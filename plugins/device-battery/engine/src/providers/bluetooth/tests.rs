use super::*;

const MOUSE: &str = r"BTHLE\DEV_A1B2C3D4E5F6\7&1&0&A1B2C3D4E5F6";
const SERVICE: &str =
    r"BTHLEDEVICE\{0000180f-0000-1000-8000-00805f9b34fb}_DEV_VID&02_PID&1_A1B2C3D4E5F6\8&2";

fn node(id: &str, name: &str, battery: Option<u8>) -> PnpNode {
    PnpNode {
        id: id.into(),
        name: name.into(),
        status_ok: true,
        battery,
        connected: None,
    }
}

fn connected(connected: bool) -> impl FnMut(u64, bool) -> Result<RadioState, &'static str> {
    move |address, low_energy| {
        assert_eq!((address, low_energy), (0xA1B2_C3D4_E5F6, true));
        Ok(RadioState {
            connected,
            class: Some((0x0F << 6) | 2),
        })
    }
}

#[test]
fn nodes_of_one_address_merge_and_only_connected_devices_show() {
    let nodes = [
        node(MOUSE, "MX Master", None),
        node(SERVICE, "Battery Service", Some(80)),
    ];
    let shown = group(&nodes, connected(true));
    assert_eq!(shown.len(), 1);
    assert_eq!(shown[0].key, "bt:A1B2C3D4E5F6");
    assert_eq!(
        (shown[0].name.as_str(), shown[0].level),
        ("MX Master", Some(80))
    );
    assert_eq!(
        (shown[0].kind, shown[0].connection_known),
        ("mouse", Some(true))
    );
    assert!(group(&nodes, connected(false)).is_empty());
}

#[test]
fn a_failed_radio_query_hides_unless_pnp_knows() {
    let mut nodes = vec![node(MOUSE, "MX Master", Some(80))];
    assert!(group(&nodes, |_, _| Err("timeout")).is_empty());
    nodes[0].connected = Some(true);
    assert_eq!(group(&nodes, |_, _| Err("timeout")).len(), 1);
}

#[test]
fn without_a_battery_property_there_is_no_card() {
    let nodes = [
        node(MOUSE, "MX Master", None),
        node(SERVICE, "x", Some(101)),
    ];
    assert!(group(&nodes, connected(true)).is_empty());
}

#[test]
fn classes_and_addresses_are_decoded() {
    assert_eq!(kind_from_class(0x0404, false), "headset");
    assert_eq!(kind_from_class(0x0580, false), "mouse");
    assert_eq!(kind_from_class(0x0508, false), "gamepad");
    assert_eq!(kind_from_class(0x0540, false), "keyboard");
    assert_eq!(kind_from_class(0x25 << 6, true), "headset");
    assert_eq!(kind_from_class(0, false), "");
    assert_eq!(mac_of(SERVICE).as_deref(), Some("A1B2C3D4E5F6"));
    let classic = r"BTHENUM\{0000110b-0000}_LOCALMFG&0002\7&1&0&001122334455_C00000000";
    assert_eq!(mac_of(classic).as_deref(), Some("001122334455"));
    assert_eq!(root_of(r"BTHLEDEVICE\DEV_A1B2C3D4E5F6\1"), None);
}
