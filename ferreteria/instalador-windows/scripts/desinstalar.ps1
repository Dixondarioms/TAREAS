# Quita los servicios, la regla de firewall y la tarea de respaldo. Lo ejecuta el desinstalador.
# Los datos y los respaldos se CONSERVAN en %ProgramData%\LaCasaDelInyector.
param([Parameter(Mandatory = $true)][string]$Aplicacion)

. (Join-Path $PSScriptRoot 'comun.ps1')

try {
  Escribir-Log '===== Desinstalación ====='
  Detener-Servicio $NombreServicioApi
  $envoltorio = Join-Path $CarpetaServicio "$NombreServicioApi.exe"
  if ((Get-Service -Name $NombreServicioApi -ErrorAction SilentlyContinue) -and (Test-Path $envoltorio)) {
    Ejecutar $envoltorio @('uninstall')
  }
  Detener-Servicio $NombreServicioBd
  if (Get-Service -Name $NombreServicioBd -ErrorAction SilentlyContinue) {
    Ejecutar (Join-Path $Aplicacion 'pgsql\bin\pg_ctl.exe') @('unregister', '-N', $NombreServicioBd)
  }
  Remove-NetFirewallRule -Name $NombreReglaFirewall -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $NombreTareaRespaldo -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item -Path (Join-Path $Aplicacion 'abrir.url') -Force -ErrorAction SilentlyContinue
  Escribir-Log "Servicios quitados. Los datos se conservan en $Datos"
  exit 0
} catch {
  Escribir-Log "ERROR al desinstalar: $($_.Exception.Message)"
  exit 1
}
