; Instalador para Windows de La Casa del Inyector San Juan, C.A.
; Se compila con Inno Setup 6 (ver preparar.ps1 y .github/workflows/instalador-windows.yml):
;   ISCC.exe /DVersionApp=0.1.0 instalador.iss
; Espera los archivos de la aplicación en dist\app (los arma preparar.ps1).

#ifndef VersionApp
  #define VersionApp "0.0.0"
#endif

[Setup]
AppId={{6F1C3A52-8E4B-4C1E-9B7A-2D4C5E6F7A81}
AppName=La Casa del Inyector - Sistema de gestión
AppVersion={#VersionApp}
AppVerName=La Casa del Inyector {#VersionApp}
AppPublisher=La Casa del Inyector San Juan, C.A.
DefaultDirName={autopf}\LaCasaDelInyector
DisableDirPage=yes
DefaultGroupName=La Casa del Inyector
DisableProgramGroupPage=yes
OutputDir=salida
OutputBaseFilename=Instalador-LaCasaDelInyector-{#VersionApp}
SetupIconFile=recursos\logo.ico
UninstallDisplayIcon={app}\logo.ico
UninstallDisplayName=La Casa del Inyector - Sistema de gestión
WizardStyle=modern
WizardImageFile=recursos\asistente.bmp,recursos\asistente-200.bmp
WizardSmallImageFile=recursos\asistente-pequeno.bmp,recursos\asistente-pequeno-200.bmp
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
MinVersion=10.0
CloseApplications=no
RestartApplications=no

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Messages]
es.WelcomeLabel2=Se instalará el sistema de gestión de La Casa del Inyector San Juan, C.A. en este equipo, que funcionará como servidor de la tienda.%n%nIncluye la base de datos, la aplicación y los respaldos automáticos. Las demás computadoras, tablets y teléfonos de la tienda entrarán desde el navegador.%n%nSi ya estaba instalado, se actualizará conservando todos los datos.

[InstallDelete]
; Se eliminan los programas de la versión anterior (nunca los datos, que están en ProgramData).
Type: filesandordirs; Name: "{app}\api"
Type: filesandordirs; Name: "{app}\web"

[Files]
Source: "dist\app\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "recursos\logo.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{commondesktop}\La Casa del Inyector"; Filename: "{app}\abrir.url"; IconFilename: "{app}\logo.ico"
Name: "{group}\La Casa del Inyector"; Filename: "{app}\abrir.url"; IconFilename: "{app}\logo.ico"
Name: "{group}\Carpeta de respaldos"; Filename: "{commonappdata}\LaCasaDelInyector\respaldos"
Name: "{group}\Restaurar un respaldo"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scripts\restaurar.ps1"""; IconFilename: "{app}\logo.ico"
Name: "{group}\Registros (diagnóstico)"; Filename: "{commonappdata}\LaCasaDelInyector\logs"
Name: "{group}\Desinstalar La Casa del Inyector"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\abrir.url"; Description: "Abrir el sistema ahora"; Flags: postinstall shellexec nowait skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\desinstalar.ps1"" -Aplicacion ""{app}"""; Flags: runhidden waituntilterminated; RunOnceId: "QuitarServicios"

[Code]
var
  TextoFinal: String;

{ Antes de copiar archivos se detienen los servicios, para poder reemplazar node.exe y postgres.exe. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Codigo: Integer;
begin
  Exec(ExpandConstant('{sys}\net.exe'), 'stop LCI-API', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  Exec(ExpandConstant('{sys}\net.exe'), 'stop LCI-BaseDatos', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  Result := '';
end;

function Valor(const Lineas: TArrayOfString; const Clave: String): String;
var
  I: Integer;
begin
  Result := '';
  for I := 0 to GetArrayLength(Lineas) - 1 do
    if Pos(Clave + '=', Lineas[I]) = 1 then
      Result := Copy(Lineas[I], Length(Clave) + 2, MaxInt);
end;

procedure ArmarTextoFinal;
var
  Lineas: TArrayOfString;
  Red, Clave: String;
begin
  if not LoadStringsFromFile(ExpandConstant('{commonappdata}\LaCasaDelInyector\config\resultado.txt'), Lineas) then
    exit;
  Red := Valor(Lineas, 'urls_red');
  StringChangeEx(Red, ';', #13#10 + '      ', True);
  Clave := Valor(Lineas, 'clave');
  TextoFinal :=
    'El sistema quedó instalado y en funcionamiento.' + #13#10#13#10 +
    'En este equipo: ' + Valor(Lineas, 'url_local') + #13#10 +
    'Desde las demás computadoras de la tienda:' + #13#10 + '      ' + Red + #13#10#13#10;
  if Clave <> '' then
    TextoFinal := TextoFinal +
      'Usuario: admin' + #13#10 +
      'Clave inicial: ' + Clave + #13#10 +
      'Anótela y cámbiela al entrar (ícono de la llave).' + #13#10#13#10;
  TextoFinal := TextoFinal +
    'Los respaldos se hacen cada día a las 23:00. Copie la carpeta de respaldos a un pendrive con regularidad.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Codigo: Integer;
  Parametros: String;
begin
  if CurStep <> ssPostInstall then
    exit;
  WizardForm.StatusLabel.Caption := 'Configurando la base de datos y los servicios. Puede tardar unos minutos...';
  WizardForm.ProgressGauge.Style := npbstMarquee;
  Parametros := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\scripts\instalar.ps1') +
    '" -Aplicacion "' + ExpandConstant('{app}') + '"';
  if Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), Parametros, '', SW_HIDE, ewWaitUntilTerminated, Codigo)
     and (Codigo = 0) then
    ArmarTextoFinal
  else
    SuppressibleMsgBox(
      'No se pudo completar la configuración del sistema (código ' + IntToStr(Codigo) + ').' + #13#10#13#10 +
      'Revise el registro en:' + #13#10 + ExpandConstant('{commonappdata}\LaCasaDelInyector\logs\instalacion.log') + #13#10#13#10 +
      'Puede volver a ejecutar el instalador para reintentar; los datos no se pierden.',
      mbCriticalError, MB_OK, IDOK);
  WizardForm.ProgressGauge.Style := npbstNormal;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if (CurPageID = wpFinished) and (TextoFinal <> '') then
  begin
    WizardForm.FinishedLabel.Caption := TextoFinal;
    WizardForm.FinishedLabel.AdjustHeight;
    WizardForm.RunList.Top := WizardForm.FinishedLabel.Top + WizardForm.FinishedLabel.Height + ScaleY(12);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    SuppressibleMsgBox(
      'El programa se desinstaló.' + #13#10#13#10 +
      'Los datos y los respaldos se conservaron en:' + #13#10 + ExpandConstant('{commonappdata}\LaCasaDelInyector') + #13#10 +
      'Si vuelve a instalar, se recuperarán automáticamente.',
      mbInformation, MB_OK, IDOK);
end;
