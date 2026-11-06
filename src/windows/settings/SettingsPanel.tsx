import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutEditor } from "./LayoutEditor";
import { readLaunchAtStartup, saveLaunchAtStartup } from "./api";
import { DEFAULT_SETTINGS_CATEGORY, type SettingsCategory } from "./categories";
import { SETTINGS_FOCUS_STORAGE_KEY, SETTINGS_FOCUS_CHANGED, takeFocusRequest } from "./storage";
import { clearAgentProviderStatus, getAgentStatus, installAgentStatusHooks, type AgentHooksInstallResult, type AgentProvider, type AgentStatusSnapshot } from "../../features/agent-status/api";
import { AGENT_PROVIDERS, DEFAULT_AGENT_STATUS, type AgentHooksInstallState } from "../../features/agent-status/status";
import { LEGACY_DEFAULT_PRESET_NAMES, isDefaultSettingPreset, mergeWithDefaultSettingPresets, normalizeSettings } from "../../features/appearance/settings";
import { loadSettingPresets, saveSettingPresets } from "../../features/appearance/storage";
import type { IslandPreset, IslandSettings } from "../../features/appearance/types";
import { useLocale, useTranslation } from "../../i18n";
import { getErrorMessage } from "../../utils/error";
import { TODO_SAVE_DIRECTORY_STORAGE_KEY, createTodoId, loadSaveDirectory, saveSaveDirectory } from "../../features/todos/storage";
import type { SavePathState } from "../../features/todos/types";
import { getClipboardHistory, listenClipboardHistoryChanged, setClipboardHistorySettings, type ClipboardHistorySettings } from "../../features/clipboard/api";
import { DEFAULT_CLIPBOARD_HISTORY, normalizeClipboardSettings } from "../../features/clipboard/settings";
import type { QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import type { WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";
import "./SettingsWindow.css";

const AGENT_STATUS_POLL_MS = 1_000;

function noop() {}

export function SettingsPanel({ settings, onSettingsChange, qqNotifications, wechatReminders, detached, onDetachedChange }: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  detached: boolean;
  onDetachedChange: (detached: boolean) => void;
}) {
  const t = useTranslation();
  const { locale, setLocale } = useLocale();
  const [presets, setPresets] = useState<IslandPreset[]>(() =>
    loadSettingPresets(t),
  );
  const savedPresets = useRef(presets);
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
  const [category, setCategory] = useState<SettingsCategory>(DEFAULT_SETTINGS_CATEGORY);

  // The island asks for the save path when an export has nowhere to go; it lives on the general page.
  const focusSavePath = useCallback(() => {
    setCategory("general");
    setHighlightSavePath(true);
  }, []);

  useEffect(() => {
    if (savedPresets.current === presets) return;
    saveSettingPresets(presets);
    savedPresets.current = presets;
  }, [presets]);

  useEffect(() => {
    if (takeFocusRequest() === "savePath") {
      focusSavePath();
    }

    const syncFromIsland = (event: StorageEvent) => {
      if (event.key === TODO_SAVE_DIRECTORY_STORAGE_KEY) {
        setSaveDirectoryDraft(loadSaveDirectory());
      }

      if (
        event.key === SETTINGS_FOCUS_STORAGE_KEY &&
        event.newValue !== null &&
        takeFocusRequest() === "savePath"
      ) {
        focusSavePath();
      }
    };

    const onFocusRequest = () => { if (takeFocusRequest() === "savePath") focusSavePath(); };
    window.addEventListener("storage", syncFromIsland);
    window.addEventListener(SETTINGS_FOCUS_CHANGED, onFocusRequest);
    return () => {
      window.removeEventListener("storage", syncFromIsland);
      window.removeEventListener(SETTINGS_FOCUS_CHANGED, onFocusRequest);
    };
  }, [focusSavePath]);

  useEffect(() => {
    void readLaunchAtStartup()
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
      const snapshot = await getAgentStatus();
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
      await saveLaunchAtStartup(enabled);
    } catch (error) {
      console.error("Failed to update launch at startup", error);
      setLaunchAtStartup(!enabled);
    }
  }, []);

  const clearAgentStatus = useCallback(async (provider: AgentProvider) => {
    setClearingAgentProvider(provider);
    try {
      const snapshot = await clearAgentProviderStatus(provider);
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
      const result = await installAgentStatusHooks();
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

    // Storage unavailable: keep the draft and do not report "saved".
    if (!saveSaveDirectory(nextDirectory)) return;
    setSaveDirectoryDraft(nextDirectory);
    setHighlightSavePath(false);
    setSavePathState("saved");
    window.setTimeout(() => setSavePathState("idle"), 1200);
  }, [saveDirectoryDraft]);

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
        onSettingsChange(normalizeSettings(preset.settings));
      }
    },
    [presets, onSettingsChange],
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
    <div className="settings-panel">
      <LayoutEditor
        detachedSettings={detached}
        onDetachedSettingsChange={onDetachedChange}
        category={category}
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
        onCategoryChange={setCategory}
        onLocaleChange={setLocale}
        onSettingsChange={onSettingsChange}
        onClipboardSettingsChange={updateClipboardSettings}
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
    </div>
  );
}
