//! Reading one environment variable of another process (the island's own user), such as the
//! `ORCA_TERMINAL_HANDLE` Orca gives every program in a terminal tab. Windows has no API for
//! this, so it follows the documented-in-practice x64 layout: the PEB's ProcessParameters
//! (offset 0x20), whose Environment pointer is at 0x80 and EnvironmentSize at 0x3F0.
//! Anything that does not read back cleanly gives `None`.

use std::{ffi::c_void, mem::size_of};

use windows::{
    Wdk::System::Threading::{NtQueryInformationProcess, ProcessBasicInformation},
    Win32::System::{
        Diagnostics::Debug::ReadProcessMemory,
        Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_VM_READ},
    },
};

use super::process::ProcessHandle;

const PEB_PROCESS_PARAMETERS: usize = 0x20;
const PARAMETERS_ENVIRONMENT: usize = 0x80;
const PARAMETERS_ENVIRONMENT_SIZE: usize = 0x3F0;
/// Environment blocks are a few KB; a larger size means the layout did not match.
const MAX_ENVIRONMENT_BYTES: usize = 1024 * 1024;

/// PROCESS_BASIC_INFORMATION, declared here so only the PEB address is needed.
#[repr(C)]
#[derive(Default)]
struct BasicInformation {
    exit_status: i32,
    peb_base_address: usize,
    affinity_mask: usize,
    base_priority: i32,
    unique_process_id: usize,
    inherited_from_unique_process_id: usize,
}

/// The value of `name` (matched case-insensitively, like Windows does) in the environment of
/// `process_id`; `None` when it is unset or the process cannot be read.
pub(crate) fn environment_variable(process_id: u32, name: &str) -> Option<String> {
    if cfg!(not(target_pointer_width = "64")) {
        return None;
    }
    // SAFETY: OpenProcess takes no pointers; a returned handle is owned by
    // ProcessHandle, which closes it.
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, false, process_id) }
        .ok()
        .map(ProcessHandle)?;

    let mut info = BasicInformation::default();
    // SAFETY: the handle is live; `info` is a writable buffer of the size passed, laid out like
    // PROCESS_BASIC_INFORMATION, which ProcessBasicInformation fills.
    let status = unsafe {
        NtQueryInformationProcess(
            process.0,
            ProcessBasicInformation,
            &mut info as *mut BasicInformation as *mut c_void,
            size_of::<BasicInformation>() as u32,
            std::ptr::null_mut(),
        )
    };
    if status.is_err() || info.peb_base_address == 0 {
        return None;
    }

    let parameters = read_usize(&process, info.peb_base_address + PEB_PROCESS_PARAMETERS)?;
    let environment = read_usize(&process, parameters + PARAMETERS_ENVIRONMENT)?;
    let size = read_usize(&process, parameters + PARAMETERS_ENVIRONMENT_SIZE)?;
    if environment == 0 || size == 0 || size > MAX_ENVIRONMENT_BYTES || size % 2 != 0 {
        return None;
    }
    let mut block = vec![0u16; size / 2];
    read_into(&process, environment, block.as_mut_ptr() as *mut c_void, size)?;
    find_variable(&block, name)
}

/// `NAME=value` entries of a UTF-16 environment block, separated by NULs.
pub(crate) fn find_variable(block: &[u16], name: &str) -> Option<String> {
    block
        .split(|&unit| unit == 0)
        .take_while(|entry| !entry.is_empty())
        .map(String::from_utf16_lossy)
        .find_map(|entry| {
            // Entries such as "=C:=C:\" start with '=', so the separator is searched from 1.
            let split = entry.get(1..)?.find('=')? + 1;
            entry[..split]
                .eq_ignore_ascii_case(name)
                .then(|| entry[split + 1..].to_string())
        })
}

fn read_usize(process: &ProcessHandle, address: usize) -> Option<usize> {
    let mut value = 0usize;
    read_into(process, address, &mut value as *mut usize as *mut c_void, size_of::<usize>())?;
    Some(value)
}

fn read_into(process: &ProcessHandle, address: usize, buffer: *mut c_void, length: usize) -> Option<()> {
    let mut read = 0usize;
    // SAFETY: the handle has PROCESS_VM_READ; `buffer` points to `length` writable bytes owned
    // by the caller; a bad `address` in the other process makes the call fail, not crash.
    unsafe { ReadProcessMemory(process.0, address as *const c_void, buffer, length, Some(&mut read)) }.ok()?;
    (read == length).then_some(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_variable_of_the_current_process_the_same_as_std() {
        let expected = std::env::var("PATH").ok();
        assert!(expected.is_some());
        assert_eq!(environment_variable(std::process::id(), "path"), expected);
        assert_eq!(environment_variable(std::process::id(), "FOCUSD_SURELY_UNSET_VARIABLE"), None);
        assert_eq!(environment_variable(u32::MAX, "PATH"), None);
    }

    #[test]
    fn environment_blocks_are_split_into_entries() {
        let block: Vec<u16> = "=C:=C:\\\0Orca_Terminal_Handle=term_1\0X=a=b\0\0".encode_utf16().collect();
        assert_eq!(find_variable(&block, "ORCA_TERMINAL_HANDLE").as_deref(), Some("term_1"));
        assert_eq!(find_variable(&block, "X").as_deref(), Some("a=b"));
        assert_eq!(find_variable(&block, "C:"), None);
    }
}
