# Respaldo de la base de datos. Lo ejecuta la tarea programada diaria (23:00) y el instalador antes de actualizar.
param(
  [string]$Motivo = 'diario',
  [int]$Dias = 30
)

. (Join-Path $PSScriptRoot 'comun.ps1')
$Script:ArchivoLog = 'respaldos.log'

# Copia el respaldo a la carpeta elegida en «Copia de respaldos fuera del equipo»
# (disco externo, pendrive o carpeta sincronizada con la nube). Si la carpeta no
# está disponible (por ejemplo, el disco no está conectado) solo se registra un
# aviso: el respaldo local ya quedó hecho.
function Copiar-AFuera($Config, [string]$Archivo, [int]$Dias) {
  $destino = $Config.carpetaCopiaRespaldos
  if (-not $destino) { return }
  try {
    if (-not (Test-Path -Path $destino -PathType Container)) { throw "la carpeta $destino no está disponible" }
    $copia = Join-Path $destino (Split-Path $Archivo -Leaf)
    Copy-Item -Path $Archivo -Destination "$copia.tmp" -Force
    Move-Item -Path "$copia.tmp" -Destination $copia -Force
    Escribir-Log "Copia fuera del equipo: $copia"
    Get-ChildItem -Path $destino -Filter 'ferreteria-*.dump' |
      Sort-Object LastWriteTime -Descending |
      Select-Object -Skip 7 |
      Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$Dias) } |
      ForEach-Object { Remove-Item $_.FullName -Force }
  } catch {
    Escribir-Log "AVISO: no se pudo copiar el respaldo fuera del equipo: $($_.Exception.Message)"
    if ($copia) { Remove-Item -Path "$copia.tmp" -Force -ErrorAction SilentlyContinue }
  }
}

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

  Copiar-AFuera $config $archivo $Dias
  exit 0
} catch {
  Escribir-Log "ERROR en el respaldo: $($_.Exception.Message)"
  if ($temporal) { Remove-Item -Path $temporal -Force -ErrorAction SilentlyContinue }
  exit 1
}
