# Cómo probar el sistema

Hay dos baterías automatizadas sin dependencias de prueba adicionales: `curl`, `node` y Chrome. Corrélas con una base temporal y `NODE_ENV=test`; las pruebas escriben votos, auditoría y asistencia.

## Preparar un servidor aislado

En PowerShell, inicia la API con una base temporal exclusiva para esta ejecución:

```powershell
$env:NODE_ENV = 'test'
$env:VOTACION_TEST_PASSWORD = 'Prueba-segura-2026'
$env:VOTACION_DB = Join-Path $env:TEMP 'votacion-api-test-unica.db'
$env:PORT = '3001'
npm start
```

`VOTACION_TEST_PASSWORD` fija las claves iniciales de las cuentas de prueba. La suite requiere `VOTACION_DB` para no modificar la base de datos de uso; usa un nombre nuevo si repetís la ejecución. No uses estas variables en producción.

## 1. Rutas y API (`tests/smoke-api.sh`)

En otra terminal PowerShell:

```powershell
$env:APP_URL = 'http://localhost:3001'
$env:VOTACION_TEST_PASSWORD = 'Prueba-segura-2026'
$env:VOTACION_DB = Join-Path $env:TEMP 'votacion-api-test-unica.db'
& 'C:\Program Files\Git\bin\bash.exe' tests/smoke-api.sh
```

La batería comprueba rutas públicas/protegidas, permisos por nivel, login/logout, CSRF y origen, APIs restringidas, alta/duplicados de bloques, usuarios, sesiones y proyectos, propagación de proyectos al orden del día y activación, voto duplicado, check-in QR con y sin credenciales, rate limiting, asignación de contraseñas e invalidación de sesiones, ausencia de hashes en respuestas, QR PNG, exportaciones, configuración, auditoría y cierre al vencer el plazo. Devuelve `TODO OK: N verificaciones` con exit 0 o detalla los fallos con exit 1.

## 2. Flujo en navegador (`tests/navegador-cdp.mjs`)

Chrome se controla mediante DevTools Protocol; Node 22 o superior incluye `WebSocket`, por lo que no hace falta Puppeteer. Esta suite modifica votos, configuración y asistencia; iniciá otro servidor en una terminal con una base temporal diferente:

```powershell
$env:NODE_ENV = 'test'
$env:VOTACION_TEST_PASSWORD = 'Prueba-segura-2026'
$env:VOTACION_DB = Join-Path $env:TEMP 'votacion-browser-test-unica.db'
$env:PORT = '3002'
npm start
```

Usar bases separadas evita que el test de rate limiting, los votos o las marcas de asistencia de la API contaminen el recorrido de navegador. Usa un nombre nuevo para repetirlo. Iniciá Chrome headless:

```powershell
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' --headless=new --remote-debugging-port=9222 --no-first-run --no-default-browser-check about:blank
```

En otra terminal:

```powershell
$env:APP_URL = 'http://localhost:3002'
$env:CDP_URL = 'http://127.0.0.1:9222'
$env:USUARIO = 'sofia'
$env:CLAVE = 'Prueba-segura-2026'
$env:ASISTENCIA = 'leo'
node tests/navegador-cdp.mjs
```

El flujo cubre login real e inválido, control de visibilidad de contraseña, las 15 páginas, configuración, asistencia QR autenticada, imagen QR, `/screen`, almacenamiento seguro de sesión, logout y errores de consola. Si el usuario indicado en `ASISTENCIA` ya registró presencia en esa sesión, elegí otro usuario sin marca. `USUARIO=raul` permite probar el camino de voto si aún no votó el proyecto activo. Para una inspección manual empezando sin datos ficticios, usá `VOTACION_EMPTY_START=1` según el README; este script CDP estándar espera la semilla completa.

## Notas

- No borres ni uses `data/votacion.db` para pruebas: las baterías modifican asistencia, votos, configuración y auditoría.
- `VOTACION_DB` permite usar una base temporal alternativa; al actualizar una base con claves legadas, configurá `VOTACION_BOOTSTRAP_PASSWORD` antes de iniciar el servidor.
- La suite de API establece el plazo de votación directamente en SQLite y puede alterar su base, razón por la que rechaza ejecutarse sin `VOTACION_DB`.
- El ejercicio de rate limiting puede bloquear temporalmente la IP local de pruebas para login/check-in; cada límite usa su ámbito y ventana de 15 minutos.
- Documentá aquí los resultados concretos de cada ejecución de validación previa a una versión, sin reutilizar los números de una ejecución anterior.

## Verificación de endurecimiento para producción (2026-10-02)

- API: **170/170 verificaciones** aprobadas con una base temporal aislada; incluye APIs privadas, CSRF, rechazo de origen ajeno incluso si se envía `x-auth-token`, check-in con cookie, rate limiting, exportaciones, QR y vencimiento de votación.
- Navegador: **53/53 verificaciones** aprobadas con otra base aislada; incluye las 15 vistas, cookie HttpOnly, CSRF, asistencia pública y carga de QR de 480 px, `/screen` y consola sin errores.
- Sesiones: comprobado mediante reinicio real del proceso que la sesión SQLite sigue válida; también se verificó rechazo HTTP 401 al forzar 30 minutos de inactividad y el vencimiento absoluto.
- Modo producción: comprobado que una base vacía hace fallar el arranque sin crear cuentas de ejemplo; al iniciar con una base previamente provisionada para la prueba, se verificó HTTP 426 sin TLS confiable, respuesta HTTPS reenviada 200 con HSTS y cookie de login `Secure`.
- Dependencias: `npm audit` devuelve **0 vulnerabilidades** tras actualizar dependencias compatibles en el lockfile.
- Sintaxis/espacios: `node --check` en servidor, JS de cliente y script CDP; `bash -n tests/smoke-api.sh`; `git diff --check`, sin errores.

Estas pruebas validan el comportamiento del software, no un despliegue real. Siguen pendientes la selección/configuración del hosting, DNS y certificado reales, política de logs y backups del organismo, y la provisión verificada de datos oficiales y contraseñas antes del primer arranque productivo.
