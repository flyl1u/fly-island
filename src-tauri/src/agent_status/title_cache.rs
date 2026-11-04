//! Reads the files behind session titles and caches the result, because the island polls the agent
//! status every 200 ms while transcripts can be megabytes long.

use std::{
    fs::{self, File},
    io::{BufRead, BufReader, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{Mutex, PoisonError},
    time::SystemTime,
};

use super::markers::{CLAUDE_CODE_HOOK_INPUT_FILE_NAME, CODEX_HOOK_INPUT_FILE_NAME};
use super::snapshot::AgentStatusSnapshot;
use super::title::{
    codex_thread_name, folder_title, is_path_inside, latest_ai_title, parse_hook_input,
    prompt_title, user_prompt_in_record, HookInput,
};
use crate::system::windows_home_dir;

/// Transcripts and the Codex index are only read this far from the end (newest title).
const READ_WINDOW_BYTES: u64 = 256 * 1024;
/// Transcripts are scanned this far from the start for the first prompt.
const FIRST_PROMPT_SCAN_BYTES: u64 = 4 * 1024 * 1024;
/// Codex first prompts remembered per session, oldest dropped first.
const CODEX_FIRST_PROMPT_LIMIT: usize = 16;

static TITLE_CACHE: Mutex<TitleCache> = Mutex::new(TitleCache::new());

pub(super) fn apply_session_titles(app_dir: &Path, snapshot: &mut AgentStatusSnapshot) {
    let Ok(home_dir) = windows_home_dir() else {
        return;
    };
    let mut cache = TITLE_CACHE.lock().unwrap_or_else(PoisonError::into_inner);
    snapshot.claude_code.title = cache.claude_code_title(app_dir, &home_dir);
    snapshot.codex.title = cache.codex_title(app_dir, &home_dir);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct FileStamp {
    len: u64,
    modified: Option<SystemTime>,
}

fn file_stamp(path: &Path) -> Option<FileStamp> {
    let metadata = fs::metadata(path).ok()?;
    metadata.is_file().then(|| FileStamp {
        len: metadata.len(),
        modified: metadata.modified().ok(),
    })
}

/// One provider's last answer and the file stamps it was computed from.
struct ProviderTitle {
    input_stamp: Option<FileStamp>,
    input: HookInput,
    /// Whether `title` is up to date for `source_stamp` (it may be `None` when nothing was found).
    computed: bool,
    source_stamp: Option<FileStamp>,
    title: Option<String>,
    first_prompt: Option<FirstPrompt>,
}

impl ProviderTitle {
    const fn new() -> Self {
        Self {
            input_stamp: None,
            input: HookInput {
                session_id: None,
                transcript_path: None,
                cwd: None,
                prompt: None,
            },
            computed: false,
            source_stamp: None,
            title: None,
            first_prompt: None,
        }
    }

    /// The first prompt in `path`, scanning the transcript again only while it may still appear.
    fn first_prompt_in(&mut self, path: &Path) -> Option<String> {
        let cached = self
            .first_prompt
            .as_ref()
            .filter(|known| known.path == path && known.final_answer);
        if cached.is_none() {
            self.first_prompt = scan_first_prompt(path);
        }
        self.first_prompt.as_ref()?.prompt.clone()
    }

    /// Re-reads the hook input when it changed. Returns false when there is none.
    fn refresh_input(&mut self, input_path: &Path) -> bool {
        let Some(stamp) = file_stamp(input_path) else {
            *self = Self::new();
            return false;
        };
        if self.input_stamp != Some(stamp) {
            self.input = fs::read(input_path)
                .map(|bytes| parse_hook_input(&String::from_utf8_lossy(&bytes)))
                .unwrap_or_default();
            self.input_stamp = Some(stamp);
            self.computed = false;
        }
        true
    }
}

pub(super) struct TitleCache {
    claude_code: ProviderTitle,
    codex: ProviderTitle,
    codex_first_prompts: Vec<(String, String)>,
}

impl TitleCache {
    pub(super) const fn new() -> Self {
        Self {
            claude_code: ProviderTitle::new(),
            codex: ProviderTitle::new(),
            codex_first_prompts: Vec::new(),
        }
    }

    /// Newest `ai-title`, else the first prompt in the transcript, else the latest prompt, else the
    /// folder name.
    pub(super) fn claude_code_title(&mut self, app_dir: &Path, home_dir: &Path) -> Option<String> {
        let entry = &mut self.claude_code;
        if !entry.refresh_input(&app_dir.join(CLAUDE_CODE_HOOK_INPUT_FILE_NAME)) {
            return None;
        }

        let projects_dir = home_dir.join(".claude").join("projects");
        let transcript = entry
            .input
            .transcript_path
            .as_deref()
            .map(PathBuf::from)
            .filter(|path| is_path_inside(path, &projects_dir));
        let stamp = transcript.as_deref().and_then(file_stamp);
        if entry.computed && entry.source_stamp == stamp {
            return entry.title.clone();
        }

        let from_transcript = transcript.as_deref().and_then(|path| {
            read_tail(path)
                .and_then(|tail| latest_ai_title(&tail))
                .or_else(|| entry.first_prompt_in(path))
        });
        entry.title = from_transcript
            .or_else(|| entry.input.prompt.as_deref().and_then(prompt_title))
            .or_else(|| entry.input.cwd.as_deref().and_then(folder_title));
        entry.source_stamp = stamp;
        entry.computed = true;
        entry.title.clone()
    }

    /// `thread_name` from the Codex session index, else the first prompt seen for the session,
    /// else the folder name.
    pub(super) fn codex_title(&mut self, app_dir: &Path, home_dir: &Path) -> Option<String> {
        let entry = &mut self.codex;
        if !entry.refresh_input(&app_dir.join(CODEX_HOOK_INPUT_FILE_NAME)) {
            return None;
        }
        remember_first_prompt(&mut self.codex_first_prompts, &entry.input);

        let index_path = home_dir.join(".codex").join("session_index.jsonl");
        let stamp = file_stamp(&index_path);
        if entry.computed && entry.source_stamp == stamp {
            return entry.title.clone();
        }

        let session_id = entry.input.session_id.as_deref();
        let thread_name = session_id
            .and_then(|id| read_tail(&index_path).and_then(|index| codex_thread_name(&index, id)));
        let first_prompt = session_id.and_then(|id| {
            self.codex_first_prompts
                .iter()
                .find(|(known_id, _)| known_id == id)
                .and_then(|(_, prompt)| prompt_title(prompt))
        });
        entry.title = thread_name
            .or(first_prompt)
            .or_else(|| entry.input.cwd.as_deref().and_then(folder_title));
        entry.source_stamp = stamp;
        entry.computed = true;
        entry.title.clone()
    }
}

fn remember_first_prompt(first_prompts: &mut Vec<(String, String)>, input: &HookInput) {
    let (Some(session_id), Some(prompt)) = (&input.session_id, &input.prompt) else {
        return;
    };
    if first_prompts
        .iter()
        .any(|(known_id, _)| known_id == session_id)
    {
        return;
    }
    if first_prompts.len() >= CODEX_FIRST_PROMPT_LIMIT {
        first_prompts.remove(0);
    }
    first_prompts.push((session_id.clone(), prompt.clone()));
}

/// The first prompt found in one transcript scan. It never changes once found, and a scan that
/// covered the whole window without finding one will not find one later either.
struct FirstPrompt {
    path: PathBuf,
    prompt: Option<String>,
    final_answer: bool,
}

/// Scans whole lines from the start, up to `FIRST_PROMPT_SCAN_BYTES`. Lines are parsed in full,
/// because a first message with a screenshot is one line of several hundred KiB.
fn scan_first_prompt(path: &Path) -> Option<FirstPrompt> {
    let file = File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let prompt = BufReader::new(file.take(FIRST_PROMPT_SCAN_BYTES))
        .split(b'\n')
        .map_while(Result::ok)
        .find_map(|line| user_prompt_in_record(&String::from_utf8_lossy(&line)));
    Some(FirstPrompt {
        path: path.to_path_buf(),
        final_answer: prompt.is_some() || len >= FIRST_PROMPT_SCAN_BYTES,
        prompt,
    })
}

/// The last `READ_WINDOW_BYTES` of a file, starting at a whole line.
fn read_tail(path: &Path) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let start = len.saturating_sub(READ_WINDOW_BYTES);
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    if start > 0 {
        let first_newline = bytes.iter().position(|&byte| byte == b'\n')?;
        bytes.drain(..=first_newline);
    }
    Some(String::from_utf8_lossy(&bytes).into_owned())
}
