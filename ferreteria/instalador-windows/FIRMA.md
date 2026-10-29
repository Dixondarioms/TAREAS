# Firma digital del instalador

Un instalador sin firmar hace que Windows muestre «Windows protegió su PC» con **Editor: Desconocido**. Firmarlo con un certificado de firma de código a nombre de **FDP Software** hace que Windows muestre **Editor comprobado: FDP Software** y que, con el tiempo, SmartScreen deje de bloquearlo.

Todo lo técnico ya está preparado en el repositorio. Falta que **usted compre el certificado y cargue cuatro secretos en GitHub**. Mientras no lo haga, el instalador se sigue compilando y publicando **sin firmar**, igual que hasta ahora.

Información revisada el 28/10/2026. Precios y condiciones cambian: confírmelos en la página del proveedor antes de pagar.

## Resumen

| | |
|---|---|
| **Qué comprar** | Certificado **OV Code Signing** de **SSL.com** con firma en la nube **eSigner**, y la suscripción eSigner **Tier 1** |
| **Costo aproximado** | Certificado: **129 US$/año**. eSigner Tier 1: **20 US$/mes** (unos 15 US$/mes si se paga el año). Total: **310–370 US$ al año**, más 50–150 US$ si piden traducir documentos. |
| **A nombre de** | FDP Software, tal como figure en el Registro Mercantil (ver más abajo) |
| **Tiempo** | La validación suele tardar de unos días a dos semanas si los documentos coinciden |
| **Alternativa** | Certum «Standard Code Signing in the Cloud» (Polonia), desde 209 €/año. Ver [Alternativa](#alternativa-certum) |

### Por qué esta opción

- **Azure Artifact Signing** (antes «Trusted Signing», de Microsoft) es lo más barato (9,99 US$/mes), pero **no está disponible para Venezuela**, ni para empresas ni para personas. Solo acepta organizaciones de EE. UU., Canadá, la UE, el Reino Unido y algunos países más, y personas de EE. UU. y Canadá ([Microsoft Learn](https://learn.microsoft.com/azure/artifact-signing/quickstart), actualizado el 08/10/2026).
- **SSL.com acepta clientes de Venezuela.** Sus países restringidos son Cuba, Irán, Corea del Norte y Siria ([ssl.com/country-codes](https://www.ssl.com/country-codes/)). Sectigo, en cambio, tiene a Venezuela en su lista restringida.
- **eSigner** firma desde la nube, sin llave USB, y **funciona sin intervención en GitHub Actions**. Es lo que necesita el flujo automático. Desde junio de 2023 todos los certificados de firma de código deben guardar la clave en hardware seguro, así que hoy solo hay dos opciones: llave USB o nube.
- **No compre un certificado EV pensando que elimina el aviso.** Desde 2024 Microsoft ya no da reputación inmediata a los certificados EV: tanto OV como EV empiezan con aviso hasta ganar reputación ([Microsoft Learn: SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)). EV cuesta más del doble y no aporta nada para este caso.

## 1. Antes de comprar: el nombre «FDP Software»

El certificado muestra **exactamente el nombre legal registrado**. La autoridad certificadora lo comprueba en un registro oficial y no acepta nombres comerciales que no estén registrados. Por eso:

- **Si FDP Software está inscrita en el Registro Mercantil** (firma personal o compañía) y tiene RIF, se pide un certificado **OV (organización)**. Windows mostrará el nombre tal como esté inscrito. Ojo: en Venezuela el nombre de una firma personal debe incluir el apellido del titular, así que puede salir algo como «FDP Software Pérez» en lugar de solo «FDP Software». Mire el acta de inscripción para saber el nombre exacto.
- **Si FDP Software no está inscrita**, solo se puede pedir un certificado **IV (individual)**, que cuesta lo mismo pero muestra **el nombre de la persona**, no «FDP Software». Si quiere que aparezca «FDP Software», primero tiene que inscribir la firma personal o la compañía.

Antes de pagar, escriba al soporte de SSL.com (chat en su página) con su caso: firma personal venezolana, nombre exacto inscrito, si aceptan documentos en español o piden traducción, y cómo quedará escrito el nombre en el certificado.

Cuando sepa el nombre exacto que tendrá el certificado, cámbielo en `instalador.iss` (`#define Editor "FDP Software"`), en las notas de versión de `.github/workflows/instalador-windows.yml` y en el `README.md`, para que todos digan lo mismo que la firma.

## 2. Documentos que le pedirán (OV)

SSL.com valida tres cosas: que la organización existe legalmente, su dirección física, y un teléfono que aparezca en un directorio independiente, al que luego llaman para verificar ([guía de SSL.com](https://www.ssl.com/guide/d-u-n-s-numbers-and-business-listings-for-code-signing-certificate-validation/)).

Prepare:

1. **Registro Mercantil**: acta de inscripción de la firma personal o documento constitutivo de la compañía, con sus últimas modificaciones.
2. **RIF** vigente.
3. **Cédula o pasaporte** del titular o representante legal. Para empresas con menos de 3 años piden documento de identidad con foto.
4. **Dirección física** y **teléfono** de la empresa, que deben coincidir en todos los documentos.
5. **Número D-U-N-S** (Dun & Bradstreet). No es obligatorio, pero es la fuente que SSL.com prefiere para confirmar dirección y teléfono. Se solicita gratis en [dnb.com](https://www.dnb.com/duns/get-a-duns.html) y tarda unas semanas: **pídalo primero**, con el mismo nombre, dirección y teléfono que el Registro Mercantil.
6. Si lo piden: **traducción** al inglés de los documentos. Pregunte antes si basta una traducción simple o si debe ser de intérprete público.

Durante la validación le llamarán al teléfono que figure en el directorio independiente (D-U-N-S u otro): tenga a alguien disponible.

## 3. Comprar y activar el certificado

1. Cree una cuenta en [ssl.com](https://www.ssl.com) y active la verificación en dos pasos de la cuenta.
2. Compre **OV Code Signing Certificate** (o **IV** si FDP Software no está inscrita) y elija la entrega **eSigner (cloud)**, no la llave USB.
3. Envíe los documentos y espere la validación.
4. Cuando esté validado, **inscriba el certificado en eSigner** desde el pedido en su cuenta. Al configurar el segundo factor, elija **aplicación de autenticación (OTP App)**. Aparecerá un código QR y un **«secret code»**: **cópielo y guárdelo en un lugar seguro**. Es el valor de `FIRMA_TOTP`. Escanee también el QR con su aplicación de autenticación, por si necesita firmar a mano.
5. Contrate la suscripción **eSigner Tier 1** (20 firmas al mes). Cada versión del instalador gasta **3 firmas** (WinSW, el desinstalador y el instalador), así que alcanza para unas 6 compilaciones firmadas al mes. Si se pasa, cada firma extra cuesta 1 US$.
6. Anote el **credential ID** del certificado. Aparece en el pedido, en la sección de eSigner. También puede obtenerlo con CodeSignTool en una PC con Windows (ver [Firmar en una PC](#firmar-en-una-pc-opcional)):
   ```powershell
   .\CodeSignTool.bat get_credential_ids -username=SU_USUARIO -password=SU_CLAVE
   ```

## 4. Cargar los secretos en GitHub

En GitHub, abra el repositorio `TAREAS` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, y cree estos cuatro:

| Secreto | Valor |
|---|---|
| `FIRMA_USUARIO` | Usuario de su cuenta de SSL.com |
| `FIRMA_CLAVE` | Contraseña de su cuenta de SSL.com |
| `FIRMA_CREDENCIAL` | Credential ID del certificado en eSigner |
| `FIRMA_TOTP` | El «secret code» del QR de eSigner (paso 3.4) |

Cuidados:

- Estos cuatro valores permiten firmar programas en nombre de FDP Software. **No los escriba en ningún archivo del repositorio** ni los envíe por chat o correo. GitHub los guarda cifrados y los oculta en los registros.
- Solo las personas con permiso de escritura en el repositorio pueden lanzar compilaciones firmadas. Mantenga ese grupo pequeño y con verificación en dos pasos en GitHub.
- Si cree que se filtraron, cambie la contraseña de SSL.com, vuelva a inscribir el segundo factor de eSigner (eso genera un secret code nuevo) y actualice los secretos.

## 5. Probar

1. En GitHub, vaya a **Actions** → **Instalador Windows** → **Run workflow**, sin marcar «Publicar».
2. Al terminar, abra la ejecución. En el resumen debe aparecer **«✅ Instalador firmado»**, con una tabla del firmante y el sello de tiempo de cada archivo y las sumas SHA-256. Si en cambio dice **«⚠️ Instalador sin firmar»**, ahí se indica el motivo (por ejemplo, qué secreto falta).
3. La prueba automática (trabajo «probar») instala el programa y comprueba que el instalador, el desinstalador (`unins000.exe`) y WinSW quedaron firmados con sello de tiempo.
4. Descargue el artefacto `instalador-windows`. Haga clic derecho sobre el `.exe` → **Propiedades** → **Firmas digitales**: debe aparecer el nombre del certificado y, en **Detalles**, «Esta firma digital es correcta».
5. Cuando todo esté bien, publique como siempre: con una etiqueta `vX.Y.Z` o con **Run workflow** marcando «Publicar». La versión incluye `SHA256SUMS.txt` y sus notas indican que está firmada.

Cuándo se firma:

- **Se firma** en las etiquetas `v*` y en las ejecuciones manuales (**Run workflow**), si están los cuatro secretos.
- **No se firma** en los pull requests: no hace falta y cada firma gasta cupo.
- Si faltan secretos, el flujo **no falla**: compila sin firmar y lo avisa en el resumen.

## 6. La reputación en SmartScreen

- Al principio, aunque esté firmado, SmartScreen puede seguir mostrando el aviso. Ahora el aviso dice **Editor: FDP Software** en lugar de «Desconocido». La reputación crece con las descargas e instalaciones sin problemas, y Microsoft indica que puede tomar **varias semanas**. No hay ningún formulario para acelerarla: el portal de envío de archivos de Microsoft sirve solo para reclamar falsos positivos de antivirus.
- La reputación se asocia al certificado. **Firme todas las versiones con el mismo certificado**, y al renovarlo use exactamente el mismo nombre y los mismos datos.
- Desde marzo de 2026 los certificados duran como máximo unos **15 meses (460 días)**: hay que renovarlos cada año. Los instaladores ya firmados **siguen siendo válidos después del vencimiento**, gracias al sello de tiempo que se pone al firmar (servidor RFC 3161 de SSL.com, `http://ts.ssl.com`).

## Qué hace el repositorio

| Archivo | Qué hace |
|---|---|
| `firmar.ps1` | Firma un archivo con CodeSignTool de SSL.com y comprueba que la firma sea válida y tenga sello de tiempo. Si CodeSignTool dice que firmó pero el archivo no está firmado, falla. |
| `instalador.iss` | Con `/DFirmar`, Inno Setup firma el instalador y el desinstalador llamando a `firmar.ps1`. Sin `/DFirmar` compila sin firmar, como antes. `AppPublisher` y la información de versión del `.exe` dicen «FDP Software». |
| `.github/workflows/instalador-windows.yml` | Decide si se firma, descarga CodeSignTool 1.3.2 y comprueba su SHA-256, firma WinSW, compila firmando, verifica con `signtool verify /pa` y `Get-AuthenticodeSignature`, genera `SHA256SUMS.txt` y lo publica junto al `.exe`. |
| `probar.ps1` | Con `-ExigirFirma`, comprueba las firmas del instalador, `unins000.exe` y `winsw.exe` ya instalados. |

Qué se firma y qué no:

- **Se firman** el instalador, el desinstalador y **WinSW**. WinSW se descarga sin firma y es el programa que Windows ejecuta como servicio, así que firmarlo ayuda con los antivirus y con el Control inteligente de aplicaciones de Windows 11.
- **No se firma `node.exe`**, porque ya viene firmado por OpenJS Foundation.
- **No se firman los binarios de PostgreSQL.** Casi todos vienen sin firma, pero son unos 190 archivos: cada uno gastaría una firma de eSigner, SmartScreen no los revisa (solo revisa el instalador descargado de internet), y firmarlos haría aparecer a FDP Software como autor de un programa ajeno.

Si sale una versión nueva de CodeSignTool, cambie `VERSION_CST` y `SHA256_CST` en el flujo. La suma se obtiene descargando el zip de [github.com/SSLcom/CodeSignTool/releases](https://github.com/SSLcom/CodeSignTool/releases) y ejecutando `Get-FileHash`.

## Firmar en una PC (opcional)

Para firmar a mano un `.exe` en Windows:

1. Descargue y descomprima CodeSignTool para Windows desde [github.com/SSLcom/CodeSignTool/releases](https://github.com/SSLcom/CodeSignTool/releases). Ya incluye Java.
2. En PowerShell:
   ```powershell
   $env:CODESIGNTOOL = 'C:\ruta\a\CodeSignTool'
   $env:FIRMA_USUARIO = '...'; $env:FIRMA_CLAVE = '...'; $env:FIRMA_CREDENCIAL = '...'; $env:FIRMA_TOTP = '...'
   .\firmar.ps1 .\salida\Instalador-LaCasaDelInyector-X.Y.Z.exe
   ```
   Para compilar el instalador ya firmado (instalador y desinstalador), con esas mismas variables:
   ```powershell
   ISCC.exe /DVersionApp=X.Y.Z /DFirmar "/Sfirma=powershell.exe -NoProfile -ExecutionPolicy Bypass -File `$q$PWD\firmar.ps1`$q `$f" instalador.iss
   ```
   Cierre la ventana de PowerShell al terminar, para no dejar la contraseña en memoria.

## Alternativa: Certum

[Certum «Standard Code Signing in the Cloud»](https://shop.certum.eu/code-signing.html) (Polonia) cuesta desde 209 € al año, menos que SSL.com con eSigner. Tiene dos inconvenientes:

- Su herramienta oficial, SimplySign Desktop, es interactiva y no está pensada para firmar sin intervención en GitHub Actions. Habría que usar una herramienta no oficial (`ssign`) o un equipo propio como runner, y adaptar `firmar.ps1`.
- No pude confirmar que acepten empresas venezolanas, ni qué traducciones exigen. Para documentos notariados piden traducción jurada al inglés o al polaco.

Si la elige, pregunte primero a Certum por esos dos puntos.

## Qué quedó probado y qué no

Probado sin certificado:

- La sintaxis del flujo y de los scripts.
- Que `firmar.ps1` pasa bien usuario, contraseña, credential ID, secreto TOTP y rutas con espacios, llamado igual que lo hace Inno Setup.
- Que `firmar.ps1` detecta un archivo devuelto sin firma.
- La decisión de firmar o no según el evento y los secretos.
- El formato de `SHA256SUMS.txt`.

**No probado**:

- La firma real con SSL.com: hace falta el certificado.
- La compilación con Inno Setup: no estaba instalado en el equipo donde se preparó.

La primera ejecución con los secretos cargados es la prueba definitiva: siga la sección [Probar](#5-probar).
