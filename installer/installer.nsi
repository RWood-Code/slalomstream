; SlalomStream Windows Installer
; Built with NSIS 3.x — compile with: makensis installer.nsi
; Run build-installer.sh first to stage all required files.

!define APP_NAME    "SlalomStream"
!define APP_VERSION "1.6.0"
!define PUBLISHER   "NZTWSA"
!define REG_KEY     "Software\Microsoft\Windows\CurrentVersion\Uninstall\SlalomStream"

Name "${APP_NAME} ${APP_VERSION}"
OutFile "../SlalomStream-Setup.exe"
Unicode True
InstallDir "$PROGRAMFILES64\SlalomStream"
InstallDirRegKey HKLM "Software\SlalomStream" "InstallDir"
RequestExecutionLevel admin
SetCompressor lzma

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; ── MUI Settings ──────────────────────────────────────────────────────────────
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN          "$INSTDIR\SlalomStream-Launch.bat"
!define MUI_FINISHPAGE_RUN_TEXT     "Launch SlalomStream now"
!define MUI_FINISHPAGE_SHOWREADME   ""
!define MUI_WELCOMEPAGE_TEXT        "This wizard will install SlalomStream on this computer.$\r$\n$\r$\nSlalomStream runs as a local server. Once installed, judges and scoreboard screens on any device connected to the same WiFi can access it via a web browser.$\r$\n$\r$\nClick Next to continue."

; ── Pages ─────────────────────────────────────────────────────────────────────
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
Page custom ConfigPage ConfigPageLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ── Config page variables ─────────────────────────────────────────────────────
Var ConfigDialog
Var hDbUrl
Var hPort
Var DatabaseUrl
Var PortNum

Function ConfigPage
  !insertmacro MUI_HEADER_TEXT "Database Configuration" \
    "Enter your PostgreSQL connection string and the port SlalomStream will listen on."

  nsDialogs::Create 1018
  Pop $ConfigDialog
  ${If} $ConfigDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 20u \
    "PostgreSQL connection string (DATABASE_URL):"
  Pop $0
  ${NSD_CreateText} 0 22u 100% 14u \
    "postgresql://username:password@localhost:5432/slalomstream"
  Pop $hDbUrl
  ${If} $DatabaseUrl != ""
    ${NSD_SetText} $hDbUrl $DatabaseUrl
  ${EndIf}

  ${NSD_CreateLabel} 0 52u 100% 12u \
    "Server port (judges connect to this computer's IP on this port):"
  Pop $0
  ${NSD_CreateNumber} 0 66u 60u 14u "3000"
  Pop $hPort
  ${If} $PortNum != ""
    ${NSD_SetText} $hPort $PortNum
  ${EndIf}

  ${NSD_CreateLabel} 0 92u 100% 32u \
    "Tip: After installation, any device on the same WiFi can reach SlalomStream$\r$\nat  http://<this-computer-IP>:3000  — no internet required."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function ConfigPageLeave
  ${NSD_GetText} $hDbUrl $DatabaseUrl
  ${NSD_GetText} $hPort  $PortNum

  ${If} $DatabaseUrl == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION \
      "Please enter a PostgreSQL connection string before continuing."
    Abort
  ${EndIf}

  ${If} $PortNum == ""
    StrCpy $PortNum "3000"
  ${EndIf}
FunctionEnd

; ── Main install section ───────────────────────────────────────────────────────
Section "SlalomStream" SecMain
  SectionIn RO

  ; ── Node.js runtime + scripts ──
  SetOutPath "$INSTDIR"
  File "stage/node.exe"
  File "stage/version.json"
  File "stage/SlalomStream.bat"
  File "stage/SlalomStream-Launch.bat"

  ; ── API server bundle ──
  SetOutPath "$INSTDIR\artifacts\api-server\dist"
  File "stage/api-server/index.cjs"

  ; ── Frontend static files ──
  ; stage/slalom-stream-dist mirrors artifacts/slalom-stream/dist
  ; (Vite outputs to dist/public, so the tree is slalom-stream-dist/public/…)
  SetOutPath "$INSTDIR\artifacts\slalom-stream\dist"
  File /r "stage/slalom-stream-dist/"

  ; ── Write slalomstream.conf ──
  SetOutPath "$INSTDIR"
  FileOpen  $0 "$INSTDIR\slalomstream.conf" w
  FileWrite $0 "DATABASE_URL=$DatabaseUrl$\r$\n"
  FileWrite $0 "PORT=$PortNum$\r$\n"
  FileClose $0

  ; ── Shortcuts — use SetShellVarContext all so shortcuts appear for every user
  ;    (without this, admin-elevation installs put shortcuts on the admin desktop)
  SetShellVarContext all

  ; Desktop shortcut → launcher (opens server + browser automatically)
  CreateShortcut "$DESKTOP\SlalomStream.lnk" \
    "$INSTDIR\SlalomStream-Launch.bat" "" "" 0 SW_SHOWNORMAL \
    "" "Start SlalomStream and open in browser"

  ; Start Menu
  CreateDirectory "$SMPROGRAMS\SlalomStream"
  CreateShortcut "$SMPROGRAMS\SlalomStream\SlalomStream.lnk" \
    "$INSTDIR\SlalomStream-Launch.bat" "" "" 0 SW_SHOWNORMAL \
    "" "Start SlalomStream and open in browser"
  CreateShortcut "$SMPROGRAMS\SlalomStream\SlalomStream Server (console).lnk" \
    "$INSTDIR\SlalomStream.bat" "" "" 0 SW_SHOWNORMAL \
    "" "Start SlalomStream server (shows console window)"
  CreateShortcut "$SMPROGRAMS\SlalomStream\Uninstall SlalomStream.lnk" \
    "$INSTDIR\Uninstall.exe"

  ; ── Uninstaller ──
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr  HKLM "Software\SlalomStream" "InstallDir" "$INSTDIR"
  WriteRegStr  HKLM "${REG_KEY}" "DisplayName"    "${APP_NAME} ${APP_VERSION}"
  WriteRegStr  HKLM "${REG_KEY}" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegStr  HKLM "${REG_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr  HKLM "${REG_KEY}" "Publisher"       "${PUBLISHER}"
  WriteRegStr  HKLM "${REG_KEY}" "DisplayVersion"  "${APP_VERSION}"
  WriteRegDWORD HKLM "${REG_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${REG_KEY}" "NoRepair"  1
SectionEnd

; ── Uninstall section ─────────────────────────────────────────────────────────
Section "Uninstall"
  SetShellVarContext all
  RMDir /r "$INSTDIR"
  Delete   "$DESKTOP\SlalomStream.lnk"
  RMDir /r "$SMPROGRAMS\SlalomStream"
  DeleteRegKey HKLM "Software\SlalomStream"
  DeleteRegKey HKLM "${REG_KEY}"
SectionEnd
