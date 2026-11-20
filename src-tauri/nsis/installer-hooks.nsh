; NSIS installer hooks for Fly Island's identifier migration.
; The former manufacturer key is read only here so an automatic update keeps the
; existing install directory and one uninstall entry. The old key is removed after
; the new template has written its own registration.
!define LEGACY_MANUFACTURER "focusd"
!define CURRENT_MANUFACTURER "flyisland"
!define LEGACY_STARTUP_VALUE "FocuSD Island"

!macro NSIS_HOOK_PREINSTALL
  ; Tauri's template derives Software\\<manufacturer>\\<product> from the
  ; identifier. Reuse the former location when it is still registered.
  ReadRegStr $0 SHCTX "Software\${LEGACY_MANUFACTURER}\fly-island" ""
  ${If} $0 != ""
    StrCpy $INSTDIR $0
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Show the requested publisher in Windows' installed-apps list.
  WriteRegStr SHCTX "${UNINSTKEY}" "Publisher" "flyl1u"
  ; The new registration is authoritative; remove the stale manufacturer branch.
  DeleteRegKey HKCU "Software\${LEGACY_MANUFACTURER}"
!macroend

; "Delete the application data" also takes the island's AI hooks out of the Codex and
; Claude Code configs, which would otherwise call scripts that no longer exist (#80).
; Before the template deletes the executable, and never for an update's uninstall.
; The executable removes only entries it wrote itself (agent_status/uninstall.rs).
!macro NSIS_HOOK_PREUNINSTALL
  ; The generated template removes the product-name value (fly-island); the
  ; migration contract uses the title shown to users, so clean both spellings.
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Fly Island"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${LEGACY_STARTUP_VALUE}"
  ${EndIf}
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
  ${AndIf} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
    ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --remove-agent-hooks'
  ${EndIf}
!macroend
