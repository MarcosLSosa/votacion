# Cómo se probó el sistema

Hay dos baterías de pruebas, ambas sin dependencias nuevas (solo `curl`, `node` y Chrome).

## 1. Prueba de rutas y API (`tests/smoke-api.sh`)

Cubre 12 grupos: rutas públicas, las 15 páginas sin sesión (302 a `/login`), login real, las 15 páginas con sesión (200 + `nav-link active`), 16 endpoints de lectura, endpoints protegidos sin token (401), los mismos con token (200), votación (opción inválida 400, voto 200, voto duplicado 409), asistencia QR (código inválido 400, usuario inexistente 404), configuración (guardado 200 y clave no permitida 400), auditoría y logout (páginas vuelven a 302 y el token revocado da 401).

```bash
npm start &                      # o en otra terminal
bash tests/smoke-api.sh          # usa http://localhost:3000
APP_URL=http://localhost:3001 USUARIO=raul bash tests/smoke-api.sh
```

Sale `TODO OK: N verificaciones` con exit 0, o lista cada falla con exit 1.

## 2. Prueba en navegador (`tests/navegador-cdp.mjs`)

Usa Chrome real por DevTools Protocol (Node 22 ya trae `WebSocket` global, no hace falta `puppeteer`). Verifica que el HTML servido se enchufa con `public/app.js`: login real desde el formulario, recorrido por las 15 páginas midiendo KPIs, filas de tablas, chips, barras, badges y controles, guardado de configuración (restaurando el valor original), link de asistencia, check-in público y logout con bloqueo posterior. Detecta errores de consola y excepciones por página.

```bash
google-chrome --headless=new --remote-debugging-port=9222 --no-first-run --no-default-browser-check about:blank &
APP_URL=http://localhost:3001 node tests/navegador-cdp.mjs
```

Variables: `APP_URL`, `CDP_URL`, `USUARIO` (default `sofia`), `CLAVE`, `ASISTENCIA` (default `leo`, el usuario que marca presencia). El paso del voto se salta solo si el usuario ya votó el proyecto activo; para forzarlo usá `USUARIO=raul`, que es el único del seed sin voto.

## Resultado de la última corrida (29/09/2026, Node v22.22.1)

- `smoke-api.sh`: `TODO OK: 101 verificaciones` (exit 0), incluidas las 15 páginas sin sesión (302 a `/login`), las 15 con sesión (200 + nav activa + ids del template), el 401 de `/api/auditoria` y `/api/asistencia` sin token y el 401 tras `logout`.
- `navegador-cdp.mjs`: `TODO OK de 40 verificaciones` (exit 0), 15/15 páginas con datos reales y **cero errores de consola**. Ejemplos de lo que se levanta desde SQLite: Usuarios 12 filas + KPIs `12 / 11 / 11`; Concejales 12 filas con bloque y voto; Bloques 3 filas y 3 chips de miembros; Municipios 3 filas con participación; Sesiones 2 filas; Asistencia QR con código y marcas; Quórum `11 presentes / 1 ausente / se requiere 7 / Alcanzado`; Votaciones 12 KPIs + 3 tarjetas de detalle con 39 badges; Reportes 3/3/0 y `11 / 12`; Estadísticas `35 votos / 92% / 6 barras`; Configuración 8 controles; Auditoría con los eventos reales.
- Flujo de voto: con `raul` (el único sin voto) el resumen pasó de `negativo 2 / pendientes 1` a `negativo 3 / pendientes 0` y el mensaje quedó en `Ya emitiste tu voto: NEGATIVO`. Después se revirtió la prueba en la base para dejar el seed intacto.
- Flujo QR: código real `80D7AF7D`, link `/asistencia?codigo=…`, check-in de `marta` respondido `Listo, Marta Silva: tu presencia quedó registrada.` y el panel pasó de 1 a 2 marcas.
- Configuración: guardado 200 y mensaje `Configuración guardada.`; se restauró `duracion_votacion = 5`.

## Cosas a tener en cuenta al volver a probar

- `data/votacion.db` está gitignoreada; si la borrás, el servidor la recrea con el seed en el próximo arranque.
- Los tokens viven en memoria: si reiniciás el servidor, hay que volver a loguearse (y los tokens guardados en `localStorage` quedan invalidados, la app redirige a `/login`).
- Las pruebas escriben en la base (auditoría, asistencias, configuración, votos). `smoke-api.sh` restaura la duración de votación; el resto queda como rastro real, que es lo que se quiere ver en Auditoría.
