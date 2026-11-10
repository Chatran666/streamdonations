; Pasos extra del instalador de StreamDonations 2 (Tauri)
; Si estaba la versión que abría Google Chrome, se quitan sus accesos directos y su entrada en
; "Agregar o quitar programas". Sus datos (carpeta "perfil") NO se tocan: la app nueva los trae
; sola la primera vez que se abre.
!macro NSIS_HOOK_POSTINSTALL
  ${If} ${FileExists} "$LOCALAPPDATA\StreamDonations\Desinstalar.exe"
    DetailPrint "Quitando los accesos de la versión anterior (tus datos se conservan)..."
    Delete "$SMPROGRAMS\StreamDonations\StreamDonations.lnk"
    Delete "$SMPROGRAMS\StreamDonations\Desinstalar StreamDonations.lnk"
    RMDir "$SMPROGRAMS\StreamDonations"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\StreamDonationsChrome"
    ; El acceso del escritorio viejo abría Chrome: lo reemplaza el de la página final del instalador
    ${If} $PassiveMode != 1
    ${AndIfNot} ${Silent}
      Delete "$DESKTOP\StreamDonations.lnk"
    ${EndIf}
    ; El desinstalador viejo borraría también la app nueva
    Delete "$LOCALAPPDATA\StreamDonations\Desinstalar.exe"
  ${EndIf}
!macroend
