//! Access to a specific DLL mapped by a verified executable.

use std::{
    ffi::OsString,
    mem::size_of,
    os::windows::ffi::OsStringExt,
    path::{Path, PathBuf},
};
use windows::Win32::{
    Foundation::WAIT_OBJECT_0,
    System::{
        Diagnostics::{
            Debug::{ReadProcessMemory, WriteProcessMemory},
            ToolHelp::{
                CreateToolhelp32Snapshot, Module32FirstW, Module32NextW, MODULEENTRY32W,
                TH32CS_SNAPMODULE,
            },
        },
        Memory::{
            VirtualQueryEx, MEMORY_BASIC_INFORMATION, MEM_COMMIT, MEM_IMAGE, PAGE_READWRITE,
            PAGE_WRITECOPY,
        },
        Threading::{
            OpenProcess, WaitForSingleObject, PROCESS_QUERY_INFORMATION, PROCESS_SYNCHRONIZE,
            PROCESS_VM_OPERATION, PROCESS_VM_READ, PROCESS_VM_WRITE,
        },
    },
};

use super::{
    process::{image_path_of, ProcessHandle},
    process_times::start_time_of,
};

pub(crate) struct RemoteModule {
    process: ProcessHandle,
    pub(crate) path: PathBuf,
    pub(crate) started_at: u64,
    base: usize,
    size: usize,
}

impl RemoteModule {
    pub(crate) fn open(pid: u32, executable: &Path, module: &str) -> Option<Self> {
        let access = PROCESS_QUERY_INFORMATION
            | PROCESS_SYNCHRONIZE
            | PROCESS_VM_OPERATION
            | PROCESS_VM_READ
            | PROCESS_VM_WRITE;
        // SAFETY: OpenProcess has no pointer arguments; ProcessHandle owns the result.
        let process = ProcessHandle(unsafe { OpenProcess(access, false, pid) }.ok()?);
        let image = image_path_of(&process)?;
        if !same_path(Path::new(&image), executable) {
            return None;
        }
        let started_at = start_time_of(&process)?;
        let (path, base, size) = find_module(pid, module)?;
        let parent = executable.parent()?;
        let module_dir = path.parent()?;
        // Normal installs load the DLL next to the EXE or from a version subdirectory.
        if !same_path(module_dir, parent)
            && !module_dir
                .parent()
                .is_some_and(|dir| same_path(dir, parent))
        {
            return None;
        }
        let remote = Self {
            process,
            path,
            started_at,
            base,
            size,
        };
        // The module snapshot is keyed by PID. A process that exited during enumeration
        // cannot be used, even if another process acquired its PID in the meantime.
        (!remote.exited()).then_some(remote)
    }

    pub(crate) fn exited(&self) -> bool {
        // SAFETY: the handle is live, has SYNCHRONIZE access, and zero only queries its state.
        unsafe { WaitForSingleObject(self.process.0, 0) == WAIT_OBJECT_0 }
    }

    pub(crate) fn read<const N: usize>(&self, rva: u32) -> Option<[u8; N]> {
        let address = self.address(rva, N)?;
        let mut buffer = [0; N];
        let mut read = 0;
        // SAFETY: the kernel validates the remote address; buffer is writable for N bytes.
        unsafe {
            ReadProcessMemory(
                self.process.0,
                address as _,
                buffer.as_mut_ptr().cast(),
                N,
                Some(&mut read),
            )
        }
        .ok()?;
        (read == N).then_some(buffer)
    }

    /// Compare before changing one byte in writable data owned by this exact DLL.
    pub(crate) fn set_data_byte(&self, rva: u32, before: u8, after: u8) -> bool {
        let Some(address) = self.address(rva, 1) else {
            return false;
        };
        let mut memory = MEMORY_BASIC_INFORMATION::default();
        // SAFETY: VirtualQueryEx receives a valid output buffer and checks the remote address.
        let queried = unsafe {
            VirtualQueryEx(
                self.process.0,
                Some(address as _),
                &mut memory,
                size_of::<MEMORY_BASIC_INFORMATION>(),
            )
        };
        if queried == 0
            || memory.AllocationBase as usize != self.base
            || memory.Type != MEM_IMAGE
            || memory.State != MEM_COMMIT
            || ![PAGE_READWRITE, PAGE_WRITECOPY].contains(&memory.Protect)
            || self.read::<1>(rva) != Some([before])
        {
            return false;
        }
        let mut written = 0;
        // SAFETY: the kernel validates the target in the held process, and &after holds one byte.
        let result = unsafe {
            WriteProcessMemory(
                self.process.0,
                address as _,
                std::ptr::from_ref(&after).cast(),
                1,
                Some(&mut written),
            )
        };
        result.is_ok() && written == 1
    }

    fn address(&self, rva: u32, length: usize) -> Option<usize> {
        let offset = rva as usize;
        (offset.checked_add(length)? <= self.size)
            .then(|| self.base.checked_add(offset))
            .flatten()
    }
}

fn same_path(left: &Path, right: &Path) -> bool {
    let normalized = |path: &Path| {
        path.to_string_lossy()
            .trim_start_matches(r"\\?\")
            .replace('/', "\\")
            .to_lowercase()
    };
    normalized(left) == normalized(right)
}

fn find_module(pid: u32, name: &str) -> Option<(PathBuf, usize, usize)> {
    // SAFETY: snapshot creation has no pointer arguments; ProcessHandle closes the result.
    let snapshot = ProcessHandle(unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPMODULE, pid) }.ok()?);
    let mut entry = MODULEENTRY32W {
        dwSize: size_of::<MODULEENTRY32W>() as u32,
        ..Default::default()
    };
    // SAFETY: the snapshot is live, and entry is writable and has dwSize set.
    unsafe { Module32FirstW(snapshot.0, &mut entry) }.ok()?;
    loop {
        let module = entry.szModule.split(|&ch| ch == 0).next()?;
        if String::from_utf16_lossy(module).eq_ignore_ascii_case(name) {
            let path = entry.szExePath.split(|&ch| ch == 0).next()?;
            return Some((
                OsString::from_wide(path).into(),
                entry.modBaseAddr as usize,
                entry.modBaseSize as usize,
            ));
        }
        // SAFETY: the same snapshot and writable entry are valid until the end of iteration.
        unsafe { Module32NextW(snapshot.0, &mut entry) }.ok()?;
    }
}
