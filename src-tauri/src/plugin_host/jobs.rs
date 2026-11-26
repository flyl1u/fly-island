//! The installs and removals in progress, one per plugin. The settings page follows them
//! through `PROGRESS_EVENT` and asks for them again when it is reopened.

use std::{collections::BTreeMap, sync::{Mutex, PoisonError}};
use serde::Serialize;
use tauri::Emitter;

pub const PROGRESS_EVENT: &str = "plugin-install-progress";
pub const BUSY: &str = "plugin_install_in_progress";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Phase { Downloading, Verifying, Installing, Uninstalling, Done, Failed }

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub id: String,
    pub phase: Phase,
    pub downloaded: u64,
    /// Package size from the index; 0 until the index has been read.
    pub total: u64,
    /// Failure code, only with `Phase::Failed`.
    pub error: Option<String>,
}

#[derive(Default)]
pub struct Jobs {
    entries: Mutex<BTreeMap<String, Progress>>,
    app: Option<tauri::AppHandle>,
}

impl Jobs {
    pub fn new(app: Option<tauri::AppHandle>) -> Self { Self { entries: Default::default(), app } }

    /// Running jobs, and the failures not yet retried.
    pub fn list(&self) -> Vec<Progress> {
        self.entries.lock().unwrap_or_else(PoisonError::into_inner).values().cloned().collect()
    }

    /// Drops a shown failure once the plugin has been used successfully since.
    pub fn forget_failure(&self, id: &str) {
        let mut entries = self.entries.lock().unwrap_or_else(PoisonError::into_inner);
        if entries.get(id).is_some_and(|entry| entry.phase == Phase::Failed) { entries.remove(id); }
    }

    /// Claims the plugin; `BUSY` while another install or removal of it is running.
    pub fn begin(&self, id: &str, phase: Phase) -> Result<Job<'_>, String> {
        let progress = Progress { id: id.into(), phase, downloaded: 0, total: 0, error: None };
        {
            let mut entries = self.entries.lock().unwrap_or_else(PoisonError::into_inner);
            if entries.get(id).is_some_and(|entry| entry.phase != Phase::Failed) { return Err(BUSY.into()); }
            entries.insert(id.into(), progress.clone());
        }
        self.emit(&progress);
        Ok(Job { jobs: self, progress: Mutex::new(progress), finished: false })
    }

    fn publish(&self, progress: &Progress) {
        {
            let mut entries = self.entries.lock().unwrap_or_else(PoisonError::into_inner);
            if progress.phase == Phase::Done { entries.remove(&progress.id); }
            else { entries.insert(progress.id.clone(), progress.clone()); }
        }
        self.emit(progress);
    }

    fn emit(&self, progress: &Progress) {
        if let Some(app) = &self.app { let _ = app.emit(PROGRESS_EVENT, progress); }
    }
}

pub struct Job<'a> { jobs: &'a Jobs, progress: Mutex<Progress>, finished: bool }

impl Job<'_> {
    fn change(&self, change: impl FnOnce(&mut Progress)) {
        let next = {
            let mut progress = self.progress.lock().unwrap_or_else(PoisonError::into_inner);
            change(&mut progress);
            progress.clone()
        };
        self.jobs.publish(&next);
    }

    pub fn phase(&self, phase: Phase) { self.change(|progress| progress.phase = phase); }

    pub fn size(&self, total: u64) { self.change(|progress| progress.total = total); }

    pub fn downloaded(&self, downloaded: u64) { self.change(|progress| progress.downloaded = downloaded); }

    pub fn finish<T>(mut self, result: &Result<T, String>) {
        self.finished = true;
        match result {
            Ok(_) => self.phase(Phase::Done),
            Err(error) => {
                let error = error.clone();
                self.change(|progress| { progress.phase = Phase::Failed; progress.error = Some(error); });
            }
        }
    }
}

/// A command dropped half way must not leave the plugin claimed forever.
impl Drop for Job<'_> {
    fn drop(&mut self) {
        if !self.finished {
            self.change(|progress| { progress.phase = Phase::Failed; progress.error = Some("plugin_install_failed".into()); });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_job_per_plugin_until_it_ends() {
        let jobs = Jobs::default();
        let job = jobs.begin("eye-care", Phase::Downloading).unwrap();
        assert_eq!(jobs.begin("eye-care", Phase::Downloading).err().as_deref(), Some(BUSY));
        assert_eq!(jobs.begin("eye-care", Phase::Uninstalling).err().as_deref(), Some(BUSY));
        let other = jobs.begin("minimax", Phase::Downloading).unwrap();
        job.size(10);
        job.downloaded(4);
        let listed = jobs.list();
        assert_eq!((listed[0].downloaded, listed[0].total), (4, 10));
        job.finish::<()>(&Err("plugin_download_timeout".into()));
        let failed = &jobs.list()[0];
        assert_eq!((failed.phase, failed.error.as_deref()), (Phase::Failed, Some("plugin_download_timeout")));
        jobs.begin("eye-care", Phase::Downloading).unwrap().finish(&Ok(()));
        drop(other);
        let listed = jobs.list();
        assert_eq!(listed.len(), 1);
        assert_eq!((listed[0].id.as_str(), listed[0].phase), ("minimax", Phase::Failed));
    }

    #[test]
    fn progress_serializes_as_the_settings_page_reads_it() {
        let progress = Progress { id: "eye-care".into(), phase: Phase::Downloading, downloaded: 1, total: 2, error: None };
        assert_eq!(serde_json::to_value(progress).unwrap(),
            serde_json::json!({"id":"eye-care","phase":"downloading","downloaded":1,"total":2,"error":null}));
    }
}
