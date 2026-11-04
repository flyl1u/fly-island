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
break > "%STATUS_DIR%\%MARKER%"
del "%STATUS_DIR%\%HOLD%" >nul 2>nul

rem "capture" (prompt submit only) saves the hook's stdin JSON so the island can show the
rem session title. findstr copies bytes unchanged but cuts lines past ~64 KB; the app
rem tolerates that. Write a temp file and move it so the app never reads half a file.
if /I "%~2"=="capture" (
  findstr "^" > "%STATUS_DIR%\agent-%PROVIDER%-hook-input.tmp" 2>nul
  move /y "%STATUS_DIR%\agent-%PROVIDER%-hook-input.tmp" "%STATUS_DIR%\agent-%PROVIDER%-hook-input.json" >nul 2>nul
)

exit /b 0
