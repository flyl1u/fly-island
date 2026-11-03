import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  LayoutEditor,
  SETTINGS_FOCUS_STORAGE_KEY,
  type SettingsFocusSection,
} from "./App";
import type { AgentHooksInstallResult, AgentProvider, AgentStatusSnapshot } from "./features/agent-status/api";
import { AGENT_PROVIDERS, DEFAULT_AGENT_STATUS, type AgentHooksInstallState } from "./features/agent-status/status";
import { DEFAULT_SETTINGS, LEGACY_DEFAULT_PRESET_NAMES, isDefaultSettingPreset, isSameSettings, mergeWithDefaultSettingPresets, normalizeSettings } from "./features/appearance/settings";
import { SETTINGS_PRESETS_STORAGE_KEY, STORAGE_KEY, loadSettingPresets, loadSettings } from "./features/appearance/storage";
import type { IslandPreset, IslandSettings } from "./features/appearance/types";
import { useLocale, useTranslation } from "./i18n";
import { getErrorMessage } from "./utils/error";
import { TODO_SAVE_DIRECTORY_STORAGE_KEY, createTodoId, loadSaveDirectory } from "./features/todos/storage";
import type { SavePathState } from "./features/todos/types";
import { getClipboardHistory, listenClipboardHistoryChanged, setClipboardHistorySettings, type ClipboardHistorySettings } from "./features/clipboard/api";
import { DEFAULT_CLIPBOARD_HISTORY, normalizeClipboardSettings } from "./features/clipboard/settings";
import { useQQNotifications } from "./QQNotifications";
import { useWeChatReminders } from "./WeChatReminders";
import "./SettingsWindow.css";

const FOCUS_REQUEST_MAX_AGE_MS = 10_000;
const AGENT_STATUS_POLL_MS = 1_000;

function takeFocusRequest(): SettingsFocusSection | null {
  const stored = window.localStorage.getItem(SETTINGS_FOCUS_STORAGE_KEY);

  if (stored === null) {
    return null;
  }

  window.localStorage.removeItem(SETTINGS_FOCUS_STORAGE_KEY);

  try {
    const request = JSON.parse(stored) as {
      section?: unknown;
      requestedAt?: unknown;
    };

    return request.section === "savePath" &&
      typeof request.requestedAt === "number" &&
      Date.now() - request.requestedAt < FOCUS_REQUEST_MAX_AGE_MS
      ? request.section
      : null;
  } catch {
    return null;
  }
}

function noop() {}

export default function SettingsWindow() {
  const t = useTranslation();
  const { locale, setLocale } = useLocale();
  const qqNotifications = useQQNotifications(false);
  const wechatReminders = useWeChatReminders(false);
  const [settings, setSettings] = useState<IslandSettings>(loadSettings);
  const [presets, setPresets] = useState<IslandPreset[]>(() =>
    loadSettingPresets(t),
  );
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [clipboardSettings, setClipboardSettings] =
    useState<ClipboardHistorySettings>(DEFAULT_CLIPBOARD_HISTORY.settings);
  const [agentStatus, setAgentStatus] =
    useState<AgentStatusSnapshot>(DEFAULT_AGENT_STATUS);
  const [clearingAgentProvider, setClearingAgentProvider] =
    useState<AgentProvider | null>(null);
  const [agentHooksInstallState, setAgentHooksInstallState] =
    useState<AgentHooksInstallState>("idle");
  const [agentHooksInstallResult, setAgentHooksInstallResult] =
    useState<AgentHooksInstallResult | null>(null);
  const [agentHooksInstallError, setAgentHooksInstallError] = useState("");
  const [saveDirectoryDraft, setSaveDirectoryDraft] =
    useState(loadSaveDirectory);
  const [savePathState, setSavePathState] = useState<SavePathState>("idle");
  const [highlightSavePath, setHighlightSavePath] = useState(false);

  useEffect(() => {
    void getCurrentWindow()
      .setTitle(`fly-island ${t.settings.title}`)
      .catch((error) => {
        console.error("Failed to set settings window title", error);
      });
  }, [t]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    window.localStorage.setItem(
      SETTINGS_PRESETS_STORAGE_KEY,
      JSON.stringify(presets),
    );
  }, [presets]);

  useEffect(() => {
    if (takeFocusRequest() === "savePath") {
      setHighlightSavePath(true);
    }

    const syncFromIsland = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        const nextSettings = loadSettings();
        setSettings((current) =>
          isSameSettings(current, nextSettings) ? current : nextSettings,
        );
      }

      if (event.key === TODO_SAVE_DIRECTORY_STORAGE_KEY) {
        setSaveDirectoryDraft(loadSaveDirectory());
      }

      if (
        event.key === SETTINGS_FOCUS_STORAGE_KEY &&
        event.newValue !== null &&
        takeFocusRequest() === "savePath"
      ) {
        setHighlightSavePath(true);
      }
    };

    window.addEventListener("storage", syncFromIsland);
    return () => window.removeEventListener("storage", syncFromIsland);
  }, []);

  useEffect(() => {
    void invoke<boolean>("get_launch_at_startup")
      .then(setLaunchAtStartup)
      .catch((error) => {
        console.error("Failed to read launch at startup", error);
      });
  }, []);

  const refreshClipboardSettings = useCallback(async () => {
    try {
      const snapshot = await getClipboardHistory();
      setClipboardSettings(snapshot.settings);
    } catch (error) {
      console.error("Failed to read clipboard history settings", error);
    }
  }, []);

  useEffect(() => {
    void refreshClipboardSettings();

    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void listenClipboardHistoryChanged(() => {
      void refreshClipboardSettings();
    })
      .then((nextUnlisten) => {
        if (didCancel) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch((error) => {
        console.error("Failed to listen for clipboard history changes", error);
      });

    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, [refreshClipboardSettings]);

  const refreshAgentStatus = useCallback(async () => {
    try {
      const snapshot = await invoke<AgentStatusSnapshot>("get_agent_status");
      setAgentStatus((current) =>
        current.statusPath === snapshot.statusPath &&
        AGENT_PROVIDERS.every(
          (provider) =>
            current[provider].phase === snapshot[provider].phase &&
            current[provider].taskId === snapshot[provider].taskId,
        )
          ? current
          : snapshot,
      );
    } catch (error) {
      console.error("Failed to read agent status", error);
    }
  }, []);

  useEffect(() => {
    void refreshAgentStatus();
    const interval = window.setInterval(() => {
      void refreshAgentStatus();
    }, AGENT_STATUS_POLL_MS);
    return () => window.clearInterval(interval);
  }, [refreshAgentStatus]);

  const updateClipboardSettings = useCallback(
    async (nextSettings: ClipboardHistorySettings) => {
      const normalizedSettings = normalizeClipboardSettings(nextSettings);
      setClipboardSettings(normalizedSettings);

      try {
        const snapshot = await setClipboardHistorySettings(normalizedSettings);
        setClipboardSettings(snapshot.settings);
      } catch (error) {
        console.error("Failed to update clipboard history settings", error);
        void refreshClipboardSettings();
      }
    },
    [refreshClipboardSettings],
  );

  const updateLaunchAtStartup = useCallback(async (enabled: boolean) => {
    setLaunchAtStartup(enabled);

    try {
      await invoke("set_launch_at_startup", { enabled });
    } catch (error) {
      console.error("Failed to update launch at startup", error);
      setLaunchAtStartup(!enabled);
    }
  }, []);

  const clearAgentStatus = useCallback(async (provider: AgentProvider) => {
    setClearingAgentProvider(provider);
    try {
      const snapshot = await invoke<AgentStatusSnapshot>("clear_agent_status", {
        provider,
      });
      setAgentStatus(snapshot);
    } catch (error) {
      console.error("Failed to clear agent status", error);
    } finally {
      setClearingAgentProvider(null);
    }
  }, []);

  const installAgentHooks = useCallback(async () => {
    setAgentHooksInstallState("installing");
    setAgentHooksInstallError("");

    try {
      const result = await invoke<AgentHooksInstallResult>(
        "install_agent_status_hooks",
      );
      setAgentHooksInstallResult(result);
      setAgentHooksInstallState("installed");
      void refreshAgentStatus();
    } catch (error) {
      console.error("Failed to install agent status hooks", error);
      setAgentHooksInstallError(getErrorMessage(error));
      setAgentHooksInstallState("error");
    }
  }, [refreshAgentStatus]);

  const saveDirectory = useCallback(() => {
    const nextDirectory = saveDirectoryDraft.trim();

    window.localStorage.setItem(TODO_SAVE_DIRECTORY_STORAGE_KEY, nextDirectory);
    setSaveDirectoryDraft(nextDirectory);
    setHighlightSavePath(false);
    setSavePathState("saved");
    window.setTimeout(() => setSavePathState("idle"), 1200);
  }, [saveDirectoryDraft]);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const saveSettingsPreset = useCallback(() => {
    setPresets((currentPresets) => {
      const customPresetCount = currentPresets.filter(
        (preset) => !preset.isDefault && !isDefaultSettingPreset(preset.id),
      ).length;
      const preset: IslandPreset = {
        id: createTodoId(),
        name: t.settings.presets.defaultName(customPresetCount + 1),
        settings,
        createdAt: Date.now(),
        isDefault: false,
      };

      return mergeWithDefaultSettingPresets([preset, ...currentPresets]);
    });
  }, [settings, t]);

  const applySettingsPreset = useCallback(
    (presetId: string) => {
      const preset = presets.find((item) => item.id === presetId);

      if (preset) {
        setSettings(normalizeSettings(preset.settings));
      }
    },
    [presets],
  );

  const renameSettingsPreset = useCallback((presetId: string, name: string) => {
    const nextName = name.trim();

    if (
      !nextName ||
      isDefaultSettingPreset(presetId) ||
      LEGACY_DEFAULT_PRESET_NAMES.has(nextName)
    ) {
      return;
    }

    setPresets((currentPresets) =>
      currentPresets.map((preset) =>
        preset.id === presetId ? { ...preset, name: nextName } : preset,
      ),
    );
  }, []);

  const deleteSettingsPreset = useCallback((presetId: string) => {
    if (isDefaultSettingPreset(presetId)) {
      return;
    }

    setPresets((currentPresets) =>
      currentPresets.filter((preset) => preset.id !== presetId),
    );
  }, []);

  return (
    <main className={`settings-stage stage--font-${settings.fontFamily}`}>
      <LayoutEditor
        locale={locale}
        settings={settings}
        qqNotifications={qqNotifications}
        wechatReminders={wechatReminders}
        clipboardSettings={clipboardSettings}
        saveDirectoryDraft={saveDirectoryDraft}
        savePathState={savePathState}
        highlightSavePath={highlightSavePath}
        focusClipboardShortcutToken={0}
        presets={presets}
        launchAtStartup={launchAtStartup}
        agentStatus={agentStatus}
        clearingAgentProvider={clearingAgentProvider}
        agentHooksInstallState={agentHooksInstallState}
        agentHooksInstallResult={agentHooksInstallResult}
        agentHooksInstallError={agentHooksInstallError}
        onLocaleChange={setLocale}
        onSettingsChange={setSettings}
        onClipboardSettingsChange={updateClipboardSettings}
        onReset={resetSettings}
        onSaveDirectoryDraftChange={setSaveDirectoryDraft}
        onSaveDirectory={saveDirectory}
        onSavePreset={saveSettingsPreset}
        onApplyPreset={applySettingsPreset}
        onRenamePreset={renameSettingsPreset}
        onDeletePreset={deleteSettingsPreset}
        onLaunchAtStartupChange={updateLaunchAtStartup}
        onClearAgentStatus={clearAgentStatus}
        onInstallAgentHooks={installAgentHooks}
        onClipboardShortcutFocusHandled={noop}
      />
    </main>
  );
}
