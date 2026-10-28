mod clipboard_history;
mod media_control;
mod messenger_activation;
mod notification_diagnostics;
mod qq_notifications;
mod qq_mail;
mod wechat_reminder_source;
mod wechat_reminders;
mod translation;

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{
    env, fs,
    os::windows::process::CommandExt,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, OnceLock,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, LogicalSize, Manager, Monitor, PhysicalPosition, Position, Size,
    WebviewWindow, WindowEvent,
};
use windows::Win32::{
    Foundation::{POINT, RECT},
    Graphics::Gdi::SetWindowRgn,
    UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON},
    UI::WindowsAndMessaging::{GetCursorPos, GetWindowRect},
};

const WINDOW_LABEL: &str = "main";
const STAGE_WINDOW_WIDTH: f64 = 820.0;
const STAGE_WINDOW_HEIGHT: f64 = 460.0;
const DEFAULT_MARGIN_Y: f64 = 0.0;
const DEFAULT_COLLAPSED_SCALE: f64 = 0.89;
const DEFAULT_EXPANDED_SCALE: f64 = 0.91;
const MIN_COLLAPSED_ISLAND_WIDTH: f64 = 280.0;
const COLLAPSED_ISLAND_WIDTH: f64 = 340.0;
const COLLAPSED_ISLAND_HEIGHT: f64 = 38.0;
const COLLAPSED_RADIUS: f64 = 22.0;
const EXPANDED_ISLAND_WIDTH: f64 = 560.0;
const DEFAULT_EXPANDED_ISLAND_HEIGHT: f64 = 306.0;
const MIN_EXPANDED_ISLAND_HEIGHT: f64 = 220.0;
const EXPANDED_ISLAND_HEIGHT_RANGE: f64 = 240.0;
const EXPANDED_RADIUS: f64 = 30.0;
const STAGE_WINDOW_PADDING_Y: f64 = 24.0;
const TUCKED_VISIBLE_EDGE_HEIGHT: f64 = 10.0;
const POSITION_ANIMATION_DURATION: Duration = Duration::from_millis(320);
const STARTUP_REGISTRY_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const STARTUP_REGISTRY_VALUE: &str = "FocuSD Island";
const CREATE_NO_WINDOW: u32 = 0x08000000;
const AGENT_STATUS_FILE_NAME: &str = "agent-status.json";
const CODEX_RUNNING_MARKER_FILE_NAME: &str = "agent-codex-running.flag";
const CODEX_RUNNING_HOLD_FILE_NAME: &str = "agent-codex-running-hold.flag";
const CLAUDE_CODE_RUNNING_MARKER_FILE_NAME: &str = "agent-claudeCode-running.flag";
const CLAUDE_CODE_RUNNING_HOLD_FILE_NAME: &str = "agent-claudeCode-running-hold.flag";
const AGENT_RUNNING_SCRIPT_FILE_NAME: &str = "focusd-agent-running.cmd";
const AGENT_STATUS_SCRIPT_FILE_NAME: &str = "focusd-agent-status.ps1";
const AGENT_RUNNING_STALE_AFTER_MS: i64 = 10 * 60 * 1000;
const FOCUSD_AGENT_HOOK_BLOCK_BEGIN: &str = "# BEGIN FocuSD Agent Status Hooks";
const FOCUSD_AGENT_HOOK_BLOCK_END: &str = "# END FocuSD Agent Status Hooks";
const FOCUSD_AGENT_HOOK_SIGNATURE: &str = "focusd-agent-";
const AGENT_RUNNING_SCRIPT: &str = include_str!("../../scripts/focusd-agent-running.cmd");
const AGENT_STATUS_SCRIPT: &str = include_str!("../../scripts/focusd-agent-status.ps1");

static WINDOW_STATE: OnceLock<Mutex<IslandWindowState>> = OnceLock::new();
static POSITION_ANIMATION_GENERATION: AtomicU64 = AtomicU64::new(0);
static NATIVE_GLASS_INITIALIZED: OnceLock<()> = OnceLock::new();

#[derive(Clone, Copy)]
enum IslandMode {
    Collapsed,
    Expanded,
}

impl IslandMode {
    fn from_value(value: &str) -> Result<Self, String> {
        match value {
            "collapsed" => Ok(Self::Collapsed),
            "expanded" => Ok(Self::Expanded),
            _ => Err(format!("Unsupported island mode: {value}")),
        }
    }

    fn base_size(self, collapsed_width: f64, expanded_height: f64) -> (f64, f64) {
        match self {
            Self::Collapsed => (collapsed_width, COLLAPSED_ISLAND_HEIGHT),
            Self::Expanded => (EXPANDED_ISLAND_WIDTH, expanded_height),
        }
    }

    fn corner_radius(self) -> f64 {
        match self {
            Self::Collapsed => COLLAPSED_RADIUS,
            Self::Expanded => EXPANDED_RADIUS,
        }
    }
}

#[derive(Clone, Copy)]
struct IslandWindowState {
    mode: IslandMode,
    is_tucked: bool,
    collapsed_scale: f64,
    expanded_scale: f64,
    margin_y: f64,
    collapsed_width: f64,
    expanded_height: f64,
    custom_position: Option<IslandPosition>,
    is_dragging: bool,
    glass_enabled: bool,
    glass_intensity: f64,
    glass_tint: (u8, u8, u8),
}

impl IslandWindowState {
    fn is_detached(self) -> bool {
        self.custom_position.is_some() || self.margin_y > 0.0
    }

    fn top_corner_radius(self) -> f64 {
        if !self.is_detached() {
            return 0.0;
        }
        match self.mode {
            IslandMode::Collapsed => 14.0,
            IslandMode::Expanded => 22.0,
        }
    }

    fn active_scale(self) -> f64 {
        match self.mode {
            IslandMode::Collapsed => self.collapsed_scale,
            IslandMode::Expanded => self.expanded_scale,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
struct IslandPosition {
    x: i32,
    y: i32,
}

impl Default for IslandWindowState {
    fn default() -> Self {
        Self {
            mode: IslandMode::Collapsed,
            is_tucked: false,
            collapsed_scale: DEFAULT_COLLAPSED_SCALE,
            expanded_scale: DEFAULT_EXPANDED_SCALE,
            margin_y: DEFAULT_MARGIN_Y,
            collapsed_width: COLLAPSED_ISLAND_WIDTH,
            expanded_height: DEFAULT_EXPANDED_ISLAND_HEIGHT,
            custom_position: None,
            is_dragging: false,
            glass_enabled: false,
            glass_intensity: 72.0,
            glass_tint: (47, 47, 55),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IslandLayout {
    collapsed_scale: f64,
    expanded_scale: f64,
    margin_y: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveTodoMarkdownResult {
    file_path: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentTaskStatus {
    #[serde(default = "default_agent_phase")]
    phase: String,
    #[serde(default)]
    task_id: Option<String>,
    #[serde(default)]
    updated_at: i64,
}

impl Default for AgentTaskStatus {
    fn default() -> Self {
        Self {
            phase: default_agent_phase(),
            task_id: None,
            updated_at: 0,
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedAgentStatus {
    #[serde(default)]
    codex: AgentTaskStatus,
    #[serde(default)]
    claude_code: AgentTaskStatus,
    #[serde(default)]
    updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentStatusSnapshot {
    codex: AgentTaskStatus,
    claude_code: AgentTaskStatus,
    updated_at: i64,
    status_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentHooksInstallResult {
    scripts_dir: String,
    status_path: String,
    codex_config_path: String,
    claude_config_path: String,
    installed_at: i64,
}

fn default_agent_phase() -> String {
    "idle".to_string()
}

#[tauri::command]
fn set_island_layout(app: AppHandle, layout: IslandLayout) -> Result<(), String> {
    let window = main_window(&app)?;
    let state = mutate_window_state(|state| {
        state.collapsed_scale = layout.collapsed_scale.clamp(0.75, 1.4);
        state.expanded_scale = layout.expanded_scale.clamp(0.75, 1.4);
        state.margin_y = layout.margin_y.clamp(0.0, 160.0);
        *state
    });
    apply_stage_geometry(&window, state, false)
}

#[tauri::command]
fn set_island_interaction(
    app: AppHandle,
    mode: String,
    collapsed_scale: f64,
    expanded_scale: f64,
    margin_y: Option<f64>,
    expanded_height: Option<f64>,
    collapsed_width: Option<f64>,
    custom_position: Option<IslandPosition>,
    is_tucked: Option<bool>,
    animate_position: Option<bool>,
    glass_enabled: Option<bool>,
    glass_intensity: Option<f64>,
    glass_tint: Option<String>,
) -> Result<String, String> {
    let window = main_window(&app)?;
    let mode = IslandMode::from_value(&mode)?;
    let previous_state = read_window_state();
    let restored_custom_position = previous_state.custom_position.or_else(|| {
        custom_position.filter(|position| {
            monitor_for_island_position(&window, *position)
                .ok()
                .flatten()
                .is_some()
        })
    });
    let state = mutate_window_state(|state| {
        state.mode = mode;
        state.is_tucked = is_tucked.unwrap_or(false);
        state.collapsed_scale = collapsed_scale.clamp(0.75, 1.4);
        state.expanded_scale = expanded_scale.clamp(0.75, 1.4);
        if let Some(margin_y) = margin_y {
            state.margin_y = margin_y.clamp(0.0, 160.0);
        }
        if let Some(expanded_height) = expanded_height {
            state.expanded_height = expanded_height.clamp(
                MIN_EXPANDED_ISLAND_HEIGHT,
                DEFAULT_EXPANDED_ISLAND_HEIGHT + EXPANDED_ISLAND_HEIGHT_RANGE,
            );
        }
        if let Some(collapsed_width) = collapsed_width {
            state.collapsed_width =
                collapsed_width.clamp(MIN_COLLAPSED_ISLAND_WIDTH, COLLAPSED_ISLAND_WIDTH);
        }
        if state.custom_position.is_none() {
            state.custom_position = restored_custom_position;
        }
        state.glass_enabled = glass_enabled.unwrap_or(false);
        if let Some(glass_intensity) = glass_intensity {
            state.glass_intensity = glass_intensity.clamp(25.0, 100.0);
        }
        if let Some(glass_tint) = glass_tint.as_deref().and_then(parse_hex_color) {
            state.glass_tint = glass_tint;
        }
        *state
    });
    apply_stage_geometry(
        &window,
        state,
        animate_position.unwrap_or(true) && previous_state.is_tucked != state.is_tucked,
    )?;
    apply_glass_material(&window, state)
}

#[tauri::command]
fn start_island_drag(app: AppHandle) -> Result<(), String> {
    let window = main_window(&app)?;
    let current_state = read_window_state();

    if !matches!(current_state.mode, IslandMode::Collapsed)
        || current_state.is_tucked
        || current_state.is_dragging
    {
        return Ok(());
    }

    let position = window.outer_position().map_err(|error| error.to_string())?;
    POSITION_ANIMATION_GENERATION.fetch_add(1, Ordering::SeqCst);
    mutate_window_state(|state| {
        state.custom_position = Some(IslandPosition {
            x: position.x,
            y: position.y,
        });
        state.is_dragging = true;
        *state
    });

    if let Err(error) = window.start_dragging() {
        mutate_window_state(|state| {
            state.is_dragging = false;
            state.custom_position = current_state.custom_position;
            *state
        });
        return Err(error.to_string());
    }

    thread::spawn(move || {
        while unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) } < 0 {
            thread::sleep(Duration::from_millis(8));
        }
        thread::sleep(Duration::from_millis(8));

        let final_position = window.outer_position().ok().map(|position| IslandPosition {
            x: position.x,
            y: position.y,
        });
        let did_finish_drag = {
            let mut state = window_state().lock().expect("window state poisoned");
            if !state.is_dragging {
                false
            } else {
                state.is_dragging = false;
                if let Some(position) = final_position {
                    state.custom_position = Some(position);
                }
                true
            }
        };

        if did_finish_drag {
            if let Some(position) = final_position {
                let _ = window.emit("island-position-changed", position);
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn reset_island_position(app: AppHandle) -> Result<(), String> {
    let window = main_window(&app)?;
    let state = mutate_window_state(|state| {
        state.custom_position = None;
        state.is_dragging = false;
        *state
    });

    apply_stage_geometry(&window, state, false)
}

#[tauri::command]
fn minimize_island(app: AppHandle) -> Result<(), String> {
    hide_island(&app);
    Ok(())
}

#[tauri::command]
fn show_ready_island(app: AppHandle) -> Result<(), String> {
    show_island(&app)
}

#[tauri::command]
fn get_launch_at_startup() -> Result<bool, String> {
    let mut command = Command::new("reg");
    let status = command
        .creation_flags(CREATE_NO_WINDOW)
        .args(["query", STARTUP_REGISTRY_KEY, "/v", STARTUP_REGISTRY_VALUE])
        .status()
        .map_err(|error| format!("Failed to query startup registry: {error}"))?;

    Ok(status.success())
}

#[tauri::command]
fn set_launch_at_startup(enabled: bool) -> Result<(), String> {
    let status = if enabled {
        let current_exe = std::env::current_exe()
            .map_err(|error| format!("Failed to resolve current executable: {error}"))?;
        let startup_value = format!("\"{}\"", current_exe.display());

        let mut command = Command::new("reg");
        command
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "add",
                STARTUP_REGISTRY_KEY,
                "/v",
                STARTUP_REGISTRY_VALUE,
                "/t",
                "REG_SZ",
                "/d",
            ])
            .arg(startup_value)
            .arg("/f")
            .status()
    } else {
        let mut command = Command::new("reg");
        command
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "delete",
                STARTUP_REGISTRY_KEY,
                "/v",
                STARTUP_REGISTRY_VALUE,
                "/f",
            ])
            .status()
    }
    .map_err(|error| format!("Failed to update startup registry: {error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err("Startup registry command failed.".to_string())
    }
}

#[tauri::command]
fn save_todo_markdown(
    directory: String,
    date: String,
    content: String,
) -> Result<SaveTodoMarkdownResult, String> {
    let directory = directory.trim();

    if directory.is_empty() {
        return Err("Todo save path is empty.".to_string());
    }

    if !date.chars().all(|ch| ch.is_ascii_digit() || ch == '-') {
        return Err("Todo date contains invalid filename characters.".to_string());
    }

    let directory_path = PathBuf::from(directory);
    fs::create_dir_all(&directory_path).map_err(|error| error.to_string())?;

    let file_path = directory_path.join(format!("{date}.md"));
    fs::write(&file_path, content).map_err(|error| error.to_string())?;

    Ok(SaveTodoMarkdownResult {
        file_path: file_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn get_default_todo_save_directory() -> Result<String, String> {
    let home_dir = windows_home_dir()?;
    Ok(home_dir
        .join("Documents")
        .join("FocuSD")
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
async fn get_agent_status(app: AppHandle) -> Result<AgentStatusSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || read_agent_status(app))
        .await
        .map_err(|error| format!("Failed to join the agent status task: {error}"))?
}

fn read_agent_status(app: AppHandle) -> Result<AgentStatusSnapshot, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;

    let status_path = app_dir.join(AGENT_STATUS_FILE_NAME);
    let status_path_display = status_path.to_string_lossy().to_string();
    let mut snapshot = match fs::read_to_string(&status_path) {
        Ok(content) => match serde_json::from_str::<PersistedAgentStatus>(&content) {
            Ok(persisted) => agent_status_snapshot_from_persisted(persisted, status_path_display),
            Err(_) => default_agent_status_snapshot(status_path_display),
        },
        Err(_) => default_agent_status_snapshot(status_path_display),
    };
    apply_agent_running_markers(&app_dir, &mut snapshot);

    Ok(snapshot)
}

#[tauri::command]
fn clear_agent_status(app: AppHandle, provider: String) -> Result<AgentStatusSnapshot, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;

    let status_path = app_dir.join(AGENT_STATUS_FILE_NAME);
    let status_path_display = status_path.to_string_lossy().to_string();
    let mut persisted = match fs::read_to_string(&status_path) {
        Ok(content) => serde_json::from_str::<PersistedAgentStatus>(&content)
            .unwrap_or_else(|_| default_persisted_agent_status()),
        Err(_) => default_persisted_agent_status(),
    };

    let now = current_unix_millis();
    let cleared_status = AgentTaskStatus {
        phase: default_agent_phase(),
        task_id: None,
        updated_at: now,
    };

    match provider.as_str() {
        "codex" => {
            persisted.codex = cleared_status;
            remove_agent_marker_files(
                &app_dir,
                CODEX_RUNNING_MARKER_FILE_NAME,
                CODEX_RUNNING_HOLD_FILE_NAME,
            );
        }
        "claudeCode" => {
            persisted.claude_code = cleared_status;
            remove_agent_marker_files(
                &app_dir,
                CLAUDE_CODE_RUNNING_MARKER_FILE_NAME,
                CLAUDE_CODE_RUNNING_HOLD_FILE_NAME,
            );
        }
        _ => {
            return Err("Unsupported agent provider.".to_string());
        }
    }

    persisted.updated_at = now;
    let content = serde_json::to_string_pretty(&persisted)
        .map_err(|error| format!("Failed to serialize agent status: {error}"))?;
    write_text_file(&status_path, &content)?;

    Ok(agent_status_snapshot_from_persisted(
        persisted,
        status_path_display,
    ))
}

#[tauri::command]
fn install_agent_status_hooks(app: AppHandle) -> Result<AgentHooksInstallResult, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;

    install_agent_hook_scripts(&app_dir)?;

    let running_script_path = app_dir.join(AGENT_RUNNING_SCRIPT_FILE_NAME);
    let status_script_path = app_dir.join(AGENT_STATUS_SCRIPT_FILE_NAME);
    let home_dir = windows_home_dir()?;
    let codex_config_path = home_dir.join(".codex").join("config.toml");
    let claude_config_path = home_dir.join(".claude").join("settings.json");

    install_codex_status_hooks(
        &codex_config_path,
        &running_script_path,
        &status_script_path,
    )?;
    install_claude_code_status_hooks(
        &claude_config_path,
        &running_script_path,
        &status_script_path,
    )?;

    Ok(AgentHooksInstallResult {
        scripts_dir: app_dir.to_string_lossy().to_string(),
        status_path: app_dir
            .join(AGENT_STATUS_FILE_NAME)
            .to_string_lossy()
            .to_string(),
        codex_config_path: codex_config_path.to_string_lossy().to_string(),
        claude_config_path: claude_config_path.to_string_lossy().to_string(),
        installed_at: current_unix_millis(),
    })
}

#[tauri::command]
async fn get_media_state() -> Result<media_control::MediaState, String> {
    tauri::async_runtime::spawn_blocking(media_control::get_state)
        .await
        .map_err(|error| format!("Failed to join the media state task: {error}"))?
}

#[tauri::command]
async fn get_audio_level() -> Result<media_control::AudioLevel, String> {
    tauri::async_runtime::spawn_blocking(media_control::get_audio_level)
        .await
        .map_err(|error| format!("Failed to join the audio level task: {error}"))?
}

#[tauri::command]
async fn media_play_pause() -> Result<media_control::MediaState, String> {
    run_media_command(media_control::MediaCommand::PlayPause).await
}

#[tauri::command]
async fn media_next() -> Result<media_control::MediaState, String> {
    run_media_command(media_control::MediaCommand::Next).await
}

#[tauri::command]
async fn media_previous() -> Result<media_control::MediaState, String> {
    run_media_command(media_control::MediaCommand::Previous).await
}

async fn run_media_command(
    command: media_control::MediaCommand,
) -> Result<media_control::MediaState, String> {
    tauri::async_runtime::spawn_blocking(move || media_control::run_command(command))
        .await
        .map_err(|error| format!("Failed to join the media command task: {error}"))?
}

fn default_agent_status_snapshot(status_path: String) -> AgentStatusSnapshot {
    AgentStatusSnapshot {
        codex: AgentTaskStatus::default(),
        claude_code: AgentTaskStatus::default(),
        updated_at: current_unix_millis(),
        status_path,
    }
}

fn default_persisted_agent_status() -> PersistedAgentStatus {
    PersistedAgentStatus {
        codex: AgentTaskStatus::default(),
        claude_code: AgentTaskStatus::default(),
        updated_at: current_unix_millis(),
    }
}

fn agent_status_snapshot_from_persisted(
    persisted: PersistedAgentStatus,
    status_path: String,
) -> AgentStatusSnapshot {
    AgentStatusSnapshot {
        codex: normalize_agent_task_status(persisted.codex),
        claude_code: normalize_agent_task_status(persisted.claude_code),
        updated_at: if persisted.updated_at > 0 {
            persisted.updated_at
        } else {
            current_unix_millis()
        },
        status_path,
    }
}

fn apply_agent_running_markers(app_dir: &Path, snapshot: &mut AgentStatusSnapshot) {
    let now = current_unix_millis();

    if let Some(marker_status) = active_agent_running_marker_status(
        app_dir,
        &snapshot.codex,
        CODEX_RUNNING_MARKER_FILE_NAME,
        CODEX_RUNNING_HOLD_FILE_NAME,
        now,
    ) {
        snapshot.codex.phase = marker_status.phase;
        snapshot.codex.updated_at = marker_status.updated_at;
    }

    if let Some(marker_status) = active_agent_running_marker_status(
        app_dir,
        &snapshot.claude_code,
        CLAUDE_CODE_RUNNING_MARKER_FILE_NAME,
        CLAUDE_CODE_RUNNING_HOLD_FILE_NAME,
        now,
    ) {
        snapshot.claude_code.phase = marker_status.phase;
        snapshot.claude_code.updated_at = marker_status.updated_at;
    }
}

fn active_agent_running_marker_status(
    app_dir: &Path,
    status: &AgentTaskStatus,
    running_file_name: &str,
    hold_file_name: &str,
    now: i64,
) -> Option<AgentTaskStatus> {
    let running_path = app_dir.join(running_file_name);
    if running_path.is_file() {
        let marker_updated_at = file_modified_unix_millis(&running_path).unwrap_or(now);
        if status.phase != "running"
            && status.updated_at > 0
            && status.updated_at >= marker_updated_at
        {
            return None;
        }

        let phase = if now.saturating_sub(marker_updated_at) >= AGENT_RUNNING_STALE_AFTER_MS {
            "stale"
        } else {
            "running"
        };

        return Some(AgentTaskStatus {
            phase: phase.to_string(),
            task_id: status.task_id.clone(),
            updated_at: marker_updated_at,
        });
    }

    let hold_path = app_dir.join(hold_file_name);
    let visible_until = fs::read_to_string(hold_path)
        .ok()
        .and_then(|content| content.trim().parse::<i64>().ok())?;
    if visible_until > now {
        Some(AgentTaskStatus {
            phase: "running".to_string(),
            task_id: status.task_id.clone(),
            updated_at: now,
        })
    } else {
        None
    }
}

fn remove_agent_marker_files(app_dir: &Path, running_file_name: &str, hold_file_name: &str) {
    fs::remove_file(app_dir.join(running_file_name)).ok();
    fs::remove_file(app_dir.join(hold_file_name)).ok();
}

fn normalize_agent_task_status(mut status: AgentTaskStatus) -> AgentTaskStatus {
    if !matches!(
        status.phase.as_str(),
        "idle" | "running" | "completed" | "failed" | "stale"
    ) {
        status.phase = default_agent_phase();
    }

    status
}

fn install_agent_hook_scripts(app_dir: &Path) -> Result<(), String> {
    write_text_file(
        &app_dir.join(AGENT_RUNNING_SCRIPT_FILE_NAME),
        &normalize_windows_line_endings(AGENT_RUNNING_SCRIPT),
    )?;
    write_text_file(
        &app_dir.join(AGENT_STATUS_SCRIPT_FILE_NAME),
        &normalize_windows_line_endings(AGENT_STATUS_SCRIPT),
    )
}

fn install_codex_status_hooks(
    config_path: &Path,
    running_script_path: &Path,
    status_script_path: &Path,
) -> Result<(), String> {
    let content = fs::read_to_string(config_path).unwrap_or_default();
    let content = remove_managed_codex_hook_block(&content);
    let block = build_codex_hook_block(running_script_path, status_script_path);
    let mut next_content = content.trim_end().to_string();
    if !next_content.is_empty() {
        next_content.push_str("\n\n");
    }
    next_content.push_str(&block);

    write_text_file(config_path, &next_content)
}

fn install_claude_code_status_hooks(
    config_path: &Path,
    running_script_path: &Path,
    status_script_path: &Path,
) -> Result<(), String> {
    let mut config = match fs::read_to_string(config_path) {
        Ok(content) if !content.trim().is_empty() => serde_json::from_str::<Value>(&content)
            .map_err(|error| format!("Failed to parse Claude Code settings.json: {error}"))?,
        _ => json!({}),
    };

    let Some(root) = config.as_object_mut() else {
        return Err("Claude Code settings.json must contain a JSON object.".to_string());
    };

    let hooks = root
        .entry("hooks")
        .or_insert_with(|| Value::Object(Map::new()));
    if !hooks.is_object() {
        *hooks = Value::Object(Map::new());
    }
    let hooks = hooks
        .as_object_mut()
        .ok_or_else(|| "Failed to prepare Claude Code hooks object.".to_string())?;

    install_claude_code_hook_event(
        hooks,
        "UserPromptSubmit",
        claude_code_running_hook_entry(running_script_path),
    );
    install_claude_code_hook_event(
        hooks,
        "PreToolUse",
        claude_code_match_all_hook_entry(claude_code_running_hook_entry(running_script_path)),
    );
    install_claude_code_hook_event(
        hooks,
        "Stop",
        claude_code_status_hook_entry(status_script_path, "completed"),
    );
    install_claude_code_hook_event(
        hooks,
        "StopFailure",
        claude_code_status_hook_entry(status_script_path, "failed"),
    );

    let json = serde_json::to_string_pretty(&config)
        .map_err(|error| format!("Failed to serialize Claude Code settings.json: {error}"))?;
    write_text_file(config_path, &json)
}

fn install_claude_code_hook_event(hooks: &mut Map<String, Value>, event_name: &str, entry: Value) {
    let mut entries = hooks
        .remove(event_name)
        .and_then(|value| match value {
            Value::Array(entries) => Some(entries),
            _ => None,
        })
        .unwrap_or_default()
        .into_iter()
        .filter_map(remove_managed_claude_code_hooks)
        .collect::<Vec<_>>();

    entries.push(entry);
    hooks.insert(event_name.to_string(), Value::Array(entries));
}

fn remove_managed_claude_code_hooks(mut entry: Value) -> Option<Value> {
    let Value::Object(entry_object) = &mut entry else {
        return Some(entry);
    };

    let Some(hooks_value) = entry_object.get_mut("hooks") else {
        return Some(entry);
    };

    let Value::Array(hooks) = hooks_value else {
        return Some(entry);
    };

    hooks.retain(|hook| !value_contains_focusd_hook_signature(hook));
    if hooks.is_empty() {
        None
    } else {
        Some(entry)
    }
}

fn value_contains_focusd_hook_signature(value: &Value) -> bool {
    match value {
        Value::String(text) => text.contains(FOCUSD_AGENT_HOOK_SIGNATURE),
        Value::Array(values) => values.iter().any(value_contains_focusd_hook_signature),
        Value::Object(values) => values.values().any(value_contains_focusd_hook_signature),
        _ => false,
    }
}

fn claude_code_match_all_hook_entry(mut entry: Value) -> Value {
    if let Value::Object(object) = &mut entry {
        object.insert("matcher".to_string(), Value::String("*".to_string()));
    }

    entry
}

fn claude_code_running_hook_entry(script_path: &Path) -> Value {
    claude_code_hook_entry(
        "cmd.exe",
        vec![
            "/d".to_string(),
            "/s".to_string(),
            "/c".to_string(),
            format!("\"{}\" claudeCode", script_path.to_string_lossy()),
        ],
        1,
    )
}

fn claude_code_status_hook_entry(script_path: &Path, phase: &str) -> Value {
    claude_code_hook_entry(
        "powershell.exe",
        vec![
            "-NoProfile".to_string(),
            "-ExecutionPolicy".to_string(),
            "Bypass".to_string(),
            "-File".to_string(),
            script_path.to_string_lossy().to_string(),
            "claudeCode".to_string(),
            phase.to_string(),
        ],
        5,
    )
}

fn claude_code_hook_entry(command: &str, args: Vec<String>, timeout: i64) -> Value {
    json!({
        "hooks": [
            {
                "type": "command",
                "command": command,
                "args": args,
                "timeout": timeout
            }
        ]
    })
}

fn build_codex_hook_block(running_script_path: &Path, status_script_path: &Path) -> String {
    let submit_command = agent_running_command(running_script_path, "codex");
    let stop_command = agent_status_command(status_script_path, "codex", "completed");

    format!(
        r#"{begin}

[[hooks.UserPromptSubmit]]
[[hooks.UserPromptSubmit.hooks]]
type = "command"
command = {submit_command}
command_windows = {submit_command}
timeout = 1
statusMessage = "Updating FocuSD agent status"

[[hooks.Stop]]
[[hooks.Stop.hooks]]
type = "command"
command = {stop_command}
command_windows = {stop_command}
timeout = 5
statusMessage = "Updating FocuSD agent status"

{end}"#,
        begin = FOCUSD_AGENT_HOOK_BLOCK_BEGIN,
        end = FOCUSD_AGENT_HOOK_BLOCK_END,
        submit_command = toml_basic_string(&submit_command),
        stop_command = toml_basic_string(&stop_command),
    )
}

fn remove_managed_codex_hook_block(content: &str) -> String {
    let mut remaining = content;
    let mut next_content = String::new();

    while let Some(start) = remaining.find(FOCUSD_AGENT_HOOK_BLOCK_BEGIN) {
        next_content.push_str(&remaining[..start]);
        let after_begin = &remaining[start..];
        let Some(end) = after_begin.find(FOCUSD_AGENT_HOOK_BLOCK_END) else {
            remaining = "";
            break;
        };

        remaining = &after_begin[end + FOCUSD_AGENT_HOOK_BLOCK_END.len()..];
        if let Some(stripped) = remaining.strip_prefix("\r\n") {
            remaining = stripped;
        } else if let Some(stripped) = remaining.strip_prefix('\n') {
            remaining = stripped;
        }
    }

    next_content.push_str(remaining);
    remove_legacy_codex_focusd_hooks(&next_content)
}

fn remove_legacy_codex_focusd_hooks(content: &str) -> String {
    let lines = content.lines().collect::<Vec<_>>();
    let mut next_lines: Vec<&str> = Vec::new();
    let mut index = 0;

    while index < lines.len() {
        let trimmed = lines[index].trim();
        if let Some(hook_path) = codex_hook_event_path(trimmed) {
            let start = index;
            index += 1;

            while index < lines.len() && !lines[index].trim().starts_with('[') {
                index += 1;
            }

            let metadata_end = index;
            let mut kept_child_ranges = Vec::new();
            let mut removed_managed_child = false;

            while index < lines.len() {
                let candidate = lines[index].trim();
                if !is_codex_nested_hook_header_for(candidate, &hook_path) {
                    break;
                }

                let child_start = index;
                index += 1;
                while index < lines.len() && !lines[index].trim().starts_with('[') {
                    index += 1;
                }

                let child_block = lines[child_start..index].join("\n");
                if child_block.contains(FOCUSD_AGENT_HOOK_SIGNATURE) {
                    removed_managed_child = true;
                } else {
                    kept_child_ranges.push(child_start..index);
                }
            }

            if !removed_managed_child {
                next_lines.extend_from_slice(&lines[start..index]);
                continue;
            }

            if kept_child_ranges.is_empty() {
                continue;
            }

            next_lines.extend_from_slice(&lines[start..metadata_end]);
            for range in kept_child_ranges {
                next_lines.extend_from_slice(&lines[range]);
            }
            continue;
        }

        next_lines.push(lines[index]);
        index += 1;
    }

    next_lines.join("\n")
}

fn codex_hook_event_path(header: &str) -> Option<String> {
    if !header.starts_with("[[hooks.") || !header.ends_with("]]") {
        return None;
    }

    let hook_path = header.strip_prefix("[[")?.strip_suffix("]]")?;
    if hook_path.ends_with(".hooks") {
        return None;
    }

    Some(hook_path.to_string())
}

fn is_codex_nested_hook_header_for(header: &str, hook_path: &str) -> bool {
    header == format!("[[{hook_path}.hooks]]")
}

fn agent_running_command(script_path: &Path, provider: &str) -> String {
    format!(
        "cmd.exe /d /s /c \"\"{}\" {}\"",
        script_path.to_string_lossy(),
        provider
    )
}

fn agent_status_command(script_path: &Path, provider: &str, phase: &str) -> String {
    format!(
        "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"{}\" {} {}",
        script_path.to_string_lossy(),
        provider,
        phase
    )
}

fn toml_basic_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn write_text_file(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    }

    let temporary_path = path.with_extension("tmp");
    fs::write(&temporary_path, content)
        .map_err(|error| format!("Failed to write {}: {error}", temporary_path.display()))?;
    fs::rename(&temporary_path, path)
        .or_else(|_| {
            fs::remove_file(path).ok();
            fs::rename(&temporary_path, path)
        })
        .map_err(|error| format!("Failed to replace {}: {error}", path.display()))
}

fn normalize_windows_line_endings(content: &str) -> String {
    content.replace("\r\n", "\n").replace('\n', "\r\n")
}

fn windows_home_dir() -> Result<PathBuf, String> {
    if let Ok(user_profile) = env::var("USERPROFILE") {
        let user_profile = user_profile.trim();
        if !user_profile.is_empty() {
            return Ok(PathBuf::from(user_profile));
        }
    }

    match (env::var("HOMEDRIVE"), env::var("HOMEPATH")) {
        (Ok(home_drive), Ok(home_path)) if !home_drive.is_empty() && !home_path.is_empty() => {
            Ok(PathBuf::from(format!("{home_drive}{home_path}")))
        }
        _ => Err("Failed to resolve the Windows user profile directory.".to_string()),
    }
}

fn file_modified_unix_millis(path: &Path) -> Option<i64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    system_time_to_unix_millis(modified)
}

fn current_unix_millis() -> i64 {
    system_time_to_unix_millis(SystemTime::now()).unwrap_or_default()
}

fn system_time_to_unix_millis(time: SystemTime) -> Option<i64> {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .ok()
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| "Main island window was not found.".to_string())
}

fn show_island(app: &AppHandle) -> Result<(), String> {
    let window = main_window(app)?;
    apply_stage_geometry(&window, read_window_state(), false)?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

fn hide_island(app: &AppHandle) {
    POSITION_ANIMATION_GENERATION.fetch_add(1, Ordering::SeqCst);
    if let Ok(window) = main_window(app) {
        let _ = window.hide();
    }
}

fn window_state() -> &'static Mutex<IslandWindowState> {
    WINDOW_STATE.get_or_init(|| Mutex::new(IslandWindowState::default()))
}

fn mutate_window_state(
    update: impl FnOnce(&mut IslandWindowState) -> IslandWindowState,
) -> IslandWindowState {
    let mut state = window_state().lock().expect("window state poisoned");
    update(&mut state)
}

fn read_window_state() -> IslandWindowState {
    *window_state().lock().expect("window state poisoned")
}

fn parse_hex_color(value: &str) -> Option<(u8, u8, u8)> {
    let hex = value.strip_prefix('#')?;
    if hex.len() != 6 || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }

    Some((
        u8::from_str_radix(&hex[0..2], 16).ok()?,
        u8::from_str_radix(&hex[2..4], 16).ok()?,
        u8::from_str_radix(&hex[4..6], 16).ok()?,
    ))
}

fn clear_window_glass_region(window: &WebviewWindow) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    if unsafe { SetWindowRgn(hwnd, None, true) } == 0 {
        return Err("Failed to clear the liquid glass window region.".to_string());
    }
    Ok(())
}

fn apply_glass_material(
    window: &WebviewWindow,
    state: IslandWindowState,
) -> Result<String, String> {
    // The main window is a fixed, transparent stage (820x460), while the island
    // itself is much smaller. Windows 11's DWM Acrylic backdrop is applied to
    // the whole HWND and cannot be reliably clipped by SetWindowRgn, leaving a
    // large blurred rectangle around the island. Keep the native state clear
    // and render the glass effect on the island element with CSS instead.
    // CSS owns the material for the lifetime of the main window. Reapplying
    // these native resets on every toggle needlessly invalidates its surface.
    if NATIVE_GLASS_INITIALIZED.get().is_none() {
        let _ = window_vibrancy::clear_acrylic(window);
        clear_window_glass_region(window)?;
        let _ = NATIVE_GLASS_INITIALIZED.set(());
    }

    if state.glass_enabled {
        Ok("css-fallback".to_string())
    } else {
        Ok("disabled".to_string())
    }
}

fn apply_stage_geometry(
    window: &WebviewWindow,
    state: IslandWindowState,
    animate_position: bool,
) -> Result<(), String> {
    let generation = POSITION_ANIMATION_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    // Keep room for the closing animation at every supported panel scale.
    let stage_height = STAGE_WINDOW_HEIGHT
        .max((state.expanded_height * state.expanded_scale).ceil() + STAGE_WINDOW_PADDING_Y);

    let stage_size = LogicalSize::new(STAGE_WINDOW_WIDTH, stage_height);
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    if window.inner_size().map_err(|error| error.to_string())?
        != stage_size.to_physical::<u32>(scale_factor)
    {
        window
            .set_size(Size::Logical(stage_size))
            .map_err(|error| error.to_string())?;
    }

    let current_monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?;
    let primary_monitor = window
        .primary_monitor()
        .map_err(|error| error.to_string())?;
    let custom_monitor = state
        .custom_position
        .and_then(|position| monitor_for_island_position(window, position).ok().flatten());
    let has_custom_monitor = custom_monitor.is_some();
    let monitor = custom_monitor
        .or_else(|| primary_monitor.or(current_monitor))
        .ok_or_else(|| "No monitor is available for island positioning.".to_string())?;

    let scale = monitor.scale_factor();
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let physical_width = (STAGE_WINDOW_WIDTH * scale).round() as i32;
    let physical_top_offset = (state.margin_y * scale).round() as i32;
    let tucked_top_offset =
        -((COLLAPSED_ISLAND_HEIGHT * state.collapsed_scale - TUCKED_VISIBLE_EDGE_HEIGHT).max(0.0)
            * scale)
            .round() as i32;
    let top_inset = work_area_top_inset(monitor_position.y, monitor.work_area().position.y);
    let centered_x = monitor_position.x + ((monitor_size.width as i32 - physical_width) / 2);
    let normal_y = monitor_position.y + top_inset + physical_top_offset;
    let tucked_y = monitor_position.y + top_inset + tucked_top_offset;
    let mut positioned_state = state;
    if !has_custom_monitor {
        positioned_state.custom_position = None;
    }
    let (x, y) = resolve_stage_position(positioned_state, centered_x, normal_y, tucked_y);

    let target = PhysicalPosition::new(x, y);
    let start = window.outer_position().map_err(|error| error.to_string())?;
    if start == target {
        return Ok(());
    }
    if !animate_position {
        return window
            .set_position(Position::Physical(target))
            .map_err(|error| error.to_string());
    }

    let window = window.clone();
    thread::spawn(move || {
        let started_at = Instant::now();
        loop {
            if POSITION_ANIMATION_GENERATION.load(Ordering::SeqCst) != generation {
                break;
            }
            let progress = (started_at.elapsed().as_secs_f64()
                / POSITION_ANIMATION_DURATION.as_secs_f64())
                .min(1.0);
            let position = interpolate_stage_position(start, target, progress);
            if let Err(error) = window.set_position(Position::Physical(position)) {
                eprintln!("Failed to animate island position: {error}");
                break;
            }
            if progress >= 1.0 {
                break;
            }
            thread::sleep(Duration::from_millis(8));
        }
    });
    Ok(())
}

fn interpolate_stage_position(
    start: PhysicalPosition<i32>,
    target: PhysicalPosition<i32>,
    progress: f64,
) -> PhysicalPosition<i32> {
    let eased = 1.0 - (1.0 - progress.clamp(0.0, 1.0)).powi(3);
    PhysicalPosition::new(
        (start.x as f64 + (target.x as f64 - start.x as f64) * eased).round() as i32,
        (start.y as f64 + (target.y as f64 - start.y as f64) * eased).round() as i32,
    )
}

fn monitor_for_island_position(
    window: &WebviewWindow,
    position: IslandPosition,
) -> Result<Option<Monitor>, String> {
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;

    Ok(monitors.into_iter().find(|monitor| {
        let scale = monitor.scale_factor();
        let island_center_x = position.x as f64 + STAGE_WINDOW_WIDTH * scale / 2.0;
        let island_center_y = position.y as f64 + COLLAPSED_ISLAND_HEIGHT * scale / 2.0;
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();

        island_center_x >= monitor_position.x as f64
            && island_center_x < (monitor_position.x + monitor_size.width as i32) as f64
            && island_center_y >= monitor_position.y as f64
            && island_center_y < (monitor_position.y + monitor_size.height as i32) as f64
    }))
}

// A top-docked taskbar shrinks the monitor work area instead of the monitor itself,
// so the island has to be anchored below it or the taskbar covers the island.
fn work_area_top_inset(monitor_top: i32, work_area_top: i32) -> i32 {
    (work_area_top - monitor_top).max(0)
}

fn resolve_stage_position(
    state: IslandWindowState,
    centered_x: i32,
    normal_y: i32,
    tucked_y: i32,
) -> (i32, i32) {
    match (state.custom_position, state.is_tucked) {
        (Some(position), true) => (position.x, tucked_y),
        (Some(position), false) => (position.x, position.y),
        (None, true) => (centered_x, tucked_y),
        (None, false) => (centered_x, normal_y),
    }
}

fn record_dragged_position(position: PhysicalPosition<i32>) {
    mutate_window_state(|state| {
        if state.is_dragging && !state.is_tucked {
            state.custom_position = Some(IslandPosition {
                x: position.x,
                y: position.y,
            });
        }
        *state
    });
}

fn start_cursor_passthrough_loop(window: WebviewWindow) {
    thread::spawn(move || {
        let mut ignoring_cursor = false;

        loop {
            let should_ignore = !cursor_is_inside_island(&window);

            if should_ignore != ignoring_cursor {
                if window.set_ignore_cursor_events(should_ignore).is_ok() {
                    ignoring_cursor = should_ignore;
                }
            }

            thread::sleep(Duration::from_millis(12));
        }
    });
}

fn cursor_is_inside_island(window: &WebviewWindow) -> bool {
    let hwnd = match window.hwnd() {
        Ok(hwnd) => hwnd,
        Err(_) => return true,
    };
    let mut window_rect = RECT::default();
    let mut cursor = POINT::default();

    if unsafe { GetWindowRect(hwnd, &mut window_rect) }.is_err() {
        return true;
    }

    if unsafe { GetCursorPos(&mut cursor) }.is_err() {
        return true;
    }

    let window_width = (window_rect.right - window_rect.left).max(1) as f64;
    let physical_scale = window_width / STAGE_WINDOW_WIDTH;
    let local_x = (cursor.x - window_rect.left) as f64;
    let local_y = (cursor.y - window_rect.top) as f64;
    let state = read_window_state();

    let (base_width, base_height) = state
        .mode
        .base_size(state.collapsed_width, state.expanded_height);
    let island_width = base_width * state.active_scale() * physical_scale;
    let island_height = base_height * state.active_scale() * physical_scale;
    let island_left = (window_width - island_width) / 2.0;
    let island_top = 0.0;
    let radius = state.mode.corner_radius() * state.active_scale() * physical_scale;
    let top_radius = state.top_corner_radius() * state.active_scale() * physical_scale;

    point_in_notch(
        local_x,
        local_y,
        island_left,
        island_top,
        island_width,
        island_height,
        radius,
        top_radius,
    )
}

fn point_in_notch(
    x: f64,
    y: f64,
    left: f64,
    top: f64,
    width: f64,
    height: f64,
    radius: f64,
    top_radius: f64,
) -> bool {
    let right = left + width;
    let bottom = top + height;

    if x < left || x > right || y < top || y > bottom {
        return false;
    }

    let top_radius = top_radius.min(width / 2.0).min(height / 2.0);
    if y < top + top_radius && (x < left + top_radius || x > right - top_radius) {
        let dx = x - x.clamp(left + top_radius, right - top_radius);
        let dy = y - (top + top_radius);
        return dx * dx + dy * dy <= top_radius * top_radius;
    }

    let radius = radius.min(width / 2.0).min(height);
    if y <= bottom - radius || (x >= left + radius && x <= right - radius) {
        return true;
    }
    let center_x = if x < left + radius {
        left + radius
    } else if x > right - radius {
        right - radius
    } else {
        x
    };
    let center_y = y.min(bottom - radius);
    let dx = x - center_x;
    let dy = y - center_y;

    (dx * dx) + (dy * dy) <= radius * radius
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(mode: IslandMode, scale: f64, expanded_height: f64) -> IslandWindowState {
        IslandWindowState {
            mode,
            collapsed_scale: scale,
            expanded_scale: scale,
            expanded_height,
            ..IslandWindowState::default()
        }
    }

    #[test]
    fn top_docked_taskbar_pushes_island_below_the_work_area() {
        assert_eq!(work_area_top_inset(0, 48), 48);
        assert_eq!(work_area_top_inset(0, 0), 0);
        assert_eq!(work_area_top_inset(-1080, -1080), 0);
        assert_eq!(work_area_top_inset(0, -10), 0);
    }

    #[test]
    fn custom_position_survives_tuck_and_reveal() {
        let mut custom = state(IslandMode::Collapsed, 1.0, DEFAULT_EXPANDED_ISLAND_HEIGHT);
        custom.custom_position = Some(IslandPosition { x: 420, y: 180 });

        assert_eq!(resolve_stage_position(custom, 100, 12, -48), (420, 180));

        custom.is_tucked = true;
        assert_eq!(resolve_stage_position(custom, 100, 12, -48), (420, -48));

        custom.is_tucked = false;
        assert_eq!(resolve_stage_position(custom, 100, 12, -48), (420, 180));
    }

    #[test]
    fn notch_has_flat_top_and_rounded_bottom_at_all_scales() {
        for scale in [0.75, DEFAULT_COLLAPSED_SCALE, 1.0, 1.4, 2.1] {
            for mode in [IslandMode::Collapsed, IslandMode::Expanded] {
                let (width, height) =
                    mode.base_size(COLLAPSED_ISLAND_WIDTH, DEFAULT_EXPANDED_ISLAND_HEIGHT);
                let width = width * scale;
                let height = height * scale;
                let radius = mode.corner_radius() * scale;
                let contains = |x, y| point_in_notch(x, y, 80.0, 0.0, width, height, radius, 0.0);

                assert!(contains(80.0, 0.0));
                assert!(contains(80.0 + width, 0.0));
                assert!(contains(80.0 + width / 2.0, height));
                assert!(!contains(80.0, height));
                assert!(!contains(80.0 + width, height));
                assert!(!contains(79.0, 0.0));
                assert!(!contains(80.0 + width / 2.0, height + 1.0));
            }
        }
    }

    #[test]
    fn default_notch_stays_at_top_when_expanding() {
        for mode in [IslandMode::Collapsed, IslandMode::Expanded] {
            let state = state(mode, 1.0, DEFAULT_EXPANDED_ISLAND_HEIGHT);
            assert_eq!(state.margin_y, 0.0);
            assert_eq!(resolve_stage_position(state, 550, 0, -28), (550, 0));
        }
    }

    #[test]
    fn compact_messages_and_mail_reader_keep_the_correct_cursor_boundary() {
        for height in [MIN_EXPANDED_ISLAND_HEIGHT, 244.0, 438.0, 450.0] {
            for scale in [0.75, 1.0, 1.4] {
                let (width, panel_height) = IslandMode::Expanded.base_size(COLLAPSED_ISLAND_WIDTH, height);
                let contains = |y| point_in_notch(
                    width * scale / 2.0, y, 0.0, 0.0, width * scale, panel_height * scale,
                    EXPANDED_RADIUS * scale, 0.0,
                );
                assert!(contains(panel_height * scale));
                assert!(!contains(panel_height * scale + 1.0));
                assert_eq!(IslandMode::Collapsed.base_size(COLLAPSED_ISLAND_WIDTH, height).1, COLLAPSED_ISLAND_HEIGHT);
            }
            let mut positioned = state(IslandMode::Expanded, 1.0, height);
            positioned.custom_position = Some(IslandPosition { x: 420, y: 180 });
            assert_eq!(resolve_stage_position(positioned, 100, 12, -48), (420, 180));
            positioned.is_tucked = true;
            assert_eq!(resolve_stage_position(positioned, 100, 12, -48), (420, -48));
        }
    }

    #[test]
    fn detached_island_rounds_top_corners() {
        for mode in [IslandMode::Collapsed, IslandMode::Expanded] {
            let mut detached = state(mode, 1.0, DEFAULT_EXPANDED_ISLAND_HEIGHT);
            assert_eq!(detached.top_corner_radius(), 0.0);
            detached.custom_position = Some(IslandPosition { x: 420, y: 180 });
            assert!(detached.top_corner_radius() > 0.0);
            let (width, height) = mode.base_size(COLLAPSED_ISLAND_WIDTH, DEFAULT_EXPANDED_ISLAND_HEIGHT);
            let contains = |x, y| point_in_notch(
                x, y, 80.0, 0.0, width, height, mode.corner_radius(), detached.top_corner_radius(),
            );
            assert!(!contains(80.0, 0.0));
            assert!(!contains(80.0 + width, 0.0));
            assert!(contains(80.0 + width / 2.0, 0.0));
            assert!(!contains(79.0, 0.0));
            detached.custom_position = None;
            assert_eq!(detached.top_corner_radius(), 0.0);
            detached.margin_y = 20.0;
            assert!(detached.top_corner_radius() > 0.0);
        }
    }

    #[test]
    fn docked_island_does_not_capture_cursor_outside_its_sides() {
        for scale in [0.75, DEFAULT_COLLAPSED_SCALE, 1.0, 1.4, 2.1] {
            let width = COLLAPSED_ISLAND_WIDTH * scale;
            let contains = |x, y| point_in_notch(
                x, y, 80.0, 0.0, width, COLLAPSED_ISLAND_HEIGHT * scale,
                COLLAPSED_RADIUS * scale, 0.0,
            );
            assert!(contains(80.0, 0.0));
            assert!(contains(80.0 + width, 0.0));
            for y in [0.0, 3.0 * scale, 6.0 * scale] {
                assert!(!contains(79.0, y));
                assert!(!contains(81.0 + width, y));
            }
        }
    }

    #[test]
    fn tuck_and_reveal_move_monotonically_between_physical_positions() {
        for (start, target) in [
            (PhysicalPosition::new(665, 0), PhysicalPosition::new(665, -32)),
            (PhysicalPosition::new(-900, -32), PhysicalPosition::new(-900, 270)),
        ] {
            assert_eq!(interpolate_stage_position(start, target, 0.0), start);
            assert_eq!(interpolate_stage_position(start, target, 1.0), target);
            let middle = interpolate_stage_position(start, target, 0.3);
            assert_ne!(middle, start);
            assert_ne!(middle, target);
            let mut last = start;
            for frame in 1..=40 {
                let current = interpolate_stage_position(start, target, frame as f64 / 40.0);
                assert_eq!(current.x, start.x);
                if target.y < start.y {
                    assert!(current.y <= last.y && current.y >= target.y);
                } else {
                    assert!(current.y >= last.y && current.y <= target.y);
                }
                last = current;
            }
        }
    }

    #[test]
    fn hex_tint_parser_rejects_invalid_values() {
        assert_eq!(parse_hex_color("#101013"), Some((16, 16, 19)));
        assert_eq!(parse_hex_color("101013"), None);
        assert_eq!(parse_hex_color("#xyzxyz"), None);
    }
}

fn build_tray(app: &App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Show Island", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "Hide Island", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

    let mut tray = TrayIconBuilder::new()
        .tooltip("fly-island")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                let _ = show_island(app);
            }
            "hide" => hide_island(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = show_island(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut context = tauri::generate_context!();
    if let Some(identifier) = notification_diagnostics::verification_identifier() {
        context.config_mut().identifier = identifier;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = show_island(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if window.label() == "translation" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
                return;
            }
            if window.label() != WINDOW_LABEL {
                return;
            }

            if let WindowEvent::Moved(position) = event {
                record_dragged_position(*position);
                return;
            }

            // Native Acrylic/Region is intentionally not reapplied on DPI
            // changes. Liquid glass is rendered inside the island element.
        })
        .setup(|app| {
            build_tray(app)?;
            if let Err(error) = clipboard_history::init(app.handle()) {
                eprintln!("failed to initialize clipboard history: {error}");
            }
            translation::init(app.handle());
            if let Err(error) = qq_mail::init(app.handle()) {
                eprintln!("failed to initialize QQ mail: {error}");
            }
            if let Err(error) = qq_notifications::init(app.handle()) {
                eprintln!("failed to initialize QQ notifications: {error}");
            }
            if let Err(error) = wechat_reminders::init(app.handle()) {
                eprintln!("failed to initialize WeChat reminders: {error}");
            }
            if let Err(error) = notification_diagnostics::start(app.handle()) {
                eprintln!("failed to initialize notification diagnostics: {error}");
            }
            if let Ok(window) = main_window(app.handle()) {
                if let Err(error) = apply_stage_geometry(&window, IslandWindowState::default(), false) {
                    eprintln!("failed to size and position island window: {error}");
                }
                start_cursor_passthrough_loop(window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            qq_mail::get_qq_mail_state,
            qq_mail::connect_qq_mail,
            qq_mail::set_qq_mail_enabled,
            qq_mail::refresh_qq_mail,
            qq_mail::read_qq_mail,
            qq_mail::disconnect_qq_mail,
            wechat_reminders::get_wechat_reminder_state,
            wechat_reminders::set_wechat_reminders_enabled,
            wechat_reminders::open_wechat,
            qq_notifications::get_qq_notification_state,
            qq_notifications::set_qq_notifications_enabled,
            qq_notifications::request_qq_notification_access,
            qq_notifications::open_qq_notification_settings,
            qq_notifications::clear_qq_notifications,
            qq_notifications::open_qq,
            set_island_layout,
            set_island_interaction,
            start_island_drag,
            reset_island_position,
            save_todo_markdown,
            get_default_todo_save_directory,
            show_ready_island,
            minimize_island,
            get_launch_at_startup,
            set_launch_at_startup,
            get_agent_status,
            clear_agent_status,
            install_agent_status_hooks,
            get_media_state,
            get_audio_level,
            media_play_pause,
            media_next,
            media_previous,
            clipboard_history::get_clipboard_history,
            clipboard_history::set_clipboard_history_settings,
            clipboard_history::copy_clipboard_history_item,
            clipboard_history::toggle_clipboard_history_favorite,
            clipboard_history::set_clipboard_history_item_note,
            clipboard_history::delete_clipboard_history_item,
            clipboard_history::clear_clipboard_history,
            translation::toggle_translation_window,
            translation::hide_translation_window,
            translation::read_translation_clipboard,
            translation::copy_translation_result,
            translation::has_translation_secret,
            translation::save_translation_secret,
            translation::delete_translation_secret,
            translation::translate_text,
            translation::set_translation_shortcut,
        ])
        .run(context)
        .expect("error while running FocuSD Island");
}
