; Bizora NSIS installer customizations
; Follows Microsoft Windows desktop installer expectations:
; - Clear product identity in Add/Remove Programs
; - Optional desktop shortcut
; - Preserve user business data on uninstall by default
; - No silent deletion of AppData without consent

!macro customHeader
  !system "echo Building Bizora Windows installer..."
!macroend

!macro customInstall
  ; Ensure Start Menu folder exists with expected branding
  CreateDirectory "$SMPROGRAMS\Bizora"
!macroend

!macro customUnInstall
  ; Intentionally do NOT delete $APPDATA\bizora here.
  ; Business data must remain unless the user opts in elsewhere.
  ; This aligns with Microsoft guidance to protect user content on uninstall.
!macroend

!macro customRemoveFiles
  ; Default electron-builder file removal for Program Files contents only
!macroend
