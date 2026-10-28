# La Casa del Inyector San Juan, C.A. — Sistema de gestión

Software de gestión de **La Casa del Inyector San Juan, C.A.**, ferretería pequeña o mediana en Venezuela, pensado para **instalarse en un servidor dentro de la tienda** y funcionar aunque falle internet.

Esta versión incluye las **fases 1 a 3** del plan: catálogo, precios en dos monedas, tasa BCV, inventario, punto de venta, caja y facturación por talonario.

| Módulo | Qué hace |
|---|---|
| Usuarios y roles | Administrador, gerente, almacén y cajero. El cajero no ve costos ni márgenes. |
| Tasa de cambio | Consulta automática de la tasa oficial del BCV (USD y EUR), carga manual cuando no hay internet e historial. |
| Productos | Código interno, descripción, categoría jerárquica, marca, ubicación, stock mínimo y máximo, IVA (general, reducida o exento). |
| Unidades y presentaciones | Venta por unidad, metro, kilo, litro o galón. Presentaciones como caja ×100 o rollo ×100 m, cada una con su código de barras. |
| Precios | Listas de precio (público, mayor, contratista). Cada precio va por margen sobre el costo o es fijo. Todo se muestra en **USD y Bs con IVA**. |
| Ajuste masivo | «El proveedor X subió 8 %»: se ajustan costos o precios por proveedor, marca o categoría, con vista previa. |
| Importación | Carga o actualización del catálogo desde Excel (.xlsx) o CSV, con revisión previa y reporte de errores por fila. |
| Proveedores | Ficha con RIF validado (dígito verificador del SENIAT) y códigos y costos por producto. |
| Búsqueda | Por palabras, sin importar acentos, por código o código de barras, y tolerante a errores de tipeo («tornilo»). |
| Inventario | Existencia por producto y kardex de cada movimiento (nunca se modifica). Ajustes de entrada, salida y merma con motivo, conteo físico con lector de código de barras, alertas de productos bajo el mínimo o sin existencia y valor del inventario al costo. La existencia inicial se puede cargar desde Excel. |
| Punto de venta | Venta con lector de código de barras, por unidad o presentación y con lista de precios. Factura en Bs a la tasa BCV, IVA por alícuota, pagos mixtos (efectivo Bs y USD, pago móvil, transferencia, punto de venta, Zelle, Binance) y vuelto en Bs o USD. Si la empresa es contribuyente especial suma el IGTF (3 %) sobre lo pagado en divisas. Descuenta el inventario. |
| Facturación por talonario | Registro de los talonarios de la imprenta: el sistema asigna cada número de factura y de control en orden, sin saltos. Hojas dañadas se anulan con motivo. Resumen imprimible para copiar la factura. Sin talonario disponible no se puede vender. |
| Caja | Apertura con fondo en Bs y USD, retiros, gastos e ingresos de efectivo, y cierre con arqueo por método de pago (esperado, contado y diferencia). Anulación de ventas mientras la caja sigue abierta. |
| Clientes | Cédula o RIF validado, nombre o razón social y dirección fiscal; sin cliente la factura sale a «Consumidor final». |
| Respaldos | Copia diaria automática de la base de datos y script de restauración. |

## Arquitectura

```
 Navegadores en la red local (cajas, oficina, tablet)
                 │  http://IP-DEL-SERVIDOR
   ┌─────────────▼──────────────────────────────────┐
   │ Servidor local (Docker Compose)                │
   │  web       nginx + aplicación React            │
   │  api       NestJS (Node 22)  ── /api/docs      │
   │  db        PostgreSQL 16 (volumen persistente) │
   │  respaldo  pg_dump diario → ./respaldos        │
   └────────────────────────────────────────────────┘
                 │ solo para la tasa BCV
              Internet
```

- **Dinero exacto.** Ningún monto usa coma flotante: se guardan como `numeric` en PostgreSQL y se calculan con `decimal.js`.
- **Moneda base USD.** Costos y precios se guardan en USD. El precio en Bs se calcula con la tasa vigente y el redondeo configurado.
- **Tasa por fecha valor.** Rige la tasa con la fecha valor más reciente que no sea posterior a hoy. Las tasas nunca se modifican: una corrección es un registro nuevo.
- **Esquema por migraciones.** La base de datos se actualiza sola al iniciar la API, con migraciones revisadas y versionadas.

## Instalación en Windows con el instalador (.exe)

Es la forma más sencilla: un solo archivo instala todo. Incluye la base de datos PostgreSQL, la aplicación, los respaldos diarios y el acceso desde la red. No necesita Docker ni internet para funcionar.

1. Descargue `Instalador-LaCasaDelInyector-X.Y.Z.exe` desde la página **Releases** del repositorio. Junto a él está `SHA256SUMS.txt`, para comprobar que el archivo llegó completo y sin cambios (ver [Verificar el instalador](#verificar-el-instalador)).
2. Ejecútelo en la computadora que será el servidor de la tienda (Windows 10 u 11 de 64 bits). Pedirá permiso de administrador.
   - Las versiones firmadas digitalmente (lo indica la página de la versión) muestran en la ventana de permiso de administrador **Editor comprobado: FDP Software**. Si dice «Editor: Desconocido», **no lo ejecute** y descárguelo otra vez desde Releases.
   - En las primeras semanas con un certificado nuevo, Windows todavía puede mostrar «Windows protegió su PC» mientras el instalador gana reputación. Pulse **Más información** y continúe con **Ejecutar de todas formas** solo si allí aparece «Editor: FDP Software».
   - Las versiones anteriores a la firma, y las que la página de la versión indique «sin firmar», muestran siempre ese aviso con «Editor: Desconocido»; en ese caso compruebe el SHA-256 antes de ejecutarlo.
3. Al terminar, el asistente muestra:
   - la dirección para entrar desde las demás computadoras, por ejemplo `http://192.168.1.50/`;
   - el usuario `admin` y su **clave inicial**. Anótela y cámbiela al entrar.
4. En el escritorio queda el acceso directo **La Casa del Inyector**.

| Qué | Dónde |
|---|---|
| Programa | `C:\Program Files\LaCasaDelInyector` |
| Datos, respaldos y registros | `C:\ProgramData\LaCasaDelInyector` |
| Servicios de Windows | `LCI-BaseDatos` y `LCI-API`, con inicio automático |
| Respaldo diario | Tarea programada a las 23:00. Si el equipo estaba apagado, se hace al encenderlo. |

- En el menú Inicio, bajo **La Casa del Inyector**, están la carpeta de respaldos, **Restaurar un respaldo** y los registros de diagnóstico, además de:
  - **Copia de respaldos fuera del equipo:** elija un disco externo, un pendrive o una carpeta de OneDrive o Google Drive. Cada respaldo se copia también allí, y se conservan los mismos días que en el servidor. Si el disco no está conectado a la hora del respaldo, solo se omite la copia de ese día y queda un aviso en `respaldos.log`.
  - **Restablecer clave del administrador:** si se pierde la clave del usuario `admin`, genera una nueva y la muestra en pantalla. Pide permiso de administrador de Windows.
- **Actualizar:** ejecute el `.exe` de la nueva versión. Antes de actualizar se hace un respaldo automático y los datos se conservan.
- **Desinstalar:** desde «Agregar o quitar programas». Los datos se conservan, y si vuelve a instalar se recuperan.
- Mantenga ese equipo encendido mientras la tienda trabaje. Configure Windows para que **no entre en suspensión**.

El instalador se compila y se prueba automáticamente en un Windows real con GitHub Actions (`.github/workflows/instalador-windows.yml`). Para publicar una versión nueva en Releases, cree una etiqueta `vX.Y.Z` o ejecute el flujo manualmente con «Publicar». La firma digital se hace en ese mismo flujo; qué certificado hace falta y cómo configurarlo está en [`instalador-windows/FIRMA.md`](instalador-windows/FIRMA.md).

### Verificar el instalador

**Firma digital.** Clic derecho sobre el `.exe` → **Propiedades** → pestaña **Firmas digitales**: debe aparecer *FDP Software* y, en **Detalles**, «Esta firma digital es correcta». O en PowerShell:

```powershell
Get-AuthenticodeSignature .\Instalador-LaCasaDelInyector-X.Y.Z.exe | Format-List Status, SignerCertificate, TimeStamperCertificate
```

`Status` debe ser `Valid` y el firmante debe ser `FDP Software` (en `SignerCertificate`, campo `CN=` u `O=`). Si la pestaña no existe o el estado es otro, el archivo no está firmado o fue modificado: no lo ejecute.

**Suma SHA-256.** Compare la suma del archivo descargado con la línea correspondiente de `SHA256SUMS.txt` de la misma versión:

```powershell
(Get-FileHash .\Instalador-LaCasaDelInyector-X.Y.Z.exe -Algorithm SHA256).Hash
Get-Content .\SHA256SUMS.txt
```

Las dos sumas deben ser iguales (sin importar mayúsculas y minúsculas).

## Instalación en un servidor Linux con Docker

### Equipo recomendado

- Un mini PC con 8 a 16 GB de RAM y un disco SSD, conectado a un **UPS**.
- Sistema operativo: Ubuntu Server 24.04 LTS.
- Red local cableada hacia las cajas.
- Un disco externo o una carpeta en otro equipo para copiar los respaldos.

### Pasos

1. Instale Docker en el servidor (siga la guía oficial de Docker Engine para Ubuntu).

2. Copie el proyecto al servidor y entre en la carpeta `ferreteria/`.

3. Cree el archivo de configuración:
   ```bash
   cp .env.example .env
   ```

4. Edite `.env` y cambie al menos `DB_CLAVE` y `JWT_SECRETO`. Para generar valores aleatorios:
   ```bash
   openssl rand -base64 48
   ```

5. Construya y levante el sistema:
   ```bash
   docker compose up -d --build
   ```

6. Abra `http://IP-DEL-SERVIDOR` desde cualquier equipo de la red. Si dejó `ADMIN_CLAVE_INICIAL` vacía, la clave temporal del usuario `admin` aparece en:
   ```bash
   docker compose logs api | grep "clave temporal"
   ```

7. Ingrese, **cambie la clave** (icono de llave, arriba a la derecha) y complete **Configuración**: razón social, RIF, alícuotas y redondeo.

Si los equipos de la red no abren la página, revise el cortafuegos del servidor y permita el puerto 80, o el que haya indicado en `PUERTO_WEB`.

### Primeros datos

1. En **Tasa de cambio**, pulse «Consultar BCV» o cargue la tasa manualmente.
2. En **Importar catálogo**, descargue la plantilla, llénela con sus productos, pulse «Revisar» y luego «Importar».
3. Cree los usuarios en **Usuarios**, con un usuario por persona.

### Actualizar a una nueva versión

```bash
git pull
```

```bash
docker compose up -d --build
```

Las migraciones de base de datos se aplican solas al reiniciar la API. Antes de actualizar, conviene hacer un respaldo manual (ver abajo).

## Respaldos

- El servicio `respaldo` hace una copia al arrancar y otra diaria a la hora `RESPALDO_HORA`.
- Las copias se guardan en `ferreteria/respaldos/` y se conservan `RESPALDO_DIAS` días.
- **Copie esa carpeta a otro equipo o disco con regularidad.** Un respaldo en el mismo servidor no protege contra robo o daño del equipo.

Para hacer un respaldo manual ahora:

```bash
docker compose restart respaldo
```

Para restaurar un respaldo (reemplaza **todos** los datos actuales):

```bash
./scripts/restaurar.sh respaldos/ferreteria-AAAAMMDD-HHMMSS.dump
```

## Tasa del BCV

- La API consulta `https://www.bcv.org.ve/` cada 2 horas, de 8:00 a 20:00, hora de Venezuela.
- Si la lectura difiere más de 50 % de la tasa vigente, se descarta por seguridad y queda registrada en el log.
- Sin internet, el gerente puede cargar la tasa a mano en **Tasa de cambio**.
- Si la consulta falla, el log de la API indica el motivo, por ejemplo «no se encontró el servidor (¿hay internet?) (ENOTFOUND)».
- **Certificado del BCV.** El sitio del BCV a veces envía su certificado sin la cadena intermedia (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). La API lo resuelve sola, igual que los navegadores: descarga el certificado intermedio desde la dirección «CA Issuers» del propio certificado. Solo lo acepta si es el que firmó el certificado del BCV, y la cadena completa debe llegar a una autoridad raíz de confianza. No se desactiva la verificación TLS.

  Si en algún momento esa descarga tampoco funciona (por ejemplo, porque la red bloquea `crt.sectigo.com`), puede darle el intermedio a mano:
  1. Descargue el certificado intermedio de la autoridad que firmó el del BCV.
  2. Guárdelo como `certificados/bcv.pem`.
  3. Descomente `NODE_EXTRA_CA_CERTS=/certificados/bcv.pem` en `.env`.
  4. Reinicie con `docker compose up -d`.

## Roles y permisos

| Acción | Admin | Gerente | Almacén | Cajero |
|---|:-:|:-:|:-:|:-:|
| Consultar productos y precios | ✓ | ✓ | ✓ | ✓ |
| Ver costos y márgenes | ✓ | ✓ | ✓ | — |
| Crear y editar productos, categorías, marcas y proveedores | ✓ | ✓ | ✓ | — |
| Modificar costos y precios, ajuste masivo, importación | ✓ | ✓ | — | — |
| Consultar existencias y kardex | ✓ | ✓ | ✓ | ✓ (sin costos) |
| Ajustes de inventario y conteo físico | ✓ | ✓ | ✓ | — |
| Vender, abrir y cerrar su caja, anular sus ventas (con la caja abierta) | ✓ | ✓ | — | ✓ |
| Ver todas las ventas y el historial de cajas | ✓ | ✓ | — | — (solo las suyas) |
| Registrar o retirar talonarios | ✓ | ✓ | — | — |
| Cargar o consultar la tasa BCV | ✓ | ✓ | — | — |
| Usuarios y configuración | ✓ | — | — | — |

Tras 5 claves incorrectas, el usuario queda bloqueado 5 minutos.

## Desarrollo

Requisitos: Node 22 y PostgreSQL 16.

```bash
cd backend
```

```bash
npm install
```

```bash
DB_HOST=localhost DB_USUARIO=ferreteria DB_CLAVE=ferreteria DB_NOMBRE=ferreteria npm run start:dev
```

En otra terminal:

```bash
cd frontend
```

```bash
npm install
```

```bash
npm run dev
```

El frontend queda en `http://localhost:5173` y reenvía `/api` a `http://localhost:3000`. La documentación interactiva de la API está en `http://localhost:3000/api/docs`.

### Pruebas

```bash
cd backend
```

```bash
npm test
```

Las pruebas de integración levantan la API completa contra una base PostgreSQL **que se borra**. Use una base dedicada:

```bash
DB_NOMBRE_PRUEBAS=ferreteria_test npm run test:e2e
```

### Cambios en la base de datos

1. Modifique las entidades en `backend/src/**/*.entity.ts`.
2. Genere la migración y revísela antes de confirmarla:
   ```bash
   npm run migracion:generar -- src/base-datos/migraciones/NombreDelCambio
   ```

## Próximas fases

1. **Módulo fiscal:** notas de crédito y débito, libros de ventas y de compras, retenciones de IVA y, si el negocio migra, imprenta digital; según lo que defina el contador.
2. **Compras, crédito a clientes y reportes.**
