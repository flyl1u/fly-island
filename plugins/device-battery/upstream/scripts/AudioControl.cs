using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace AtkBattery {
    public sealed class AudioDeviceChoice {
        public string Id;
        public string Name;
        public string InterfaceName;
        public int Flow;
        // Devices contains DEVICE_STATE_ACTIVE endpoints only, from EnumAudioEndpoints.
        public int? FormFactor;
    }
    public sealed class AudioReading {
        public string ActiveOutput = "other";
        public bool? MicrophoneMuted;
        public bool SpeakerAvailable;
        public bool HeadsetAvailable;
        public bool MicrophoneAvailable;
        public string Error;
        public DateTime TimestampUtc;
        public string SpeakerId;
        public string HeadsetId;
        public string MicrophoneId;
        public string SpeakerName;
        public string HeadsetName;
        public string MicrophoneName;
        public string ConsoleOutputId;
        public string MultimediaOutputId;
        public string CommunicationsOutputId;
        public bool OutputRolesDiffer;
        public bool OperationSucceeded;
        public bool OutcomeUnknown;
        public int? OutputVolumePercent;
        public string VolumeEndpointId;
        public string[] Endpoints;
        public AudioDeviceChoice[] Devices = new AudioDeviceChoice[0];
    }

    // Windows endpoints describe the receiver's audio interface, not its radio
    // connection. HeadsetAvailable must never be used as headset-on detection.
    internal sealed class AudioEndpointInfo {
        internal string Id;
        internal string Name;
        internal string InterfaceName;
        internal int Flow;
        internal int? FormFactor;
    }

    // Session-only state shared by reads and writes, including callers outside
    // the audio worker. Device-specific scopes neither use nor update it.
    internal sealed class SpeakerEndpointMemory {
        readonly object gate=new object();
        string rememberedOutputId;
        internal AudioEndpointInfo FindSpeaker(IList<AudioEndpointInfo> endpoints,AudioBindings bindings,string defaultOutputId,out bool ambiguous){
            bool headsetAmbiguous;
            var headset=AudioControl.FindEndpoint(endpoints,"headset",bindings,out headsetAmbiguous);
            return FindSpeaker(endpoints,bindings,defaultOutputId,headset==null?null:headset.Id,out ambiguous);
        }
        internal AudioEndpointInfo FindSpeaker(IList<AudioEndpointInfo> endpoints,AudioBindings bindings,string defaultOutputId,string headsetId,out bool ambiguous){
            lock(gate){
                if(!bindings.ExplicitAudioBindingsOnly){
                    var current=AudioControl.KnownNonHeadphoneOutput(endpoints,defaultOutputId,headsetId);
                    if(current!=null)rememberedOutputId=current.Id;
                }
                return AudioControl.FindEndpoint(endpoints,"speaker",bindings,defaultOutputId,rememberedOutputId,headsetId,out ambiguous);
            }
        }
    }

    public static partial class AudioControl {
        // ENDPOINT_FORM_FACTOR (mmdeviceapi.h): Headphones=3, Headset=5.
        internal static bool IsHeadphone(int? formFactor){return formFactor==3||formFactor==5;}
        const string SpeakerInterface = "Realtek(R) Audio";
        const string HeadsetInterface = "HyperX Cloud Alpha Wireless";
        internal static bool IsHyperXEndpoint(string interfaceName,string name,int flow) {
            if(Exact(interfaceName,HeadsetInterface))return true;
            if(!String.IsNullOrEmpty(interfaceName))return false;
            return flow==0?
                Exact(name,"耳机 (HyperX Cloud Alpha Wireless)")||Exact(name,"Headphones (HyperX Cloud Alpha Wireless)"):
                Exact(name,"麦克风 (HyperX Cloud Alpha Wireless)")||Exact(name,"Microphone (HyperX Cloud Alpha Wireless)");
        }
        static readonly object OperationLock = new object();
        static readonly SpeakerEndpointMemory SpeakerMemory = new SpeakerEndpointMemory();
        static readonly Guid VolumeInterfaceId = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
        static readonly Guid ChangeContext = new Guid("7495D5A5-5C95-47C4-8D95-0A9A1E5A4B11");
        static readonly PropertyKey FriendlyNameKey = new PropertyKey("A45C254E-DF1C-4EFD-8020-67D146A850E0", 14);
        static readonly PropertyKey InterfaceNameKey = new PropertyKey("026E516E-B814-414B-83CD-856D6FEF4822", 2);
        static readonly PropertyKey FormFactorKey = new PropertyKey("1DA5D803-D492-4EDD-8C23-E0C0FFEE7F0E", 0);

        public static AudioReading Read() {
            return OnAudioThread(delegate {
                using (var session = new AudioSession()) {
                    var result = ReadCore(session);
                    result.OperationSucceeded = String.IsNullOrEmpty(result.Error);
                    return result;
                }
            });
        }

        // Switch the normal/media output only. The communications default is
        // deliberately preserved, as is every default recording endpoint.
        public static AudioReading SwitchOutput(string target) {
            return SwitchOutput(target,null);
        }
        internal static AudioReading SwitchOutput(string target,string expectedEndpointId) {
            if (target != "speaker" && target != "headset")
                return FailedReading("音源只能选择 speaker 或 headset。");
            return OnAudioThread(delegate {
                using (var session = new AudioSession()) {
                    AudioReading before = ReadCore(session);
                    string targetId = target == "speaker" ? before.SpeakerId : before.HeadsetId;
                    if (String.IsNullOrEmpty(targetId)) {
                        before.Error = AddError(before.Error, "未找到唯一可用的目标音源，未更改默认设备。");
                        before.OperationSucceeded = false;
                        return before;
                    }
                    if (expectedEndpointId!=null&&!SameId(targetId,expectedEndpointId)) {
                        before.Error=AddError(before.Error,"音源绑定或设备已改变，未更改默认设备。");
                        before.OperationSucceeded=false;
                        return before;
                    }
                    if (String.IsNullOrEmpty(before.ConsoleOutputId) || String.IsNullOrEmpty(before.MultimediaOutputId)) {
                        before.Error = AddError(before.Error, "无法读取原默认音源，未更改默认设备。");
                        before.OperationSucceeded = false;
                        return before;
                    }
                    object policyObject = null;
                    bool attempted = false;
                    try {
                        policyObject = new PolicyConfigClient();
                        var policy = (IPolicyConfig)policyObject;
                        if (!SameId(before.ConsoleOutputId, targetId)) {
                            attempted = true;
                            Check(policy.SetDefaultEndpoint(targetId, Role.Console), "切换系统音源");
                        }
                        if (!SameId(before.MultimediaOutputId, targetId)) {
                            attempted = true;
                            Check(policy.SetDefaultEndpoint(targetId, Role.Multimedia), "切换媒体音源");
                        }
                        AudioReading after = ReadCore(session);
                        if (!SameId(after.ConsoleOutputId, targetId) || !SameId(after.MultimediaOutputId, targetId))
                            throw new InvalidOperationException("默认音源切换后核验不一致。");
                        if (!SameId(before.CommunicationsOutputId, after.CommunicationsOutputId))
                            throw new InvalidOperationException("通讯默认音源发生意外变化。");
                        after.OperationSucceeded = true;
                        return after;
                    } catch (Exception ex) {
                        string rollbackError = null;
                        if (attempted && policyObject != null) {
                            rollbackError = RestoreOutputs((IPolicyConfig)policyObject, session, before);
                        }
                        AudioReading after = ReadCore(session);
                        after.OperationSucceeded = false;
                        after.Error = AddError(after.Error, Describe(ex));
                        if (attempted)
                            after.Error = AddError(after.Error, rollbackError == null ? "已恢复原默认音源。" : rollbackError);
                        return after;
                    } finally {
                        ReleaseCom(policyObject);
                    }
                }
            });
        }

        // This is Windows endpoint mute, not the headset's physical mute state.
        // It targets the configured capture endpoint without changing any defaults.
        public static AudioReading SetHeadsetMicrophoneMute(bool mute) {
            return SetHeadsetMicrophoneMute(mute,null);
        }
        internal static AudioReading SetHeadsetMicrophoneMute(bool mute,string expectedEndpointId) {
            return OnAudioThread(delegate {
                using (var session = new AudioSession()) {
                    AudioReading before = ReadCore(session);
                    if (String.IsNullOrEmpty(before.MicrophoneId)) {
                        before.Error = AddError(before.Error, "未找到唯一可用的麦克风，未更改静音状态。");
                        before.OperationSucceeded = false;
                        return before;
                    }
                    if (expectedEndpointId!=null&&!SameId(before.MicrophoneId,expectedEndpointId)) {
                        before.Error=AddError(before.Error,"麦克风绑定或设备已改变，未更改静音状态。");
                        before.OperationSucceeded=false;
                        return before;
                    }
                    IMMDevice microphone = null;
                    object volumeObject = null;
                    bool oldMute = false;
                    bool oldMuteRead = false;
                    bool attempted = false;
                    try {
                        Check(session.Enumerator.GetDevice(before.MicrophoneId, out microphone), "打开麦克风");
                        Guid iid = VolumeInterfaceId;
                        Check(microphone.Activate(ref iid, 23, IntPtr.Zero, out volumeObject), "读取麦克风音量接口");
                        var volume = (IAudioEndpointVolume)volumeObject;
                        Check(volume.GetMute(out oldMute), "读取麦克风静音状态");
                        oldMuteRead = true;
                        if (oldMute != mute) {
                            attempted = true;
                            Guid context = ChangeContext;
                            Check(volume.SetMute(mute, ref context), "设置麦克风静音");
                        }
                        bool actualMute;
                        Check(volume.GetMute(out actualMute), "核验麦克风静音状态");
                        if (actualMute != mute) throw new InvalidOperationException("麦克风静音设置后核验不一致。");
                        AudioReading after = ReadCore(session);
                        if (!SameId(after.MicrophoneId,before.MicrophoneId)||after.MicrophoneMuted != mute) throw new InvalidOperationException("麦克风端点或静音重新读取后核验不一致。");
                        after.OperationSucceeded = true;
                        return after;
                    } catch (Exception ex) {
                        string rollbackError = null;
                        if (attempted && oldMuteRead && volumeObject != null) {
                            try {
                                var volume = (IAudioEndpointVolume)volumeObject;
                                Guid context = ChangeContext;
                                Check(volume.SetMute(oldMute, ref context), "恢复原麦克风静音状态");
                                bool actualMute;
                                Check(volume.GetMute(out actualMute), "核验麦克风静音恢复");
                                if (actualMute != oldMute) throw new InvalidOperationException("静音状态恢复核验失败。");
                            } catch (Exception rollbackEx) {
                                rollbackError = "恢复原麦克风状态失败：" + Describe(rollbackEx);
                            }
                        }
                        AudioReading after = ReadCore(session);
                        after.OperationSucceeded = false;
                        after.Error = AddError(after.Error, Describe(ex));
                        if (attempted)
                            after.Error = AddError(after.Error, rollbackError == null ? "已恢复原麦克风静音状态。" : rollbackError);
                        return after;
                    } finally {
                        ReleaseCom(volumeObject);
                        ReleaseCom(microphone);
                    }
                }
            });
        }

        public static AudioReading SetOutputVolume(string expectedEndpointId,int percent) {
            if(String.IsNullOrEmpty(expectedEndpointId)||percent<0||percent>100)return FailedReading("无效的音量目标。");
            return OnAudioThread(delegate {
                using(var session=new AudioSession()) {
                    var before=ReadCore(session);
                    if(DeviceSettings.Current.ExplicitAudioBindingsOnly&&!SameId(expectedEndpointId,before.SpeakerId)&&!SameId(expectedEndpointId,before.HeadsetId)){before.OperationSucceeded=false;before.Error="输出不属于当前设备绑定，未更改音量。";return before;}
                    if(!SameId(before.ConsoleOutputId,expectedEndpointId)){before.OperationSucceeded=false;before.Error="输出设备已改变，请重试。";return before;}
                    IMMDevice device=null;object native=null;float old=0;bool changed=false;
                    try {
                        Check(session.Enumerator.GetDevice(expectedEndpointId,out device),"打开输出设备");
                        Guid iid=VolumeInterfaceId;Check(device.Activate(ref iid,23,IntPtr.Zero,out native),"读取输出音量接口");
                        var volume=(IAudioEndpointVolume)native;Check(volume.GetMasterVolumeLevelScalar(out old),"读取原音量");
                        Guid context=ChangeContext;Check(volume.SetMasterVolumeLevelScalar(percent/100f,ref context),"设置输出音量");changed=true;
                        float actual;Check(volume.GetMasterVolumeLevelScalar(out actual),"核验输出音量");
                        if(Math.Abs(actual-percent/100f)>.011f)throw new InvalidOperationException("音量读回不一致。");
                        var after=ReadCore(session);
                        if(!SameId(after.ConsoleOutputId,expectedEndpointId)||!after.OutputVolumePercent.HasValue||Math.Abs(after.OutputVolumePercent.Value-percent)>1)throw new InvalidOperationException("输出设备或音量已改变。");
                        after.OperationSucceeded=true;return after;
                    }catch(Exception error) {
                        string message=Describe(error);
                        if(changed&&native!=null)try{Guid context=ChangeContext;Check(((IAudioEndpointVolume)native).SetMasterVolumeLevelScalar(old,ref context),"恢复原音量");}catch(Exception restore){message=AddError(message,Describe(restore));}
                        var after=ReadCore(session);after.OperationSucceeded=false;after.Error=AddError(after.Error,message);return after;
                    }finally{ReleaseCom(native);ReleaseCom(device);}
                }
            });
        }

        static AudioReading OnAudioThread(Func<AudioReading> operation) {
            AudioReading result = null;
            // Windows thread-pool workers use MTA. A separate queued operation
            // keeps every COM object on its own worker and reuses the runtime's
            // workers rather than retaining short-lived native thread handles.
            using (var finished = new ManualResetEvent(false)) {
                bool queued = ThreadPool.QueueUserWorkItem(delegate {
                    try {
                        lock (OperationLock) {
                            try { result = operation(); }
                            catch (Exception ex) { result = FailedReading(Describe(ex)); }
                        }
                    } finally { finished.Set(); }
                });
                if (!queued) return FailedReading("无法启动音频操作线程。");
                // Do not return while a change could still execute in the worker.
                // The tray calls this from its existing background operation queue.
                finished.WaitOne();
            }
            return result ?? FailedReading("音频接口未返回状态。");
        }

        static AudioReading ReadCore(AudioSession session) {
            var result = new AudioReading { TimestampUtc = DateTime.UtcNow, ActiveOutput = "other" };
            var endpoints = session.Enumerate();
            var bindings = DeviceSettings.Current;
            result.ConsoleOutputId = session.DefaultOutput(Role.Console);
            result.MultimediaOutputId = session.DefaultOutput(Role.Multimedia);
            result.CommunicationsOutputId = session.DefaultOutput(Role.Communications);
            bool ambiguous, headsetAmbiguous;
            var headset = FindEndpoint(endpoints, "headset", bindings, out headsetAmbiguous);
            var speaker = SpeakerMemory.FindSpeaker(endpoints, bindings, result.ConsoleOutputId, headset == null ? null : headset.Id, out ambiguous);
            if (ambiguous) result.Error = AddError(result.Error, "扬声器端点不唯一，请到音频设置中绑定。");
            if (headsetAmbiguous) result.Error = AddError(result.Error, "耳机端点不唯一，未选择。");
            var microphone = FindEndpoint(endpoints, "microphone", bindings, out ambiguous);
            if (ambiguous) result.Error = AddError(result.Error, "麦克风端点不唯一，未选择。");
            result.SpeakerAvailable = speaker != null;
            result.HeadsetAvailable = headset != null;
            result.MicrophoneAvailable = microphone != null;
            if (speaker != null) { result.SpeakerId = speaker.Id; result.SpeakerName = speaker.Name; }
            if (headset != null) { result.HeadsetId = headset.Id; result.HeadsetName = headset.Name; }
            if (microphone != null) { result.MicrophoneId = microphone.Id; result.MicrophoneName = microphone.Name; }
            result.OutputRolesDiffer = !SameId(result.ConsoleOutputId, result.MultimediaOutputId);
            if (speaker != null && SameId(result.ConsoleOutputId, speaker.Id)) result.ActiveOutput = "speaker";
            else if (headset != null && SameId(result.ConsoleOutputId, headset.Id)) result.ActiveOutput = "headset";
            var descriptions = new List<string>();
            var choices = new List<AudioDeviceChoice>();
            foreach (var endpoint in endpoints) {
                descriptions.Add((endpoint.Flow == 0 ? "render" : "capture") + " | " + endpoint.Name + " | " + endpoint.InterfaceName + " | " + endpoint.Id);
                choices.Add(new AudioDeviceChoice { Id=endpoint.Id, Name=endpoint.Name, InterfaceName=endpoint.InterfaceName, Flow=endpoint.Flow, FormFactor=endpoint.FormFactor });
            }
            result.Endpoints = descriptions.ToArray();
            result.Devices = choices.ToArray();
            bool volumeInScope=!bindings.ExplicitAudioBindingsOnly||SameId(result.ConsoleOutputId,result.SpeakerId)||SameId(result.ConsoleOutputId,result.HeadsetId);
            if(!String.IsNullOrEmpty(result.ConsoleOutputId)&&volumeInScope) {
                IMMDevice device=null;object native=null;
                try {
                    Check(session.Enumerator.GetDevice(result.ConsoleOutputId,out device),"打开当前输出设备");
                    Guid iid=VolumeInterfaceId;Check(device.Activate(ref iid,23,IntPtr.Zero,out native),"读取输出音量接口");
                    float scalar;Check(((IAudioEndpointVolume)native).GetMasterVolumeLevelScalar(out scalar),"读取输出音量");
                    result.OutputVolumePercent=(int)Math.Round(Math.Max(0,Math.Min(1,scalar))*100);
                    result.VolumeEndpointId=result.ConsoleOutputId;
                }catch(Exception){result.OutputVolumePercent=null;}
                finally{ReleaseCom(native);ReleaseCom(device);}
            }
            if (microphone != null) {
                IMMDevice device = null;
                object volumeObject = null;
                try {
                    Check(session.Enumerator.GetDevice(microphone.Id, out device), "打开麦克风");
                    Guid iid = VolumeInterfaceId;
                    Check(device.Activate(ref iid, 23, IntPtr.Zero, out volumeObject), "读取麦克风音量接口");
                    bool mute;
                    Check(((IAudioEndpointVolume)volumeObject).GetMute(out mute), "读取麦克风静音状态");
                    result.MicrophoneMuted = mute;
                } catch (Exception ex) { result.Error = AddError(result.Error, Describe(ex)); }
                finally { ReleaseCom(volumeObject); ReleaseCom(device); }
            }
            return result;
        }

        internal static AudioEndpointInfo FindEndpoint(IList<AudioEndpointInfo> endpoints, string target, out bool ambiguous) {
            return FindEndpoint(endpoints,target,new AudioBindings(),out ambiguous);
        }
        internal static AudioEndpointInfo FindEndpoint(IList<AudioEndpointInfo> endpoints, string target, AudioBindings bindings, out bool ambiguous) {
            return FindEndpoint(endpoints,target,bindings,null,null,out ambiguous);
        }
        internal static AudioEndpointInfo FindEndpoint(IList<AudioEndpointInfo> endpoints, string target, AudioBindings bindings, string defaultOutputId, string rememberedOutputId, out bool ambiguous) {
            bool headsetAmbiguous;
            var headset=target=="speaker"?FindEndpoint(endpoints,"headset",bindings,out headsetAmbiguous):null;
            return FindEndpoint(endpoints,target,bindings,defaultOutputId,rememberedOutputId,headset==null?null:headset.Id,out ambiguous);
        }
        // COM-free selection: explicit bindings and legacy vendor identities
        // keep priority; the caller supplies the default, memory and resolved headset.
        internal static AudioEndpointInfo FindEndpoint(IList<AudioEndpointInfo> endpoints, string target, AudioBindings bindings, string defaultOutputId, string rememberedOutputId, string headsetId, out bool ambiguous) {
            AudioEndpointInfo match = null;
            ambiguous = false;
            if(target!="speaker"&&target!="headset"&&target!="microphone")return null;
            string configuredId=bindings.EndpointFor(target);
            if(bindings.ExplicitAudioBindingsOnly&&String.IsNullOrEmpty(configuredId))return null;
            if(!String.IsNullOrEmpty(configuredId)) {
                int expectedFlow=target=="microphone"?1:0;
                foreach(var endpoint in endpoints) {
                    if(endpoint.Flow!=expectedFlow||!SameId(endpoint.Id,configuredId))continue;
                    if(match!=null){ambiguous=true;return null;}
                    match=endpoint;
                }
                return match;
            }
            foreach (var endpoint in endpoints) {
                bool matching;
                if (target == "speaker") {
                    bool identity = Exact(endpoint.InterfaceName, SpeakerInterface) ||
                        (String.IsNullOrEmpty(endpoint.InterfaceName) &&
                         (Exact(endpoint.Name, "扬声器 (Realtek(R) Audio)") || Exact(endpoint.Name, "Speakers (Realtek(R) Audio)")));
                    bool speakerType = endpoint.FormFactor.HasValue ? endpoint.FormFactor.Value == 1 :
                        Exact(endpoint.Name, "扬声器 (Realtek(R) Audio)") || Exact(endpoint.Name, "Speakers (Realtek(R) Audio)");
                    matching = endpoint.Flow == 0 && identity && speakerType;
                } else if (target == "headset" || target == "microphone") {
                    int flow = target == "headset" ? 0 : 1;
                    matching = endpoint.Flow == flow && IsHyperXEndpoint(endpoint.InterfaceName,endpoint.Name,flow);
                } else return null;
                if (!matching) continue;
                if (match != null) { ambiguous = true; return null; }
                match = endpoint;
            }
            // Preserve the existing HyperX identity and explicit binding above.
            // Other outputs qualify only through Windows' endpoint type, never a name guess.
            if(match==null&&target=="headset")foreach(var endpoint in endpoints) {
                if(endpoint.Flow!=0||!IsHeadphone(endpoint.FormFactor))continue;
                if(match!=null){ambiguous=true;return null;}match=endpoint;
            }
            if(match==null&&target=="speaker")return FindAutomaticSpeaker(endpoints,defaultOutputId,rememberedOutputId,headsetId,out ambiguous);
            return match;
        }

        static bool IsKnownNonHeadphoneOutput(AudioEndpointInfo endpoint){
            // ENDPOINT_FORM_FACTOR values 0..9 are known; UnknownFormFactor=10.
            return endpoint.Flow==0&&!String.IsNullOrEmpty(endpoint.Id)&&endpoint.FormFactor.HasValue&&endpoint.FormFactor.Value>=0&&endpoint.FormFactor.Value<10&&!IsHeadphone(endpoint.FormFactor);
        }
        internal static AudioEndpointInfo KnownNonHeadphoneOutput(IList<AudioEndpointInfo> endpoints,string id,string headsetId){
            if(String.IsNullOrEmpty(id)||SameId(id,headsetId))return null;
            AudioEndpointInfo match=null;
            foreach(var endpoint in endpoints){
                if(!SameId(endpoint.Id,id)||!IsKnownNonHeadphoneOutput(endpoint))continue;
                if(match!=null)return null;match=endpoint;
            }
            return match;
        }
        static AudioEndpointInfo FindAutomaticSpeaker(IList<AudioEndpointInfo> endpoints,string defaultOutputId,string rememberedOutputId,string headsetId,out bool ambiguous){
            ambiguous=false;
            var current=KnownNonHeadphoneOutput(endpoints,defaultOutputId,headsetId);if(current!=null)return current;
            var remembered=KnownNonHeadphoneOutput(endpoints,rememberedOutputId,headsetId);if(remembered!=null)return remembered;
            AudioEndpointInfo speaker=null,other=null;int speakerCount=0,otherCount=0;
            foreach(var endpoint in endpoints){
                // USB headset receivers can report a non-headphone form factor.
                if(SameId(endpoint.Id,headsetId)||!IsKnownNonHeadphoneOutput(endpoint))continue;
                if(endpoint.FormFactor==1){speaker=endpoint;speakerCount++;}
                else{other=endpoint;otherCount++;}
            }
            if(speakerCount>0){ambiguous=speakerCount>1;return ambiguous?null:speaker;}
            ambiguous=otherCount>1;return ambiguous?null:other;
        }

        static string RestoreOutputs(IPolicyConfig policy, AudioSession session, AudioReading before) {
            var errors = new List<string>();
            RestoreRole(policy, session, Role.Console, before.ConsoleOutputId, errors);
            RestoreRole(policy, session, Role.Multimedia, before.MultimediaOutputId, errors);
            // Restore communications only if this attempted operation changed it.
            RestoreRole(policy, session, Role.Communications, before.CommunicationsOutputId, errors);
            return errors.Count == 0 ? null : "恢复原音源失败：" + String.Join("；", errors.ToArray());
        }

        static void RestoreRole(IPolicyConfig policy, AudioSession session, Role role, string id, List<string> errors) {
            try {
                string actual = session.DefaultOutput(role);
                if (SameId(id, actual)) return;
                if (String.IsNullOrEmpty(id)) throw new InvalidOperationException("原默认设备为空，无法恢复 " + role + "。");
                Check(policy.SetDefaultEndpoint(id, role), "恢复 " + role + " 音源");
                if (!SameId(id, session.DefaultOutput(role))) throw new InvalidOperationException(role + " 恢复后核验不一致。");
            } catch (Exception ex) { errors.Add(Describe(ex)); }
        }

        internal static bool SameId(string left, string right) { return String.Equals(left, right, StringComparison.OrdinalIgnoreCase); }
        static bool Exact(string left, string right) { return String.Equals(left, right, StringComparison.OrdinalIgnoreCase); }
        static string AddError(string current, string next) { return String.IsNullOrEmpty(current) ? next : current + "；" + next; }
        static string Describe(Exception ex) {
            var com = ex as COMException;
            return com == null ? ex.Message : ex.Message + " (0x" + com.ErrorCode.ToString("X8") + ")";
        }
        static AudioReading FailedReading(string error) { return new AudioReading { Error = error, TimestampUtc = DateTime.UtcNow, OperationSucceeded = false }; }
        static void Check(int hr, string operation) { if (hr < 0) throw new COMException(operation + "失败", hr); }
        static void ReleaseCom(object value) { if (value != null && Marshal.IsComObject(value)) Marshal.FinalReleaseComObject(value); }

        sealed class AudioSession : IDisposable {
            internal IMMDeviceEnumerator Enumerator;
            internal AudioSession() { Enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator(); }
            internal List<AudioEndpointInfo> Enumerate() {
                var endpoints = new List<AudioEndpointInfo>();
                for (int flow = 0; flow <= 1; flow++) {
                    IMMDeviceCollection collection = null;
                    try {
                        Check(Enumerator.EnumAudioEndpoints(flow, 1, out collection), "枚举活动音频设备");
                        uint count;
                        Check(collection.GetCount(out count), "读取音频设备数量");
                        for (uint index = 0; index < count; index++) {
                            IMMDevice device = null;
                            IPropertyStore properties = null;
                            try {
                                Check(collection.Item(index, out device), "读取音频设备");
                                string id;
                                Check(device.GetId(out id), "读取音频设备 ID");
                                Check(device.OpenPropertyStore(0, out properties), "读取音频设备属性");
                                endpoints.Add(new AudioEndpointInfo {
                                    Id = id,
                                    Name = ReadString(properties, FriendlyNameKey),
                                    InterfaceName = ReadString(properties, InterfaceNameKey),
                                    Flow = flow,
                                    FormFactor = ReadNumber(properties, FormFactorKey)
                                });
                            } finally { ReleaseCom(properties); ReleaseCom(device); }
                        }
                    } finally { ReleaseCom(collection); }
                }
                return endpoints;
            }
            internal string DefaultOutput(Role role) {
                IMMDevice device = null;
                try {
                    int hr = Enumerator.GetDefaultAudioEndpoint(0, role, out device);
                    if (hr == unchecked((int)0x80070490)) return null;
                    Check(hr, "读取默认音源");
                    string id;
                    Check(device.GetId(out id), "读取默认音源 ID");
                    return id;
                } finally { ReleaseCom(device); }
            }
            public void Dispose() { ReleaseCom(Enumerator); Enumerator = null; }
        }

        static string ReadString(IPropertyStore properties, PropertyKey key) {
            PropVariant value;
            int hr = properties.GetValue(ref key, out value);
            try {
                if (hr < 0 || value.VariantType != 31 || value.PointerValue == IntPtr.Zero) return null;
                return Marshal.PtrToStringUni(value.PointerValue);
            } finally { PropVariantClear(ref value); }
        }
        static int? ReadNumber(IPropertyStore properties, PropertyKey key) {
            PropVariant value;
            int hr = properties.GetValue(ref key, out value);
            try { return hr >= 0 && value.VariantType == 19 ? (int?)value.UIntValue : null; }
            finally { PropVariantClear(ref value); }
        }

        enum Role { Console = 0, Multimedia = 1, Communications = 2 }
        [StructLayout(LayoutKind.Sequential)] struct PropertyKey {
            internal Guid Format;
            internal uint Id;
            internal PropertyKey(string format, uint id) { Format = new Guid(format); Id = id; }
        }
        [StructLayout(LayoutKind.Explicit, Size = 24)] struct PropVariant {
            [FieldOffset(0)] internal ushort VariantType;
            [FieldOffset(8)] internal IntPtr PointerValue;
            [FieldOffset(8)] internal uint UIntValue;
        }
        [DllImport("ole32.dll")] static extern int PropVariantClear(ref PropVariant value);

        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
        [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator {
            [PreserveSig] int EnumAudioEndpoints(int flow, uint stateMask, out IMMDeviceCollection collection);
            [PreserveSig] int GetDefaultAudioEndpoint(int flow, Role role, out IMMDevice device);
            [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
            [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
            [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
        }
        [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceCollection {
            [PreserveSig] int GetCount(out uint count);
            [PreserveSig] int Item(uint index, out IMMDevice device);
        }
        [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice {
            [PreserveSig] int Activate(ref Guid iid, uint context, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object result);
            [PreserveSig] int OpenPropertyStore(uint access, out IPropertyStore properties);
            [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
            [PreserveSig] int GetState(out uint state);
        }
        [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IPropertyStore {
            [PreserveSig] int GetCount(out uint count);
            [PreserveSig] int GetAt(uint index, out PropertyKey key);
            [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
            [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant value);
            [PreserveSig] int Commit();
        }
        [ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")] class PolicyConfigClient { }
        [ComImport, Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IPolicyConfig {
            [PreserveSig] int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string id, out IntPtr format);
            [PreserveSig] int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id, int isDefault, out IntPtr format);
            [PreserveSig] int ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id);
            [PreserveSig] int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr endpointFormat, IntPtr mixFormat);
            [PreserveSig] int GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string id, int isDefault, out long defaultPeriod, out long minimumPeriod);
            [PreserveSig] int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string id, ref long period);
            [PreserveSig] int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr mode);
            [PreserveSig] int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr mode);
            [PreserveSig] int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string id, ref PropertyKey key, out PropVariant value);
            [PreserveSig] int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string id, ref PropertyKey key, ref PropVariant value);
            [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, Role role);
            [PreserveSig] int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string id, int visible);
        }
        [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioEndpointVolume {
            [PreserveSig] int RegisterControlChangeNotify(IntPtr client);
            [PreserveSig] int UnregisterControlChangeNotify(IntPtr client);
            [PreserveSig] int GetChannelCount(out uint channels);
            [PreserveSig] int SetMasterVolumeLevel(float level, ref Guid context);
            [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid context);
            [PreserveSig] int GetMasterVolumeLevel(out float level);
            [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
            [PreserveSig] int SetChannelVolumeLevel(uint channel, float level, ref Guid context);
            [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
            [PreserveSig] int GetChannelVolumeLevel(uint channel, out float level);
            [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level);
            [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
            [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
            [PreserveSig] int GetVolumeStepInfo(out uint step, out uint count);
            [PreserveSig] int VolumeStepUp(ref Guid context);
            [PreserveSig] int VolumeStepDown(ref Guid context);
            [PreserveSig] int QueryHardwareSupport(out uint mask);
            [PreserveSig] int GetVolumeRange(out float minimum, out float maximum, out float increment);
        }
    }
}
