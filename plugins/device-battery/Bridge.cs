using System;
using System.Collections.Generic;
using System.Text;
using System.Web.Script.Serialization;
using AtkBattery;

class Bridge {
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    static object NativeBattery() {
        var devices = new List<object>();
        var errors = new List<string>();
        try {
            var b = MouseBattery.Read();
            devices.Add(new { id = "native-atk", name = b.Product ?? "ATK A9 Air+", kind = "mouse",
                percent = b.Percent, charging = b.Charging, approximate = false, measurementState = "current",
                confirmedAtUtc = b.TimestampUtc.ToString("o"), provider = "native-atk" });
        } catch (Exception) { errors.Add("native-atk: unavailable"); }
        try {
            var b = HeadsetBattery.Read();
            if (b.ReceiverPresent) devices.Add(new { id = "native-hyperx", name = b.Product, kind = "headset",
                percent = b.Percent, charging = b.Charging, approximate = false,
                measurementState = b.Percent.HasValue ? "current" : "unknown",
                confirmedAtUtc = b.BatteryTimestampUtc == DateTime.MinValue ? null : b.BatteryTimestampUtc.ToString("o"),
                provider = "native-hyperx" });
        } catch (Exception) { errors.Add("native-hyperx: unavailable"); }
        return new { devices = devices, errors = errors };
    }
    static int Main(string[] args) {
        Console.OutputEncoding = new UTF8Encoding(false);
        try {
            if (args.Length == 1 && args[0] == "battery") {
                Console.WriteLine(Json.Serialize(NativeBattery())); return 0;
            }
            if (args.Length != 3 && args.Length != 4) throw new ArgumentException("Invalid bridge arguments");
            DeviceSettings.Current.SpeakerEndpointId = args[1];
            DeviceSettings.Current.HeadsetEndpointId = args[2];
            AudioReading reading;
            if (args[0] == "audio" && args.Length == 3) reading = AudioControl.Read();
            else if (args[0] == "switch" && args.Length == 4 && (args[3] == "speaker" || args[3] == "headset")) {
                string expected = DeviceSettings.Current.EndpointFor(args[3]);
                if (String.IsNullOrWhiteSpace(expected)) throw new ArgumentException("Bind an output first");
                reading = AudioControl.SwitchOutput(args[3], expected);
            } else throw new ArgumentException("Unsupported bridge operation");
            // All operations return the read-back snapshot, including rollback failures.
            Console.WriteLine(Json.Serialize(reading)); return 0;
        } catch (Exception e) { Console.Error.WriteLine(e.Message); return 1; }
    }
}
