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

rem "notification" (Claude Code's Notification hook) only saves the hook's stdin JSON, which
rem names the session and the kind of notification, so the island can show a session waiting
rem for permission. It leaves the running marker alone: an idle-prompt notification comes after
rem the turn ended. Written to a temp file and moved so the app never reads half a file.
rem Any other second argument, such as the "capture" older installs pass, is ignored.
if /I "%~2"=="notification" (
  findstr "^" > "%STATUS_DIR%\agent-%PROVIDER%-notification.tmp" 2>nul
  move /y "%STATUS_DIR%\agent-%PROVIDER%-notification.tmp" "%STATUS_DIR%\agent-%PROVIDER%-notification.json" >nul 2>nul
  exit /b 0
)

break > "%STATUS_DIR%\%MARKER%"
del "%STATUS_DIR%\%HOLD%" >nul 2>nul

exit /b 0
