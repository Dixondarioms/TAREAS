# Restaura un respaldo de la base de datos (reemplaza TODOS los datos actuales).
# Se abre desde el menú Inicio: "La Casa del Inyector > Restaurar un respaldo".
param([string]$Archivo = '')

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
  $bin = Join-Path (Split-Path $PSScriptRoot -Parent) 'pgsql\bin'

  if (-not $Archivo) {
    $dialogo = New-Object Windows.Forms.OpenFileDialog
    $dialogo.Title = 'Elija el respaldo que desea restaurar'
    $dialogo.InitialDirectory = $CarpetaRespaldos
    $dialogo.Filter = 'Respaldos (*.dump)|*.dump'
    if ($dialogo.ShowDialog() -ne 'OK') { exit 0 }
    $Archivo = $dialogo.FileName
  }

  $respuesta = Mensaje "Se reemplazarán TODOS los datos actuales por los del respaldo:`n`n$Archivo`n`nAntes se guardará un respaldo de los datos actuales. ¿Desea continuar?" 'Warning' 'YesNo'
  if ($respuesta -ne 'Yes') { exit 0 }

  & (Join-Path $PSScriptRoot 'respaldo.ps1') -Motivo 'antes-de-restaurar'
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo respaldar los datos actuales; no se restauró nada.' }

  Escribir-Log "Restaurando $Archivo"
  Detener-Servicio $NombreServicioApi
  $env:PGPASSWORD = $config.claveBdSuper
  try {
    Ejecutar (Join-Path $bin 'pg_restore.exe') @('-h', '127.0.0.1', '-p', "$($config.puertoBd)", '-U', 'postgres', '--clean', '--if-exists', '--single-transaction', '-d', 'ferreteria', $Archivo)
  } finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    Start-Service -Name $NombreServicioApi
  }
  Escribir-Log 'Restauración terminada'
  Mensaje 'La restauración terminó correctamente.' | Out-Null
} catch {
  Escribir-Log "ERROR al restaurar: $($_.Exception.Message)"
  Mensaje "No se pudo restaurar el respaldo:`n`n$($_.Exception.Message)`n`nDetalles en $CarpetaLogs\respaldos.log" 'Error' | Out-Null
  exit 1
}
