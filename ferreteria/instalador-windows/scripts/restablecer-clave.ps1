# Restablece la clave del usuario administrador cuando se pierde.
# Se abre desde el menú Inicio: "La Casa del Inyector > Restablecer clave del administrador".

. (Join-Path $PSScriptRoot 'comun.ps1')
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

  $respuesta = Mensaje "Se generará una clave nueva para el usuario «admin».`nLa clave actual dejará de funcionar.`n`n¿Desea continuar?" 'Question' 'YesNo'
  if ($respuesta -ne 'Yes') { exit 0 }

  $aplicacion = Split-Path $PSScriptRoot -Parent
  $env:DB_HOST = '127.0.0.1'
  $env:DB_PUERTO = "$($config.puertoBd)"
  $env:DB_USUARIO = 'ferreteria'
  $env:DB_CLAVE = $config.claveBdApp
  $env:DB_NOMBRE = 'ferreteria'
  try {
    $ErrorActionPreference = 'Continue'
    $salida = & (Join-Path $aplicacion 'node\node.exe') (Join-Path $aplicacion 'api\dist\restablecer-admin.js') 'admin' 2>&1
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
  } finally {
    'DB_HOST', 'DB_PUERTO', 'DB_USUARIO', 'DB_CLAVE', 'DB_NOMBRE' | ForEach-Object { Remove-Item "Env:\$_" -ErrorAction SilentlyContinue }
  }
  $linea = $salida | ForEach-Object { "$_" } | Where-Object { $_ -like 'clave=*' } | Select-Object -First 1
  if ($codigo -ne 0 -or -not $linea) { throw (($salida | ForEach-Object { "$_" }) -join "`n") }
  $clave = $linea.Substring(6)

  Escribir-Log 'Se restableció la clave del usuario admin'
  $copiada = $true
  try { [Windows.Forms.Clipboard]::SetText($clave) } catch { $copiada = $false }
  $aviso = if ($copiada) { 'Ya está copiada: puede pegarla con Ctrl+V.' } else { '' }
  Mensaje "Clave nueva del usuario admin:`n`n        $clave`n`n$aviso`n`nAnótela, entre al sistema y cámbiela con el icono de llave (arriba a la derecha).`nSi el sistema dice «Demasiados intentos», espere 5 minutos." | Out-Null
} catch {
  Escribir-Log "ERROR al restablecer la clave: $($_.Exception.Message)"
  Mensaje "No se pudo restablecer la clave:`n`n$($_.Exception.Message)`n`nDetalles en $CarpetaLogs\instalacion.log" 'Error' | Out-Null
  exit 1
}
