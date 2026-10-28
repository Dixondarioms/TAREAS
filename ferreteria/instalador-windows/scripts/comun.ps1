# Funciones y rutas comunes de la instalación en Windows de La Casa del Inyector.
# Compatible con Windows PowerShell 5.1 (incluido en Windows 10 y 11).

$ErrorActionPreference = 'Stop'

$NombreServicioBd = 'LCI-BaseDatos'
$NombreServicioApi = 'LCI-API'
$NombreTareaRespaldo = 'LCI - Respaldo diario'
$NombreReglaFirewall = 'LCI-Web'

$Datos = Join-Path $env:ProgramData 'LaCasaDelInyector'
$CarpetaConfig = Join-Path $Datos 'config'
$ArchivoConfig = Join-Path $CarpetaConfig 'config.json'
$CarpetaPgData = Join-Path $Datos 'pgdata'
$CarpetaLogs = Join-Path $Datos 'logs'
$CarpetaRespaldos = Join-Path $Datos 'respaldos'
$CarpetaServicio = Join-Path $Datos 'servicio'
# Resultado para el asistente (incluye la clave inicial): dentro de la carpeta protegida.
$ArchivoResultado = Join-Path $CarpetaConfig 'resultado.txt'

# SID fijos: los nombres de cuentas cambian según el idioma de Windows.
$SidServicioRed = '*S-1-5-20'
$SidSistema = '*S-1-5-18'
$SidAdministradores = '*S-1-5-32-544'

$Script:ArchivoLog = 'instalacion.log'

function Escribir-Log([string]$Mensaje) {
  $linea = '{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $Mensaje
  # Write-Host (no Write-Output) para no mezclar el registro con los valores que devuelven las funciones.
  Write-Host $linea
  if (-not (Test-Path $CarpetaLogs)) { New-Item -ItemType Directory -Path $CarpetaLogs -Force | Out-Null }
  Add-Content -Path (Join-Path $CarpetaLogs $Script:ArchivoLog) -Value $linea -Encoding UTF8
}

function Leer-Config {
  if (-not (Test-Path $ArchivoConfig)) { return $null }
  return Get-Content -Path $ArchivoConfig -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Guardar-Config($Config) {
  if (-not (Test-Path $CarpetaConfig)) { New-Item -ItemType Directory -Path $CarpetaConfig -Force | Out-Null }
  $Config | ConvertTo-Json | Set-Content -Path $ArchivoConfig -Encoding UTF8
}

function Nueva-ClaveHex([int]$Bytes = 32) {
  $b = New-Object byte[] $Bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return -join ($b | ForEach-Object { $_.ToString('x2') })
}

# Clave fácil de dictar o copiar: sin caracteres que se confunden (0/O, 1/l/I).
function Nueva-ClaveLegible([int]$Largo = 12) {
  $alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  $b = New-Object byte[] $Largo
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return -join ($b | ForEach-Object { $alfabeto[$_ % $alfabeto.Length] })
}

function Ejecutar([string]$Programa, [string[]]$Argumentos) {
  # Los programas de PostgreSQL escriben avisos por stderr; no deben abortar el script.
  $ErrorActionPreference = 'Continue'
  & $Programa @Argumentos 2>&1 | ForEach-Object { Escribir-Log "    $_" }
  if ($LASTEXITCODE -ne 0) { throw "Falló $([IO.Path]::GetFileName($Programa)) (código $LASTEXITCODE)" }
}

function Herencia([string]$Ruta) {
  if (Test-Path -Path $Ruta -PathType Container) { return '(OI)(CI)' }
  return ''
}

function Dar-Permiso([string]$Ruta, [string]$Sid, [string]$Permiso) {
  & icacls.exe $Ruta /grant "${Sid}:$(Herencia $Ruta)$Permiso" /T /C /Q | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "No se pudo asignar permisos sobre $Ruta" }
}

# Deja una carpeta (o archivo) accesible solo para administradores y SYSTEM, más los permisos
# adicionales indicados como 'SID:PERMISO' (p. ej. '*S-1-5-20:RX').
function Restringir-Carpeta([string]$Ruta, [string[]]$Adicionales = @()) {
  $h = Herencia $Ruta
  $argumentos = @($Ruta, '/inheritance:r', '/grant:r', "${SidAdministradores}:${h}F", "${SidSistema}:${h}F")
  foreach ($a in $Adicionales) {
    $partes = $a.Split(':')
    $argumentos += @('/grant:r', "$($partes[0]):$h$($partes[1])")
  }
  & icacls.exe @argumentos | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "No se pudo proteger la carpeta $Ruta" }
}

function Puerto-Libre([int]$Puerto) {
  $ocupado = Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue
  return -not $ocupado
}

function Buscar-PuertoLibre([int[]]$Candidatos) {
  foreach ($p in $Candidatos) { if (Puerto-Libre $p) { return $p } }
  throw "No hay un puerto libre entre: $($Candidatos -join ', ')"
}

function Esperar-Servicio([string]$Nombre, [int]$Segundos = 60) {
  $limite = (Get-Date).AddSeconds($Segundos)
  while ((Get-Date) -lt $limite) {
    $s = Get-Service -Name $Nombre -ErrorAction SilentlyContinue
    if ($s -and $s.Status -eq 'Running') { return }
    Start-Sleep -Seconds 2
  }
  throw "El servicio $Nombre no arrancó en $Segundos segundos"
}

function Detener-Servicio([string]$Nombre) {
  $s = Get-Service -Name $Nombre -ErrorAction SilentlyContinue
  if ($s -and $s.Status -ne 'Stopped') {
    Escribir-Log "Deteniendo $Nombre"
    Stop-Service -Name $Nombre -Force -ErrorAction SilentlyContinue
    $s.WaitForStatus('Stopped', (New-TimeSpan -Seconds 60))
  }
}

function Url-Para([string]$Servidor, [int]$Puerto) {
  if ($Puerto -eq 80) { return "http://$Servidor/" }
  return "http://${Servidor}:$Puerto/"
}

function Direcciones-Red {
  return @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      Select-Object -ExpandProperty IPAddress)
}

function Es-Administrador {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
