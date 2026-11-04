export type LocaleCode = "zh-CN" | "en";

export type Translations = {
  /** Native language name shown in the locale picker. */
  localeLabel: string;
  /** BCP-47 tag handed to Intl for dates and numbers. */
  localeTag: string;

  common: {
    close: string;
    retry: string;
    refresh: string;
    clear: string;
    saved: string;
    connecting: string;
    noMessages: string;
  };
  messages: {
    title: string;
    sources: string;
    wechat: string;
    mail: string;
    qqMail: string;
    qqNotifications: string;
    wechatReminders: string;
    newReminder: string;
    newMessage: string;
    newMail: string;
    wechatPreview: string;
    openNewMail: string;
    newMailLabel: string;
    sourceLabels: {
      qq: string;
      wechat: string;
      qqMail: string;
    };
    collapsedTask: (title: string) => string;
    expand: (label: string) => string;
    openPreview: (text: string, source: string) => string;
    badge: (count: number, wechat: boolean) => string;
    label: (text: string) => string;
    qqPreview: (title: string, body: string) => string;
  };
  qq: {
    desktopOnly: string;
    receive: string;
    title: string;
    pause: string;
    resume: string;
    allow: string;
    allowLabel: string;
    grant: string;
    settings: string;
    retry: string;
    retryLabel: string;
    recent: string;
    open: string;
    refresh: string;
    clear: string;
    list: string;
    status: {
      disabled: string;
      waiting: string;
      listening: string;
      permissionDenied: string;
      permissionRequired: string;
      error: string;
    };
    openNotification: (title: string) => string;
  };
  wechat: {
    desktopOnly: string;
    receive: string;
    pause: string;
    open: string;
    noReminders: string;
    status: {
      disabled: string;
      waiting: string;
      listening: string;
      error: string;
    };
  };
  mail: {
    savePreferencesFailed: string;
    desktopConnect: string;
    desktopRead: string;
    changed: string;
    openLinkFailed: string;
    openFailed: string;
    helpFailed: string;
    reader: string;
    back: string;
    webHint: string;
    openWeb: string;
    body: string;
    loading: string;
    emptyHtml: string;
    emptyText: string;
    notice: string;
    remoteImages: string;
    remoteImagesOn: string;
    remoteImagesOff: string;
    loadRemoteImages: string;
    remoteImagesBlocked: (count: number) => string;
    receive: string;
    pause: string;
    resume: string;
    help: string;
    helpLabel: string;
    open: string;
    openLabel: string;
    refresh: string;
    refreshLabel: string;
    disconnect: string;
    disconnectLabel: string;
    email: string;
    emailPlaceholder: string;
    authorizationCode: string;
    authorizationPlaceholder: string;
    connect: string;
    inbox: string;
    syncing: string;
    empty: string;
    status: {
      disconnected: string;
      connecting: string;
      connected: string;
      paused: string;
      authRequired: string;
      error: string;
    };
    lastSynced: (time: string) => string;
    readMessage: (subject: string, unread: boolean) => string;
  };
  translator: {
    label: string;
    title: string;
    subtitle: string;
    settings: string;
    closeLabel: string;
    credentialHint: string;
    provider: string;
    providers: {
      deepseek: string;
      volcengine: string;
      dashscope: string;
      moonshot: string;
      openai: string;
      custom: string;
    };
    baseUrl: string;
    baseUrlHint: string;
    model: string;
    modelDefault: (model: string) => string;
    modelRequired: string;
    secret: string;
    replaceSecret: string;
    enterSecret: string;
    saveSecret: string;
    deleteSecret: string;
    shortcut: string;
    pressShortcut: string;
    shortcutHint: string;
    direction: string;
    auto: string;
    zhEn: string;
    enZh: string;
    chinese: string;
    english: string;
    bilingual: string;
    source: string;
    limit: string;
    placeholder: string;
    paste: string;
    result: string;
    copy: string;
    copied: string;
    clearSource: string;
    loading: string;
    emptyResult: string;
    configureSecret: string;
    enterHint: string;
    translate: string;
    emptyClipboard: string;
    emptySource: string;
    tooLong: string;
    clipboard: (text: string) => string;
  };

  island: {
    appName: string;
    focusing: (taskTitle: string) => string;
    pendingTodos: (count: number) => string;
    agentSession: (provider: string, title: string) => string;
    openMusic: string;
    collapse: string;
    collapseIsland: string;
    minimizeToTray: string;
    tuckToTop: string;
    resetPosition: string;
    resetPositionLabel: string;
    editor: string;
    todoList: string;
    music: string;
    clipboardHistory: string;
    shelf: string;
    shelfCount: (count: number) => string;
    layoutEditor: string;
  };

  agent: {
    running: (provider: string) => string;
    failed: (provider: string) => string;
    stale: (provider: string) => string;
    idleOrDone: string;
    phase: {
      running: string;
      completed: string;
      failed: string;
      stale: string;
      idle: string;
    };
  };

  notebook: {
    sectionLabel: string;
    backToToday: string;
    saveToday: string;
    saveTodayMarkdown: string;
    reviewSaved: string;
    tasksTab: string;
    dailyTab: string;
    reviewTab: string;
    openDailyNote: string;
    backToTasks: string;
    notebookCards: string;
    twoColumnTimeline: string;
    openCount: (count: number) => string;
    addTaskFor: (date: string) => string;
    reviewTodos: string;
    addTaskHint: string;
    dailyPlaceholder: string;
    dailyNoteLabel: string;
    pickDate: string;
    dateToday: string;
    dateTomorrow: string;
    upcomingTab: string;
    showUpcoming: (count: number) => string;
    scheduledCount: (count: number) => string;
    noScheduled: string;
    deleteScheduled: (title: string) => string;
  };

  archive: {
    noSavedLists: string;
    eyebrow: string;
    noTasks: string;
  };

  music: {
    playerLabel: string;
    controlFailed: string;
    noMedia: string;
    unknownArtist: string;
    previous: string;
    previousTrack: string;
    play: string;
    pause: string;
    next: string;
    nextTrack: string;
    shuffle: string;
    repeatOne: string;
    repeatAll: string;
    repeatOff: string;
    seek: string;
    settingsTitle: string;
    settingsHint: string;
    openSettings: string;
    closeSettings: string;
    reorderSource: string;
    removeSource: string;
    noSources: string;
  };

  todo: {
    empty: string;
    emptyReview: string;
    complete: string;
    markIncomplete: string;
    /** Screen-reader label pairing an action with the task it targets. */
    actionOnTask: (action: string, taskTitle: string) => string;
    editTitle: string;
    start: string;
    stop: string;
    delete: string;
    deleteTask: (taskTitle: string) => string;
    reorder: string;
    reorderTask: (taskTitle: string) => string;
  };

  clipboard: {
    title: string;
    favoriteCount: (count: number) => string;
    expandShortcut: string;
    clear: string;
    confirmClear: string;
    clearHistory: string;
    segments: string;
    all: string;
    favorites: string;
    searchPlaceholder: string;
    searchLabel: string;
    clearSearch: string;
    emptyAll: string;
    emptyFavorites: string;
    emptySearch: string;
    copyBack: string;
    copy: string;
    copied: string;
    favorite: string;
    unfavorite: string;
    favoriteItem: string;
    unfavoriteItem: string;
    delete: string;
    confirmDelete: string;
    deleteItem: string;
    notePlaceholder: string;
    noteInputLabel: string;
    saveNote: string;
    cancelEdit: string;
    cancelEditNote: string;
    editNote: (note: string) => string;
    editNoteLabel: string;
    addNote: string;
    addNoteLabel: string;
    noteFallback: string;
  };

  fileShelf: {
    title: string;
    clear: string;
    confirmClear: string;
    empty: string;
    dropHint: string;
    dragHint: string;
    folder: string;
    missing: string;
    missingHint: string;
    copyItem: string;
    copied: string;
    reveal: string;
    removeItem: string;
    alreadyOnShelf: string;
    dragHintReveal: string;
    unreachable: string;
    unreachableHint: string;
    pin: string;
    unpin: string;
    searchPlaceholder: string;
    searchLabel: string;
    clearSearch: string;
    emptySearch: string;
    selectedCount: (count: number) => string;
    copySelected: string;
    removeSelected: string;
    clearSelection: string;
  };

  settings: {
    fileShelf: {
      title: string;
      expandOnDrop: string;
      expandOnDropHint: string;
      autoCleanup: string;
      cleanupNever: string;
      cleanupDays: (days: number) => string;
      removeMissing: string;
      removeAfterDragOut: string;
      maxItems: string;
      doubleClick: string;
      doubleClickOpen: string;
      doubleClickReveal: string;
      showCount: string;
      cleanupHint: string;
    };
    messageReception: string;

    modules: {
      title: string;
      hint: string;
      todo: string;
      music: string;
      agents: string;
      mail: string;
      shelf: string;
    };
    title: string;
    resetAppearance: {
      label: string;
      hint: string;
      confirm: string;
      cancel: string;
    };

    categories: {
      label: string;
      general: string;
      appearance: string;
      notifications: string;
      todos: string;
      music: string;
      clipboard: string;
      translation: string;
      shelf: string;
      agents: string;
      plugins: string;
      about: string;
    };

    behavior: {
      title: string;
    };

    translation: {
      serviceTitle: string;
      shortcutTitle: string;
      shortcutHint: string;
    };

    position: {
      title: string;
      moveHint: string;
    };

    expand: {
      title: string;
      trigger: string;
      click: string;
      hover: string;
      hoverDelay: string;
      hoverCollapseDelay: string;
      revealOnMessage: string;
    };

    project: {
      title: string;
      star: string;
      starHint: string;
      latestRelease: string;
      latestReleaseHint: string;
      openFailed: string;
      update: {
        title: string;
        hint: string;
        versionLabel: (version: string) => string;
        check: string;
        checking: string;
        upToDate: (version: string) => string;
        available: (version: string) => string;
        download: string;
        downloading: (percent: number) => string;
        downloadingUnknown: string;
        installing: string;
        done: string;
        error: string;
        errorDetail: (reason: string) => string;
        unavailable: string;
      };
    };

    language: {
      title: string;
      label: string;
    };

    appearance: {
      font: string;
      fontLabel: string;
      systemFont: string;
      pixelFont: string;
      title: string;
      classic: string;
      liquidGlass: string;
      glassStrength: string;
      styleTitle: string;
    };

    layout: {
      collapsedScale: string;
      expandedScale: string;
      showCollapsedText: string;
      showIdleTodoCount: string;
      title: string;
      opacity: string;
      marginY: string;
      topFilletRadius: string;
      islandCornerRadius: string;
      maxPanelHeight: string;
      launchAtStartup: string;
      showTitle: string;
      displayTitle: string;
      minimizeAction: string;
      minimizeToTray: string;
      minimizeToTop: string;
      autoTuck: string;
      autoTuckSeconds: string;
    };

    todo: {
      title: string;
      carryOverIncomplete: string;
      enableReorder: string;
      rotateTodos: string;
      rotationSeconds: string;
    };

    agent: {
      title: string;
      install: string;
      installing: string;
      installed: string;
      currentStatus: string;
      clearStatusFor: (provider: string) => string;
      clearing: string;
      clearStatus: string;
      scriptsDir: string;
      legendTitle: string;
      legend: {
        idle: string;
        running: string;
        attention: string;
      };
      sessionTitleSection: string;
      sessionTitle: string;
      sessionTitleHint: string;
      hooksOutdated: string;
      hooksMissing: string;
    };

    clipboard: {
      title: string;
      enabled: string;
      captureImages: string;
      maxItems: string;
      panelTitle: string;
      visibleRows: string;
      shortcut: string;
      shortcutEnabled: string;
      pressKeys: string;
    };

    colors: {
      title: string;
      taskText: string;
      pulse: string;
      islandBackground: string;
      todoPaper: string;
      pulseBrightness: string;
    };

    presets: {
      title: string;
      saveCurrent: string;
      empty: string;
      nameLabel: string;
      defaultName: (index: number) => string;
      rename: string;
      defaultPreset: string;
      apply: string;
      delete: string;
      deleteNamed: (name: string) => string;
    };

    save: {
      title: string;
      folder: string;
      folderLabel: string;
      folderPlaceholder: string;
      saved: string;
      save: string;
    };
    localApi: {
      title: string;
      hint: string;
      enable: string;
      allowWrite: string;
      allowWriteHint: string;
      address: string;
      token: string;
      copy: string;
      copied: string;
      resetToken: string;
      configFile: string;
      running: string;
      stopped: string;
    };
    plugins: {
      title: string;
      allowThirdParty: string;
      warning: string;
      folder: string;
      openFolder: string;
      reload: string;
      empty: string;
      enable: string;
      by: (author: string) => string;
      homepage: string;
      permissions: string;
      noPermissions: string;
      permission: Record<"todos:read" | "todos:write" | "notes:read" | "notes:write" | "agent-status:write", string>;
      needsApproval: string;
      notAllowed: string;
      describedOnly: string;
      invalid: string;
      log: string;
      noLog: string;
      status: Record<"stopped" | "starting" | "running" | "restarting" | "crashed", string>;
      uninstall: string;
      confirmUninstall: string;
      market: {
        title: string;
        hint: string;
        refresh: string;
        loading: string;
        empty: string;
        install: string;
        installing: string;
        update: (version: string) => string;
        installed: string;
        incompatible: string;
      };
    };
  };
};
