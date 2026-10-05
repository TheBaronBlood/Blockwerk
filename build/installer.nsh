; ---------------------------------------------------------------
; Eigene Seite »Zielordner« für den Windows-Installer.
;
; electron-builder bindet diese Datei von selbst ein (build/installer.nsh). Die eingebaute
; Seite ist abgeschaltet (nsis.allowToChangeInstallationDirectory: false), weil sie
;   - den Unterordner des Programms erst nach dem Klick auf »Installieren« anhängt, ohne
;     ihn anzuzeigen, und
;   - die alte Ordnerauswahl von Windows mit der Baumansicht benutzt.
; Diese Seite hängt den Unterordner sichtbar an und öffnet die heutige Ordnerauswahl
; (dieselbe wie im Explorer). Scheitert das auf einem alten System, kommt die alte Auswahl.
;
; Alles steht im Makro: Es wird erst an der Stelle eingesetzt, an der die Oberfläche (MUI)
; schon geladen ist – und gar nicht, wenn der Deinstallierer gebaut wird.
; ---------------------------------------------------------------
!include LogicLib.nsh
!include nsDialogs.nsh

!macro customPageAfterChangeDir
  Var bwDirText

  Page custom bwDirShow bwDirLeave

  ; Hängt an $2 den Ordner des Programms an, wenn der Pfad nicht schon darauf endet
  Function bwAppendAppFolder
    StrCpy $3 $2 1 -1
    ${If} $3 == "\"
      StrCpy $2 $2 -1
    ${EndIf}
    ; letzter Teil des Pfads: von hinten bis zum Trennstrich zählen ($4 Zeichen)
    StrLen $6 $2
    StrCpy $4 0
    ${Do}
      IntOp $4 $4 + 1
      ${If} $4 > $6
        ${ExitDo}
      ${EndIf}
      IntOp $7 0 - $4
      StrCpy $3 $2 1 $7
      ${If} $3 == "\"
        ${ExitDo}
      ${EndIf}
    ${Loop}
    IntOp $4 $4 - 1
    StrCpy $3 ""
    ${If} $4 > 0
      IntOp $7 0 - $4
      StrCpy $3 $2 "" $7
    ${EndIf}
    ${If} $3 != "${APP_FILENAME}"
      StrCpy $2 "$2\${APP_FILENAME}"
    ${EndIf}
  FunctionEnd

  ; Ordnerauswahl; das Ergebnis steht in $2 (leer = abgebrochen)
  Function bwPickFolder
    StrCpy $2 ""
    ; FileOpenDialog mit der Schnittstelle IFileDialog
    System::Call 'ole32::CoCreateInstance(g "{DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7}", p 0, i 1, g "{42F85136-DB7E-439C-85F1-E4075D135FC8}", *p .r5) i .r6'
    ${If} $6 != 0
    ${OrIf} $5 == 0
      nsDialogs::SelectFolderDialog "Ordner für ${PRODUCT_NAME} wählen" "$1"
      Pop $2
      ${If} $2 == error
        StrCpy $2 ""
      ${EndIf}
      Return
    ${EndIf}
    System::Call '$5->10(*i .r7)'                   ; GetOptions
    IntOp $7 $7 | 0x60                              ; nur Ordner (0x20), nur echte Verzeichnisse (0x40)
    System::Call '$5->9(i r7)'                      ; SetOptions
    System::Call '$5->17(w "Ordner für ${PRODUCT_NAME} wählen")'   ; SetTitle
    System::Call '$5->18(w "Ordner auswählen")'     ; SetOkButtonLabel
    System::Call '$5->3(p $HWNDPARENT) i .r6'       ; Show
    ${If} $6 == 0
      System::Call '$5->20(*p .r8) i .r6'           ; GetResult
      ${If} $6 == 0
      ${AndIf} $8 != 0
        System::Call '$8->5(i 0x80058000, *p .r9) i .r6'   ; GetDisplayName als Dateipfad
        ${If} $6 == 0
        ${AndIf} $9 != 0
          System::Call '*$9(&w1024 .r2)'
          System::Call 'ole32::CoTaskMemFree(p r9)'
        ${EndIf}
        System::Call '$8->2()'                      ; Release
      ${EndIf}
    ${EndIf}
    System::Call '$5->2()'                          ; Release
  FunctionEnd

  Function bwDirBrowse
    Pop $0
    ${NSD_GetText} $bwDirText $1
    Call bwPickFolder
    ${If} $2 != ""
      Call bwAppendAppFolder
      ${NSD_SetText} $bwDirText $2
    ${EndIf}
  FunctionEnd

  Function bwDirShow
    ${If} ${isUpdated}
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "Zielordner" "Wohin soll ${PRODUCT_NAME} installiert werden?"
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 28u "${PRODUCT_NAME} wird in den folgenden Ordner installiert. Mit »Durchsuchen …« wählst du einen anderen Ort – der Unterordner »${APP_FILENAME}« wird dabei automatisch angehängt."
    Pop $0
    ${NSD_CreateGroupBox} 0 38u 100% 36u "Zielordner"
    Pop $0
    ${NSD_CreateText} 8u 53u 216u 13u "$INSTDIR"
    Pop $bwDirText
    ${NSD_CreateButton} 230u 52u 62u 15u "Durchsuchen …"
    Pop $0
    ${NSD_OnClick} $0 bwDirBrowse
    ${NSD_CreateLabel} 0 84u 100% 20u "Der Ordner wird angelegt, falls es ihn noch nicht gibt. Bei der Deinstallation wird er wieder entfernt."
    Pop $0
    nsDialogs::Show
  FunctionEnd

  Function bwDirLeave
    ${NSD_GetText} $bwDirText $0
    ${If} $0 == ""
      MessageBox MB_OK|MB_ICONEXCLAMATION "Bitte einen Ordner angeben."
      Abort
    ${EndIf}
    StrCpy $INSTDIR $0
  FunctionEnd
!macroend
