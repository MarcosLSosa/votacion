# Sistema de Votación — Concejo Deliberante

Panel de votación para un concejo deliberante: login de concejales, votación nominal en vivo, quórum, asistencia por código/QR, sesiones, proyectos, orden del día, reportes, estadísticas, auditoría y configuración. Incluye pantalla pública para proyectar en el recinto.

**Stack:** Node.js 22 + Express 4 + SQLite (`better-sqlite3`) + HTML/CSS/JS plano (sin framework, sin build, sin CSS procesado). El panel es **multipágina del lado del servidor**: cada módulo tiene su URL, el servidor arma el HTML desde plantillas y el JavaScript del navegador sólo carga y pinta los datos de la API.

## Requisitos y arranque

```bash
npm install          # express, cors, better-sqlite3
PORT=3001 npm start  # puerto alternativo
```

Requiere Node 22 o superior (`better-sqlite3` 13). La base `data/votacion.db` se crea sola al primer arranque y carga datos ficticios de desarrollo; esa carpeta está gitignoreada, así que borrarla es la forma de resetear el sistema. Con `VOTACION_DB=/ruta/base.db npm start` se usa otra base (útil para pruebas y demos sin tocar la de siempre). **No expongas la instancia con datos demo a una red o entorno real.**

Antes del primer arranque, configurá una contraseña robusta para la cuenta administrativa inicial `sofia` (mínimo 12 caracteres):

```powershell
$env:VOTACION_BOOTSTRAP_PASSWORD = 'una-frase-larga-y-unica'
npm start
```

Las contraseñas se almacenan con scrypt y sal individual. Las demás cuentas creadas desde la semilla reciben claves aleatorias no reveladas; después de ingresar como `sofia`, asignales credenciales individuales desde **Usuarios → Cambiar clave**. Al actualizar una base antigua, configurá `VOTACION_BOOTSTRAP_PASSWORD` **antes** del primer arranque: las claves planas anteriores se rotan, la cuenta `sofia` recibe esa clave y las otras cuentas reciben claves aleatorias.

Para pruebas automatizadas se puede usar una base aislada y una clave compartida sólo en modo test:

```powershell
$env:NODE_ENV = 'test'
$env:VOTACION_TEST_PASSWORD = 'Prueba-segura-2026'
$env:VOTACION_DB = "$env:TEMP\votacion-test.db"
npm start
```

No uses `NODE_ENV=test` ni `VOTACION_TEST_PASSWORD` fuera de pruebas. En producción, ejecutá detrás de HTTPS con `NODE_ENV=production`; la cookie de sesión entonces lleva `Secure`.

## Rutas

| URL | Qué es |
| --- | --- |
| `/login` | Ingreso de concejales (pública) |
| `/asistencia?codigo=…` | Marcado de presencia desde el celular (pública) |
| `/screen` | Pantalla pública para proyectar: resultado, conteos y presencia (pública, alimenta `GET /api/screen`) |
| `/` | Redirige a `/dashboard` o a `/login` según la sesión |
| `/dashboard` | Votación en curso y botones de voto |
| `/usuarios` `/concejales` `/bloques` `/municipios` | Administración del cuerpo |
| `/sesiones` `/asistencia-qr` `/quorum` `/orden-del-dia` | Sesión y presencia |
| `/proyectos` `/votaciones` | Temas y detalle voto a voto |
| `/reportes` `/estadisticas` `/auditoria` | Cierres, métricas y bitácora |
| `/configuracion` | Parámetros del sistema |
| `/api/...` | API JSON (ver `docs/API.md`) |

Las 15 páginas del panel y varias APIs exigen sesión: una cookie `votacion_token` (HttpOnly, SameSite=Lax, 8 h) que coloca el login, o el header `x-auth-token` para pruebas. Sin sesión, las páginas redirigen a `/login` (302) y las APIs responden 401.

El perfil de concejal sólo muestra y permite abrir **Votación en curso, Orden del Día, Quórum y Votaciones**. Las vistas de consulta ampliada y gestión se reservan para Mesa o Administración; Usuarios y Configuración son exclusivas de Administración.

## Documentación

| Archivo | Contenido |
| --- | --- |
| `docs/API.md` | Referencia de todos los endpoints con ejemplos `curl` |
| `docs/ARQUITECTURA.md` | Capas, ciclo de una request, sesión, plantillas, datos, límites conocidos |
| `docs/MANUAL_DE_USO.md` | Guía módulo por módulo: votar, asistencia QR, pantalla pública, imprimir |
| `docs/PRUEBAS.md` | Cómo se probó, resultados de la última corrida y cómo volver a correrlo |

## Pruebas

```bash
NODE_ENV=test VOTACION_TEST_PASSWORD=Prueba-segura-2026 VOTACION_DB=/tmp/votacion-test.db npm start &
bash tests/smoke-api.sh                       # rutas, 302/401, API, voto, QR, config, logout
google-chrome --headless=new --remote-debugging-port=9222 about:blank &
node tests/navegador-cdp.mjs                  # login real, 15 páginas, sin errores de consola
```

`smoke-api.sh` verifica rutas, roles, credenciales y asistencia con `curl`; `navegador-cdp.mjs` comprueba los flujos en Chrome por DevTools Protocol (Node 22 ya trae `WebSocket`, no hace falta puppeteer). Usá una base aislada en pruebas para no tocar `data/votacion.db`.

```bash
VOTACION_DB=/tmp/votacion-test.db PORT=3199 npm start &
APP_URL=http://localhost:3199 bash tests/smoke-api.sh
```

## Estructura

```
server.js                 servidor: tablas, seed, APIs, sesión, plantillas
public/
  layout.html             shell (sidebar + top bar) con placeholders {{NAV}} {{CONTENIDO}}…
  vistas/*.html           15 vistas, una por módulo
  app.js                  un cargador por página + mapa CARGADORES por data-page
  login.html/js           ingreso
  asistencia.html/js      marcado de presencia público
  screen.html/js/css      pantalla pública
  styles.css              design system del panel (tema oscuro, tablas, KPIs, print)
data/votacion.db          SQLite (gitignored)
tests/                    smoke de API + prueba de navegador por CDP
docs/                     API, arquitectura, manual de uso y pruebas
```

## Estado y próximos pasos

Funciona de punta a punta en local: login, votación nominal única, quórum, asistencia por código con autogeneración por sesión, activación de proyectos y sesiones, configuración persistida y auditoría de todo. Lo que falta para producción está listado en `docs/ARQUITECTURA.md` (contraseñas con hash, roles, CSRF, APIs de lectura cerradas, sesiones persistentes, timer de votación, imagen QR y exportaciones).
