# Respaldo de la base de datos. Lo ejecuta la tarea programada diaria (23:00) y el instalador antes de actualizar.
param(
  [string]$Motivo = 'diario',
  [int]$Dias = 30
)

. (Join-Path $PSScriptRoot 'comun.ps1')
$Script:ArchivoLog = 'respaldos.log'

try {
  $config = Leer-Config
  if (-not $config) { throw 'No se encontró la configuración de la instalación' }
  $bin = Join-Path (Split-Path $PSScriptRoot -Parent) 'pgsql\bin'
  if (-not (Test-Path $CarpetaRespaldos)) { New-Item -ItemType Directory -Path $CarpetaRespaldos -Force | Out-Null }

  $archivo = Join-Path $CarpetaRespaldos ('ferreteria-{0:yyyyMMdd-HHmmss}-{1}.dump' -f (Get-Date), $Motivo)
  $temporal = "$archivo.tmp"
  Escribir-Log "Iniciando respaldo ($Motivo)"
  $env:PGPASSWORD = $config.claveBdSuper
  try {
    Ejecutar (Join-Path $bin 'pg_dump.exe') @('-h', '127.0.0.1', '-p', "$($config.puertoBd)", '-U', 'postgres', '--format=custom', '--compress=9', "--file=$temporal", 'ferreteria')
  } finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  }
  Move-Item -Path $temporal -Destination $archivo -Force
  Escribir-Log ('Respaldo listo: {0} ({1:N0} KB)' -f $archivo, ((Get-Item $archivo).Length / 1KB))

  # Se borran los respaldos viejos, conservando siempre al menos los 7 más recientes.
  Get-ChildItem -Path $CarpetaRespaldos -Filter 'ferreteria-*.dump' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 7 |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$Dias) } |
    ForEach-Object { Escribir-Log "Eliminando respaldo antiguo $($_.Name)"; Remove-Item $_.FullName -Force }
  exit 0
} catch {
  Escribir-Log "ERROR en el respaldo: $($_.Exception.Message)"
  if ($temporal) { Remove-Item -Path $temporal -Force -ErrorAction SilentlyContinue }
  exit 1
}
