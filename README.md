# Sistema de Votación — Concejo Deliberante

Panel de votación para un concejo deliberante: login de concejales, votación nominal en vivo, quórum, asistencia por código/QR, sesiones, proyectos, orden del día, reportes, estadísticas, auditoría y configuración. Incluye pantalla pública para proyectar en el recinto.

**Stack:** Node.js 22 + Express 4 + SQLite (`better-sqlite3`) + HTML/CSS/JS plano (sin framework, sin build, sin CSS procesado). El panel es **multipágina del lado del servidor**: cada módulo tiene su URL, el servidor arma el HTML desde plantillas y el JavaScript del navegador sólo carga y pinta los datos de la API.

## Requisitos y arranque

```bash
npm install          # express, cors, better-sqlite3
npm start            # http://localhost:3000
npm run dev          # mismo pero con node --watch
PORT=3001 npm start  # puerto alternativo
```

Requiere Node 22 o superior (`better-sqlite3` 13). La base `data/votacion.db` se crea sola al primer arranque y carga los datos demo; esa carpeta está gitignoreada, así que borrarla es la forma de resetear el sistema.

**Usuarios demo** (clave `1234` para todos): `sofia` (Presidenta), `juan`, `maria`, `carlos`, `ana`, `pedro`, `lucia`, `diego`, `marta`, `raul`, `patricia`, `leo`.

## Rutas

| URL | Qué es |
| --- | --- |
| `/login` | Ingreso de concejales (pública) |
| `/asistencia?codigo=…` | Marcado de presencia desde el celular (pública) |
| `/screen` | Pantalla pública de resultados (pública) |
| `/` | Redirige a `/dashboard` o a `/login` según la sesión |
| `/dashboard` | Votación en curso y botones de voto |
| `/usuarios` `/concejales` `/bloques` `/municipios` | Administración del cuerpo |
| `/sesiones` `/asistencia-qr` `/quorum` `/orden-del-dia` | Sesión y presencia |
| `/proyectos` `/votaciones` | Temas y detalle voto a voto |
| `/reportes` `/estadisticas` `/auditoria` | Cierres, métricas y bitácora |
| `/configuracion` | Parámetros del sistema |
| `/api/...` | API JSON (ver `docs/API.md`) |

Las 15 páginas del panel y varias APIs exigen sesión: una cookie `votacion_token` (HttpOnly, SameSite=Lax, 8 h) que coloca el login, o el header `x-auth-token` para pruebas. Sin sesión, las páginas redirigen a `/login` (302) y las APIs responden 401.

## Documentación

| Archivo | Contenido |
| --- | --- |
| `docs/API.md` | Referencia de todos los endpoints con ejemplos `curl` |
| `docs/ARQUITECTURA.md` | Capas, ciclo de una request, sesión, plantillas, datos, límites conocidos |
| `docs/MANUAL_DE_USO.md` | Guía módulo por módulo: votar, asistencia QR, pantalla pública, imprimir |
| `docs/PRUEBAS.md` | Cómo se probó, resultados de la última corrida y cómo volver a correrlo |

## Pruebas

```bash
npm start &
bash tests/smoke-api.sh                       # rutas, 302/401, API, voto, QR, config, logout
google-chrome --headless=new --remote-debugging-port=9222 about:blank &
node tests/navegador-cdp.mjs                  # login real, 15 páginas, sin errores de consola
```

`smoke-api.sh` hace 101 verificaciones con `curl`; `navegador-cdp.mjs` hace 40 sobre Chrome real por DevTools Protocol (Node 22 ya trae `WebSocket`, no hace falta puppeteer). Última corrida: ambas en verde y cero errores de consola en las 15 páginas.

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
