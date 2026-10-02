# Sistema de Votación — Concejo Deliberante

Panel de votación para un concejo deliberante: login de concejales, votación nominal en vivo, quórum, asistencia por código/QR, sesiones, proyectos, orden del día, reportes, estadísticas, auditoría y configuración. Incluye pantalla pública para proyectar en el recinto.

**Stack:** Node.js 22 + Express 4 + SQLite (`better-sqlite3`) + HTML/CSS/JS plano (sin framework, sin build, sin CSS procesado). El panel es **multipágina del lado del servidor**: cada módulo tiene su URL, el servidor arma el HTML desde plantillas y el JavaScript del navegador sólo carga y pinta los datos de la API.

## Requisitos y arranque

```bash
npm install          # express, better-sqlite3, qrcode
PORT=3001 npm start  # puerto alternativo
```

Requiere Node 22 o superior (`better-sqlite3` 13). En desarrollo y pruebas la base `data/votacion.db` se crea sola al primer arranque y carga datos ficticios; esa carpeta está gitignoreada, así que borrarla es la forma de resetear el sistema. Con `VOTACION_DB=/ruta/base.db npm start` se usa otra base. **En producción no se inserta esa semilla:** el servidor se niega a iniciar si faltan concejales, proyectos, sesiones, bloques, municipios, configuración o una cuenta Administrador. Provisioná los datos oficiales y claves antes del despliegue; hoy no hay una importación de padrón oficial integrada.

En desarrollo, antes del primer arranque configurá una contraseña robusta para la cuenta de ejemplo `sofia` (mínimo 12 caracteres):

```powershell
$env:VOTACION_BOOTSTRAP_PASSWORD = 'una-frase-larga-y-unica'
npm start
```

Las contraseñas se almacenan con scrypt y sal individual. Las demás cuentas ficticias reciben claves aleatorias no reveladas; después de ingresar como `sofia`, asignales claves para poder probarlas desde **Usuarios → Cambiar clave**. Al migrar una base antigua con claves planas, configurá `VOTACION_BOOTSTRAP_PASSWORD` **antes** del arranque: la cuenta `sofia` recibe esa clave y las demás cuentas se rotan a claves aleatorias. En producción, esa variable no crea usuarios; ver la sección de despliegue.

Para pruebas automatizadas se puede usar una base aislada y una clave compartida sólo en modo test:

```powershell
$env:NODE_ENV = 'test'
$env:VOTACION_TEST_PASSWORD = 'Prueba-segura-2026'
$env:VOTACION_DB = "$env:TEMP\votacion-test.db"
npm start
```

No uses `NODE_ENV=test` ni `VOTACION_TEST_PASSWORD` fuera de pruebas.

### Despliegue detrás de HTTPS

La aplicación espera un proxy inverso que termine TLS (por ejemplo, Nginx o el proxy de la plataforma). En producción exigí HTTPS en el proxy, bloqueá el acceso público directo al puerto de Node y configurá el número exacto de proxies confiables:

```powershell
$env:NODE_ENV = 'production'
$env:VOTACION_BOOTSTRAP_PASSWORD = 'una-frase-larga-y-unica'
$env:PUBLIC_BASE_URL = 'https://votaciones.ejemplo.gob.ar'
$env:TRUST_PROXY_HOPS = '1'
npm start
```

`PUBLIC_BASE_URL` debe ser el origen HTTPS público, sin ruta ni credenciales; `TRUST_PROXY_HOPS` debe reflejar la topología real y el proxy debe enviar `X-Forwarded-Proto: https`. La aplicación rechaza solicitudes que no llegan como HTTPS confiable y usa cookies `Secure`, HSTS y cabeceras de seguridad. No confíes en `X-Forwarded-*` desde clientes directos. Los registros JSON de acceso y errores salen por stdout/stderr: conectalos a la plataforma de logs y definí retención/acceso según la política del organismo.

El valor `VOTACION_BOOTSTRAP_PASSWORD` sirve para inicializar cuentas de desarrollo o rotar claves legadas; no crea usuarios oficiales en producción. La base productiva debe incluir usuarios con contraseñas scrypt y, al menos, un Administrador asignado por un procedimiento controlado.

Las sesiones se guardan en SQLite y vencen tras **30 minutos sin actividad** o **8 horas absolutas**. Las escrituras usan WAL; montá `data/` en almacenamiento persistente y configurá copias de seguridad verificadas. El navegador autentica con cookie HttpOnly y token CSRF; no guarda el token de sesión en `localStorage`. Login y marcación QR tienen límites de intentos (10 y 20 por IP en 15 minutos).

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

Las 15 páginas del panel y las APIs operativas exigen sesión: una cookie `votacion_token` (HttpOnly, SameSite=Lax, Secure en producción) que coloca el login, o el header `x-auth-token` para clientes de API explícitos. Las mutaciones autenticadas por cookie requieren origen same-site y token CSRF; login y check-in validan origen y sus propias credenciales. Sin sesión, las páginas redirigen a `/login` (302) y las APIs responden 401. La pantalla `/screen`, el login y el check-in QR autenticado son las superficies públicas previstas.

El perfil de concejal sólo muestra y permite abrir **Votación en curso, Orden del Día, Quórum y Votaciones**. Las vistas de consulta ampliada y gestión se reservan para Mesa o Administración; Usuarios y Configuración son exclusivas de Administración.

## Documentación

| Archivo | Contenido |
| --- | --- |
| `docs/API.md` | Referencia de todos los endpoints con ejemplos `curl` |
| `docs/ARQUITECTURA.md` | Capas, sesiones, seguridad, datos y requisitos de despliegue |
| `docs/MANUAL_DE_USO.md` | Guía módulo por módulo: votar, asistencia QR, pantalla pública, imprimir |
| `docs/PRUEBAS.md` | Cómo se probó, resultados de la última corrida y cómo volver a correrlo |

## Pruebas

Las instrucciones reproducibles para ejecutar cada batería en una base temporal distinta están en `docs/PRUEBAS.md`. `smoke-api.sh` usa `curl`; `navegador-cdp.mjs` controla Chrome mediante DevTools Protocol (Node 22 o superior incluye `WebSocket`, no hace falta Puppeteer). Ambas suites pueden modificar sus bases: nunca las apuntes a `data/votacion.db`.

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

## Estado actual y pendientes para producción

El sistema implementa login con contraseñas scrypt y sal individual; permisos por nivel; claves individuales; check-in QR autenticado; sesiones persistentes y vencimiento por inactividad; protección CSRF; autorización de APIs; rate limiting; HTTPS detrás de proxy confiable; logs estructurados; cierre automático de votaciones; imagen QR y exportaciones CSV.

La preparación del software no sustituye la puesta en marcha: antes de abrirlo al público hay que configurar el proxy, dominio/certificado, almacenamiento persistente y backups; provisionar los datos oficiales y claves individuales; y validar el procedimiento de recuperación y continuidad con el organismo. No expongas una instalación de prueba ni consideres listo el despliegue hasta completar esos pasos. El detalle está en `docs/ARQUITECTURA.md`.
