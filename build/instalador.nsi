; StreamDonations - instalador (usa Google Chrome en modo aplicación, con un perfil propio)
; Se arma con:  makensis /DVERSION=1.6.0 /DORIGEN=..\app /DSALIDA=..\dist\StreamDonations-Setup-1.6.0.exe build\instalador.nsi
Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WordFunc.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef ORIGEN
  !define ORIGEN "..\app"
!endif
!ifndef SALIDA
  !define SALIDA "..\dist\StreamDonations-Setup-${VERSION}.exe"
!endif

!define APPNAME "StreamDonations"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\StreamDonationsChrome"

Name "${APPNAME}"
OutFile "${SALIDA}"
InstallDir "$LOCALAPPDATA\StreamDonations"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "StreamDonations ${VERSION} - Mariano"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileDescription" "Instalador de StreamDonations"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Mariano - mrlasheras@gmail.com"

!define MUI_ICON "icono.ico"
!define MUI_UNICON "icono.ico"
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Abrir StreamDonations"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Spanish"

Var Chrome
Var AppUrl
Var AppArgs

; Busca Google Chrome en los lugares habituales
Function FindChrome
  StrCpy $Chrome ""
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" ""
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0"
    StrCpy $Chrome $0
    Return
  ${EndIf}
  SetRegView 64
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" ""
  SetRegView 32
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0"
    StrCpy $Chrome $0
    Return
  ${EndIf}
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" ""
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0"
    StrCpy $Chrome $0
    Return
  ${EndIf}
  ReadEnvStr $1 "ProgramW6432"
  ${If} ${FileExists} "$1\Google\Chrome\Application\chrome.exe"
    StrCpy $Chrome "$1\Google\Chrome\Application\chrome.exe"
    Return
  ${EndIf}
  ${If} ${FileExists} "$PROGRAMFILES\Google\Chrome\Application\chrome.exe"
    StrCpy $Chrome "$PROGRAMFILES\Google\Chrome\Application\chrome.exe"
    Return
  ${EndIf}
  ${If} ${FileExists} "$LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    StrCpy $Chrome "$LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    Return
  ${EndIf}
FunctionEnd

Function LaunchApp
  Exec '"$Chrome" $AppArgs'
FunctionEnd

Section "Instalar"
  Call FindChrome
  ${If} $Chrome == ""
    MessageBox MB_ICONSTOP "No encontré Google Chrome en esta PC.$\r$\nInstalá Chrome (google.com/chrome) y volvé a ejecutar este instalador."
    Abort
  ${EndIf}

  ; Si estaba la versión vieja con la voz incluida (Electron), se desinstala primero
  StrCpy $0 "$LOCALAPPDATA\Programs\StreamDonations"
  ${If} ${FileExists} "$0\Uninstall StreamDonations.exe"
    DetailPrint "Quitando la versión anterior..."
    ExecWait '"$0\Uninstall StreamDonations.exe" /S _?=$0'
    Delete "$0\Uninstall StreamDonations.exe"
    RMDir /r "$0"
  ${EndIf}

  ; Archivos de la app (se reemplazan; el perfil con los datos del usuario no se toca)
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\lib"
  File /r /x "*.md" "${ORIGEN}\*.*"

  ${WordReplace} "$INSTDIR" "\" "/" "+" $1
  StrCpy $AppUrl "file:///$1/index.html"

  ; Perfil de Chrome propio: sin la foto de perfil en la barra de tareas y con sonido desde que abre
  CreateDirectory "$INSTDIR\perfil"
  StrCpy $AppArgs '--user-data-dir="$INSTDIR\perfil" --app="$AppUrl" --autoplay-policy=no-user-gesture-required --no-first-run --no-default-browser-check'

  CreateShortcut "$DESKTOP\StreamDonations.lnk" "$Chrome" '$AppArgs' "$INSTDIR\icon.ico" 0 SW_SHOWMAXIMIZED "" "StreamDonations - donaciones en vivo"
  CreateDirectory "$SMPROGRAMS\StreamDonations"
  CreateShortcut "$SMPROGRAMS\StreamDonations\StreamDonations.lnk" "$Chrome" '$AppArgs' "$INSTDIR\icon.ico" 0 SW_SHOWMAXIMIZED "" "StreamDonations - donaciones en vivo"
  CreateShortcut "$SMPROGRAMS\StreamDonations\Desinstalar StreamDonations.lnk" "$INSTDIR\Desinstalar.exe"
  ; Acceso viejo que ya no se usa
  Delete "$SMPROGRAMS\StreamDonations\StreamDonations - pasar mis datos.lnk"

  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "StreamDonations"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "Mariano"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\StreamDonations.lnk"
  RMDir /r "$SMPROGRAMS\StreamDonations"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
SectionEnd
