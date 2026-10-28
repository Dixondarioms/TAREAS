# Prueba completa del instalador en un Windows limpio (se usa en GitHub Actions):
# instalación silenciosa, uso de la API, respaldo, actualización conservando datos y desinstalación.
param([Parameter(Mandatory = $true)][string]$Instalador)
$ErrorActionPreference = 'Stop'

$datos = Join-Path $env:ProgramData 'LaCasaDelInyector'
$app = Join-Path ${env:ProgramFiles} 'LaCasaDelInyector'
$registros = Join-Path $env:RUNNER_TEMP 'registros-instalador'
New-Item -ItemType Directory -Path $registros -Force | Out-Null

function Paso([string]$Texto) { Write-Host "`n=== $Texto ===" -ForegroundColor Cyan }
function Afirmar([bool]$Condicion, [string]$Mensaje) {
  if (-not $Condicion) { throw "FALLÓ: $Mensaje" }
  Write-Host "  ok: $Mensaje"
}
function Instalar([string]$Nombre) {
  $p = Start-Process -FilePath $Instalador -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/LOG=$registros\$Nombre.log") -Wait -PassThru
  Afirmar ($p.ExitCode -eq 0) "el instalador terminó con código 0 ($Nombre)"
}
function Resultado {
  $r = @{}
  Get-Content (Join-Path $datos 'config\resultado.txt') | ForEach-Object { $k, $v = $_ -split '=', 2; $r[$k] = $v }
  return $r
}
function Api([string]$Metodo, [string]$Ruta, $Cuerpo = $null, [string]$Token = '') {
  $h = @{}
  if ($Token) { $h.Authorization = "Bearer $Token" }
  $parametros = @{ Method = $Metodo; Uri = "$($script:url)api$Ruta"; Headers = $h; ContentType = 'application/json' }
  if ($null -ne $Cuerpo) { $parametros.Body = ($Cuerpo | ConvertTo-Json -Depth 5) }
  return Invoke-RestMethod @parametros
}

try {
  Paso 'Instalación nueva'
  Instalar 'instalacion'
  foreach ($s in @('LCI-BaseDatos', 'LCI-API')) {
    $svc = Get-Service $s
    Afirmar ($svc.Status -eq 'Running') "servicio $s en ejecución"
    Afirmar ($svc.StartType -eq 'Automatic') "servicio $s con inicio automático"
  }
  $cuentaApi = (Get-CimInstance Win32_Service -Filter "Name='LCI-API'").StartName
  Afirmar ($cuentaApi -match 'NetworkService') "la API corre como NetworkService ($cuentaApi)"
  $r = Resultado
  $script:url = $r.url_local
  Afirmar ($r.clave.Length -ge 8) 'se generó la clave inicial del administrador'
  Afirmar ($null -ne (Get-NetFirewallRule -Name 'LCI-Web' -ErrorAction SilentlyContinue)) 'regla de firewall creada'
  Afirmar ($null -ne (Get-ScheduledTask -TaskName 'LCI - Respaldo diario' -ErrorAction SilentlyContinue)) 'tarea de respaldo creada'
  Afirmar (Test-Path "$app\abrir.url") 'acceso directo creado'

  Paso 'La aplicación responde'
  $pagina = Invoke-WebRequest -Uri $script:url -UseBasicParsing
  Afirmar ($pagina.Content -match 'La Casa del Inyector') 'la página principal se sirve'
  $ruta = Invoke-WebRequest -Uri "$($script:url)productos/1" -UseBasicParsing
  Afirmar ($ruta.StatusCode -eq 200) 'las rutas de la aplicación devuelven la página'
  $login = Api POST '/auth/login' @{ usuario = 'admin'; clave = $r.clave }
  $token = $login.token
  Afirmar ([bool]$token) 'inicio de sesión del administrador'
  Api POST '/tasas' @{ moneda = 'USD'; valor = '217.1032'; fechaValor = '2026-01-01' } $token | Out-Null
  Api POST '/marcas' @{ nombre = 'Bosch' } $token | Out-Null
  $p = Api POST '/productos' @{ codigo = 'INY-01'; descripcion = 'Inyector de combustible Bosch'; unidadBaseId = 1; costoUsd = '35.50' } $token
  Afirmar ($p.precios[0].precioBsConIva -ne $null) "producto creado con precio en Bs ($($p.precios[0].precioBsConIva))"
  $busqueda = Api GET '/productos?q=inyectr' $null $token
  Afirmar ($busqueda.total -eq 1) 'búsqueda tolerante a errores (pg_trgm y unaccent instalados)'

  Paso 'Respaldo'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$app\scripts\respaldo.ps1" -Motivo 'prueba'
  Afirmar ($LASTEXITCODE -eq 0) 'el script de respaldo terminó bien'
  Afirmar ((Get-ChildItem "$datos\respaldos" -Filter '*-prueba.dump').Count -eq 1) 'archivo de respaldo creado'

  Paso 'Actualización (reinstalar sobre la instalación existente)'
  Instalar 'actualizacion'
  $r2 = Resultado
  Afirmar ($r2.clave -eq '') 'en la actualización no se vuelve a mostrar la clave'
  Afirmar ($r2.url_local -eq $script:url) 'se conserva el puerto'
  $token = (Api POST '/auth/login' @{ usuario = 'admin'; clave = $r.clave }).token
  $marcas = Api GET '/marcas' $null $token
  Afirmar (@($marcas | Where-Object nombre -eq 'Bosch').Count -eq 1) 'los datos se conservan tras actualizar'
  Afirmar ((Get-ChildItem "$datos\respaldos" -Filter '*antes-de-actualizar.dump').Count -eq 1) 'respaldo automático antes de actualizar'

  Paso 'Desinstalación'
  $p = Start-Process -FilePath "$app\unins000.exe" -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/LOG=$registros\desinstalacion.log") -Wait -PassThru
  Afirmar ($p.ExitCode -eq 0) 'el desinstalador terminó con código 0'
  Start-Sleep -Seconds 5
  Afirmar ($null -eq (Get-Service 'LCI-API' -ErrorAction SilentlyContinue)) 'servicio de la API eliminado'
  Afirmar ($null -eq (Get-Service 'LCI-BaseDatos' -ErrorAction SilentlyContinue)) 'servicio de la base de datos eliminado'
  Afirmar ($null -eq (Get-NetFirewallRule -Name 'LCI-Web' -ErrorAction SilentlyContinue)) 'regla de firewall eliminada'
  Afirmar (Test-Path "$datos\pgdata\PG_VERSION") 'los datos se conservan tras desinstalar'

  Paso 'Reinstalación recupera los datos'
  Instalar 'reinstalacion'
  $token = (Api POST '/auth/login' @{ usuario = 'admin'; clave = $r.clave }).token
  Afirmar (@((Api GET '/marcas' $null $token) | Where-Object nombre -eq 'Bosch').Count -eq 1) 'datos recuperados al reinstalar'

  Write-Host "`nTodas las pruebas del instalador pasaron." -ForegroundColor Green
} finally {
  if (Test-Path "$datos\logs") { Copy-Item "$datos\logs\*" $registros -Recurse -ErrorAction SilentlyContinue }
  if (Test-Path "$datos\pgdata\log") { Copy-Item "$datos\pgdata\log\*" $registros -ErrorAction SilentlyContinue }
}
