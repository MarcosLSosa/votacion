# Cómo probar el sistema

Hay dos baterías automatizadas sin dependencias de prueba adicionales: `curl`, `node` y Chrome. Corrélas con una base temporal y `NODE_ENV=test`; las pruebas escriben votos, auditoría y asistencia.

## Preparar un servidor aislado

En PowerShell:

```powershell
$env:NODE_ENV = 'test'
$env:VOTACION_TEST_PASSWORD = 'Prueba-segura-2026'
$env:VOTACION_DB = Join-Path $env:TEMP 'votacion-test.db'
$env:PORT = '3001'
npm start
```

`VOTACION_TEST_PASSWORD` debe coincidir con `CLAVE` si se especifica. No uses esta configuración en producción.

## 1. Rutas y API (`tests/smoke-api.sh`)

En otra terminal PowerShell:

```powershell
$env:APP_URL = 'http://localhost:3001'
$env:VOTACION_TEST_PASSWORD = 'Prueba-segura-2026'
& 'C:\Program Files\Git\bin\bash.exe' tests/smoke-api.sh
```

La batería comprueba las rutas públicas y protegidas, permisos por nivel, login/logout, endpoints, voto duplicado, check-in QR con y sin credenciales, rechazo de suplantación y duplicados, asignación de contraseñas (incluidos permisos de Administración e invalidación de sesiones previas), ausencia de hashes en respuestas API, configuración y auditoría. Devuelve `TODO OK: N verificaciones` con exit 0 o detalla los fallos con exit 1.

## 2. Flujo en navegador (`tests/navegador-cdp.mjs`)

Chrome se controla mediante DevTools Protocol; Node 22 o superior incluye `WebSocket`, por lo que no hace falta Puppeteer. Iniciá Chrome headless:

```powershell
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' --headless=new --remote-debugging-port=9222 --no-first-run --no-default-browser-check about:blank
```

En otra terminal:

```powershell
$env:APP_URL = 'http://localhost:3001'
$env:USUARIO = 'sofia'
$env:CLAVE = 'Prueba-segura-2026'
$env:ASISTENCIA = 'leo'
node tests/navegador-cdp.mjs
```

El flujo cubre login real e inválido, control de visibilidad de contraseña, las 15 páginas, configuración, asistencia QR autenticada, `/screen`, logout y errores de consola. Si el usuario indicado en `ASISTENCIA` ya registró presencia en esa sesión, elegí otro usuario sin marca. `USUARIO=raul` permite probar el camino de voto si aún no votó el proyecto activo.

## Resultado de verificación de esta revisión

- `smoke-api.sh`: **153 verificaciones aprobadas**.
- `navegador-cdp.mjs`: **51 verificaciones aprobadas**, incluidas las 15 páginas, check-in válido, visualización de `/screen` y cero errores de consola.
- Sintaxis: `node --check` en servidor, scripts del navegador y cliente; `bash -n` en `smoke-api.sh`.
- Migración de una base legada: sin `VOTACION_BOOTSTRAP_PASSWORD` el proceso rechaza el arranque sin modificar claves; con la variable, las 12 cuentas se convierten en hashes scrypt únicos, la clave heredada no autentica y la clave de bootstrap permite entrar a `sofia`.

## Notas

- No borres ni uses `data/votacion.db` para pruebas: las baterías modifican asistencia, votos, configuración y auditoría.
- Los tokens viven en memoria. Reiniciar el proceso cierra todas las sesiones.
- `VOTACION_DB` permite usar una base temporal alternativa; al actualizar una base con claves legadas, configurá `VOTACION_BOOTSTRAP_PASSWORD` antes de iniciar el servidor.
