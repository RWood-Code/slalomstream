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

; ── Custom Icons ────────────────────────────────────────────────────────────────
!define MUI_ICON    "slalomstream.ico"
!define MUI_UNICON  "slalomstream.ico"

; ── MUI Settings ──────────────────────────────────────────────────────────────
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN          "$INSTDIR\SlalomStream-Launch.bat"
!define MUI_FINISHPAGE_RUN_TEXT     "Launch SlalomStream now"
!define MUI_FINISHPAGE_SHOWREADME   ""
!define MUI_WELCOMEPAGE_TEXT        "This wizard will install SlalomStream on this computer.$\r$\n$\r$\nSlalomStream runs as a local server — no internet connection is required during tournaments. Judges and scoreboard screens on any device connected to the same WiFi can access it via a web browser.$\r$\n$\r$\nClick Next to continue."

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
Var hPort
Var PortNum

Function ConfigPage
  !insertmacro MUI_HEADER_TEXT "Network Port" \
    "Choose the port judges and scoreboard screens will connect on."

  nsDialogs::Create 1018
  Pop $ConfigDialog
  ${If} $ConfigDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 30u \
    "SlalomStream works completely offline — the database is stored on this computer.$\r$\nNo internet connection is required during tournaments."
  Pop $0

  ${NSD_CreateLabel} 0 38u 100% 12u \
    "Server port (judges and scoreboards connect on this port):"
  Pop $0
  ${NSD_CreateNumber} 0 52u 60u 14u "3000"
  Pop $hPort
  ${If} $PortNum != ""
    ${NSD_SetText} $hPort $PortNum
  ${EndIf}

  ${NSD_CreateLabel} 0 76u 100% 50u \
    "Once installed, any device on the same WiFi network can open SlalomStream$\r$\nin their browser at:$\r$\n  http://<this-computer-IP>:3000$\r$\n$\r$\nYour tournament data is saved locally and survives restarts."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function ConfigPageLeave
  ${NSD_GetText} $hPort  $PortNum
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
  File "slalomstream.ico"

  ; ── API server bundle ──
  SetOutPath "$INSTDIR\artifacts\api-server\dist"
  File "stage/api-server/index.cjs"

  ; ── PGlite (offline PostgreSQL — runs inside Node.js with no external server) ──
  SetOutPath "$INSTDIR\node_modules\@electric-sql\pglite"
  File /r "stage/pglite/"

  ; ── Frontend static files ──
  SetOutPath "$INSTDIR\artifacts\slalom-stream\dist"
  File /r "stage/slalom-stream-dist/"

  ; ── Write slalomstream.conf ──
  SetOutPath "$INSTDIR"
  FileOpen  $0 "$INSTDIR\slalomstream.conf" w
  FileWrite $0 "PORT=$PortNum$\r$\n"
  FileClose $0

  ; ── Shortcuts — use SetShellVarContext all so shortcuts appear for every user ──
  SetShellVarContext all

  CreateShortcut "$DESKTOP\SlalomStream.lnk" \
    "$INSTDIR\SlalomStream-Launch.bat" "" \
    "$INSTDIR\slalomstream.ico" 0 SW_SHOWNORMAL \
    "" "Start SlalomStream and open in browser"

  CreateDirectory "$SMPROGRAMS\SlalomStream"
  CreateShortcut "$SMPROGRAMS\SlalomStream\SlalomStream.lnk" \
    "$INSTDIR\SlalomStream-Launch.bat" "" \
    "$INSTDIR\slalomstream.ico" 0 SW_SHOWNORMAL \
    "" "Start SlalomStream and open in browser"
  CreateShortcut "$SMPROGRAMS\SlalomStream\SlalomStream Server (console).lnk" \
    "$INSTDIR\SlalomStream.bat" "" \
    "$INSTDIR\slalomstream.ico" 0 SW_SHOWNORMAL \
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
