using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace AtkBattery {
    public sealed class HeadsetReading {
        public bool ReceiverPresenceVerified;
        public bool Connected;
        public int? Percent;
        public bool? Charging;
        public DateTime TimestampUtc = DateTime.UtcNow;
        public string Detail = "";
        public string Product = "HyperX Cloud Alpha Wireless";
        // A USB receiver being present is not proof of a connected radio.
        public bool ReceiverPresent;
        public bool ConnectionVerified;
        public DateTime ConnectionTimestampUtc = DateTime.MinValue;
        public DateTime BatteryTimestampUtc = DateTime.MinValue;
        public DateTime ChargingTimestampUtc = DateTime.MinValue;
    }

    // Query-only provider for the verified 03F0:098D vendor collection.
    // It never writes settings, pairing, reset, firmware or audio commands.
    public static class HeadsetBattery {
        public const int ReportLength = 31;
        public const int PollTimeBudgetMs = 2400;
        const int QueryTimeBudgetMs = 750;
        const uint ReadAccess = 0x80000000, WriteAccess = 0x40000000;
        const uint Overlapped = 0x40000000;
        const int Pending = 997, Aborted = 995;
        static readonly object Gate = new object();
        static readonly Guid HidGuid = new Guid("4d1e55b2-f16f-11cf-88cb-001111000030");

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
        [StructLayout(LayoutKind.Sequential)] struct NativeOverlapped {
            public IntPtr Internal, InternalHigh; public uint Offset, OffsetHigh; public IntPtr Event;
        }
        [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern IntPtr SetupDiGetClassDevs(ref Guid guid, IntPtr enumerator, IntPtr hwnd, uint flags);
        [DllImport("setupapi.dll", SetLastError = true)]
        static extern bool SetupDiEnumDeviceInterfaces(IntPtr set, IntPtr device, ref Guid guid, uint index, ref InterfaceData data);
        [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr set, ref InterfaceData data, IntPtr detail, uint size, out uint needed, IntPtr device);
        [DllImport("setupapi.dll")] static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
        [DllImport("hid.dll")][return: MarshalAs(UnmanagedType.U1)]
        static extern bool HidD_GetPreparsedData(SafeFileHandle handle, out IntPtr data);
        [DllImport("hid.dll")][return: MarshalAs(UnmanagedType.U1)] static extern bool HidD_FreePreparsedData(IntPtr data);
        [DllImport("hid.dll")] static extern int HidP_GetCaps(IntPtr data, out Caps caps);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool ReadFile(SafeFileHandle handle, IntPtr buffer, uint count, IntPtr read, IntPtr overlap);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool WriteFile(SafeFileHandle handle, IntPtr buffer, uint count, IntPtr written, IntPtr overlap);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool GetOverlappedResult(SafeFileHandle handle, IntPtr overlap, out uint count, bool wait);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool CancelIoEx(SafeFileHandle handle, IntPtr overlap);

        static bool AllowedQuery(byte command) {
            return command == 0x03 || command == 0x0b || command == 0x0c;
        }
        public static byte[] QueryPacket(byte command) {
            if (!AllowedQuery(command)) throw new ArgumentException("Only connection, battery and charging queries are allowed", "command");
            var report = new byte[ReportLength];
            report[0] = 0x21; report[1] = 0xbb; report[2] = command;
            return report;
        }
        static bool MatchingFrame(byte[] report, byte opcode) {
            return report != null && report.Length == ReportLength
                && report[0] == 0x21 && report[1] == 0xbb && report[2] == opcode;
        }
        static bool ApplyValue(HeadsetReading reading, byte command, byte value, DateTime timestampUtc) {
            if (reading == null) return false;
            if (command == 0x03) {
                if (value != 0x01 && value != 0x02) return false;
                reading.ConnectionVerified = true;
                reading.Connected = value == 0x02;
                reading.ConnectionTimestampUtc = timestampUtc;
                if (!reading.Connected) {
                    reading.Percent = null; reading.Charging = null;
                    reading.BatteryTimestampUtc = DateTime.MinValue;
                    reading.ChargingTimestampUtc = DateTime.MinValue;
                }
                return true;
            }
            if (command == 0x0b) {
                if (!reading.ConnectionVerified || !reading.Connected) return false;
                if (value > 100) return false;
                reading.Percent = value;
                reading.BatteryTimestampUtc = timestampUtc;
                return true;
            }
            if (command == 0x0c) {
                if (!reading.ConnectionVerified || !reading.Connected) return false;
                // NGENUITY's CloudAlphaWireless GetChargeStatus and input
                // event handler both map 00 to NoCharging and 01 to
                // WireCharging. Other values are left unknown, not guessed.
                if (value != 0x00 && value != 0x01) return false;
                reading.Charging = value == 0x01;
                reading.ChargingTimestampUtc = timestampUtc;
                return true;
            }
            return false;
        }
        // Pure parsers are also used by the offline probe. An unrelated or
        // all-zero HID report can never satisfy the requested query.
        public static bool TryApplyQueryResponse(HeadsetReading reading, byte expectedCommand, byte[] report, DateTime timestampUtc) {
            return AllowedQuery(expectedCommand) && MatchingFrame(report, expectedCommand)
                && ApplyValue(reading, expectedCommand, report[3], timestampUtc);
        }
        public static bool TryApplyEvent(HeadsetReading reading, byte[] report, DateTime timestampUtc) {
            if (report == null || report.Length != ReportLength || report[0] != 0x21 || report[1] != 0xbb) return false;
            switch (report[2]) {
                case 0x24: return ApplyValue(reading, 0x03, report[3], timestampUtc);
                case 0x25: return ApplyValue(reading, 0x0b, report[3], timestampUtc);
                case 0x26: return ApplyValue(reading, 0x0c, report[3], timestampUtc);
                // Mic-mute event 23 is unrelated to radio/battery state.
                default: return false;
            }
        }

        static string FindControlPath(HeadsetReading reading, Stopwatch budget) {
            var guid = HidGuid;
            IntPtr set = SetupDiGetClassDevs(ref guid, IntPtr.Zero, IntPtr.Zero, 0x12);
            if (set == new IntPtr(-1)) throw new IOException("HID enumeration failed: " + Marshal.GetLastWin32Error());
            string found = null;
            bool enumerationCompleted = false;
            try {
                for (uint index = 0; budget.ElapsedMilliseconds < PollTimeBudgetMs; index++) {
                    var data = new InterfaceData(); data.Size = Marshal.SizeOf(typeof(InterfaceData));
                    if (!SetupDiEnumDeviceInterfaces(set, IntPtr.Zero, ref guid, index, ref data)) {
                        int error = Marshal.GetLastWin32Error();
                        if (error != 259) throw new IOException("HID interface enumeration failed: " + error);
                        enumerationCompleted = true;
                        break;
                    }
                    uint needed;
                    SetupDiGetDeviceInterfaceDetail(set, ref data, IntPtr.Zero, 0, out needed, IntPtr.Zero);
                    if (needed < 8 || needed > 65536) continue;
                    IntPtr detail = Marshal.AllocHGlobal((int)needed);
                    try {
                        Marshal.WriteInt32(detail, IntPtr.Size == 8 ? 8 : 6);
                        if (!SetupDiGetDeviceInterfaceDetail(set, ref data, detail, needed, out needed, IntPtr.Zero)) continue;
                        string path = Marshal.PtrToStringUni(IntPtr.Add(detail, 4));
                        if (path == null || path.IndexOf("vid_03f0&pid_098d&mi_03&col01", StringComparison.OrdinalIgnoreCase) < 0) continue;
                        reading.ReceiverPresent = true;
                        using (var handle = CreateFile(path, 0, 3, IntPtr.Zero, 3, 0, IntPtr.Zero)) {
                            if (handle.IsInvalid) throw new IOException("Cannot inspect HyperX control collection: " + Marshal.GetLastWin32Error());
                            IntPtr parsed;
                            if (!HidD_GetPreparsedData(handle, out parsed)) throw new IOException("Cannot inspect HyperX HID capabilities");
                            try {
                                Caps caps;
                                if (HidP_GetCaps(parsed, out caps) != 0x00110000) throw new IOException("Invalid HyperX HID capabilities");
                                if (caps.UsagePage != 0xff43 || caps.Usage != 0x0202
                                    || caps.InputReportByteLength != ReportLength || caps.OutputReportByteLength != ReportLength
                                    || caps.FeatureReportByteLength != 0)
                                    throw new IOException("HyperX control collection does not match the verified protocol");
                            } finally { HidD_FreePreparsedData(parsed); }
                        }
                        if (found != null) throw new IOException("Multiple HyperX control collections found; refusing an ambiguous receiver");
                        found = path;
                    } finally { Marshal.FreeHGlobal(detail); }
                }
            } finally { SetupDiDestroyDeviceInfoList(set); }
            if (!enumerationCompleted) throw new TimeoutException("HyperX enumeration time budget exhausted; state is unknown");
            return found;
        }
        static int Io(SafeFileHandle handle, byte[] bytes, bool writing, int timeoutMs) {
            if (timeoutMs <= 0) throw new TimeoutException("HyperX query time budget exhausted");
            using (var signal = new ManualResetEvent(false)) {
                var native = new NativeOverlapped(); native.Event = signal.SafeWaitHandle.DangerousGetHandle();
                IntPtr pointer = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NativeOverlapped)));
                var pin = GCHandle.Alloc(bytes, GCHandleType.Pinned);
                try {
                    Marshal.StructureToPtr(native, pointer, false);
                    bool completed = writing
                        ? WriteFile(handle, pin.AddrOfPinnedObject(), (uint)bytes.Length, IntPtr.Zero, pointer)
                        : ReadFile(handle, pin.AddrOfPinnedObject(), (uint)bytes.Length, IntPtr.Zero, pointer);
                    int error = completed ? 0 : Marshal.GetLastWin32Error();
                    string direction = writing ? "write" : "read";
                    if (!completed && error != Pending) throw new IOException("HyperX HID " + direction + " failed: " + error);
                    if (!completed && !signal.WaitOne(timeoutMs)) {
                        // The buffer, OVERLAPPED and event must all outlive a
                        // pending kernel operation. Drain cancellation before
                        // freeing them, and accept a completion racing timeout.
                        CancelIoEx(handle, pointer);
                        uint lateCount;
                        if (GetOverlappedResult(handle, pointer, out lateCount, true)) return (int)lateCount;
                        int cancellationError = Marshal.GetLastWin32Error();
                        if (cancellationError != Aborted) throw new IOException("HyperX HID cancellation failed: " + cancellationError);
                        throw new TimeoutException("HyperX HID " + direction + " timed out; state is unknown");
                    }
                    uint count;
                    if (!GetOverlappedResult(handle, pointer, out count, false)) throw new IOException("HyperX HID result failed: " + Marshal.GetLastWin32Error());
                    return (int)count;
                } finally { pin.Free(); Marshal.FreeHGlobal(pointer); }
            }
        }
        static int RemainingMs(Stopwatch budget, long deadline) {
            return (int)Math.Max(0, deadline - budget.ElapsedMilliseconds);
        }
        static bool Query(SafeFileHandle handle, HeadsetReading reading, byte command, Stopwatch budget) {
            long deadline = Math.Min(PollTimeBudgetMs, budget.ElapsedMilliseconds + QueryTimeBudgetMs);
            byte[] outgoing = QueryPacket(command);
            if (Io(handle, outgoing, true, Math.Min(200, RemainingMs(budget, deadline))) != outgoing.Length)
                throw new IOException("Incomplete HyperX query write");
            while (RemainingMs(budget, deadline) > 0) {
                var incoming = new byte[ReportLength];
                int count = Io(handle, incoming, false, RemainingMs(budget, deadline));
                if (count != ReportLength) continue;
                DateTime received = DateTime.UtcNow;
                if (TryApplyQueryResponse(reading, command, incoming, received)) return true;
                TryApplyEvent(reading, incoming, received);
            }
            return false;
        }
        public static HeadsetReading Read() {
            var reading = new HeadsetReading();
            if (!Monitor.TryEnter(Gate)) {
                reading.Detail = "Another HyperX poll is already running; state is unknown";
                return reading;
            }
            var budget = Stopwatch.StartNew();
            string failures = "";
            try {
                string path = FindControlPath(reading, budget);
                reading.ReceiverPresenceVerified=true;
                if (path == null) {
                    reading.Detail = reading.ReceiverPresent ? "HyperX control collection unavailable" : "HyperX receiver not present";
                    return reading;
                }
                using (var handle = CreateFile(path, ReadAccess | WriteAccess, 3, IntPtr.Zero, 3, Overlapped, IntPtr.Zero)) {
                    if (handle.IsInvalid) throw new IOException("Cannot open HyperX control collection: " + Marshal.GetLastWin32Error());
                    foreach (byte command in new byte[] { 0x03, 0x0b, 0x0c }) {
                        if (budget.ElapsedMilliseconds >= PollTimeBudgetMs) break;
                        if (reading.ConnectionVerified && !reading.Connected) break;
                        try {
                            if (!Query(handle, reading, command, budget)) failures += "No matching " + command.ToString("X2") + " reply. ";
                        } catch (IOException error) { failures += error.Message + ". "; }
                          catch (TimeoutException error) { failures += error.Message + ". "; }
                    }
                }
                if (!reading.ConnectionVerified) {
                    reading.Connected = false;
                    reading.Percent = null; reading.Charging = null;
                    reading.BatteryTimestampUtc = DateTime.MinValue; reading.ChargingTimestampUtc = DateTime.MinValue;
                    reading.Detail = "Receiver present; headset radio state not verified. " + failures;
                } else if (!reading.Connected) {
                    reading.Percent = null; reading.Charging = null;
                    reading.BatteryTimestampUtc = DateTime.MinValue; reading.ChargingTimestampUtc = DateTime.MinValue;
                    reading.Detail = "Headset radio disconnected";
                } else {
                    reading.Detail = reading.Percent.HasValue ? "Headset radio connected; battery verified" : "Headset radio connected; battery unavailable. " + failures;
                }
            } catch (Exception error) {
                reading.Connected = false;
                reading.ConnectionVerified = false;
                reading.Percent = null; reading.Charging = null;
                reading.BatteryTimestampUtc = DateTime.MinValue; reading.ChargingTimestampUtc = DateTime.MinValue;
                reading.Detail = "HyperX state unknown: " + error.Message;
            } finally {
                reading.TimestampUtc = DateTime.UtcNow;
                Monitor.Exit(Gate);
            }
            return reading;
        }
    }
}
