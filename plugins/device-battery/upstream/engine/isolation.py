"""At most two hidden, kill-bounded reader children; no orphaning timeout threads.

Only pipe pumping uses a thread. A reader timeout terminates the entire child's
Windows Job (including Bluetooth PowerShell) and waits for process exit before
its slot can be reused. A waiting thread is never treated as cancellation.
"""
from __future__ import annotations

import ctypes as c
import json
import os
import queue
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

MAX_LINE = 1024 * 1024


def wire_encode(value):
    if isinstance(value, bytes):
        return {"$localBytes": value.hex()}
    raise TypeError("unsupported local IPC value")


def wire_decode(value):
    if set(value) == {"$localBytes"} and isinstance(value["$localBytes"], str):
        return bytes.fromhex(value["$localBytes"])
    return value


class IsolationError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


class _BasicLimit(c.Structure):
    _fields_ = [("perProcess", c.c_int64), ("perJob", c.c_int64), ("flags", c.c_uint32),
                ("minimum", c.c_size_t), ("maximum", c.c_size_t), ("active", c.c_uint32),
                ("affinity", c.c_size_t), ("priority", c.c_uint32), ("scheduling", c.c_uint32)]


class _IoCounters(c.Structure):
    _fields_ = [(name, c.c_uint64) for name in ("readOps", "writeOps", "otherOps", "readBytes", "writeBytes", "otherBytes")]


class _ExtendedLimit(c.Structure):
    _fields_ = [("basic", _BasicLimit), ("io", _IoCounters), ("processMemory", c.c_size_t),
                ("jobMemory", c.c_size_t), ("peakProcess", c.c_size_t), ("peakJob", c.c_size_t)]


class KillJob:
    def __init__(self, process):
        self.handle = None
        if os.name != "nt":
            return
        self.kernel = c.WinDLL("kernel32", use_last_error=True)
        self.kernel.CreateJobObjectW.argtypes = [c.c_void_p, c.c_wchar_p]
        self.kernel.CreateJobObjectW.restype = c.c_void_p
        self.kernel.SetInformationJobObject.argtypes = [c.c_void_p, c.c_int, c.c_void_p, c.c_uint32]
        self.kernel.AssignProcessToJobObject.argtypes = [c.c_void_p, c.c_void_p]
        self.kernel.CloseHandle.argtypes = [c.c_void_p]
        handle = self.kernel.CreateJobObjectW(None, None)
        if not handle:
            raise IsolationError("job_unavailable")
        limits = _ExtendedLimit()
        limits.basic.flags = 0x00002000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not self.kernel.SetInformationJobObject(handle, 9, c.byref(limits), c.sizeof(limits)):
            self.kernel.CloseHandle(handle)
            raise IsolationError("job_unavailable")
        if not self.kernel.AssignProcessToJobObject(handle, c.c_void_p(int(process._handle))):
            self.kernel.CloseHandle(handle)
            raise IsolationError("job_unavailable")
        self.handle = handle

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None


class ReaderProcess:
    def __init__(self, command=None):
        self.command = command or [sys.executable, "-I", "-B", str(Path(__file__).with_name("server.py")), "--reader-child"]
        self.process = None
        self.job = None
        self.queue = None
        self.reader = None
        self.pending = None
        self.serial = 0
        self.quarantined = False

    @staticmethod
    def _pump(stream, target):
        try:
            while True:
                line = stream.readline(MAX_LINE + 1)
                if not line:
                    break
                if len(line) > MAX_LINE:
                    target.put_nowait(IsolationError("invalid_response"))
                    return
                target.put_nowait(line)
        except (OSError, ValueError, queue.Full):
            pass
        finally:
            try:
                target.put_nowait(None)
            except queue.Full:
                pass

    def _ensure(self):
        if self.quarantined and self.process is not None and self.process.poll() is None:
            raise IsolationError("termination_pending")
        if self.process is not None and self.process.poll() is None:
            return
        self.close()
        self.quarantined = False
        kwargs = {"creationflags": 0x08000000} if os.name == "nt" else {"start_new_session": True}
        try:
            self.process = subprocess.Popen(self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                            stderr=subprocess.DEVNULL, **kwargs)
            # No query is sent until its lifetime is bound to this private job.
            self.job = KillJob(self.process)
            self.queue = queue.Queue(maxsize=4)
            self.reader = threading.Thread(target=self._pump, args=(self.process.stdout, self.queue), daemon=True)
            self.reader.start()
        except Exception:
            self.close()
            raise IsolationError("worker_unavailable")

    def start(self, command, budget):
        if self.pending is not None:
            raise IsolationError("reader_busy")
        self._ensure()
        self.serial += 1
        message = dict(command, sequence=self.serial)
        data = json.dumps(message, ensure_ascii=True, default=wire_encode).encode("ascii") + b"\n"
        if len(data) > MAX_LINE:
            raise IsolationError("invalid_request")
        self.pending = (self.serial, time.monotonic() + budget)
        try:
            self.process.stdin.write(data)
            self.process.stdin.flush()
        except (OSError, ValueError):
            self.close()
            raise IsolationError("worker_unavailable")

    def result(self):
        """None while pending; result dict, or IsolationError on a hard boundary."""
        if self.pending is None:
            return None
        sequence, deadline = self.pending
        try:
            item = self.queue.get_nowait()
        except queue.Empty:
            if time.monotonic() < deadline and self.process.poll() is None:
                return None
            code = "timeout" if time.monotonic() >= deadline else "worker_exited"
            self.close()
            raise IsolationError(code)
        if item is None or isinstance(item, Exception):
            self.close()
            raise IsolationError("invalid_response" if item else "worker_exited")
        try:
            data = json.loads(item, object_hook=wire_decode)
            if data.get("sequence") != sequence:
                raise ValueError("stale child response")
        except (ValueError, TypeError, AttributeError):
            self.close()
            raise IsolationError("invalid_response")
        self.pending = None
        if data.get("errorCode"):
            raise IsolationError(data["errorCode"] if data["errorCode"] in ("read_failed", "invalid_request", "load_failed") else "read_failed")
        return data

    def close(self):
        process, job, reader = self.process, self.job, self.reader
        self.process = self.job = self.reader = self.queue = self.pending = None
        if process is None:
            return
        # Closing the Windows job kills nested PowerShell too. POSIX tests use
        # a private process group for the same descendant-boundary behavior.
        if job is not None:
            job.close()
        if os.name != "nt":
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass
        if process.poll() is None:
            try:
                process.kill()
            except OSError:
                pass
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            # Rare kernel/driver teardown delay: do not spawn another worker
            # or close a pipe underneath its blocking reader. Quarantine this
            # slot until the process is actually gone; the GUI's outer Job is
            # also the final lifetime boundary when the app exits.
            self.process, self.job, self.reader = process, job, reader
            self.quarantined = True
            return
        except OSError:
            pass
        for stream in (process.stdin, process.stdout):
            try:
                stream.close()
            except (OSError, ValueError):
                pass
        if reader is not None:
            reader.join(timeout=2)
        self.quarantined = False
