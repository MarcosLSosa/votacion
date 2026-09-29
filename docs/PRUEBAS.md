# Cómo se probó el sistema

Hay dos baterías de pruebas, ambas sin dependencias nuevas (solo `curl`, `node` y Chrome).

## 1. Prueba de rutas y API (`tests/smoke-api.sh`)

Cubre 12 grupos: rutas públicas, las 15 páginas sin sesión (302 a `/login`), login real + la marca de presencia que deja en `asistencias`, las 15 páginas con sesión (200 + `nav-link active`), 17 endpoints de lectura (incluido `GET /api/screen`, con `quorumAlcanzado`, `bloqueColor`, `presente` y `serverAt`), endpoints protegidos sin token (401), los mismos con token (200), votación (opción inválida 400, voto 200, voto duplicado 409), asistencia QR (código inválido 400, usuario inexistente 404), configuración (guardado 200 y clave no permitida 400), auditoría y logout (páginas vuelven a 302 y el token revocado da 401).

```bash
npm start &                      # o en otra terminal
bash tests/smoke-api.sh          # usa http://localhost:3000
APP_URL=http://localhost:3001 USUARIO=raul bash tests/smoke-api.sh
```

Sale `TODO OK: N verificaciones` con exit 0, o lista cada falla con exit 1.

## 2. Prueba en navegador (`tests/navegador-cdp.mjs`)

Usa Chrome real por DevTools Protocol (Node 22 ya trae `WebSocket` global, no hace falta `puppeteer`). Verifica que el HTML servido se enchufa con `public/app.js`: login real desde el formulario (y credenciales inválidas rechazadas), recorrido por las 15 páginas midiendo KPIs, filas de tablas, chips, barras, badges y controles, guardado de configuración (restaurando el valor original), link de asistencia, check-in público, la pantalla pública `/screen` y logout con bloqueo posterior. Detecta errores de consola y excepciones por página.

En `/screen` se chequean las 8 cosas que la hacen util en el recinto: una ficha por concejal (presentes + ausentes = cuerpo), el badge verde `PRESENTE`, que presentes/ausentes cubran el cuerpo, la dona con `conic-gradient` de los conteos, la barra de presencia y el voton global, las 4 tarjetas de conteo con números, el reloj en vivo en formato 24 h con el estado del quórum y cero errores de consola. Antes de salir vuelve al panel porque `/screen` es pública y no tiene botón de salida.

```bash
google-chrome --headless=new --remote-debugging-port=9222 --no-first-run --no-default-browser-check about:blank &
APP_URL=http://localhost:3001 node tests/navegador-cdp.mjs
```

Variables: `APP_URL`, `CDP_URL`, `USUARIO` (default `sofia`), `CLAVE`, `ASISTENCIA` (default `leo`, el usuario que marca presencia). El paso del voto se salta solo si el usuario ya votó el proyecto activo; para forzarlo usá `USUARIO=raul`, que es el único del seed sin voto.

## Resultado de la última corrida (29/09/2026 19:40, Node v22.22.1, Chrome headless)

Se corrió con base aislada (`VOTACION_DB=/tmp/votacion-test.db`, puerto 3199) para no tocar `data/votacion.db`.

- `smoke-api.sh`: `TODO OK: 107 verificaciones` (exit 0), incluidas las 15 páginas sin sesión (302 a `/login`), las 15 con sesión (200 + nav activa + ids del template), `GET /api/screen` con los campos nuevos y el 401 tras `logout`.
- `navegador-cdp.mjs` con `USUARIO=raul`: `TODO OK de 49 verificaciones` (exit 0), 15/15 páginas con datos reales, `/screen` en verde y **cero errores de consola**. El conteo es 49 cuando corre el paso del voto y 48 cuando se salta porque el usuario ya votó. Ejemplos de lo que se levanta desde SQLite: Usuarios 12 filas + KPIs; Concejales 12 filas con bloque y voto; Bloques 3 filas y 3 chips de miembros; Municipios 3 filas con participación; Sesiones 2 filas; Asistencia QR con código y marcas; Quórum 4 KPIs + 12 filas; Orden del día 3 filas con botones; Proyectos 3 filas + 3 controles de activación; Votaciones 12 KPIs + 3 tarjetas de detalle con 39 badges; Reportes 4 KPIs; Estadísticas 4 KPIs + 6 barras; Auditoría con los eventos reales; Configuración 8 controles.
- `/screen` con 12 concejales del seed: `fichas=12`, `presentes=10 / ausentes=2`, dona `conic-gradient(...)`, barra `83% · 10 PRESENTES`, tarjetas `cards=4 · 8/3/1/0`, quórum `QUÓRUM OK` y reloj `19:36:xx`.
- Flujo de voto: con `raul` (el único sin voto) el resumen pasó de `negativo 2 / pendientes 1` a `negativo 3 / pendientes 0` y el mensaje quedó en `Ya emitiste tu voto: NEGATIVO`. Al usar base aislada el seed queda intacto para volver a probar.
- Flujo QR: código real `CC211242`, link `/asistencia?codigo=…`, check-in de `leo` respondido `Listo, Leo Ramos: tu presencia quedó registrada.`
- Configuración: guardado 200 y mensaje `Configuración guardada.`; se restauró `duracion_votacion = 5`.
- Login invalidado: credenciales incorrectas muestran `Usuario o contraseña incorrectos.` y no dejan entrar; tras `logout` el token revocado vuelve a responder 401.

## Cosas a tener en cuenta al volver a probar

- `data/votacion.db` está gitignoreada; si la borrás, el servidor la recrea con el seed en el próximo arranque.
- `VOTACION_DB=/ruta/base.db npm start` levanta el servidor con otra base: útil para correr las pruebas sin ensuciar (ni revertir) la base de siempre. La carpeta se crea sola si no existe.
- Los tokens viven en memoria: si reiniciás el servidor, hay que volver a loguearse (y los tokens guardados en `localStorage` quedan invalidados, la app redirige a `/login`).
- Las pruebas escriben en la base (auditoría, asistencias, configuración, votos). `smoke-api.sh` restaura la duración de votación; el resto queda como rastro real, que es lo que se quiere ver en Auditoría.
- El reloj de `/screen` y `serverAt` se piden con `hour12: false` (`19:36:41`). Si alguien lo cambia a 12 h, el paso `reloj en vivo y quorum indicado` de `navegador-cdp.mjs` pasa a fallar porque `es-AR` agrega `p. m.`.

