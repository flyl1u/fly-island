//! Job objects for plugin processes: a plugin and every process it starts go
//! into one job that is set to end all of them when its handle closes, so
//! stopping a plugin (or the island crashing) leaves nothing behind.

use std::{mem::size_of, os::windows::io::AsRawHandle, process::Child};
use windows::Win32::{
    Foundation::{CloseHandle, HANDLE},
    System::{
        JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, QueryInformationJobObject, SetInformationJobObject,
            JobObjectBasicAccountingInformation, JobObjectBasicProcessIdList, JobObjectExtendedLimitInformation,
            JOBOBJECT_BASIC_ACCOUNTING_INFORMATION, JOBOBJECT_BASIC_PROCESS_ID_LIST,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        },
        ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS},
    },
};

use super::process::open_for_limited_query;

/// Most process ids read from a job at once; plugins rarely start more.
const MAX_LISTED_PROCESSES: usize = 64;

/// A job that ends its processes when dropped.
pub(crate) struct Job(HANDLE);

// SAFETY: a job handle is a kernel object handle; the calls made on it here
// are thread-safe, and it is closed exactly once in Drop.
unsafe impl Send for Job {}
// SAFETY: as above; the methods take &self and only make thread-safe kernel calls.
unsafe impl Sync for Job {}

/// What the processes of a job use now.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct JobUsage {
    /// Private bytes (commit) of every process still in the job.
    pub memory_bytes: u64,
    /// User plus kernel time of every process that ran in the job, in 100 ns ticks.
    pub cpu_ticks: u64,
}

impl Job {
    /// A new job that ends its processes when its last handle closes.
    pub(crate) fn new() -> Result<Self, String> {
        // SAFETY: no security attributes and no name; a returned handle is owned by Job.
        let handle = unsafe { CreateJobObjectW(None, None) }.map_err(|error| format!("Could not create a job object: {error}"))?;
        let job = Self(handle);
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        // SAFETY: `job.0` is a live job handle and `limits` is a valid
        // JOBOBJECT_EXTENDED_LIMIT_INFORMATION whose size is passed with it.
        unsafe {
            SetInformationJobObject(
                job.0,
                JobObjectExtendedLimitInformation,
                std::ptr::from_ref(&limits).cast(),
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        }
        .map_err(|error| format!("Could not set up the job object: {error}"))?;
        Ok(job)
    }

    /// Puts `child` (and so every process it starts from now on) into the job.
    pub(crate) fn assign(&self, child: &Child) -> Result<(), String> {
        let process = HANDLE(child.as_raw_handle());
        // SAFETY: both handles are live: the job is owned by self, and the
        // process handle is owned by `child`, which outlives this call.
        unsafe { AssignProcessToJobObject(self.0, process) }.map_err(|error| format!("Could not put the plugin in a job object: {error}"))
    }

    /// Memory and CPU time of the job's processes; `None` if the job cannot be read.
    pub(crate) fn usage(&self) -> Option<JobUsage> {
        let mut accounting = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
        // SAFETY: `self.0` is a live job handle and `accounting` is a valid
        // output buffer of the size passed.
        unsafe {
            QueryInformationJobObject(
                Some(self.0),
                JobObjectBasicAccountingInformation,
                std::ptr::from_mut(&mut accounting).cast(),
                size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
                None,
            )
        }
        .ok()?;
        let cpu_ticks = u64::try_from(accounting.TotalUserTime).unwrap_or(0) + u64::try_from(accounting.TotalKernelTime).unwrap_or(0);
        let memory_bytes = self.process_ids().into_iter().filter_map(private_bytes).sum();
        Some(JobUsage { memory_bytes, cpu_ticks })
    }

    fn process_ids(&self) -> Vec<u32> {
        // The list header is followed by room for MAX_LISTED_PROCESSES ids.
        #[repr(C)]
        struct IdList {
            header: JOBOBJECT_BASIC_PROCESS_ID_LIST,
            more: [usize; MAX_LISTED_PROCESSES - 1],
        }
        let mut list = IdList { header: JOBOBJECT_BASIC_PROCESS_ID_LIST::default(), more: [0; MAX_LISTED_PROCESSES - 1] };
        // SAFETY: `self.0` is a live job handle; `list` is a JOBOBJECT_BASIC_PROCESS_ID_LIST
        // followed by space for more ids, and its full size is passed.
        let read = unsafe {
            QueryInformationJobObject(
                Some(self.0),
                JobObjectBasicProcessIdList,
                std::ptr::from_mut(&mut list).cast(),
                size_of::<IdList>() as u32,
                None,
            )
        };
        // ERROR_MORE_DATA still fills the list as far as it goes.
        if read.is_err() && list.header.NumberOfProcessIdsInList == 0 {
            return Vec::new();
        }
        let count = (list.header.NumberOfProcessIdsInList as usize).min(MAX_LISTED_PROCESSES);
        std::iter::once(list.header.ProcessIdList[0])
            .chain(list.more.iter().copied())
            .take(count)
            .filter_map(|id| u32::try_from(id).ok())
            .collect()
    }
}

/// Private bytes (commit charge) of a process, or `None` if it cannot be read.
fn private_bytes(process_id: u32) -> Option<u64> {
    let process = open_for_limited_query(process_id)?;
    let mut counters = PROCESS_MEMORY_COUNTERS::default();
    // SAFETY: `process.0` is a live handle opened with PROCESS_QUERY_LIMITED_INFORMATION,
    // which GetProcessMemoryInfo accepts, and `counters` is a valid output of the size passed.
    unsafe { GetProcessMemoryInfo(process.0, &mut counters, size_of::<PROCESS_MEMORY_COUNTERS>() as u32) }.ok()?;
    Some(counters.PagefileUsage as u64)
}

impl Drop for Job {
    fn drop(&mut self) {
        // SAFETY: the handle came from CreateJobObjectW, is owned only by this
        // value and is closed once here; closing it ends the job's processes.
        let _ = unsafe { CloseHandle(self.0) };
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::{Command, Stdio};

    #[test]
    fn closing_the_job_ends_the_process_tree() {
        let job = Job::new().expect("job");
        // cmd starts a second, long-running process; both are in the job.
        let mut child = Command::new("cmd")
            .args(["/c", "ping -n 30 127.0.0.1 >nul"])
            .stdout(Stdio::null())
            .spawn()
            .expect("spawn");
        job.assign(&child).expect("assign");
        std::thread::sleep(std::time::Duration::from_millis(500));
        let ids = job.process_ids();
        assert!(ids.len() >= 2, "cmd and ping are both in the job: {ids:?}");
        assert!(job.usage().is_some_and(|usage| usage.memory_bytes > 0));
        drop(job);
        // Ending a process tree is asynchronous; under a parallel test run it can take
        // well over the half second this used to wait, so poll with a generous deadline.
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        let mut ended = || child_ended(&mut child) && ids.iter().all(|id| !alive(*id));
        while !ended() && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        assert!(child.try_wait().expect("wait").is_some(), "cmd ended with the job");
        for id in &ids {
            assert!(!alive(*id), "process {id} ended with the job");
        }
    }

    fn child_ended(child: &mut std::process::Child) -> bool {
        child.try_wait().is_ok_and(|status| status.is_some())
    }

    /// Whether a process with exactly this id is running. Matches the PID column, not
    /// any digits in the output (a memory column like "14,927 K" contains "4927").
    fn alive(process_id: u32) -> bool {
        let output = Command::new("tasklist")
            .args(["/FI", &format!("PID eq {process_id}"), "/FO", "CSV", "/NH"])
            .output()
            .expect("tasklist");
        let wanted = format!("\"{process_id}\"");
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .any(|line| line.split(',').nth(1) == Some(wanted.as_str()))
    }
}
