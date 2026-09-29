# Arquitectura

## Stack y decisiones

| Capa | Elección | Por qué |
| --- | --- | --- |
| Runtime | Node.js 22 + Express 4 | una sola dependencia de servidor, cero build |
| Datos | SQLite embebida (`better-sqlite3`) | cero servicios externos, archivo `data/votacion.db` |
| Páginas | HTML servido desde el servidor con placeholders | URL por módulo, sin SPA ni router en el cliente |
| Cliente | `public/app.js` + `fetch` | cada página carga sólo los datos que necesita |
| CSS | `public/styles.css`, clases en español | un único design system para las 15 vistas |
| Pruebas | `curl` + Chrome por DevTools Protocol | verifican el HTML servido y el JS ejecutado sin agregar dependencias |

No hay framework de frontend ni bundler: el JS se sirve tal cual y el CSS tampoco se procesa.

## Estructura de `server.js`

```
declaración de tablas (CREATE TABLE IF NOT EXISTS)
rowToCouncillor / rowToProject / rowToSession / rowToOrderItem   ← mapean fila SQLite a objeto de API
getAll* / get*ById / update*                                     ← única capa que toca SQL
seedDatabase()                                                   ← datos demo sólo si la base está vacía
sesión: tokens (Map), createToken, readCookies, tokenFrom, authMiddleware
audit(usuario, accion, detalle)                                  ← escribe en la tabla auditoria
getConfig / setConfig                                            ← clave/valor
getActiveProject / computeCounts / getSessionOverview / getActiveSession
rutas /api/*
VISTAS + renderPagina + paginaProtegida                          ← panel multipágina
rutas de páginas y app.get('*')
```

## Ciclo de una request

1. `express.static('public')` resuelve `/styles.css`, `/app.js`, `/login.html`, etc.
2. Si la URL es `/login`, `/asistencia`, `/screen` o `/`, se responde con `sendFile` o un redirect.
3. Si es una de las 15 URLs del panel (`/dashboard`, `/usuarios`, …), `paginaProtegida` chequea el token: sin token válido → `302 /login`; con token → `renderPagina`.
4. `renderPagina` arma el HTML: toma `public/layout.html`, genera la navegación con `VISTAS` y reemplaza `{{NAV}}`, `{{TITULO}}`, `{{PAGE}}`, `{{CABECERA}}`, `{{DESCRIPCION}}` y `{{CONTENIDO}}` (que es `public/vistas/<clave>.html`).
5. El HTML llega con `data-page="clave"` en el `<body>`. `app.js` lee ese atributo, busca el cargador en `CARGADORES` y pide la API; cada 5 s vuelve a correr el cargador de la página para mantener los números vivos.
6. Las rutas `/api/*` responden JSON puro.

## Autenticación y autorización

- `POST /api/auth/login` valida `username`/`password` contra `councillors`, marca `connected = true`, genera un token aleatorio (`crypto.randomBytes(16)`) y lo guarda en un `Map` en memoria junto al objeto del concejal.
- El navegador recibe `Set-Cookie: votacion_token=…; HttpOnly; SameSite=Lax; Max-Age=28800`. El frontend además guarda `votacion:token` y `votacion:user` en `localStorage` para reconstruir el perfil tras un refresh.
- `tokenFrom(req)` acepta el header `x-auth-token` (para pruebas y clientes alternativos) o la cookie. `authMiddleware` responde **401 JSON** en las APIs y `paginaProtegida` responde **302 a `/login`** en las páginas: una API no debe devolver HTML y una navegación no debe mostrar un 401 crudo.
- `POST /api/auth/logout` borra el token (invalidación inmediata, también para el header) y limpia la cookie con `Max-Age=0`.
- `publicUser(user)` es la proyección sin contraseña que sale por la API; incluye `voted`/`vote` sobre el proyecto activo.

## Render de plantillas

`renderPagina` usa `.replace(clave, () => valor)` (con **función** de reemplazo) a propósito: con reemplazo de string, un contenido que incluya `$&`, `$1` o `$'` sería interpretado por `String.replace` y corrompería el HTML. El `Map` `cacheVistas` evita releer el disco en cada request (se vacía reiniciando el proceso).

## Capa de datos

| Tabla | Uso |
| --- | --- |
| `councillors` | concejales + `username`/`password` + `connected` + `votes` (JSON `{projectId: opción}`) + `bloque_id` |
| `projects` | proyectos/ordenanzas; `counts` guarda un JSON con los contadores |
| `sessions` | sesiones con `quorumRequired`, `projectCount` y `active` |
| `order_of_day` | puntos del orden del día |
| `bloques` / `municipios` | catálogos del cuerpo y del distrito |
| `asistencias` | marcas de presencia (`sesion_id`, `concejal_id`, `codigo`, `metodo`, `creado_en`) |
| `configuracion` | clave/valor: `municipio_sede`, `mayoria`, `duracion_votacion`, `pantalla_publica`, `notificaciones`, `qr_codigo`, `qr_sesion` |
| `auditoria` | bitácora de acciones |

Cosas a saber:

- Los conteos **se acumulan** en `projects.counts` cuando alguien vota y `computeCounts` sólo agrega `pendientes = totalCouncillors - emitidos`. Si se editan votos a mano en la base, hay que ajustar `counts` a mano.
- `activeProjectId` vive en memoria: el proyecto «en votación» vuelve al default (`1`) al reiniciar, aunque `sessions.active` sí persiste.
- El código de asistencia se autogenera y queda atado a la sesión activa (`qr_codigo` + `qr_sesion`); si cambia la sesión se emite un código nuevo y los links viejos dejan de servir.
- El seed (`seedDatabase`) sólo corre si `councillors` está vacía: si borrás `data/votacion.db`, la próxima arranque vuelve a tener los datos demo.

## Auditoría

`audit()` escribe `timestamp` (`dd/MM/yyyy HH:mm`), `usuario`, `accion` y `detalle`. Eventos registrados hoy: `Intento fallido`, `Inicio de sesión`, `Fin de sesión`, `Voto emitido`, `Proyecto activado`, `Sesión activada`, `Asistencia QR`, `Configuración`. Se ve en `/auditoria` y en `GET /api/auditoria`.

## Frontend

- `public/layout.html`: shell (sidebar con la nav, top bar con el estado de sesión y `<section id="contenido">`).
- `public/vistas/*.html`: sólo el contenido de cada módulo, sin `<html>` ni `<head>`.
- `public/app.js`: helpers de DOM (`el`, `texto`, `cuerpo`, `etiqueta`, `boton`, `kpis`, `barra`), `api()` (fetch con credenciales, errores en JSON y redirección a `/login` ante 401), un `cargar*` por página y el mapa `CARGADORES`.
- `public/login.js` y `public/asistencia.js`: páginas independientes, sin shell ni sesión.
- `public/screen.html` / `screen.js` / `screen.css`: pantalla pública a pantalla completa que consulta `GET /api/overview`.
- `styles.css`: variables de tema, shell, tablas (`.table-card` con `overflow-x: auto`), KPIs, badges, barras, `.qr-box`, `.config-form`, `.login-body`, `@media print` y un breakpoint en 720 px.

## Cómo agregar un módulo

1. `public/vistas/mi-modulo.html` con el contenido (ids únicos).
2. Entrada en `VISTAS` de `server.js` (`titulo` + `descripcion`): la ruta `/mi-modulo`, la nav y el 302 salen solos.
3. Endpoint en `server.js` (y `audit(...)` si escribe).
4. `cargarMiModulo()` en `app.js` y su entrada en `CARGADORES`.
5. Estilos en `styles.css` reutilizando las clases existentes.
6. Sumarlo a `PAGINAS` en `tests/smoke-api.sh` y a `PAGINAS` en `tests/navegador-cdp.mjs`.

## Límites conocidos

- **Sesiones en memoria**: reiniciar el servidor desloguea a todo el mundo; no hay expiración por inactividad ni renovación de token.
- **Contraseñas en texto plano** en `councillors.password`; no hay hash ni política de claves.
- **Sin roles**: cualquier concejal logueado puede activar proyectos/sesiones y editar la configuración.
- **CSRF**: no hay token; `SameSite=Lax` mitiga en parte, pero un POST desde otro sitio sigue siendo un riesgo real.
- **Varias APIs de lectura son públicas** (listado en `docs/API.md`), pensado para `/screen` y `/asistencia`; conviene cerrarlas o tokenizarlas antes de exponer el panel.
- `duracion_votacion`, `pantalla_publica` y `notificaciones` **se guardan pero no tienen comportamiento asociado**: no hay timer de votación ni bloqueo de la pantalla pública.
- No hay cierre automático de votación, exportación CSV, ni imagen QR (se muestra el código como texto + link copiable).
- Instancia única: sin rate limit, sin HTTPS y sin logs de acceso; pensado para red local o demo.

