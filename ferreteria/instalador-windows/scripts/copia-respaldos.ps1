# Elige la carpeta donde se copia cada respaldo, fuera del disco del servidor
# (disco externo, pendrive o carpeta sincronizada con OneDrive o Google Drive).
# Se abre desde el menú Inicio: "La Casa del Inyector > Copia de respaldos fuera del equipo".

. (Join-Path $PSScriptRoot 'comun.ps1')
$Script:ArchivoLog = 'respaldos.log'
Add-Type -AssemblyName System.Windows.Forms

if (-not (Es-Administrador)) {
  # Se vuelve a abrir con permisos de administrador (Windows mostrará la confirmación).
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
  exit 0
}

function Mensaje([string]$Texto, [string]$Icono = 'Information', [string]$Botones = 'OK') {
  return [Windows.Forms.MessageBox]::Show($Texto, 'La Casa del Inyector', $Botones, $Icono)
}

try {
  $config = Leer-Config
  if (-not $config) { throw 'No se encontró la instalación de La Casa del Inyector en este equipo.' }
  $actual = $config.carpetaCopiaRespaldos

  if ($actual) {
    $r = Mensaje "Los respaldos se copian ahora en:`n`n$actual`n`n¿Desea elegir otra carpeta?`n(«No» deja de copiarlos fuera del equipo.)" 'Question' 'YesNoCancel'
    if ($r -eq 'Cancel') { exit 0 }
    if ($r -eq 'No') {
      $config.PSObject.Properties.Remove('carpetaCopiaRespaldos')
      Guardar-Config $config
      Escribir-Log 'Se desactivó la copia de respaldos fuera del equipo'
      Mensaje 'Los respaldos ya no se copiarán fuera del equipo. Siguen guardándose en el servidor.' | Out-Null
      exit 0
    }
  }

  $dialogo = New-Object Windows.Forms.FolderBrowserDialog
  $dialogo.Description = 'Elija la carpeta donde se copiará cada respaldo (disco externo, pendrive o carpeta de OneDrive o Google Drive).'
  if ($actual -and (Test-Path $actual)) { $dialogo.SelectedPath = $actual }
  if ($dialogo.ShowDialog() -ne 'OK') { exit 0 }
  $carpeta = $dialogo.SelectedPath

  $raizDatos = [IO.Path]::GetPathRoot($Datos)
  if ([IO.Path]::GetPathRoot($carpeta) -eq $raizDatos) {
    $r = Mensaje "La carpeta elegida está en el mismo disco ($raizDatos) que el servidor. Si el disco falla o roban el equipo, la copia también se pierde.`n`nSolo es útil si esa carpeta se sincroniza con la nube (OneDrive, Google Drive). ¿Desea usarla de todas formas?" 'Warning' 'YesNo'
    if ($r -ne 'Yes') { exit 0 }
  }

  $config | Add-Member -NotePropertyName carpetaCopiaRespaldos -NotePropertyValue $carpeta -Force
  Guardar-Config $config
  Escribir-Log "Carpeta de copia de respaldos: $carpeta"

  # Se hace un respaldo ahora para comprobar que la copia funciona.
  & (Join-Path $PSScriptRoot 'respaldo.ps1') -Motivo 'prueba-de-copia'
  $copias = Get-ChildItem -Path $carpeta -Filter 'ferreteria-*-prueba-de-copia.dump' -ErrorAction SilentlyContinue
  if ($LASTEXITCODE -ne 0 -or -not $copias) { throw "Se guardó la carpeta, pero la copia de prueba falló. Revise $CarpetaLogs\respaldos.log" }
  Mensaje "Listo. Cada respaldo diario se copiará también en:`n`n$carpeta`n`nSi es un disco externo o pendrive, déjelo conectado. Si no está conectado a la hora del respaldo, solo se omite la copia de ese día." | Out-Null
} catch {
  Escribir-Log "ERROR al configurar la copia de respaldos: $($_.Exception.Message)"
  Mensaje "No se pudo configurar la copia de respaldos:`n`n$($_.Exception.Message)" 'Error' | Out-Null
  exit 1
}
