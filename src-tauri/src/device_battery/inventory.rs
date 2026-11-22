use serde_json::{json, Value};

/// Retain a known receiver from the engine's sanitized inventory even when the
/// wireless device has not answered. USB presence proves neither radio link nor charge.
pub(super) fn append_unread_receivers(devices: &mut Vec<Value>, snapshot: &Value) {
    let Some(inventory) = snapshot["unadapted"].as_array() else {
        return;
    };
    for candidate in inventory.iter().take(16) {
        let Some(product) = candidate["product"].as_str() else {
            continue;
        };
        let vendor = candidate["vendorId"].as_u64();
        let pid = candidate["productId"].as_u64();
        let (id, kind, provider, page, usage) = match (vendor, pid) {
            (Some(0x36a7), Some(0xa868))
                if product.eq_ignore_ascii_case("WLMOUSE MINI PRO 8K RECEIVER") =>
            {
                ("receiver-36a7-a868", "mouse", "wlmouse", 0xffff, 0)
            }
            (Some(0x03f0), Some(0x06be))
                if product.eq_ignore_ascii_case("HyperX Cloud III S Wireless") =>
            {
                ("receiver-03f0-06be", "headset", "hyperx_cloud3s", 0x01c0, 1)
            }
            _ => continue,
        };
        let has_collection = candidate["collections"]
            .as_array()
            .is_some_and(|collections| {
                collections
                    .iter()
                    .any(|item| item["usagePage"] == page && item["usage"] == usage)
            });
        if !has_collection
            || devices.iter().any(|device| {
                device["id"] == id
                    || kind == "mouse" && device["provider"] == "wlmouse"
                    || device["vendorId"].as_u64() == vendor && device["productId"].as_u64() == pid
            })
        {
            continue;
        }
        devices.push(json!({
            "id": id, "name": product, "kind": kind,
            "vendorId": vendor, "productId": pid, "provider": provider,
            "percent": null, "charging": null, "measurementState": "unknown",
            "receiverOnly": true, "approximate": false
        }));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cloud_iii_s_receiver_stays_visible_without_a_battery_reply() {
        let snapshot = json!({"unadapted":[{"vendorId":0x03f0,"productId":0x06be,"product":"HyperX Cloud III S Wireless",
            "collections":[{"usagePage":0x01c0,"usage":1}]}]});
        let mut devices = vec![];
        append_unread_receivers(&mut devices, &snapshot);
        assert_eq!(devices[0]["kind"], "headset");
        assert!(devices[0]["percent"].is_null());
        let mut measured = vec![json!({"vendorId":0x03f0,"productId":0x06be,"percent":84})];
        append_unread_receivers(&mut measured, &snapshot);
        assert_eq!(measured.len(), 1);
    }
    fn snapshot() -> Value {
        json!({"unadapted":[{"vendorId":0x36a7,"productId":0xa868,"product":"WLMOUSE MINI PRO 8K RECEIVER",
            "collections":[{"usagePage":0xffff,"usage":0}]}]})
    }
    #[test]
    fn present_receiver_keeps_unknown_battery_and_charging() {
        let mut devices = vec![];
        append_unread_receivers(&mut devices, &snapshot());
        assert_eq!(devices.len(), 1);
        assert!(devices[0]["percent"].is_null());
        assert!(devices[0]["charging"].is_null());
        assert_eq!(devices[0]["receiverOnly"], true);
    }
    #[test]
    fn repeated_inventory_or_real_measurements_do_not_duplicate_cards() {
        let mut value = snapshot();
        let duplicate = value["unadapted"][0].clone();
        value["unadapted"].as_array_mut().unwrap().push(duplicate);
        let mut devices = vec![];
        append_unread_receivers(&mut devices, &value);
        assert_eq!(devices.len(), 1);
        let mut measured = vec![json!({"provider":"wlmouse","percent":80})];
        append_unread_receivers(&mut measured, &value);
        assert_eq!(measured.len(), 1);
        assert_eq!(measured[0]["percent"], 80);
    }
    #[test]
    fn unknown_models_or_missing_descriptor_proof_are_not_guessed() {
        let mut devices = vec![];
        let mut candidate = snapshot();
        candidate["unadapted"][0]["productId"] = json!(0xa869);
        append_unread_receivers(&mut devices, &candidate);
        candidate["unadapted"][0]["productId"] = json!(0xa868);
        candidate["unadapted"][0]["collections"] = json!([]);
        append_unread_receivers(&mut devices, &candidate);
        assert!(devices.is_empty());
    }
}
