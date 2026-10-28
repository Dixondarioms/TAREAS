# Arma la carpeta dist\app con todo lo que lleva el instalador:
#   node\        Node.js para Windows (solo node.exe)
#   pgsql\       PostgreSQL para Windows (bin, lib, share)
#   servicio\    WinSW, para ejecutar la API como servicio de Windows
#   api\         API compilada con sus dependencias de producción
#   web\         Aplicación web compilada
#   scripts\     Scripts de instalación, respaldo y restauración
# Requiere haber compilado antes backend (npm run build + npm prune --omit=dev) y frontend (npm run build).
param(
  [string]$VersionNode = '22.23.4',
  [string[]]$VersionesPostgres = @('16.14', '16.13', '16.12', '16.11', '16.10', '16.9'),
  [string]$VersionWinSW = '2.12.0'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$aqui = $PSScriptRoot
$raiz = Split-Path $aqui -Parent
$dist = Join-Path $aqui 'dist\app'
$cache = Join-Path $aqui 'dist\descargas'
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Path $dist, $cache -Force | Out-Null

function Descargar([string]$Url, [string]$Destino) {
  if (Test-Path $Destino) { return }
  Write-Host "Descargando $Url"
  Invoke-WebRequest -Uri $Url -OutFile "$Destino.parcial" -UseBasicParsing
  Move-Item "$Destino.parcial" $Destino
}

# ---- Node.js (verificado con la suma SHA-256 oficial)
$zipNode = Join-Path $cache "node-v$VersionNode-win-x64.zip"
Descargar "https://nodejs.org/dist/v$VersionNode/node-v$VersionNode-win-x64.zip" $zipNode
$sumas = (Invoke-WebRequest -Uri "https://nodejs.org/dist/v$VersionNode/SHASUMS256.txt" -UseBasicParsing).Content
$esperada = ($sumas -split "`n" | Where-Object { $_ -match "node-v$VersionNode-win-x64.zip" }) -split '\s+' | Select-Object -First 1
$real = (Get-FileHash $zipNode -Algorithm SHA256).Hash.ToLower()
if ($esperada -ne $real) { throw "Suma SHA-256 de Node no coincide ($real vs $esperada)" }
$tmpNode = Join-Path $cache 'node'
if (Test-Path $tmpNode) { Remove-Item $tmpNode -Recurse -Force }
Expand-Archive $zipNode $tmpNode
New-Item -ItemType Directory -Path (Join-Path $dist 'node') | Out-Null
Copy-Item (Join-Path $tmpNode "node-v$VersionNode-win-x64\node.exe") (Join-Path $dist 'node')
Copy-Item (Join-Path $tmpNode "node-v$VersionNode-win-x64\LICENSE") (Join-Path $dist 'node\LICENSE.txt')

# ---- PostgreSQL: binarios oficiales de EnterpriseDB (se usa la versión 16 más reciente disponible)
$zipPg = $null
foreach ($v in $VersionesPostgres) {
  $candidato = Join-Path $cache "postgresql-$v-windows-x64-binaries.zip"
  try {
    Descargar "https://get.enterprisedb.com/postgresql/postgresql-$v-1-windows-x64-binaries.zip" $candidato
    $zipPg = $candidato
    Write-Host "PostgreSQL $v"
    break
  } catch {
    Write-Host "PostgreSQL $v no disponible: $($_.Exception.Message)"
    Remove-Item "$candidato.parcial" -ErrorAction SilentlyContinue
  }
}
if (-not $zipPg) { throw 'No se pudo descargar PostgreSQL para Windows' }
$tmpPg = Join-Path $cache 'pg'
if (Test-Path $tmpPg) { Remove-Item $tmpPg -Recurse -Force }
Expand-Archive $zipPg $tmpPg
$pgsql = Join-Path $dist 'pgsql'
New-Item -ItemType Directory -Path $pgsql | Out-Null
foreach ($c in @('bin', 'lib', 'share')) { Copy-Item (Join-Path $tmpPg "pgsql\$c") $pgsql -Recurse }
# Se quitan herramientas gráficas y archivos que no hacen falta para el servidor.
Get-ChildItem (Join-Path $pgsql 'bin') -Filter '*pgAdmin*' | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $pgsql 'bin\stackbuilder.exe') -ErrorAction SilentlyContinue
Get-ChildItem $pgsql -Recurse -Include '*.pdb', '*.lib' | Remove-Item -Force
foreach ($exe in @('postgres.exe', 'pg_ctl.exe', 'initdb.exe', 'psql.exe', 'pg_dump.exe', 'pg_restore.exe', 'pg_isready.exe')) {
  if (-not (Test-Path (Join-Path $pgsql "bin\$exe"))) { throw "Falta $exe en los binarios de PostgreSQL" }
}
foreach ($ext in @('unaccent.control', 'pg_trgm.control')) {
  if (-not (Test-Path (Join-Path $pgsql "share\extension\$ext"))) { throw "Falta la extensión $ext" }
}

# ---- WinSW (envoltorio de servicios de Windows)
New-Item -ItemType Directory -Path (Join-Path $dist 'servicio') | Out-Null
Descargar "https://github.com/winsw/winsw/releases/download/v$VersionWinSW/WinSW-net461.exe" (Join-Path $cache "WinSW-$VersionWinSW.exe")
Copy-Item (Join-Path $cache "WinSW-$VersionWinSW.exe") (Join-Path $dist 'servicio\winsw.exe')

# ---- Aplicación
$backend = Join-Path $raiz 'backend'
$api = Join-Path $dist 'api'
New-Item -ItemType Directory -Path $api | Out-Null
foreach ($c in @('dist', 'node_modules', 'package.json')) { Copy-Item (Join-Path $backend $c) $api -Recurse }
if (Test-Path (Join-Path $api 'node_modules\typescript')) { throw 'node_modules incluye dependencias de desarrollo: ejecute npm prune --omit=dev' }
Copy-Item (Join-Path $raiz 'frontend\dist') (Join-Path $dist 'web') -Recurse
Copy-Item (Join-Path $aqui 'scripts') $dist -Recurse

$tamano = (Get-ChildItem $dist -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Write-Host ('Contenido listo en {0} ({1:N0} MB)' -f $dist, $tamano)
