@echo off
setlocal

set "PROVIDER=%~1"
if /I "%PROVIDER%"=="codex" (
  set "MARKER=agent-codex-running.flag"
  set "HOLD=agent-codex-running-hold.flag"
) else if /I "%PROVIDER%"=="claudeCode" (
  set "MARKER=agent-claudeCode-running.flag"
  set "HOLD=agent-claudeCode-running-hold.flag"
) else (
  exit /b 2
)

if defined FOCUSD_AGENT_STATUS_DIR (
  set "STATUS_DIR=%FOCUSD_AGENT_STATUS_DIR%"
) else (
  if defined APPDATA (
    set "STATUS_DIR=%APPDATA%\com.focusd.island"
  ) else (
    set "STATUS_DIR=%LOCALAPPDATA%\com.focusd.island"
  )
)

if not exist "%STATUS_DIR%" mkdir "%STATUS_DIR%" >nul 2>nul

rem "notification" (the Notification and PermissionRequest hooks of Claude Code, PermissionRequest
rem of Codex) only saves the hook's stdin JSON, which names the session and why it waits, so the
rem island can show a session waiting for permission. It prints nothing, so it makes no decision. It leaves the running marker alone: an idle-prompt notification comes after
rem the turn ended. Written to a temp file and moved so the app never reads half a file.
rem Any other second argument, such as the "capture" older installs pass, is ignored.
if /I "%~2"=="notification" (
  findstr "^" > "%STATUS_DIR%\agent-%PROVIDER%-notification.tmp" 2>nul
  move /y "%STATUS_DIR%\agent-%PROVIDER%-notification.tmp" "%STATUS_DIR%\agent-%PROVIDER%-notification.json" >nul 2>nul
  exit /b 0
)
if /I "%~2"=="session" goto session

break > "%STATUS_DIR%\%MARKER%"
del "%STATUS_DIR%\%HOLD%" >nul 2>nul

exit /b 0

rem "session" (Claude Code's SessionStart hook) records which Orca terminal holds the session,
rem so the island can switch to that tab: the hook's stdin JSON names the session, and is saved
rem as agent-terminals\<ORCA_TERMINAL_HANDLE>.json. Outside Orca it does nothing. It prints
rem nothing, because SessionStart output would be added to the conversation.
:session
if not defined ORCA_TERMINAL_HANDLE exit /b 0
set "TERMINALS_DIR=%STATUS_DIR%\agent-terminals"
if not exist "%TERMINALS_DIR%" mkdir "%TERMINALS_DIR%" >nul 2>nul
findstr "^" > "%TERMINALS_DIR%\%ORCA_TERMINAL_HANDLE%.tmp" 2>nul
move /y "%TERMINALS_DIR%\%ORCA_TERMINAL_HANDLE%.tmp" "%TERMINALS_DIR%\%ORCA_TERMINAL_HANDLE%.json" >nul 2>nul
exit /b 0
