//! A private plugin process tree is terminated when its worker leaves scope.
use std::{os::windows::io::AsRawHandle, process::Child};
use windows::{core::PCWSTR, Win32::{Foundation::{CloseHandle, HANDLE}, System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
    JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
}}};

pub(crate) struct ProcessJob(HANDLE);

impl ProcessJob {
    pub(crate) fn attach(child: &Child) -> windows::core::Result<Self> {
        // SAFETY: no name or security attributes; the returned handle is owned by this guard.
        let job = Self(unsafe { CreateJobObjectW(None, PCWSTR::null())? });
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        // SAFETY: limits is a valid structure of the supplied size; the child handle is borrowed
        // from a live Child and both handles remain valid for the duration of these calls.
        unsafe {
            SetInformationJobObject(job.0, JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of_val(&limits) as u32)?;
            AssignProcessToJobObject(job.0, HANDLE(child.as_raw_handle()))?;
        }
        Ok(job)
    }
}

impl Drop for ProcessJob {
    fn drop(&mut self) {
        // SAFETY: this guard owns the handle and closes it exactly once.
        let _ = unsafe { CloseHandle(self.0) };
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{os::windows::process::CommandExt, process::{Command, Stdio}, time::{Duration, Instant}};

    #[test]
    fn closing_job_ends_the_owned_process_tree_without_a_console() {
        let mut child = Command::new("cmd.exe").args(["/d", "/c", "ping -n 60 127.0.0.1 >NUL"])
            .creation_flags(0x08000000).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap();
        let job = ProcessJob::attach(&child).unwrap();
        let deadline = Instant::now() + Duration::from_secs(3);
        let descendant = loop {
            if let Some((id, _)) = super::super::process_tree::parent_process_ids().into_iter().find(|(_, parent)| *parent == child.id()) { break id; }
            assert!(Instant::now() < deadline, "console fixture did not spawn its child");
            std::thread::sleep(Duration::from_millis(10));
        };
        drop(job);
        let deadline = Instant::now() + Duration::from_secs(3);
        while child.try_wait().unwrap().is_none() {
            assert!(Instant::now() < deadline, "parent survived job teardown");
            std::thread::sleep(Duration::from_millis(10));
        }
        while super::super::process_tree::parent_process_ids().contains_key(&descendant) {
            assert!(Instant::now() < deadline, "descendant survived job teardown");
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}
