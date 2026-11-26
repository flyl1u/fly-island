//! A scripted HID bus for reader tests: replies are queued per path, and every request
//! is recorded so a test can assert exactly what would reach a device.
use super::{HidBus, HidDevice, HidError, HidResult};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Default)]
pub(crate) struct Script {
    /// Input reports returned by successive reads; then reads come back empty.
    pub reads: VecDeque<Vec<u8>>,
    /// Replies that appear only after the n-th write (1-based), in order.
    pub on_write: HashMap<usize, Vec<Vec<u8>>>,
    /// Feature reports returned by successive gets; then gets fail.
    pub features: VecDeque<Vec<u8>>,
    pub inputs: VecDeque<Vec<u8>>,
    pub descriptor: Option<Vec<u8>>,
    pub write_error: Option<String>,
    pub writes: Vec<Vec<u8>>,
    pub sent_features: Vec<Vec<u8>>,
    pub asked_features: Vec<(u8, usize)>,
    pub opens: usize,
}

#[derive(Clone, Default)]
pub(crate) struct FakeBus {
    pub scripts: Arc<Mutex<HashMap<String, Script>>>,
}

impl FakeBus {
    pub(crate) fn script(&self, path: &str, edit: impl FnOnce(&mut Script)) {
        edit(self.scripts.lock().unwrap().entry(path.into()).or_default());
    }

    pub(crate) fn inspect<T>(&self, path: &str, read: impl FnOnce(&Script) -> T) -> T {
        read(self.scripts.lock().unwrap().entry(path.into()).or_default())
    }

    /// Every path that was written to or sent a feature report.
    pub(crate) fn written_paths(&self) -> Vec<String> {
        let scripts = self.scripts.lock().unwrap();
        let mut paths: Vec<String> = scripts
            .iter()
            .filter(|(_, s)| !s.writes.is_empty() || !s.sent_features.is_empty())
            .map(|(path, _)| path.clone())
            .collect();
        paths.sort();
        paths
    }
}

impl HidBus for FakeBus {
    fn open(&self, path: &str) -> HidResult<Box<dyn HidDevice>> {
        let mut scripts = self.scripts.lock().unwrap();
        let Some(script) = scripts.get_mut(path) else {
            return Err(HidError("open failed".into()));
        };
        script.opens += 1;
        Ok(Box::new(FakeDevice {
            bus: self.clone(),
            path: path.into(),
        }))
    }
}

struct FakeDevice {
    bus: FakeBus,
    path: String,
}

impl FakeDevice {
    fn with<T>(&self, edit: impl FnOnce(&mut Script) -> T) -> T {
        edit(
            self.bus
                .scripts
                .lock()
                .unwrap()
                .entry(self.path.clone())
                .or_default(),
        )
    }
}

impl HidDevice for FakeDevice {
    fn write(&mut self, data: &[u8]) -> HidResult<usize> {
        self.with(|script| {
            if let Some(message) = &script.write_error {
                return Err(HidError(message.clone()));
            }
            script.writes.push(data.to_vec());
            if let Some(replies) = script.on_write.remove(&script.writes.len()) {
                script.reads.extend(replies);
            }
            Ok(data.len())
        })
    }

    fn read(&mut self, len: usize, _timeout: Duration) -> HidResult<Vec<u8>> {
        let mut report = self.with(|script| script.reads.pop_front().unwrap_or_default());
        report.truncate(len);
        Ok(report)
    }

    fn send_feature(&mut self, data: &[u8]) -> HidResult<usize> {
        self.with(|script| script.sent_features.push(data.to_vec()));
        Ok(data.len())
    }

    fn get_feature(&mut self, report_id: u8, len: usize) -> HidResult<Vec<u8>> {
        self.with(|script| {
            script.asked_features.push((report_id, len));
            script
                .features
                .pop_front()
                .ok_or_else(|| HidError("read error".into()))
        })
    }

    fn get_input(&mut self, _report_id: u8, _len: usize) -> HidResult<Vec<u8>> {
        self.with(|script| Ok(script.inputs.pop_front().unwrap_or_default()))
    }

    fn report_descriptor(&mut self) -> HidResult<Vec<u8>> {
        self.with(|script| {
            script
                .descriptor
                .clone()
                .ok_or_else(|| HidError("no descriptor".into()))
        })
    }
}
