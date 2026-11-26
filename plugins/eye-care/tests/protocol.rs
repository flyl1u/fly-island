//! Exercise the real SDK process without opening a break window.
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::mpsc::{self, Receiver},
    time::{Duration, Instant},
};

struct Plugin {
    child: Child,
    input: Option<ChildStdin>,
    lines: Receiver<Value>,
}
impl Plugin {
    fn start() -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_eye-care"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();
        let output = child.stdout.take().unwrap();
        let input = child.stdin.take();
        let (sender, lines) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(output).lines() {
                let Ok(line) = line else { break };
                if sender.send(serde_json::from_str(&line).unwrap()).is_err() {
                    break;
                }
            }
        });
        Self {
            child,
            input,
            lines,
        }
    }
    fn send(&mut self, request: Value) {
        writeln!(self.input.as_mut().unwrap(), "{request}").unwrap();
        self.input.as_mut().unwrap().flush().unwrap();
    }
    fn next(&self) -> Value {
        self.lines.recv_timeout(Duration::from_secs(10)).unwrap()
    }
    fn response(&self, id: u64) -> Value {
        for _ in 0..30 {
            let value = self.next();
            if value["id"] == id {
                return value;
            }
        }
        panic!("no response for {id}")
    }
    fn exited(&mut self) {
        let end = Instant::now() + Duration::from_secs(3);
        loop {
            if let Some(status) = self.child.try_wait().unwrap() {
                assert!(status.success());
                return;
            }
            assert!(
                Instant::now() < end,
                "plugin did not release its process on shutdown/EOF"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}
impl Drop for Plugin {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn initialize_publishes_a_valid_panel_and_shutdown_or_eof_exits() {
    for eof in [false, true] {
        let mut plugin = Plugin::start();
        plugin.send(
            json!({"jsonrpc":"2.0","id":0,"method":"initialize","params":{
                "apiVersion":1,"settings":{"period":"20","rest-minutes":"1","idle":"5","language":"en","_host-eye-care-windows":true}
            }}),
        );
        assert_eq!(plugin.response(0)["result"]["apiVersion"], 1);
        let published = plugin.next();
        assert_eq!(published["method"], "publish");
        let panel = &published["params"]["panel"];
        assert!(panel["headline"].is_string());
        assert_eq!(panel["rows"].as_array().unwrap().len(), 1);
        assert_eq!(panel["actions"], json!(["rest_now"]));
        assert_eq!(panel["islandActions"], json!(["rest_now"]));
        assert_eq!(panel["attention"], false);
        if panel["rows"][0]["countdownTo"].is_number() {
            assert!(panel["rows"][0]["detail"]
                .as_str()
                .unwrap()
                .contains("1 min break"));
        }
        plugin.send(json!({"jsonrpc":"2.0","id":1,"method":"action","params":{"id":"skip"}}));
        assert_eq!(plugin.response(1)["error"]["code"], -32000);
        plugin.send(json!({"jsonrpc":"2.0","id":2,"method":"action","params":{"id":"rest_now"}}));
        assert_eq!(plugin.response(2)["result"]["success"], true);
        let rest = plugin.next();
        assert_eq!(rest["params"]["panel"]["attention"], true);
        assert_eq!(
            rest["params"]["panel"]["actions"],
            json!(["snooze_10", "skip"])
        );
        assert_eq!(rest["params"]["panel"]["islandActions"], json!([]));
        plugin.send(json!({"jsonrpc":"2.0","id":3,"method":"action","params":{"id":"snooze_25"}}));
        assert_eq!(plugin.response(3)["result"]["success"], true);
        assert_eq!(plugin.next()["params"]["panel"]["attention"], false);
        plugin.send(json!({"jsonrpc":"2.0","id":4,"method":"action","params":{"id":"rest_now"}}));
        assert_eq!(plugin.response(4)["result"]["success"], true);
        assert_eq!(plugin.next()["params"]["panel"]["actions"], json!(["skip"]));
        plugin.send(json!({"jsonrpc":"2.0","id":5,"method":"action","params":{"id":"snooze_10"}}));
        assert_eq!(plugin.response(5)["error"]["code"], -32000);
        if eof {
            plugin.input.take();
        } else {
            plugin.send(json!({"jsonrpc":"2.0","method":"shutdown"}));
        }
        plugin.exited();
    }
}
