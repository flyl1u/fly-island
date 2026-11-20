using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace AtkBattery {
    public sealed class HidDevice {
        public string Path;
        public string Product;
        public ushort UsagePage, Usage, InputLength, OutputLength, FeatureLength;
    }
    public sealed class BatteryReading {
        public string DeviceKey;
        public int Percent;
        public bool Charging;
        public int Millivolts;
        public string Product;
        public int? Cid;
        public int? Mid;
        public bool IdentityVerified;
        public DateTime TimestampUtc = DateTime.UtcNow;
    }
    public sealed class DpiStage {
        public int Index;
        public ushort Address;
        public byte Status;
        public int XDpi;
        public int YDpi;
        public byte DpiEx;
        public byte Crc;
        public byte ExpectedCrc;
        public bool CrcValid;
        public byte[] Raw;
        public string RawHex { get { return MouseBattery.Hex(Raw); } }
    }
    public sealed class DpiConfig {
        public string DeviceKey;
        public string Product;
        public int Cid;
        public int Mid;
        public int ActiveStage;
        public int MaxStages;
        public List<DpiStage> Stages = new List<DpiStage>();
        public byte[] Raw;
        public string RawHex { get { return MouseBattery.Hex(Raw); } }
        public byte Status;
        public bool CrcValid;
        public bool[] CrcByField;
        public DateTime TimestampUtc = DateTime.UtcNow;
        public string RefreshError = "";
    }
    public sealed class MouseSnapshot {
        public string DeviceKey;
        public BatteryReading Battery;
        public DpiConfig Dpi;
        public string BatteryError;
        public string DpiError;
        public DateTime CheckedAtUtc = DateTime.UtcNow;
    }
    public sealed class NativeDpiRequest {
        public readonly string DeviceKey;
        public readonly int Stage,StageCount,XDpi,YDpi,Epoch;
        readonly Func<bool> stillCurrent;
        public NativeDpiRequest(DpiConfig display,int stage,int epoch,Func<bool> current) {
            if(display==null||!MouseBattery.ValidDeviceKey(display.DeviceKey)||display.Stages==null)throw new ArgumentException("A current receiver identity is required.");
            MouseBattery.ValidateActiveDpiIndex(stage,display.Stages.Count);
            DeviceKey=display.DeviceKey;Stage=stage;StageCount=display.Stages.Count;XDpi=display.Stages[stage].XDpi;YDpi=display.Stages[stage].YDpi;Epoch=epoch;stillCurrent=current;
        }
        public void CheckCurrent(){if(stillCurrent!=null&&!stillCurrent())throw new OperationCanceledException("Mouse connection changed; the old DPI request was cancelled.");}
        public void Validate(DpiConfig actual) {
            CheckCurrent();
            if(actual==null||actual.DeviceKey!=DeviceKey||actual.Stages==null||actual.Stages.Count!=StageCount||actual.Stages[Stage].XDpi!=XDpi||actual.Stages[Stage].YDpi!=YDpi)
                throw new IOException("Mouse identity or DPI table changed; refresh before switching.");
        }
    }
    public static class MouseBattery {
        static readonly Guid HidGuid = new Guid("4d1e55b2-f16f-11cf-88cb-001111000030");
        const uint READ = 0x80000000, WRITE = 0x40000000, OVERLAPPED = 0x40000000;
        [StructLayout(LayoutKind.Sequential)] struct InterfaceData {
            public int Size; public Guid ClassGuid; public uint Flags; public IntPtr Reserved;
        }
        [StructLayout(LayoutKind.Sequential)] struct Caps {
            public ushort Usage, UsagePage, InputReportByteLength, OutputReportByteLength, FeatureReportByteLength;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 17)] public ushort[] Reserved;
            public ushort NumberLinkCollectionNodes, NumberInputButtonCaps, NumberInputValueCaps, NumberInputDataIndices;
            public ushort NumberOutputButtonCaps, NumberOutputValueCaps, NumberOutputDataIndices;
            public ushort NumberFeatureButtonCaps, NumberFeatureValueCaps, NumberFeatureDataIndices;
        }
        [StructLayout(LayoutKind.Sequential)] struct Ov {
            public IntPtr Internal, InternalHigh; public uint Offset, OffsetHigh; public IntPtr Event;
        }
        [DllImport("setupapi.dll", CharSet=CharSet.Unicode, SetLastError=true)]
        static extern IntPtr SetupDiGetClassDevs(ref Guid guid, IntPtr enumerator, IntPtr hwnd, uint flags);
        [DllImport("setupapi.dll", SetLastError=true)]
        static extern bool SetupDiEnumDeviceInterfaces(IntPtr set, IntPtr device, ref Guid guid, uint index, ref InterfaceData data);
        [DllImport("setupapi.dll", CharSet=CharSet.Unicode, SetLastError=true)]
        static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr set, ref InterfaceData data, IntPtr detail, uint size, out uint needed, IntPtr device);
        [DllImport("setupapi.dll")] static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
        static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
        [DllImport("hid.dll")][return: MarshalAs(UnmanagedType.U1)] static extern bool HidD_GetPreparsedData(SafeFileHandle handle, out IntPtr data);
        [DllImport("hid.dll")][return: MarshalAs(UnmanagedType.U1)] static extern bool HidD_FreePreparsedData(IntPtr data);
        [DllImport("hid.dll")] static extern int HidP_GetCaps(IntPtr data, out Caps caps);
        [DllImport("hid.dll")][return: MarshalAs(UnmanagedType.U1)] static extern bool HidD_GetProductString(SafeFileHandle handle, byte[] value, uint length);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadFile(SafeFileHandle handle, IntPtr buffer, uint count, IntPtr read, IntPtr overlap);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool WriteFile(SafeFileHandle handle, IntPtr buffer, uint count, IntPtr written, IntPtr overlap);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetOverlappedResult(SafeFileHandle handle, IntPtr overlap, out uint count, bool wait);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool CancelIoEx(SafeFileHandle handle, IntPtr overlap);

        public static string DeviceKey(string path) {
            if(String.IsNullOrWhiteSpace(path))return null;
            using(var sha=SHA256.Create())return "receiver-"+BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(path.ToLowerInvariant()))).Replace("-","").ToLowerInvariant();
        }
        public static bool ValidDeviceKey(string key){return key!=null&&System.Text.RegularExpressions.Regex.IsMatch(key,@"^receiver-[a-f0-9]{64}$");}

        public static List<HidDevice> Enumerate() {
            var result = new List<HidDevice>(); var guid = HidGuid;
            IntPtr set = SetupDiGetClassDevs(ref guid, IntPtr.Zero, IntPtr.Zero, 0x12);
            if (set == new IntPtr(-1)) return result;
            try {
                for (uint index=0; ; index++) {
                    var data = new InterfaceData(); data.Size = Marshal.SizeOf(typeof(InterfaceData));
                    if (!SetupDiEnumDeviceInterfaces(set, IntPtr.Zero, ref guid, index, ref data)) break;
                    uint needed; SetupDiGetDeviceInterfaceDetail(set, ref data, IntPtr.Zero, 0, out needed, IntPtr.Zero);
                    if (needed < 8) continue;
                    IntPtr detail = Marshal.AllocHGlobal((int)needed);
                    try {
                        Marshal.WriteInt32(detail, IntPtr.Size == 8 ? 8 : 6);
                        if (!SetupDiGetDeviceInterfaceDetail(set, ref data, detail, needed, out needed, IntPtr.Zero)) continue;
                        string path = Marshal.PtrToStringUni(IntPtr.Add(detail, 4));
                        if (path == null || path.IndexOf("vid_373b&pid_1278", StringComparison.OrdinalIgnoreCase) < 0) continue;
                        using (var file = CreateFile(path, 0, 3, IntPtr.Zero, 3, 0, IntPtr.Zero)) {
                            if (file.IsInvalid) continue;
                            IntPtr pp; if (!HidD_GetPreparsedData(file, out pp)) continue;
                            try {
                                Caps caps; if (HidP_GetCaps(pp, out caps) != 0x00110000) continue;
                                var bytes = new byte[512]; string product = "ATK receiver";
                                if (HidD_GetProductString(file, bytes, (uint)bytes.Length)) product = Encoding.Unicode.GetString(bytes).TrimEnd('\0');
                                result.Add(new HidDevice { Path=path, Product=product, UsagePage=caps.UsagePage, Usage=caps.Usage,
                                    InputLength=caps.InputReportByteLength, OutputLength=caps.OutputReportByteLength, FeatureLength=caps.FeatureReportByteLength });
                            } finally { HidD_FreePreparsedData(pp); }
                        }
                    } finally { Marshal.FreeHGlobal(detail); }
                }
            } finally { SetupDiDestroyDeviceInfoList(set); }
            return result;
        }
        // This allowlist cannot send settings, pairing, reset or firmware commands.
        public static byte[] QueryPacket(byte command, int length) {
            if (command != 1 && command != 3 && command != 4 && command != 16) throw new ArgumentException("Not a battery/identity query");
            if (length < 17 || length > 512) throw new ArgumentException("Unexpected report length");
            var packet = new byte[length]; packet[0]=8; packet[1]=command; packet[16]=(byte)((0x55-8-command)&255);
            return packet;
        }
        static int Io(SafeFileHandle handle, byte[] bytes, bool writing, int timeout) {
            using (var signal = new ManualResetEvent(false)) {
                var ov = new Ov(); ov.Event = signal.SafeWaitHandle.DangerousGetHandle();
                IntPtr ptr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Ov)));
                var pin = GCHandle.Alloc(bytes, GCHandleType.Pinned);
                try {
                    Marshal.StructureToPtr(ov, ptr, false);
                    bool success = writing ? WriteFile(handle, pin.AddrOfPinnedObject(), (uint)bytes.Length, IntPtr.Zero, ptr)
                        : ReadFile(handle, pin.AddrOfPinnedObject(), (uint)bytes.Length, IntPtr.Zero, ptr);
                    int error = success ? 0 : Marshal.GetLastWin32Error();
                    string direction=writing?"write":"read";
                    if (!success && error != 997) throw new IOException("HID "+direction+" failed: " + error);
                    if (!success && !signal.WaitOne(timeout)) {
                        // Keep both pin and OVERLAPPED alive until cancellation has completed.
                        // A reply racing the timeout must not be discarded as a failure.
                        CancelIoEx(handle, ptr); uint cancelled;
                        if(GetOverlappedResult(handle, ptr, out cancelled, true))return (int)cancelled;
                        int cancelError=Marshal.GetLastWin32Error();
                        if(cancelError!=995)throw new IOException("HID "+direction+" cancellation failed: "+cancelError);
                        throw new TimeoutException("HID "+direction+" timed out; mouse state is unknown");
                    }
                    uint count; if (!GetOverlappedResult(handle, ptr, out count, false)) throw new IOException("HID result failed: " + Marshal.GetLastWin32Error());
                    return (int)count;
                } finally { pin.Free(); Marshal.FreeHGlobal(ptr); }
            }
        }
        static byte[] Query(SafeFileHandle handle, HidDevice device, byte command) {
            var outgoing = QueryPacket(command, device.OutputLength);
            if(command==1) {
                outgoing[5]=8;var rng=new Random();for(int i=0;i<4;i++)outgoing[6+i]=(byte)rng.Next(0,255);
                int frameSum=0;for(int i=0;i<16;i++)frameSum+=outgoing[i];outgoing[16]=(byte)((0x55-frameSum)&255);
            }
            if(Io(handle, outgoing, true, 3000)!=outgoing.Length)throw new IOException("Incomplete battery query write");
            var watch = Stopwatch.StartNew();
            while (watch.ElapsedMilliseconds < 3000) {
                var incoming = new byte[device.InputLength]; int count = Io(handle, incoming, false, (int)Math.Max(100, 3000-watch.ElapsedMilliseconds));
                if (count < 17 || incoming[0]!=8 || incoming[1]!=command) continue;
                int sum=0; for(int i=0;i<17;i++) sum+=incoming[i];
                if ((sum&255)!=0x55) throw new IOException("Invalid battery response checksum");
                return incoming;
            }
            throw new TimeoutException("No matching battery response");
        }
        static byte[] EepromGetPacket(ushort address, byte length, int reportLength) {
            if(reportLength<17||length>10)throw new ArgumentException("Invalid EEPROM read length");
            var raw=new byte[reportLength];raw[0]=8;raw[1]=8;raw[2]=0;raw[3]=(byte)(address>>8);raw[4]=(byte)address;raw[5]=length;
            int sum=0;for(int i=0;i<16;i++)sum+=raw[i];raw[16]=(byte)((0x55-sum)&255);return raw;
        }
        static byte[] EepromGet(SafeFileHandle handle,HidDevice device,ushort address,byte length) {
            var outReport=EepromGetPacket(address,length,device.OutputLength);
            if(Io(handle,outReport,true,3000)!=outReport.Length)throw new IOException("Incomplete EEPROM read write");
            var watch=Stopwatch.StartNew();
            while(watch.ElapsedMilliseconds<3000) {
                var input=new byte[device.InputLength];int count=Io(handle,input,false,(int)Math.Max(100,3000-watch.ElapsedMilliseconds));
                if(count<17||input[0]!=8||input[1]!=8)continue;
                int sum=0;for(int i=0;i<17;i++)sum+=input[i];
                if((sum&255)!=0x55)throw new IOException("Invalid EEPROM response checksum");
                // Ignore a late response to another EEPROM query, even though
                // it has the same opcode. Only a matching frame can satisfy us.
                if(input[3]!=(byte)(address>>8)||input[4]!=(byte)address||input[5]!=length)continue;
                if(input[2]!=0)throw new IOException("EEPROM read failed with status "+input[2]);
                return input;
            }
            throw new TimeoutException("EEPROM read timed out; mouse state is unknown");
        }
        static byte[] EepromSetPacket(ushort address,byte[] data,int reportLength) {
            if(reportLength<17||data==null||data.Length==0||data.Length>10)throw new ArgumentException("Invalid EEPROM write length");
            var raw=new byte[reportLength];raw[0]=8;raw[1]=7;raw[2]=0;raw[3]=(byte)(address>>8);raw[4]=(byte)address;raw[5]=(byte)data.Length;
            Array.Copy(data,0,raw,6,data.Length);
            int sum=0;for(int i=0;i<16;i++)sum+=raw[i];raw[16]=(byte)((0x55-sum)&255);return raw;
        }
        static void EepromSet(SafeFileHandle handle,HidDevice device,ushort address,byte[] data) {
            var outReport=EepromSetPacket(address,data,device.OutputLength);
            if(Io(handle,outReport,true,3000)!=outReport.Length)throw new IOException("Incomplete EEPROM write");
            Thread.Sleep(10);
        }
        public static byte[] PackPaw3955Stage(int xDpi,int yDpi) {
            if(xDpi<1||xDpi>40000||yDpi<1||yDpi>40000)throw new ArgumentOutOfRangeException("DPI must be between 1 and 40000");
            int x=xDpi-1,y=yDpi-1;var raw=new byte[]{(byte)x,(byte)(x>>8),(byte)y,(byte)(y>>8),0,0};
            int sum=0;for(int i=0;i<5;i++)sum+=raw[i];raw[5]=(byte)((0x55-sum)&255);return raw;
        }
        public static DpiStage ParsePaw3955Stage(byte[] raw,int index,ushort address) {
            if(raw==null||raw.Length<6)throw new IOException("DPI stage response is truncated");
            int sum=0;for(int i=0;i<6;i++)sum+=raw[i];byte expected=(byte)((0x55-(sum-raw[5]))&255);
            bool valid=(sum&255)==0x55&&raw[5]==expected;if(!valid)throw new IOException("DPI stage checksum is invalid at 0x"+address.ToString("X4"));
            int x=(raw[0]|raw[1]<<8)+1;int y=(raw[2]|raw[3]<<8)+1;
            if((raw[4]&1)!=0)x*=2;if((raw[4]&16)!=0)y*=2;
            return new DpiStage {Index=index,Address=address,XDpi=x,YDpi=y,DpiEx=raw[4],Crc=raw[5],ExpectedCrc=expected,CrcValid=true,Raw=(byte[])raw.Clone()};
        }
        public static DpiConfig ParseDpiSystem(byte[] system) {
            if(system==null||system.Length!=17)throw new IOException("DPI system response must contain exactly 17 bytes");
            if(system[0]!=8||system[1]!=8||system[2]!=0||system[3]!=0||system[4]!=0||system[5]!=10)
                throw new IOException("Invalid DPI system response framing or status");
            int frameSum=0;for(int i=0;i<17;i++)frameSum+=system[i];
            if((frameSum&255)!=0x55)throw new IOException("Invalid DPI system response checksum");
            if(((system[8]+system[9])&255)!=0x55)throw new IOException("DPI stage-count checksum is invalid");
            if(((system[10]+system[11])&255)!=0x55)throw new IOException("DPI active-stage checksum is invalid");
            int count=system[8];if(count<1||count>8)throw new IOException("Invalid DPI stage count: "+count);
            int active=system[10];if(active>=count)throw new IOException("Invalid active DPI stage: "+active);
            var crc=new bool[5];for(int i=0;i<crc.Length;i++)crc[i]=((system[6+i*2]+system[7+i*2])&255)==0x55;
            return new DpiConfig {ActiveStage=active,MaxStages=count,Raw=(byte[])system.Clone(),CrcValid=true,CrcByField=crc};
        }
        public static void ValidateActiveDpiIndex(int index,int count) {
            if(count<1||count>8)throw new ArgumentOutOfRangeException("count","DPI stage count must be between 1 and 8");
            if(index<0||index>=count)throw new ArgumentOutOfRangeException("index","DPI stage index is outside the available stages");
        }
        static DpiConfig ReadDpiConfigFromHandle(SafeFileHandle file,HidDevice device,byte[] system) {
            var config=ParseDpiSystem(system);int count=config.MaxStages;
            config.DeviceKey=DeviceKey(device.Path);
            for(int i=0;i<count;i++) {
                ushort address=(ushort)(0x1b00+i*6);var frame=EepromGet(file,device,address,6);var raw=new byte[6];Array.Copy(frame,6,raw,0,6);
                config.Stages.Add(ParsePaw3955Stage(raw,i,address));
            }
            config.TimestampUtc=DateTime.UtcNow;
            return config;
        }
        public static MouseSnapshot ReadSnapshot(bool includeBattery) {
            try { return WithGate<MouseSnapshot>(delegate { return ReadSnapshotUnlocked(includeBattery); }); }
            catch(Exception error) { return new MouseSnapshot {BatteryError=includeBattery?error.Message:null,DpiError=error.Message}; }
        }
        static MouseSnapshot ReadSnapshotUnlocked(bool includeBattery) {
            var snapshot=new MouseSnapshot();
            var devices=Enumerate().FindAll(d=>d.UsagePage==0xff02&&d.Usage==2&&d.InputLength==17&&d.OutputLength==17);
            if(devices.Count!=1)throw new IOException("Expected one ATK 17-byte I/O collection");
            var device=devices[0];snapshot.DeviceKey=DeviceKey(device.Path);using(var file=CreateFile(device.Path,READ|WRITE,3,IntPtr.Zero,3,OVERLAPPED,IntPtr.Zero)) {
                if(file.IsInvalid)throw new IOException("Cannot open receiver");
                Query(file,device,1);
                if(includeBattery) {
                    try { snapshot.Battery=ParseBattery(Query(file,device,4));snapshot.Battery.Product=device.Product;snapshot.Battery.DeviceKey=snapshot.DeviceKey; }
                    catch(Exception error) { snapshot.BatteryError=error.Message; }
                }
                try { var system=EepromGet(file,device,0,10);snapshot.Dpi=ReadDpiConfigFromHandle(file,device,system); }
                catch(Exception error) { snapshot.DpiError=error.Message; }
            }
            snapshot.CheckedAtUtc=DateTime.UtcNow;return snapshot;
        }
        public static DpiConfig ReadDpiConfig() { return WithGate<DpiConfig>(ReadDpiConfigUnlocked); }
        static DpiConfig ReadDpiConfigUnlocked() {
            var devices=Enumerate().FindAll(d=>d.UsagePage==0xff02&&d.Usage==2&&d.InputLength==17&&d.OutputLength==17);
            if(devices.Count!=1)throw new IOException("Expected one ATK 17-byte I/O collection");
            var device=devices[0];using(var file=CreateFile(device.Path,READ|WRITE,3,IntPtr.Zero,3,OVERLAPPED,IntPtr.Zero)) {
                if(file.IsInvalid)throw new IOException("Cannot open receiver");
                Query(file,device,1);var system=EepromGet(file,device,0,10);return ReadDpiConfigFromHandle(file,device,system);
            }
        }
        public static DpiConfig SetDpiStage(int index,int xDpi,int yDpi) { return WithGate<DpiConfig>(delegate { return SetDpiStageUnlocked(index,xDpi,yDpi); }); }
        static DpiConfig SetDpiStageUnlocked(int index,int xDpi,int yDpi) {
            var target=PackPaw3955Stage(xDpi,yDpi);var devices=Enumerate().FindAll(d=>d.UsagePage==0xff02&&d.Usage==2&&d.InputLength==17&&d.OutputLength==17);
            if(devices.Count!=1)throw new IOException("Expected one ATK 17-byte I/O collection");
            var device=devices[0];using(var file=CreateFile(device.Path,READ|WRITE,3,IntPtr.Zero,3,OVERLAPPED,IntPtr.Zero)) {
                if(file.IsInvalid)throw new IOException("Cannot open receiver");
                Query(file,device,1);var system=EepromGet(file,device,0,10);int count=system[8];if(index<0||index>=count)throw new ArgumentOutOfRangeException("index");
                ushort address=(ushort)(0x1b00+index*6);var beforeFrame=EepromGet(file,device,address,6);var before=new byte[6];Array.Copy(beforeFrame,6,before,0,6);ParsePaw3955Stage(before,index,address);
                EepromSet(file,device,address,target);
                try {
                    var afterFrame=EepromGet(file,device,address,6);var after=new byte[6];Array.Copy(afterFrame,6,after,0,6);var parsed=ParsePaw3955Stage(after,index,address);
                    if(parsed.XDpi!=xDpi||parsed.YDpi!=yDpi)throw new IOException("DPI readback did not match the requested value");
                } catch(Exception error) {
                    try { EepromSet(file,device,address,before);var rollbackFrame=EepromGet(file,device,address,6);var rollback=new byte[6];Array.Copy(rollbackFrame,6,rollback,0,6);ParsePaw3955Stage(rollback,index,address); }
                    catch(Exception rollbackError) { throw new IOException("DPI write readback failed and rollback failed: "+rollbackError.Message,error); }
                    throw;
                }
                return ReadDpiConfigFromHandle(file,device,system);
            }
        }
        public static DpiConfig SetActiveDpiStage(int index) {
            // Reject globally invalid indices before enumeration, opening HID,
            // or sending any packet. Device-specific bounds are checked below.
            ValidateActiveDpiIndex(index,8);
            return WithGate<DpiConfig>(delegate { return SetActiveDpiStageUnlocked(index,null); });
        }
        public static DpiConfig SetActiveDpiStage(NativeDpiRequest request) {
            if(request==null)throw new ArgumentNullException("request");request.CheckCurrent();
            return WithGate<DpiConfig>(delegate {return SetActiveDpiStageUnlocked(request.Stage,request);});
        }
        static DpiConfig SetActiveDpiStageUnlocked(int index,NativeDpiRequest request) {
            if(request!=null)request.CheckCurrent();
            var devices=Enumerate().FindAll(d=>d.UsagePage==0xff02&&d.Usage==2&&d.InputLength==17&&d.OutputLength==17);
            if(devices.Count!=1)throw new IOException("Expected one ATK 17-byte I/O collection");
            var device=devices[0];if(request!=null&&DeviceKey(device.Path)!=request.DeviceKey)throw new IOException("The selected mouse receiver is no longer connected.");
            using(var file=CreateFile(device.Path,READ|WRITE,3,IntPtr.Zero,3,OVERLAPPED,IntPtr.Zero)) {
                if(file.IsInvalid)throw new IOException("Cannot open receiver");
                Query(file,device,1);var identity=Query(file,device,16);
                // RID is byte 0. The paired mouse CID/MID are bytes 6/7;
                // byte 5 describes the receiver and is not the mouse CID.
                if(identity[6]!=1||identity[7]!=54)throw new IOException("Paired device is not the verified ATK A9 Air+");
                var system=EepromGet(file,device,0,10);var original=ReadDpiConfigFromHandle(file,device,system);
                ValidateActiveDpiIndex(index,original.MaxStages);
                if(request!=null)request.Validate(original);
                if(original.ActiveStage==index)return original;
                byte[] before=new byte[]{system[10],system[11]};byte[] target=new byte[]{(byte)index,(byte)((0x55-index)&255)};
                byte[] confirmed;
                if(request!=null)request.CheckCurrent();
                try {
                    EepromSet(file,device,4,target);
                    confirmed=EepromGet(file,device,0,10);var confirmedSystem=ParseDpiSystem(confirmed);
                    if(confirmedSystem.ActiveStage!=index||confirmed[10]!=target[0]||confirmed[11]!=target[1])throw new IOException("DPI active-stage readback did not match");
                } catch(Exception error) {
                    try {
                        EepromSet(file,device,4,before);var rollback=EepromGet(file,device,0,10);var restored=ReadDpiConfigFromHandle(file,device,rollback);
                        for(int i=6;i<16;i++)if(rollback[i]!=system[i])throw new IOException("DPI system rollback byte mismatch at "+(i-6));
                        for(int i=0;i<original.Stages.Count;i++)for(int j=0;j<original.Stages[i].Raw.Length;j++)
                            if(restored.Stages[i].Raw[j]!=original.Stages[i].Raw[j])throw new IOException("DPI stage rollback byte mismatch at stage "+i);
                    }
                    catch(Exception rollbackError) { throw new IOException("DPI stage switch failed and rollback failed: "+rollbackError.Message,error); }
                    throw;
                }
                // The two written bytes have been verified. A later table-read
                // failure is a refresh problem, not a reason to undo the switch.
                DateTime confirmedAt=DateTime.UtcNow;
                try { return ReadDpiConfigFromHandle(file,device,confirmed); }
                catch(Exception refreshError) {
                    original.ActiveStage=index;original.Raw=(byte[])confirmed.Clone();original.TimestampUtc=confirmedAt;original.RefreshError=refreshError.Message;return original;
                }
            }
        }
        public static string DpiDiagnostics() { return WithGate<string>(DpiDiagnosticsUnlocked); }
        static string DpiDiagnosticsUnlocked() {
            var config=ReadDpiConfigUnlocked();var sb=new StringBuilder();sb.Append("{\"addressBase\":6912,\"activeStage\":").Append(config.ActiveStage).Append(",\"stageCount\":").Append(config.Stages.Count).Append(",\"stages\":[");
            for(int i=0;i<config.Stages.Count;i++){if(i>0)sb.Append(',');var s=config.Stages[i];sb.Append("{\"index\":").Append(s.Index).Append(",\"address\":").Append(s.Address).Append(",\"xDpi\":").Append(s.XDpi).Append(",\"yDpi\":").Append(s.YDpi).Append(",\"raw\":\"").Append(Hex(s.Raw)).Append("\",\"crcValid\":true}");}
            sb.Append("]}");return sb.ToString();
        }
        public static BatteryReading Read() {
            return WithGate<BatteryReading>(ReadUnlocked);
        }
        static T WithGate<T>(Func<T> query) {
            using(var gate=new Mutex(false,"Local\\ATK-A9-Air-Battery-HID")) {
                bool locked=false;
                try {
                    try{locked=gate.WaitOne(0);}catch(AbandonedMutexException){locked=true;}
                    if(!locked)throw new IOException("Another battery query is already in progress");
                    return query();
                } finally {if(locked)gate.ReleaseMutex();}
            }
        }
        static BatteryReading ReadUnlocked() {
            // WebHID groups this dongle's collections. On Windows the RID 08 I/O
            // collection is FF02:0002; FF04 only exposes a separate feature report.
            var devices = Enumerate().FindAll(d => d.UsagePage==0xff02 && d.Usage==2 && d.InputLength==17 && d.OutputLength==17);
            if (devices.Count!=1) throw new IOException(devices.Count==0 ? "ATK 373B:1278 receiver not found" : "Multiple ATK receivers found; refusing an ambiguous selection");
            var device=devices[0];
            using (var file=CreateFile(device.Path, READ|WRITE, 3, IntPtr.Zero, 3, OVERLAPPED, IntPtr.Zero)) {
                if (file.IsInvalid) throw new IOException("Cannot open ATK receiver: " + Marshal.GetLastWin32Error());
                Query(file,device,1);var battery=Query(file,device,4);
                var reading=ParseBattery(battery);reading.Product=device.Product;
                return reading;
            }
        }
        public static BatteryReading ParseBattery(byte[] battery) {
            if(battery==null||battery.Length<17||battery[0]!=8||battery[1]!=4)throw new IOException("Invalid battery response framing");
            int sum=0;for(int i=0;i<17;i++)sum+=battery[i];
            if((sum&255)!=0x55)throw new IOException("Invalid battery response checksum");
            if(battery[6]>100||battery[7]>1)throw new IOException("Invalid battery percentage or charge flag");
            return new BatteryReading {Percent=battery[6],Charging=battery[7]==1,Millivolts=(battery[8]<<8)|battery[9]};
        }
        public static string Diagnostics() {
            return WithGate<string>(DiagnosticUnlocked);
        }
        internal static string Hex(byte[] value) {
            if(value==null)return null;
            var sb=new StringBuilder(value.Length*2);foreach(byte b in value)sb.Append(b.ToString("X2"));return sb.ToString();
        }
        static string DiagnosticUnlocked() {
            var devices = Enumerate().FindAll(d => d.UsagePage==0xff02 && d.Usage==2 && d.InputLength==17 && d.OutputLength==17);
            if (devices.Count!=1) throw new IOException("Expected one ATK receiver");
            var device=devices[0];
            using(var file=CreateFile(device.Path,READ|WRITE,3,IntPtr.Zero,3,OVERLAPPED,IntPtr.Zero)) {
                if(file.IsInvalid) throw new IOException("Cannot open receiver");
                byte[] online=null,identity=null,battery=null;string onlineError=null,identityError=null,batteryError=null;
                try{online=Query(file,device,3);}catch(Exception e){onlineError=e.Message;}
                if(online!=null){try{identity=Query(file,device,16);}catch(Exception e){identityError=e.Message;}}
                if(identity!=null){try{battery=Query(file,device,4);}catch(Exception e){batteryError=e.Message;}}
                string json="{\"onlineStatus\":"+(online==null?"null":online[6].ToString())+
                    ",\"onlineRaw\":"+(online==null?"null":"\""+Hex(online)+"\"")+
                    ",\"onlineError\":"+(onlineError==null?"null":"\""+onlineError.Replace("\\","\\\\").Replace("\"","\\\"")+"\"")+
                    ",\"cid\":"+(identity==null?"null":identity[6].ToString())+
                    ",\"mid\":"+(identity==null?"null":identity[7].ToString())+
                    ",\"identityRaw\":"+(identity==null?"null":"\""+Hex(identity)+"\"")+
                    ",\"identityError\":"+(identityError==null?"null":"\""+identityError.Replace("\\","\\\\").Replace("\"","\\\"")+"\"")+
                    ",\"percent\":"+(battery==null?"null":battery[6].ToString())+
                    ",\"chargeFlag\":"+(battery==null?"null":battery[7].ToString())+
                    ",\"millivolts\":"+(battery==null?"null":((battery[8]<<8)|battery[9]).ToString())+
                    ",\"batteryRaw\":"+(battery==null?"null":"\""+Hex(battery)+"\"")+
                    ",\"batteryError\":"+(batteryError==null?"null":"\""+batteryError.Replace("\\","\\\\").Replace("\"","\\\"")+"\"")+
                    "}";return json;
            }
        }
        public static string PowerDiagnostic() {
            return WithGate<string>(PowerUnlocked);
        }
        static string PowerUnlocked() {
            var devices = Enumerate().FindAll(d => d.UsagePage==0xff02 && d.Usage==2 && d.InputLength==17 && d.OutputLength==17);
            if(devices.Count!=1) throw new IOException("Expected one ATK receiver");
            using(var file=CreateFile(devices[0].Path,READ|WRITE,3,IntPtr.Zero,3,OVERLAPPED,IntPtr.Zero)) {
                if(file.IsInvalid)throw new IOException("Cannot open receiver");
                var battery=Query(file,devices[0],4);
                return "{\"percent\":"+battery[6]+",\"chargeFlag\":"+battery[7]+",\"millivolts\":"+((battery[8]<<8)|battery[9])+"}";
            }
        }
    }
}
