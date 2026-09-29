# Referencia de la API

Servidor: `server.js` (Express 4). Todo el tráfico es JSON salvo las páginas HTML.

**Autenticación.** Las rutas marcadas 🔒 exigen sesión. La sesión se manda de dos formas:

- Cookie `votacion_token` (HttpOnly, SameSite=Lax, `Max-Age=28800` = 8 h), que coloca `POST /api/auth/login`.
- Header `x-auth-token: <token>` (útil para probar con curl o desde otro cliente).

Los tokens se guardan en un `Map` en memoria: al reiniciar el servidor todas las sesiones caen.

**Errores.** Siempre `{ "error": "mensaje legible" }` con estado 400 (datos inválidos), 401 (sin sesión), 404 (no existe) o 409 (conflicto, por ejemplo voto duplicado).

---

## Autenticación

### `POST /api/auth/login`
```bash
curl -i -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"sofia","password":"1234"}'
```
- Body: `username`, `password`.
- 200 → `{ "token": "…", "user": { "id": 1, "name": "Sofía Pérez", "role": "Presidenta", "voted": true, "vote": "afirmativo" } }` + `Set-Cookie`.
- 401 → `Usuario o contraseña incorrectos.` (queda un registro `Intento fallido` en auditoría).
- Efectos: marca `connected = true` en el concejal, crea token, auditoría `Inicio de sesión`.

### `POST /api/auth/logout` 🔒
Elimina el token y la cookie. 200 → `{ "success": true }`. Auditoría `Fin de sesión`.

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
Pone ese proyecto como el proyecto en votación (en memoria). 200 → `{ "activeProjectId": 2 }`. Auditoría `Proyecto activado`.

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

### `GET /api/asistencia/qr` 🔒
Devuelve (y genera si no existe) el código de la sesión activa:
```json
{ "codigo": "80D7AF7D", "url": "/asistencia?codigo=80D7AF7D", "sesion": { … },
  "registrados": 2, "total": 12, "ausentes": [ { "id", "name", "bloque" } ] }
```
El código vive en la tabla `configuracion` (`qr_codigo` + `qr_sesion`) y cambia cuando cambia la sesión activa.

### `GET /api/asistencia` 🔒
Últimas 50 marcas: `{ id, creadoEn, metodo, codigo, concejalId, name, role }`.

### `POST /api/asistencia/checkin` (pública, sin sesión)
```bash
curl -X POST http://localhost:3000/api/asistencia/checkin \
  -H 'Content-Type: application/json' \
  -d '{"codigo":"80D7AF7D","username":"marta"}'
```
- 200 → `{ "success": true, "name": "Marta Silva" }`.
- 400 código inválido, 404 concejal inexistente.
- Efectos: marca `connected = true`, inserta en `asistencias`, auditoría `Asistencia QR`.

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

---

## Rutas sin sesión

`/api/session`, `/api/projects`, `/api/history`, `/api/project/:id`, `/api/sessions`, `/api/order-of-day`, `/api/quorum`, `/api/attendance`, `/api/reports`, `/api/stats`, `/api/votaciones`, `/api/overview`, `/api/usuarios`, `/api/councillors`, `/api/bloques`, `/api/municipios` y `POST /api/asistencia/checkin`.

Son de lectura (o de marcado de presencia) y están pensadas para la pantalla pública y la página `/asistencia`. Todo lo que escribe datos de administración o revela registro fino exige sesión. Ver limitaciones en `docs/ARQUITECTURA.md`.
