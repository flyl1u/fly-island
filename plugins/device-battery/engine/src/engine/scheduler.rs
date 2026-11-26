//! Runs one round: the HID topology, then every reader on every device it applies
//! to, two at a time, each with its own time budget inside the round's budget. A
//! reader that overruns is abandoned; the process exits after the round.
use super::clock::utc_now;
use super::platform::{Platform, ReadResult};
use super::round::{Round, Subject};
use crate::hid::{topology, DeviceInfo};
use crate::providers::registry::{Reader, Source};
use serde_json::Value;
use std::collections::BTreeSet;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::time::{Duration, Instant};

const SLOTS: usize = 2;
const MAX_TASKS: usize = 96;
const MAX_GROUPS: usize = 64;
const MAX_PARTIALS: usize = 96;

#[derive(Clone, Copy)]
pub(crate) struct Limits {
    pub round: Duration,
    /// Scales every task budget; tests shorten them.
    pub unit: Duration,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            round: Duration::from_secs(36),
            unit: Duration::from_secs(1),
        }
    }
}

#[derive(Clone)]
enum Job {
    Topology,
    Query(Reader, Vec<DeviceInfo>),
}

struct Task {
    subject: Subject,
    job: Job,
    /// In budget units.
    seconds: u32,
}

impl Task {
    fn query(reader: Reader, physical: String, devices: Vec<DeviceInfo>) -> Self {
        let seconds = match reader.name {
            "bluetooth" => 14,
            "logitech" => 12,
            "lofree" => 10,
            "xinput" | "standard_hid" => 5,
            _ => 7,
        };
        Self {
            subject: Subject {
                reader: reader.name,
                physical,
            },
            job: Job::Query(reader, devices),
            seconds,
        }
    }

    fn is_query(&self) -> bool {
        matches!(self.job, Job::Query(..))
    }
}

enum Output {
    Topology {
        native_mouse: bool,
        inventory: Vec<DeviceInfo>,
    },
    Reading(ReadResult, String),
    Failed,
}

struct Running {
    ticket: usize,
    subject: Subject,
    deadline: Instant,
}

fn execute(platform: &dyn Platform, job: &Job) -> Output {
    match job {
        Job::Topology => {
            let Some(paths) = platform.interface_paths() else {
                return Output::Failed;
            };
            let native_mouse = paths
                .iter()
                .any(|path| path.to_ascii_lowercase().contains("vid_373b&pid_1278"));
            let mut inventory = platform.discover(&paths);
            inventory.retain(|d| !topology::is_native(d.vendor_id, d.product_id));
            Output::Topology {
                native_mouse,
                inventory,
            }
        }
        Job::Query(reader, devices) => match platform.read(*reader, devices) {
            Ok(result) => Output::Reading(result, utc_now()),
            Err(()) => Output::Failed,
        },
    }
}

fn spawn(platform: Arc<dyn Platform>, job: Job, ticket: usize, sender: Sender<(usize, Output)>) {
    std::thread::spawn(move || {
        let output = catch_unwind(AssertUnwindSafe(|| execute(platform.as_ref(), &job)))
            .unwrap_or(Output::Failed);
        // Nobody listens once the task was abandoned.
        let _ = sender.send((ticket, output));
    });
}

/// Physical devices in the order they were discovered.
fn physical_groups(inventory: Vec<DeviceInfo>) -> Vec<(String, Vec<DeviceInfo>)> {
    let mut groups: Vec<(String, Vec<DeviceInfo>)> = Vec::new();
    for info in inventory {
        match groups.iter_mut().find(|(id, _)| *id == info.physical_id) {
            Some((_, list)) => list.push(info),
            None => groups.push((info.physical_id.clone(), vec![info])),
        }
    }
    groups.truncate(MAX_GROUPS);
    groups
}

struct Scheduler<'a> {
    readers: &'a [Reader],
    pending: Vec<Task>,
    running: Vec<Running>,
    /// Readers that matched more than one device.
    ambiguous: BTreeSet<&'static str>,
    round: Round,
}

impl Scheduler<'_> {
    /// One task per reader and device it applies to.
    fn plan_devices(&mut self, inventory: Vec<DeviceInfo>) {
        self.round.groups = physical_groups(inventory);
        for &reader in self.readers {
            let matches: Vec<&(String, Vec<DeviceInfo>)> = match reader.source {
                Source::Vendors(vendors, _) => self
                    .round
                    .groups
                    .iter()
                    .filter(|(_, infos)| infos.iter().any(|d| vendors.contains(&d.vendor_id)))
                    .collect(),
                Source::AnyDevice(_) => self.round.groups.iter().collect(),
                Source::XInput | Source::Bluetooth => continue,
            };
            if matches.len() > 1 {
                self.ambiguous.insert(reader.name);
            }
            let tasks: Vec<Task> = matches
                .into_iter()
                .map(|(id, infos)| Task::query(reader, id.clone(), infos.clone()))
                .collect();
            if tasks.is_empty() {
                self.round.no_devices(reader.name);
            }
            for task in tasks {
                if self.pending.len() + self.running.len() >= MAX_TASKS {
                    self.round.fail(&task.subject, "capacity_limit");
                } else {
                    self.pending.push(task);
                }
            }
        }
    }

    fn can_start(&self, task: &Task, at: usize) -> bool {
        if self.running.len() >= SLOTS {
            return false;
        }
        // Bluetooth waits for the radio queries to follow all HID work.
        if task.subject.reader == "bluetooth" {
            let others = self
                .pending
                .iter()
                .enumerate()
                .any(|(index, _)| index != at);
            return self.running.is_empty() && !others;
        }
        // One device is never asked two things at once.
        let physical = &task.subject.physical;
        physical.is_empty() || !self.running.iter().any(|r| &r.subject.physical == physical)
    }

    fn finish(&mut self, running: &Running, output: Output) {
        match output {
            Output::Topology {
                native_mouse,
                inventory,
            } => {
                self.round.native_mouse = Some(native_mouse);
                self.plan_devices(inventory);
            }
            Output::Reading(result, checked_at) => {
                let ambiguous = self.ambiguous.contains(running.subject.reader);
                self.round
                    .accept(&running.subject, result, ambiguous, &checked_at);
            }
            Output::Failed => self.round.fail(&running.subject, "read_failed"),
        }
    }

    /// The round's budget ran out.
    fn expire(&mut self) {
        for running in std::mem::take(&mut self.running) {
            self.round.fail(&running.subject, "timeout");
        }
        for task in std::mem::take(&mut self.pending) {
            if task.is_query() {
                self.round.defer(&task.subject);
            } else {
                self.round.fail(&task.subject, "round_budget");
            }
        }
    }
}

fn first_tasks(readers: &[Reader]) -> Vec<Task> {
    let mut tasks = vec![Task {
        subject: Subject {
            reader: "topology",
            physical: String::new(),
        },
        job: Job::Topology,
        seconds: 6,
    }];
    for wanted in ["xinput", "bluetooth"] {
        tasks.extend(
            readers
                .iter()
                .filter(|reader| reader.name == wanted)
                .map(|&reader| Task::query(reader, String::new(), Vec::new())),
        );
    }
    tasks
}

/// Fills `round`, reporting a partial snapshot after each finished task.
pub(crate) fn run(
    platform: &Arc<dyn Platform>,
    readers: &[Reader],
    round: Round,
    limits: Limits,
    mut progress: Option<&mut dyn FnMut(Value)>,
) -> Round {
    let mut scheduler = Scheduler {
        readers,
        pending: first_tasks(readers),
        running: Vec::new(),
        ambiguous: BTreeSet::new(),
        round,
    };
    let deadline = Instant::now() + limits.round;
    let (sender, receiver) = mpsc::channel();
    let (mut ticket, mut partials) = (0, 0);
    loop {
        let mut at = 0;
        while at < scheduler.pending.len() {
            let task = &scheduler.pending[at];
            let budget = limits.unit * task.seconds;
            let remaining = deadline.saturating_duration_since(Instant::now());
            if task.is_query() && remaining < budget {
                let task = scheduler.pending.remove(at);
                scheduler.round.defer(&task.subject);
            } else if scheduler.can_start(task, at) {
                let task = scheduler.pending.remove(at);
                ticket += 1;
                spawn(platform.clone(), task.job.clone(), ticket, sender.clone());
                scheduler.running.push(Running {
                    ticket,
                    subject: task.subject,
                    deadline: Instant::now() + budget.min(remaining),
                });
            } else {
                at += 1;
            }
        }
        let Some(next) = scheduler.running.iter().map(|r| r.deadline).min() else {
            scheduler.expire();
            break;
        };
        let wait = next.min(deadline).saturating_duration_since(Instant::now());
        let mut finished = 0;
        match receiver.recv_timeout(wait) {
            Ok((done, output)) => {
                // A late result of an abandoned task is ignored.
                if let Some(at) = scheduler.running.iter().position(|r| r.ticket == done) {
                    let running = scheduler.running.remove(at);
                    scheduler.finish(&running, output);
                    finished += 1;
                }
            }
            Err(RecvTimeoutError::Timeout | RecvTimeoutError::Disconnected) => {}
        }
        let now = Instant::now();
        let mut at = 0;
        while at < scheduler.running.len() {
            if now >= scheduler.running[at].deadline {
                let running = scheduler.running.remove(at);
                scheduler.round.fail(&running.subject, "timeout");
                finished += 1;
            } else {
                at += 1;
            }
        }
        if let Some(report) = progress.as_mut() {
            if finished > 0 && partials < MAX_PARTIALS {
                partials += 1;
                report(scheduler.round.snapshot(false));
            }
        }
        if now >= deadline {
            scheduler.expire();
            break;
        }
        if scheduler.pending.is_empty() && scheduler.running.is_empty() {
            break;
        }
    }
    scheduler.round
}

#[cfg(test)]
mod tests;
