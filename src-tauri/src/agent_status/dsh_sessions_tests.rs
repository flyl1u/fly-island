use super::*;
use serde_json::json;

const ID: &str = "session-00000000-0000-4000-8000-000000000001";

fn fixture() -> Value {
    json!({"version":7,"record":{
        "identity":{"formatVersion":4,"createdAt":100,"cwd":"D:\\fictional-project","isSeeded":false},
        "rows":{
            "title":{"ver":1,"seq":12,"val":"Fictional session"},
            "sessionListMetadata":{"ver":1,"seq":12,"val":{"blank":false,"lastPromptAt":1000}},
            "turnBoundary":{"ver":2,"seq":12,"val":{"openTurnStartSeq":5,"lastTurn":1}},
            "turnOutline":{"ver":2,"seq":12,"val":{"turns":[{"turn":1,"seq":5,"prompt":"Example prompt","response":"Example response"}]}},
            "modelSelection":{"ver":2,"seq":12,"val":{"lastUsed":{"provider":"deepseek-official","model":"deepseek-v4","reasoningEffort":"high"}}},
            "userQuestions":{"ver":2,"seq":12,"val":{"questions":{"active":[]}}}
        }
    }})
}

#[test]
fn parses_known_checkpoint_and_does_not_guess_after_version_changes() {
    let mut value = fixture();
    let session = parse_checkpoint(&value, ID, 1100, 1200, true).unwrap();
    assert_eq!(session.provider, "dsh");
    assert_eq!(session.title.as_deref(), Some("Fictional session"));
    assert_eq!(session.phase, "running");
    assert_eq!(session.model.as_deref(), Some("deepseek-v4"));
    assert_eq!(session.owner_prompt_at, Some(1000));
    assert!(!session.closed);
    value["version"] = json!(99);
    assert!(parse_checkpoint(&value, ID, 1100, 1200, true).is_none());
    value = fixture();
    value["record"]["rows"]["turnBoundary"]["ver"] = json!(99);
    assert!(parse_checkpoint(&value, ID, 1100, 1200, true).is_none());
    assert!(parse_checkpoint(&fixture(), "../../example", 1100, 1200, true).is_none());
}

#[test]
fn differentiates_waiting_continued_done_stale_and_exited() {
    let mut value = fixture();
    value["record"]["rows"]["userQuestions"]["val"]["questions"]["active"] = json!([{"state":"open"}]);
    assert_eq!(parse_checkpoint(&value, ID, 1100, 9999999, true).unwrap().phase, "waiting");
    value["record"]["rows"]["userQuestions"]["val"]["questions"]["active"][0]["state"] = json!("continued");
    assert_eq!(parse_checkpoint(&value, ID, 1100, 9999999, true).unwrap().phase, "stale");
    value["record"]["rows"]["turnBoundary"]["val"]["openTurnStartSeq"] = Value::Null;
    assert_eq!(parse_checkpoint(&value, ID, 1100, 1200, true).unwrap().phase, "completed");
    assert!(parse_checkpoint(&fixture(), ID, 1100, 1200, false).unwrap().closed);
    value["record"]["rows"]["sessionListMetadata"]["val"]["blank"] = json!(true);
    assert!(parse_checkpoint(&value, ID, 1100, 1200, true).is_none());
}
