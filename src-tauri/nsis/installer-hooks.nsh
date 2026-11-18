; NSIS installer hooks, wired in through bundle.windows.nsis.installerHooks.

; Show "flyl1u" as the publisher in Windows' installed-apps list.
;
; bundle.publisher stays unset on purpose: the installer finds the previous
; install folder under Software\<publisher>\fly-island (the publisher defaults
; to "focusd", taken from the identifier com.focusd.island). Changing it would
; make updates lose a custom install folder, and a manual reinstall would call
; the old uninstaller without a folder. Rewriting only the displayed value
; after the template has written its own keeps that lookup intact.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "${UNINSTKEY}" "Publisher" "flyl1u"
!macroend

; "Delete the application data" also takes the island's AI hooks out of the Codex and
; Claude Code configs, which would otherwise call scripts that no longer exist (#80).
; Before the template deletes the executable, and never for an update's uninstall.
; The executable removes only entries it wrote itself (agent_status/uninstall.rs).
!macro NSIS_HOOK_PREUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
  ${AndIf} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
    ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --remove-agent-hooks'
  ${EndIf}
!macroend
