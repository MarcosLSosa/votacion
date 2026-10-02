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
sesiones SQLite, hashes opacos, CSRF, rate limits y authMiddleware
audit(usuario, accion, detalle)                                  ← escribe en la tabla auditoria
getConfig / setConfig                                            ← clave/valor
getActiveProject / computeCounts / getSessionOverview / getActiveSession
rutas /api/*
VISTAS + renderPagina + paginaProtegida                          ← panel multipágina
rutas de páginas y app.get('*')
```

## Ciclo de una request

1. El middleware registra solicitudes en JSON, agrega cabeceras de seguridad y, en producción, exige HTTPS según el proxy de confianza configurado. `express.static('public')` resuelve recursos y páginas públicas.
2. Si la URL es `/login`, `/asistencia`, `/screen` o `/`, se responde con `sendFile` o un redirect.
3. Si es una de las 15 URLs del panel (`/dashboard`, `/usuarios`, …), `paginaProtegida` chequea una sesión persistente: sin sesión válida → `302 /login`; con sesión y permiso → `renderPagina`.
4. `renderPagina` arma el HTML: toma `public/layout.html`, genera la navegación con `VISTAS` y reemplaza `{{NAV}}`, `{{TITULO}}`, `{{PAGE}}`, `{{CABECERA}}`, `{{DESCRIPCION}}` y `{{CONTENIDO}}` (que es `public/vistas/<clave>.html`).
5. El HTML llega con `data-page="clave"` en el `<body>`. `app.js` lee ese atributo, busca el cargador en `CARGADORES` y pide la API; cada 5 s vuelve a correr el cargador de la página para mantener los números vivos.
6. Las rutas `/api/*` responden JSON puro.

## Autenticación y autorización

- `POST /api/auth/login` valida `username`/`password` contra hashes scrypt en `councillors.password`, marca `connected = true` y crea una sesión persistente en SQLite. Sólo se almacena el SHA-256 del token aleatorio; el navegador recibe el token en cookie HttpOnly.
- `VOTACION_BOOTSTRAP_PASSWORD` (mínimo 12 caracteres) es obligatorio para la primera inicialización y para migrar contraseñas legadas en texto plano. La cuenta `sofia` recibe esta clave y las demás claves legadas se reemplazan por valores aleatorios. En `NODE_ENV=test`, `VOTACION_TEST_PASSWORD` proporciona la clave de semilla para pruebas aisladas.
- `PUT /api/usuarios/:id/password` permite a Administración asignar una nueva contraseña individual; invalida los tokens previos del usuario y nunca devuelve hashes.
- Administración crea bloques y cuentas con `POST /api/bloques` y `POST /api/usuarios`; las contraseñas se validan y se hashean antes de persistirlas. Las nuevas cuentas amplían los pendientes de los expedientes abiertos.
- Mesa y Administración crean convocatorias (`POST /api/sessions`) y expedientes (`POST /api/projects`). Los proyectos se agregan al orden del día sin votos y sólo entran al timer cuando alguien autorizado los activa.
- `POST /api/asistencia/checkin` valida usuario, contraseña y código QR de la sesión activa; el registro duplicado de presencia se rechaza.
- La cookie es `HttpOnly; SameSite=Lax; Max-Age=28800` y además `Secure` en producción. El navegador guarda el perfil y el token CSRF en `sessionStorage`, no el token de sesión.
- Las sesiones vencen a los 30 minutos sin actividad de usuario o a las 8 horas absolutas. `X-User-Activity-At` permite distinguir interacciones reales de las consultas automáticas de actualización; `last_seen_at` no renueva la ventana de inactividad.
- `tokenFrom(req)` acepta `x-auth-token` para clientes API explícitos o la cookie. Para mutaciones autorizadas por cookie, `csrfProtection` comprueba Origin/Referer del mismo origen y un token sincronizador en `X-CSRF-Token`; login y check-in validan el origen pero no requieren CSRF porque validan sus propias credenciales. El header de token explícito no depende de cookie y evita CSRF. `authMiddleware` responde **401 JSON** en las APIs y `paginaProtegida` responde **302 a `/login`** en las páginas.
- Login limita a 10 y check-in a 20 intentos por IP en una ventana de 15 minutos; los contadores persisten en SQLite y guardan HMAC de la IP, no la IP sin procesar.
- `POST /api/auth/logout` elimina la sesión persistente y limpia la cookie con `Max-Age=0`.
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
| `auth_sessions` | hash del token y CSRF, usuario, creación, actividad, última consulta y vencimiento absoluto |
| `rate_limits` | ventana y cantidad de solicitudes; identidad IP protegida mediante HMAC |

Cosas a saber:

- Los conteos **se acumulan** en `projects.counts` cuando alguien vota y `computeCounts` sólo agrega `pendientes = totalCouncillors - emitidos`. Si se editan votos a mano en la base, hay que ajustar `counts` a mano.
- `active_project_id` y `voting_deadline_at` persisten en `configuracion`; al reiniciar se restaura el proyecto activo y continúa el plazo. Un intervalo servidor cierra el proyecto cuando vence, y las lecturas también comprueban y ejecutan el cierre por si el intervalo se demora.
- El código de asistencia se autogenera y queda atado a la sesión activa (`qr_codigo` + `qr_sesion`); si cambia la sesión se emite un código nuevo y los links viejos dejan de servir.
- En desarrollo/pruebas, el seed (`seedDatabase`) crea datos ficticios cuando faltan. En `NODE_ENV=production` no inserta datos demo: exige las tablas base provisionadas y un perfil Administrador, y aborta el arranque indicando lo faltante.
- Para una instancia real no se debe publicar la base de desarrollo con personas/expedientes ficticios. Provisioná una base oficial con claves scrypt y asigná/verificá permisos antes de habilitar acceso público. No hay aún un importador de padrón oficial.
- Para recorrer el flujo desde cero en desarrollo, `NODE_ENV=test` junto con `VOTACION_EMPTY_START=1` conserva sólo una cuenta administradora `sofia` (clave `VOTACION_TEST_PASSWORD`) y las opciones de configuración mínimas, sin bloques, concejales, sesiones ni proyectos ficticios. Esta variable se ignora fuera del modo test.

## Auditoría

`audit()` escribe `timestamp` (`dd/MM/yyyy HH:mm`), `usuario`, `accion` y `detalle`. Eventos registrados hoy: `Intento fallido`, `Inicio de sesión`, `Fin de sesión`, `Voto emitido`, `Proyecto activado`, `Sesión activada`, `Asistencia QR`, `Configuración`. Se ve en `/auditoria` y en `GET /api/auditoria`.

## Frontend

- `public/layout.html`: shell (sidebar con la nav, top bar con el estado de sesión y `<section id="contenido">`).
- `public/vistas/*.html`: sólo el contenido de cada módulo, sin `<html>` ni `<head>`.
- `public/app.js`: helpers de DOM (`el`, `texto`, `cuerpo`, `etiqueta`, `boton`, `kpis`, `barra`), `api()` (fetch con credenciales, errores en JSON y redirección a `/login` ante 401), un `cargar*` por página y el mapa `CARGADORES`.
- `public/login.js` y `public/asistencia.js`: páginas independientes, sin shell ni sesión.
- `public/screen.html` / `screen.js` / `screen.css`: pantalla pública a pantalla completa que consulta sólo `GET /api/screen` (un solo pedido cada 3 s), con el conjunto mínimo deliberado de datos para proyección.
- `styles.css`: variables de tema, shell, tablas (`.table-card` con `overflow-x: auto`), KPIs, badges, barras, `.qr-box`, `.config-form`, `.login-body`, `@media print` y un breakpoint en 720 px.

## Cómo agregar un módulo

1. `public/vistas/mi-modulo.html` con el contenido (ids únicos).
2. Entrada en `VISTAS` de `server.js` (`titulo` + `descripcion`): la ruta `/mi-modulo`, la nav y el 302 salen solos.
3. Endpoint en `server.js` (y `audit(...)` si escribe).
4. `cargarMiModulo()` en `app.js` y su entrada en `CARGADORES`.
5. Estilos en `styles.css` reutilizando las clases existentes.
6. Sumarlo a `PAGINAS` en `tests/smoke-api.sh` y a `PAGINAS` en `tests/navegador-cdp.mjs`.

## Seguridad y despliegue

- Sólo `POST /api/auth/login`, `GET /api/screen` y `POST /api/asistencia/checkin` son endpoints API deliberadamente públicos. El check-in requiere código, credenciales válidas, origen del mismo sitio y rate limit; el resto de APIs exige sesión y los perfiles correspondientes. La lista vigente y formatos están en `docs/API.md`.
- Las respuestas incluyen cabeceras de seguridad, CSP, protección contra framing, MIME sniffing y HSTS en producción. El servidor emite logs estructurados JSON de acceso y errores por stdout/stderr; el operador debe conectarlos a un sistema con control de acceso y retención definida.
- En producción, definir `NODE_ENV=production`, `PUBLIC_BASE_URL` (origen HTTPS canónico) y `TRUST_PROXY_HOPS` según la topología TLS. El arranque falla de forma segura si detecta un conjunto de datos base incompleto o sin Administrador; nunca rellena tablas vacías con datos de ejemplo. Servir sólo detrás de un proxy HTTPS confiable, bloquear el puerto Node a tráfico público, conservar el archivo SQLite en almacenamiento persistente y comprobar backups/restauraciones. No hay un hosting elegido ni despliegue productivo real validado todavía.
- Configurar alertas, retención de logs, backups, monitoreo, recuperación ante desastre, dominio y certificado son responsabilidades del despliegue; ver checklist del README.
- La aplicación es de instancia única con SQLite local; no está diseñada para múltiples réplicas concurrentes ni almacenamiento efímero.
- `pantalla_publica` y `notificaciones` siguen siendo opciones de configuración almacenadas sin comportamiento de bloqueo/notificación asociado.
- Las rutas `/api/export/votaciones.csv`, `/api/export/asistencia.csv` y `/api/export/auditoria.csv` requieren Mesa y envían archivos privados sin caché. Las celdas CSV que podrían iniciar fórmulas se neutralizan.
