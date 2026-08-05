# Custom NSIS additions for the RAChecker installer.
#
# electron-builder's assisted installer always creates a desktop and a start-menu
# shortcut. This adds the page every other Windows installer has: two checkboxes
# that decide whether they are created at all.
#
# electron-builder's own shortcut code is switched off in electron-builder.yml
# (createDesktopShortcut / createStartMenuShortcut = false, which define
# DO_NOT_CREATE_*_SHORTCUT). That also stops its *uninstaller* from removing
# them, so removal is handled here too.
#
# This file is prepended to electron-builder's own script, so anything MUI or
# electron-builder defines is not available yet at this point — the page
# functions therefore live inside the customPageAfterChangeDir macro, which is
# expanded further down, after those definitions exist.

!include "LogicLib.nsh"
!include "FileFunc.nsh"

# The installer and the uninstaller are compiled from the same script. These
# variables and macros belong to the installer only — declaring them in the
# uninstaller pass would leave them unused, and NSIS treats that warning as an
# error here.
!ifndef BUILD_UNINSTALLER

Var ShortcutDialog
Var ChkDesktop
Var ChkStartMenu
Var MakeDesktop
Var MakeStartMenu

# Defaults, and the values a silent install uses: /S installs — including the
# ones electron-updater runs for an update — show no pages, and an update must
# not silently drop the shortcuts the user already has.
!macro customInit
  StrCpy $MakeDesktop 1
  StrCpy $MakeStartMenu 1
!macroend

!macro customPageAfterChangeDir
  Page custom shortcutPageCreate shortcutPageLeave

  Function shortcutPageCreate
    !insertmacro MUI_HEADER_TEXT "Shortcuts" "Choose where RAChecker should appear."
    nsDialogs::Create 1018
    Pop $ShortcutDialog
    ${If} $ShortcutDialog == error
      Abort
    ${EndIf}

    ${NSD_CreateCheckbox} 0 6u 100% 12u "Create a desktop shortcut"
    Pop $ChkDesktop
    ${If} $MakeDesktop == 1
      ${NSD_Check} $ChkDesktop
    ${EndIf}

    ${NSD_CreateCheckbox} 0 24u 100% 12u "Create a Start menu entry"
    Pop $ChkStartMenu
    ${If} $MakeStartMenu == 1
      ${NSD_Check} $ChkStartMenu
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function shortcutPageLeave
    ${NSD_GetState} $ChkDesktop $MakeDesktop
    ${NSD_GetState} $ChkStartMenu $MakeStartMenu
  FunctionEnd
!macroend

# Runs inside the install section after setLinkVars, so $appExe,
# $newDesktopLink and $newStartMenuLink are set. An unticked box also removes an
# existing shortcut, so the choice means the same on a re-install as on a first
# install.
!macro customInstall
  ${If} $MakeDesktop == 1
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${Else}
    WinShell::UninstShortcut "$newDesktopLink"
    Delete "$newDesktopLink"
  ${EndIf}

  ${If} $MakeStartMenu == 1
    !insertmacro createMenuDirectory
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${Else}
    WinShell::UninstShortcut "$newStartMenuLink"
    Delete "$newStartMenuLink"
  ${EndIf}

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!endif # BUILD_UNINSTALLER

# Remove whatever was created. Skipped while updating — the uninstaller is run
# with --keep-shortcuts then, and the shortcuts would otherwise vanish with
# every update.
!macro customUnInstall
  ClearErrors
  ${GetParameters} $R9
  ${GetOptions} $R9 "--keep-shortcuts" $R8
  ${if} ${Errors}
    WinShell::UninstAppUserModelId "${APP_ID}"

    WinShell::UninstShortcut "$oldDesktopLink"
    Delete "$oldDesktopLink"
    WinShell::UninstShortcut "$newDesktopLink"
    Delete "$newDesktopLink"

    WinShell::UninstShortcut "$oldStartMenuLink"
    Delete "$oldStartMenuLink"
    WinShell::UninstShortcut "$newStartMenuLink"
    Delete "$newStartMenuLink"

    ReadRegStr $R8 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" MenuDirectory
    ${ifNot} $R8 == ""
      RMDir "$SMPROGRAMS\$R8"
    ${endIf}
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${endif}
!macroend
