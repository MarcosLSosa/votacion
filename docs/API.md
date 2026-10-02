# Referencia de la API

Servidor: `server.js` (Express 4). Todo el tráfico es JSON salvo las páginas HTML.

**Autenticación.** Las rutas marcadas 🔒 exigen sesión.

- Cookie `votacion_token` (HttpOnly, SameSite=Lax, ocho horas absolutas; `Secure` en producción).
- Header `x-auth-token: <token>` sólo para clientes API que administren tokens explícitamente (útil en pruebas).

Las sesiones se guardan en SQLite; sobreviven reinicios y vencen tras 30 minutos sin actividad o 8 horas absolutas. Para mutaciones autorizadas por cookie, enviá `Origin` del mismo origen y `X-CSRF-Token` recibido en el login. Login y check-in también validan el origen, pero no exigen token CSRF porque validan sus propias credenciales; los clientes que usan `x-auth-token` no necesitan token CSRF.

**Errores.** `{ "error": "mensaje legible" }`: 400 (datos inválidos), 401 (sin sesión/credenciales), 403 (origen, CSRF o nivel), 404 (no existe), 409 (conflicto), 429 (límite de intentos) y 426 (producción requiere HTTPS confiable).

---

## Autenticación

### `POST /api/auth/login`
```bash
curl -i -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3000' \
  -d '{"username":"sofia","password":"<VOTACION_BOOTSTRAP_PASSWORD>"}'
```
- Body: `username`, `password`.
- 200 → `{ "token": "…", "csrfToken": "…", "user": { "id": 1, "name": "Sofía Pérez", "role": "Presidenta", "voted": true, "vote": "afirmativo" } }` + cookie HttpOnly. Los clientes web usan la cookie y guardan el token CSRF en `sessionStorage`, nunca el token de sesión en `localStorage`.
- 401 → `Usuario o contraseña incorrectos.` (queda un registro `Intento fallido` en auditoría).
- 403 si falta `Origin` o no coincide con el origen de la aplicación; 429 tras 10 intentos desde una IP en 15 minutos.
- Efectos: marca `connected = true` en el concejal, persiste una sesión revocable, crea token CSRF y registra `Inicio de sesión`.
- En `NODE_ENV=production`, la cookie incluye `Secure`; la aplicación requiere HTTPS detrás del proxy confiable configurado.

### `POST /api/auth/logout` 🔒
Requiere `Origin` y `X-CSRF-Token` si usa cookie; elimina la sesión persistente y limpia la cookie. 200 → `{ "success": true }`. Auditoría `Fin de sesión`.

### `GET /api/auth/me` 🔒
200 → `{ "user": { "id", "name", "role", "voted", "vote" } }` (estado del concejal sobre el proyecto activo).

---

## Votación

### `GET /api/session`
Resumen del proyecto activo para el dashboard.
```json
{ "id": 1, "project": "Proyecto Nº 125/2026", "title": "…", "description": "…",
  "type": "Ordenanza", "startedBy": "…", "startedAt": "…", "startedAtFull": "…",
  "status": "abierta", "sessionType": "Sesión Ordinaria", "totalCouncillors": 12,
  "counts": { "afirmativo": 8, "negativo": 2, "abstencion": 1, "pendientes": 1 },
  "connectedCouncillors": 11 }
```
404 si no hay proyecto activo.

### `GET /api/project/:id`
Mismo objeto para un proyecto puntual; 404 si no existe.

### `GET /api/projects`
Array de los 3 proyectos con `counts` recalculados.

### `GET /api/history`
Idéntico a `/api/projects` pero sólo los que **no** están `abierta`.

### `POST /api/vote` 🔒
```bash
curl -X POST http://localhost:3000/api/vote \
  -H 'Content-Type: application/json' \
  -H "x-auth-token: $TOKEN" \
  -d '{"option":"negativo"}'
```
- `option` ∈ `afirmativo | negativo | abstencion`.
- 200 → `{ "success": true, "counts": { … } }`.
- 400 opción inválida o votación cerrada, 404 sin proyecto activo, 409 si el concejal ya votó ese proyecto.
- Efectos: suma el conteo en `projects.counts`, guarda `votes[projectId]` en `councillors`, auditoría `Voto emitido`.

### `POST /api/project/:id/activate` 🔒
Pone un proyecto abierto como el proyecto en votación y persiste el cierre automático según `duracion_votacion` (1–120 minutos). 200 → `{ "activeProjectId": 1, "votingDeadline": 1790964000000 }`. El id y plazo sobreviven reinicios; un proyecto finalizado responde 409 y no puede reabrirse desde este endpoint. Al vencer el plazo, el sistema cierra la votación y registra auditoría.

### `POST /api/sessions/:id/activate` 🔒
Activa la sesión en la tabla `sessions` (desactiva las demás; si estaba `cerrada` pasa a `abierta`). 200 → `{ "activeSessionId": 2 }`. Auditoría `Sesión activada`.

---

## Sesión, quórum y asistencia

### `GET /api/sessions`
Todas las sesiones: `{ id, name, date, status, quorumRequired, projectCount, active }`.

### `GET /api/order-of-day`
Puntos del orden del día: `{ id, title, status, presenter }`.

### `GET /api/quorum`
```json
{ "activeSession": { … }, "connected": 11, "totalCouncillors": 12,
  "quorumRequired": 7, "quorumReached": true, "present": 11, "absent": 1 }
```

### `GET /api/attendance`
Array `{ id, name, role, connected, vote }` donde `vote` es el voto sobre el proyecto activo o `"Pendiente"`.

### `GET /api/overview`
Alimento de la pantalla pública `/screen`:
```json
{ "project": "…", "title": "…", "description": "…", "status": "abierta",
  "counts": { … }, "sessionType": "Sesión Ordinaria", "startedAtFull": "…",
  "result": { "label": "APROBADO", "color": "green" } }
```
`result.label` ∈ `APROBADO | RECHAZADO | EMPATE` (compara afirmativo contra negativo).

### `GET /api/screen`
Payload único que alimenta la pantalla pública `/screen` en un solo pedido cada 3 s (antes eran 4 requests por refresco). Reúne sesión, concejales con presencia fina, conteos y resultado:
```json
{
  "sesion": { "id": 1, "nombre": "…", "fecha": "…", "estado": "activa",
              "requerido": 7, "proyectos": 2 },
  "concejales": [ { "id", "name", "role", "iniciales", "bloque", "bloqueSigla",
                    "bloqueColor", "conectado", "enLinea", "presente",
                    "marca", "metodo", "voto" } ],
  "presencia": { "total": 12, "presentes": 10, "ausentes": 2, "enLinea": 1,
                 "porcentaje": 83, "quorumAlcanzado": true },
  "proyecto": { "project": "…", "title": "…", "description": "…", "type": "…",
                "status": "abierta", "sessionType": "…", "startedAtFull": "…",
                "votingDeadline": 1790964000000,
                "counts": { "afirmativo": 8, "negativo": 3, "abstencion": 1, "pendientes": 0 },
                "total": 12, "emitidos": 12, "participacion": 100, "mayoria": true,
                "resultado": { "label": "APROBADO", "color": "green" } },
  "serverAt": "19:35:12"
}
```
- `presente` = está conectado **o** tiene marca en `asistencias` (login por panel o QR); `enLinea` = tiene una sesión persistente dentro de su vencimiento por inactividad.
- `sesion` y `proyecto` pueden ser `null` (sesión cerrada / sin proyecto en votación): `/screen` muestra un aviso en vez de romperse.
- `serverAt` y el reloj de la pantalla salen en formato 24 h (`hour12: false`) para que en el proyector no haya ambigüedad a.m./p.m.
- Este endpoint es público y deliberadamente contiene sólo los datos necesarios para proyectar resultados y asistencia; el resto de APIs de lectura exige autenticación y nivel.

### `GET /api/asistencia/qr` 🔒
Devuelve (y genera si no existe) el código de la sesión activa:
```json
{ "codigo": "80D7AF7D", "url": "/asistencia?codigo=80D7AF7D", "sesion": { … },
  "registrados": 2, "total": 12, "ausentes": [ { "id", "name", "bloque" } ] }
```
El código vive en la tabla `configuracion` (`qr_codigo` + `qr_sesion`) y cambia cuando cambia la sesión activa.

### `GET /api/asistencia/qr.png` 🔒
Genera un PNG escaneable que enlaza al formulario de la sesión activa. Requiere nivel Mesa; envía `Cache-Control: private, no-store`. En producción el enlace se construye desde `PUBLIC_BASE_URL`.

### `GET /api/asistencia` 🔒
Últimas 50 marcas: `{ id, creadoEn, metodo, codigo, concejalId, name, role }`.

### `POST /api/asistencia/checkin` (pública, requiere credenciales)
```bash
curl -X POST http://localhost:3000/api/asistencia/checkin \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://votaciones.ejemplo.gob.ar' \
  -d '{"codigo":"80D7AF7D","username":"marta","password":"<clave-personal>"}'
```
- 200 → `{ "success": true, "name": "Marta Silva" }`.
- 400 código inválido; 401 credenciales incompletas/incorrectas; 404 si no hay sesión disponible; 409 si ya registró asistencia.
- El código debe corresponder al QR de la sesión activa; un código vencido se rechaza.
- Requiere encabezado `Origin` del mismo origen; 403 para origen ajeno y 429 tras 20 intentos por IP en 15 minutos.
- Efectos: verifica usuario y contraseña, marca `connected = true`, inserta una sola asistencia y registra auditoría `Asistencia QR`.

### `PUT /api/usuarios/:id/password` 🔒 (Administración)
Permite a Administración asignar una clave individual sin leer ni recuperar la clave anterior. Envía `{ "password": "una-clave-individual-de-12-o-mas-caracteres" }`; requiere una clave de al menos 12 caracteres. El cambio invalida las sesiones existentes de esa cuenta. Nunca devuelve el hash.

---

## Administración y reportes

### `GET /api/usuarios`
`{ id, name, role, username, email, bloque, conectado, estado, votosEmitidos }`. El `email` se deriva de `username@concejo.local`.

### `GET /api/councillors`
`{ id, name, role, connected, bloqueId, bloque, voted, vote }` (voto sobre el proyecto activo).

### `GET /api/bloques`
`{ id, nombre, sigla, color, fundado, miembros, presentes, concejales: [ { id, name, role, connected } ] }`.

### `GET /api/municipios`
`{ "municipios": [ { id, nombre, departamento, habitantes, distrito } ], "totalHabitantes": 79790 }`.

### `GET /api/reports`
`{ totalProjects, openProjects, closedProjects, approvedCount, rejectedCount, totalCouncillors, connectedCouncillors }`.

### `GET /api/stats`
`{ activeSessionName, activeProjects, totalVotes, affirmatives, negatives, abstentions, totalProjects, connected, totalCouncillors, participationRate }`.

### `GET /api/votaciones`
Detalle voto a voto por proyecto:
```json
{ "id": 1, "project": "…", "title": "…", "type": "…", "status": "abierta",
  "startedAtFull": "…", "counts": { … },
  "detalle": { "afirmativo": [ { "id", "name", "bloque" } ], "negativo": [], "abstencion": [], "pendientes": [] } }
```

### `GET /api/auditoria` 🔒
`?limit=N` (por defecto 100). Filas `{ id, timestamp, usuario, accion, detalle }`, las más nuevas primero.

### `GET /api/configuracion` 🔒
`{ "config": { clave: valor }, "quorumSesion": 7 }`.

### `PUT /api/configuracion` 🔒
Sólo se aceptan `municipio_sede`, `mayoria`, `duracion_votacion`, `pantalla_publica`, `notificaciones`; el resto se descarta, y si no queda ninguna clave válida responde 400. 200 → `{ "config": { … } }`. Auditoría `Configuración` con las claves modificadas.

### Exportaciones CSV 🔒 (Mesa)

- `GET /api/export/votaciones.csv`: resumen y conteos de cada expediente.
- `GET /api/export/asistencia.csv`: sesión, fechas, concejal, usuario, método y código de asistencia.
- `GET /api/export/auditoria.csv`: hasta 10.000 eventos recientes.

Todas responden como descarga `text/csv; charset=utf-8` con `Cache-Control: private, no-store`. Los campos se entrecomillan y escapan; valores que podrían iniciar fórmulas de hoja de cálculo llevan prefijo de texto. Tratalas como información institucional restringida.

---

## Superficie pública

Las únicas APIs sin sesión son `POST /api/auth/login` (limitado por IP), `POST /api/asistencia/checkin` (credenciales, código de sesión, mismo origen y límite por IP) y `GET /api/screen` (payload mínimo para proyección). El PNG QR y los CSV no son públicos. Todas las demás APIs —incluidas consultas— requieren sesión y, según la operación, el nivel correspondiente. `GET /api/overview`, por ejemplo, es sólo para Mesa; la pantalla pública usa exclusivamente `/api/screen`.
