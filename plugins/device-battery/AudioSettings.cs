using System;

namespace AtkBattery {
    // The headless bridge owns only these bindings; it never loads MyFinder settings.
    public sealed class AudioBindings {
        public string SpeakerEndpointId;
        public string HeadsetEndpointId;
        public string MicrophoneEndpointId;
        public bool ExplicitAudioBindingsOnly = true;
        public string EndpointFor(string role) {
            if (role == "speaker") return SpeakerEndpointId;
            if (role == "headset") return HeadsetEndpointId;
            if (role == "microphone") return MicrophoneEndpointId;
            throw new ArgumentException("Unknown audio role");
        }
    }
    public static class DeviceSettings {
        public static readonly AudioBindings Current = new AudioBindings();
    }
}
