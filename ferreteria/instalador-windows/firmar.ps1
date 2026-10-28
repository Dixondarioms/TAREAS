# Firma un archivo (.exe) con el certificado de FDP Software en SSL.com eSigner (ver FIRMA.md).
# Lo usan el flujo de GitHub Actions (WinSW) e Inno Setup (instalador y desinstalador, con /DFirmar).
# Lee de variables de entorno:
#   CODESIGNTOOL                 carpeta de CodeSignTool ya descomprimida
#   FIRMA_USUARIO, FIRMA_CLAVE   usuario y contraseña de la cuenta de SSL.com
#   FIRMA_CREDENCIAL             credential_id del certificado en eSigner
#   FIRMA_TOTP                   secreto del autenticador (el código del QR de eSigner)
# CodeSignTool pone el sello de tiempo RFC 3161 de SSL.com (http://ts.ssl.com).
param([Parameter(Mandatory = $true)][string]$Archivo)
$ErrorActionPreference = 'Stop'

foreach ($v in @('CODESIGNTOOL', 'FIRMA_USUARIO', 'FIRMA_CLAVE', 'FIRMA_CREDENCIAL', 'FIRMA_TOTP')) {
  if (-not [Environment]::GetEnvironmentVariable($v)) { throw "Falta la variable de entorno $v (ver FIRMA.md)" }
}
$herramienta = $env:CODESIGNTOOL
$java = Join-Path $herramienta 'jdk-11.0.2\bin\java.exe'
$jar = Get-ChildItem (Join-Path $herramienta 'jar') -Filter 'code_sign_tool-*.jar' | Select-Object -First 1
if (-not (Test-Path $java) -or -not $jar) { throw "CodeSignTool incompleto en $herramienta" }

$Archivo = (Resolve-Path $Archivo).Path
$salida = Join-Path ([IO.Path]::GetTempPath()) ('firma-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $salida | Out-Null
try {
  # CodeSignTool busca conf\ en su carpeta. La contraseña no se muestra: GitHub oculta los secretos en el registro.
  $env:CODE_SIGN_TOOL_PATH = $herramienta
  # Java escribe en stderr: con 'Stop', Windows PowerShell 5.1 lo tomaría como error.
  Push-Location $herramienta
  $ErrorActionPreference = 'Continue'
  try {
    $texto = & $java -jar $jar.FullName sign `
      "-username=$env:FIRMA_USUARIO" "-password=$env:FIRMA_CLAVE" `
      "-credential_id=$env:FIRMA_CREDENCIAL" "-totp_secret=$env:FIRMA_TOTP" `
      "-input_file_path=$Archivo" "-output_dir_path=$salida" 2>&1 | ForEach-Object { "$_" } | Out-String
    $codigo = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = 'Stop'
    Pop-Location
  }
  Write-Host $texto.Trim()
  # CodeSignTool puede terminar con código 0 aunque falle: se comprueba el archivo firmado.
  $firmado = Join-Path $salida (Split-Path $Archivo -Leaf)
  if ($codigo -ne 0 -or -not (Test-Path $firmado)) { throw "CodeSignTool no firmó $Archivo" }
  $firma = Get-AuthenticodeSignature $firmado
  if ($firma.Status -ne 'Valid') { throw "La firma de $Archivo no es válida: $($firma.Status) $($firma.StatusMessage)" }
  if (-not $firma.TimeStamperCertificate) { throw "La firma de $Archivo no tiene sello de tiempo" }
  Copy-Item $firmado $Archivo -Force
  Write-Host "Firmado: $Archivo ($($firma.SignerCertificate.Subject))"
} finally {
  Remove-Item $salida -Recurse -Force -ErrorAction SilentlyContinue
}
