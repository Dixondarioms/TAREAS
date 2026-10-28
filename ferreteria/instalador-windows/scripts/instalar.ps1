# Configura La Casa del Inyector en este equipo. Lo ejecuta el instalador después de copiar los archivos.
# Sirve tanto para la primera instalación como para actualizar: los datos existentes se conservan.
param(
  [Parameter(Mandatory = $true)][string]$Aplicacion,
  [int]$PuertoWeb = 0
)

. (Join-Path $PSScriptRoot 'comun.ps1')

$Bin = Join-Path $Aplicacion 'pgsql\bin'
$Node = Join-Path $Aplicacion 'node\node.exe'

try {
  foreach ($c in @($Datos, $CarpetaLogs, $CarpetaRespaldos, $CarpetaServicio)) {
    if (-not (Test-Path $c)) { New-Item -ItemType Directory -Path $c -Force | Out-Null }
  }
  Escribir-Log "===== Instalación en $Aplicacion ====="

  $config = Leer-Config
  $esNueva = $null -eq $config
  if ($esNueva) {
    $web = if ($PuertoWeb -gt 0) { $PuertoWeb } else { Buscar-PuertoLibre @(80, 8080, 8081, 8090) }
    $config = [pscustomobject]@{
      puertoWeb            = $web
      puertoBd             = Buscar-PuertoLibre @(5433, 5434, 5435, 5436)
      claveBdApp           = Nueva-ClaveHex 24
      claveBdSuper         = Nueva-ClaveHex 24
      jwtSecreto           = Nueva-ClaveHex 48
      claveAdminInicial    = Nueva-ClaveLegible 12
      instalacionCompleta  = $false
      instaladoEn          = (Get-Date).ToString('s')
    }
    Guardar-Config $config
    Escribir-Log "Instalación nueva: web en el puerto $($config.puertoWeb), base de datos en el puerto $($config.puertoBd)"
  } else {
    Escribir-Log 'Se encontró una instalación anterior: se actualizará conservando los datos'
  }
  Restringir-Carpeta $CarpetaConfig
  # Los respaldos contienen todos los datos: solo administradores y SYSTEM (la tarea diaria).
  Restringir-Carpeta $CarpetaRespaldos

  # ---------------------------------------------------------------- base de datos
  $base = Join-Path $CarpetaPgData 'PG_VERSION'
  if (-not (Test-Path $base)) {
    Escribir-Log 'Inicializando la base de datos'
    if (-not (Test-Path $CarpetaPgData)) { New-Item -ItemType Directory -Path $CarpetaPgData -Force | Out-Null }
    # Los archivos de la base solo los ven administradores y la cuenta del servicio. initdb se
    # ejecuta con privilegios reducidos, por eso necesita permiso explícito para el usuario actual.
    $yo = '*' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    Restringir-Carpeta $CarpetaPgData @("${yo}:F", "${SidServicioRed}:F")

    $archivoClave = Join-Path $CarpetaConfig 'pwfile.tmp'
    Set-Content -Path $archivoClave -Value $config.claveBdSuper -Encoding ASCII -NoNewline
    Dar-Permiso $archivoClave $yo 'R'
    try {
      $comunes = @('-D', $CarpetaPgData, '-U', 'postgres', "--pwfile=$archivoClave", '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '-E', 'UTF8')
      try {
        Ejecutar (Join-Path $Bin 'initdb.exe') ($comunes + @('--locale=C', '--locale-provider=icu', '--icu-locale=es-VE'))
      } catch {
        Escribir-Log 'initdb con ICU no disponible; se usa la configuración regional C'
        Get-ChildItem -Path $CarpetaPgData -Force | Remove-Item -Recurse -Force
        Ejecutar (Join-Path $Bin 'initdb.exe') ($comunes + @('--locale=C'))
      }
    } finally {
      Remove-Item -Path $archivoClave -Force -ErrorAction SilentlyContinue
    }
    # Solo escucha en este equipo: la red local accede a través de la API, nunca a la base directamente.
    Add-Content -Path (Join-Path $CarpetaPgData 'postgresql.conf') -Encoding ASCII -Value @(
      '',
      '# --- La Casa del Inyector ---',
      "listen_addresses = '127.0.0.1'",
      "port = $($config.puertoBd)",
      'logging_collector = on',
      "log_filename = 'postgresql-%a.log'",
      'log_truncate_on_rotation = on',
      'log_rotation_age = 1d'
    )
  }

  if (-not (Get-Service -Name $NombreServicioBd -ErrorAction SilentlyContinue)) {
    Escribir-Log "Registrando el servicio $NombreServicioBd"
    Ejecutar (Join-Path $Bin 'pg_ctl.exe') @('register', '-N', $NombreServicioBd, '-U', 'NT AUTHORITY\NetworkService', '-D', $CarpetaPgData, '-S', 'auto', '-w', '-t', '120')
    & sc.exe description $NombreServicioBd 'La Casa del Inyector: base de datos PostgreSQL' | Out-Null
    & sc.exe failure $NombreServicioBd reset= 3600 actions= restart/10000/restart/30000/restart/60000 | Out-Null
  }
  Escribir-Log 'Iniciando la base de datos'
  Start-Service -Name $NombreServicioBd
  Esperar-Servicio $NombreServicioBd 120
  $listo = $false
  for ($i = 0; $i -lt 60 -and -not $listo; $i++) {
    & (Join-Path $Bin 'pg_isready.exe') -h 127.0.0.1 -p $config.puertoBd -q
    if ($LASTEXITCODE -eq 0) { $listo = $true } else { Start-Sleep -Seconds 2 }
  }
  if (-not $listo) { throw 'La base de datos no responde' }

  $env:PGPASSWORD = $config.claveBdSuper
  $psql = Join-Path $Bin 'psql.exe'
  $existe = (& $psql -h 127.0.0.1 -p $config.puertoBd -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'ferreteria'") -eq '1'
  if (-not $existe) {
    Escribir-Log 'Creando la base de datos de la aplicación'
    Ejecutar $psql @('-h', '127.0.0.1', '-p', "$($config.puertoBd)", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
      '-c', "CREATE ROLE ferreteria LOGIN PASSWORD '$($config.claveBdApp)'",
      '-c', 'CREATE DATABASE ferreteria OWNER ferreteria')
  } elseif ($config.instalacionCompleta) {
    # Actualización: respaldo antes de que la nueva versión aplique sus migraciones.
    Escribir-Log 'Respaldo previo a la actualización'
    & (Join-Path $PSScriptRoot 'respaldo.ps1') -Motivo 'antes-de-actualizar'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo hacer el respaldo previo a la actualización' }
  }
  # respaldo.ps1 también la borra al terminar, por eso se ignora si ya no existe.
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

  # ---------------------------------------------------------------- servicio de la API
  Detener-Servicio $NombreServicioApi
  $argumentosNode = @()
  # --use-system-ca permite usar los certificados de Windows (útil para el sitio del BCV).
  $prueba = Start-Process -FilePath $Node -ArgumentList @('--use-system-ca', '-e', '0') -Wait -PassThru -WindowStyle Hidden
  if ($prueba.ExitCode -eq 0) { $argumentosNode += '--use-system-ca' }
  $argumentosNode += "`"$(Join-Path $Aplicacion 'api\dist\main.js')`""

  $variables = [ordered]@{
    NODE_ENV                     = 'production'
    PUERTO                       = "$($config.puertoWeb)"
    DB_HOST                      = '127.0.0.1'
    DB_PUERTO                    = "$($config.puertoBd)"
    DB_USUARIO                   = 'ferreteria'
    DB_CLAVE                     = $config.claveBdApp
    DB_NOMBRE                    = 'ferreteria'
    JWT_SECRETO                  = $config.jwtSecreto
    ADMIN_USUARIO                = 'admin'
    ADMIN_CLAVE_INICIAL          = $config.claveAdminInicial
    FRONTEND_DIR                 = (Join-Path $Aplicacion 'web')
    BCV_ACTUALIZACION_AUTOMATICA = 'true'
  }
  $lineasEnv = ($variables.GetEnumerator() | ForEach-Object {
      '  <env name="{0}" value="{1}"/>' -f $_.Key, [Security.SecurityElement]::Escape($_.Value)
    }) -join "`r`n"
  $xml = @"
<service>
  <id>$NombreServicioApi</id>
  <name>La Casa del Inyector - Sistema de gestion</name>
  <description>API y aplicacion web de La Casa del Inyector San Juan, C.A.</description>
  <executable>$([Security.SecurityElement]::Escape($Node))</executable>
  <arguments>$([Security.SecurityElement]::Escape($argumentosNode -join ' '))</arguments>
  <workingdirectory>$([Security.SecurityElement]::Escape((Join-Path $Aplicacion 'api')))</workingdirectory>
$lineasEnv
  <depend>$NombreServicioBd</depend>
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="10 sec"/>
  <onfailure action="restart" delay="30 sec"/>
  <onfailure action="restart" delay="60 sec"/>
  <resetfailure>1 hour</resetfailure>
  <stoptimeout>20 sec</stoptimeout>
  <logpath>$([Security.SecurityElement]::Escape($CarpetaLogs))</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
</service>
"@
  $envoltorio = Join-Path $CarpetaServicio "$NombreServicioApi.exe"
  Copy-Item -Path (Join-Path $Aplicacion 'servicio\winsw.exe') -Destination $envoltorio -Force
  Set-Content -Path (Join-Path $CarpetaServicio "$NombreServicioApi.xml") -Value $xml -Encoding UTF8
  # El archivo del servicio contiene claves: solo administradores, SYSTEM y la cuenta del servicio.
  Restringir-Carpeta $CarpetaServicio @("${SidServicioRed}:RX")
  Dar-Permiso $Aplicacion $SidServicioRed 'RX'
  Dar-Permiso $CarpetaLogs $SidServicioRed 'M'

  if (-not (Get-Service -Name $NombreServicioApi -ErrorAction SilentlyContinue)) {
    Escribir-Log "Registrando el servicio $NombreServicioApi"
    Ejecutar $envoltorio @('install')
  }
  # La API corre con una cuenta sin privilegios de administrador.
  $cambio = Get-CimInstance -ClassName Win32_Service -Filter "Name='$NombreServicioApi'" |
    Invoke-CimMethod -MethodName Change -Arguments @{ StartName = 'NT AUTHORITY\NetworkService'; StartPassword = '' }
  if ($cambio.ReturnValue -ne 0) { throw "No se pudo asignar la cuenta del servicio (código $($cambio.ReturnValue))" }
  Escribir-Log 'Iniciando la aplicación'
  Start-Service -Name $NombreServicioApi
  Esperar-Servicio $NombreServicioApi 60

  $urlLocal = Url-Para 'localhost' $config.puertoWeb
  $respondio = $false
  for ($i = 0; $i -lt 90 -and -not $respondio; $i++) {
    try {
      $r = Invoke-RestMethod -Uri "${urlLocal}api/salud" -TimeoutSec 5
      if ($r.estado -eq 'ok') { $respondio = $true }
    } catch { Start-Sleep -Seconds 2 }
  }
  if (-not $respondio) { throw "La aplicación no respondió en $urlLocal. Revise los registros en $CarpetaLogs" }
  Escribir-Log 'La aplicación responde correctamente'

  # ---------------------------------------------------------------- red, respaldos y accesos directos
  Remove-NetFirewallRule -Name $NombreReglaFirewall -ErrorAction SilentlyContinue
  New-NetFirewallRule -Name $NombreReglaFirewall -DisplayName 'La Casa del Inyector (sistema de gestión)' `
    -Direction Inbound -Protocol TCP -LocalPort $config.puertoWeb -Action Allow -Profile Any -RemoteAddress LocalSubnet | Out-Null
  Escribir-Log "Firewall: permitido el puerto $($config.puertoWeb) desde la red local"

  $accion = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'respaldo.ps1')`""
  $disparador = New-ScheduledTaskTrigger -Daily -At '23:00'
  # Si el equipo estaba apagado a las 23:00, el respaldo se hace al encenderlo.
  $ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
  $cuenta = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $NombreTareaRespaldo -Action $accion -Trigger $disparador -Settings $ajustes `
    -Principal $cuenta -Description 'Respaldo diario de la base de datos de La Casa del Inyector' -Force | Out-Null
  Escribir-Log 'Tarea de respaldo diario registrada (23:00)'

  Set-Content -Path (Join-Path $Aplicacion 'abrir.url') -Encoding ASCII -Value @('[InternetShortcut]', "URL=$urlLocal")

  $mostrarClave = -not $config.instalacionCompleta
  $config.instalacionCompleta = $true
  Guardar-Config $config

  $urlsRed = (Direcciones-Red | ForEach-Object { Url-Para $_ $config.puertoWeb }) -join ';'
  $lineas = @(
    "url_local=$urlLocal",
    "urls_red=$urlsRed",
    'usuario=admin',
    "clave=$(if ($mostrarClave) { $config.claveAdminInicial } else { '' })",
    "datos=$Datos"
  )
  [IO.File]::WriteAllLines($ArchivoResultado, $lineas, (New-Object Text.UTF8Encoding $false))
  Restringir-Carpeta $ArchivoResultado
  Escribir-Log '===== Instalación terminada ====='
  exit 0
} catch {
  Escribir-Log "ERROR: $($_.Exception.Message)"
  Escribir-Log $_.ScriptStackTrace
  exit 1
}
