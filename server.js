const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dataDir = path.join(__dirname, 'data');
// VOTACION_DB permite aislar la base (pruebas automatizadas, demos) sin tocar data/votacion.db
const dbPath = process.env.VOTACION_DB ? path.resolve(process.env.VOTACION_DB) : path.join(dataDir, 'votacion.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS councillors (
    id INTEGER PRIMARY KEY,
    name TEXT,
    role TEXT,
    username TEXT UNIQUE,
    password TEXT,
    connected INTEGER,
    votes TEXT
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    project TEXT,
    title TEXT,
    description TEXT,
    type TEXT,
    startedBy TEXT,
    startedAt TEXT,
    startedAtFull TEXT,
    status TEXT,
    sessionType TEXT,
    totalCouncillors INTEGER,
    counts TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY,
    name TEXT,
    date TEXT,
    status TEXT,
    quorumRequired INTEGER,
    projectCount INTEGER,
    active INTEGER
  );

  CREATE TABLE IF NOT EXISTS order_of_day (
    id INTEGER PRIMARY KEY,
    title TEXT,
    status TEXT,
    presenter TEXT
  );

  CREATE TABLE IF NOT EXISTS bloques (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL,
    sigla TEXT,
    color TEXT,
    fundado TEXT
  );

  CREATE TABLE IF NOT EXISTS municipios (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL,
    departamento TEXT,
    habitantes INTEGER,
    distrito TEXT
  );

  CREATE TABLE IF NOT EXISTS auditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    usuario TEXT NOT NULL,
    accion TEXT NOT NULL,
    detalle TEXT
  );

  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT
  );

  CREATE TABLE IF NOT EXISTS asistencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sesion_id INTEGER,
    concejal_id INTEGER,
    codigo TEXT,
    metodo TEXT,
    creado_en TEXT
  );
`);

const columnaBloque = db
  .prepare("SELECT COUNT(*) AS count FROM pragma_table_info('councillors') WHERE name = 'bloque_id'")
  .get().count;
if (columnaBloque === 0) {
  db.exec('ALTER TABLE councillors ADD COLUMN bloque_id INTEGER');
}

function rowToCouncillor(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    username: row.username,
    password: row.password,
    connected: Boolean(row.connected),
    bloqueId: row.bloque_id ?? null,
    votes: JSON.parse(row.votes || '{}')
  };
}

function rowToProject(row) {
  return {
    id: row.id,
    project: row.project,
    title: row.title,
    description: row.description,
    type: row.type,
    startedBy: row.startedBy,
    startedAt: row.startedAt,
    startedAtFull: row.startedAtFull,
    status: row.status,
    sessionType: row.sessionType,
    totalCouncillors: row.totalCouncillors,
    counts: JSON.parse(row.counts || '{}')
  };
}

function rowToSession(row) {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    status: row.status,
    quorumRequired: row.quorumRequired,
    projectCount: row.projectCount,
    active: Boolean(row.active)
  };
}

function getAllCouncillors() {
  const rows = db.prepare('SELECT * FROM councillors ORDER BY id').all();
  return rows.map(rowToCouncillor);
}

function getCouncillorByUsername(username) {
  const row = db.prepare('SELECT * FROM councillors WHERE username = ?').get(username);
  return row ? rowToCouncillor(row) : null;
}

function getCouncillorById(id) {
  const row = db.prepare('SELECT * FROM councillors WHERE id = ?').get(id);
  return row ? rowToCouncillor(row) : null;
}

function updateCouncillor(updated) {
  db.prepare(
    'UPDATE councillors SET name = ?, role = ?, username = ?, password = ?, connected = ?, votes = ? WHERE id = ?'
  ).run(
    updated.name,
    updated.role,
    updated.username,
    updated.password,
    updated.connected ? 1 : 0,
    JSON.stringify(updated.votes || {}),
    updated.id
  );
}

function getAllProjects() {
  const rows = db.prepare('SELECT * FROM projects ORDER BY id').all();
  return rows.map(rowToProject);
}

function getProject(projectId) {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  return row ? rowToProject(row) : null;
}

function createProject(data) {
  const stmt = db.prepare(
    'INSERT INTO projects (project, title, description, type, startedBy, startedAt, startedAtFull, status, sessionType, totalCouncillors, counts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(
    data.project,
    data.title,
    data.description,
    data.type,
    data.startedBy,
    data.startedAt,
    data.startedAtFull,
    data.status,
    data.sessionType,
    data.totalCouncillors,
    JSON.stringify(data.counts || { afirmativo: 0, negativo: 0, abstencion: 0 })
  );
  return getProject(result.lastInsertRowid);
}

function updateProject(id, data) {
  const project = getProject(id);
  if (!project) return null;
  db.prepare(
    'UPDATE projects SET project = ?, title = ?, description = ?, type = ?, startedBy = ?, startedAt = ?, startedAtFull = ?, status = ?, sessionType = ?, totalCouncillors = ?, counts = ? WHERE id = ?'
  ).run(
    data.project ?? project.project,
    data.title ?? project.title,
    data.description ?? project.description,
    data.type ?? project.type,
    data.startedBy ?? project.startedBy,
    data.startedAt ?? project.startedAt,
    data.startedAtFull ?? project.startedAtFull,
    data.status ?? project.status,
    data.sessionType ?? project.sessionType,
    data.totalCouncillors ?? project.totalCouncillors,
    JSON.stringify(data.counts ?? project.counts),
    id
  );
  return getProject(id);
}

function getAllSessions() {
  const rows = db.prepare('SELECT * FROM sessions ORDER BY id').all();
  return rows.map(rowToSession);
}

function getSession(sessionId) {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  return row ? rowToSession(row) : null;
}

function rowToOrderItem(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    presenter: row.presenter
  };
}

function getAllOrderOfDay() {
  const rows = db.prepare('SELECT * FROM order_of_day ORDER BY id').all();
  return rows.map(rowToOrderItem);
}

function createSession(data) {
  if (data.active) {
    db.prepare('UPDATE sessions SET active = 0').run();
  }
  const stmt = db.prepare(
    'INSERT INTO sessions (name, date, status, quorumRequired, projectCount, active) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(data.name, data.date, data.status, data.quorumRequired, data.projectCount, data.active ? 1 : 0);
  return getSession(result.lastInsertRowid);
}

function updateSession(id, data) {
  const session = getSession(id);
  if (!session) return null;
  if (data.active) {
    db.prepare('UPDATE sessions SET active = 0').run();
  }
  db.prepare(
    'UPDATE sessions SET name = ?, date = ?, status = ?, quorumRequired = ?, projectCount = ?, active = ? WHERE id = ?'
  ).run(
    data.name ?? session.name,
    data.date ?? session.date,
    data.status ?? session.status,
    data.quorumRequired ?? session.quorumRequired,
    data.projectCount ?? session.projectCount,
    data.active ? 1 : (data.active === false ? 0 : session.active ? 1 : 0),
    id
  );
  return getSession(id);
}

function seedDatabase() {
  const councillorCount = db.prepare('SELECT COUNT(*) AS count FROM councillors').get().count;
  if (councillorCount === 0) {
    const stmt = db.prepare(
      'INSERT INTO councillors (id, name, role, username, password, connected, votes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const initial = [
      [1, 'Sofía Pérez', 'Presidenta', 'sofia', '1234', 1, JSON.stringify({ 1: 'afirmativo' })],
      [2, 'Juan López', 'Vicepresidente', 'juan', '1234', 1, JSON.stringify({ 1: 'afirmativo' })],
      [3, 'María Gómez', 'Concejala', 'maria', '1234', 1, JSON.stringify({ 1: 'afirmativo' })],
      [4, 'Carlos Díaz', 'Concejal', 'carlos', '1234', 1, JSON.stringify({ 1: 'afirmativo' })],
      [5, 'Ana Ruiz', 'Concejala', 'ana', '1234', 1, JSON.stringify({ 1: 'afirmativo' })],
      [6, 'Pedro Martínez', 'Concejal', 'pedro', '1234', 1, JSON.stringify({ 1: 'afirmativo' })],
      [7, 'Lucía Fernández', 'Concejala', 'lucia', '1234', 1, JSON.stringify({ 1: 'negativo' })],
      [8, 'Diego Torres', 'Concejal', 'diego', '1234', 1, JSON.stringify({ 1: 'negativo' })],
      [9, 'Marta Silva', 'Concejala', 'marta', '1234', 0, JSON.stringify({ 1: 'abstencion' })],
      [10, 'Raúl Pérez', 'Concejal', 'raul', '1234', 1, JSON.stringify({})],
      [11, 'Patricia Ortiz', 'Concejala', 'patricia', '1234', 0, JSON.stringify({ 1: 'afirmativo' })],
      [12, 'Leo Ramos', 'Concejal', 'leo', '1234', 0, JSON.stringify({ 1: 'afirmativo' })]
    ];
    const insert = db.transaction(rows => {
      for (const row of rows) stmt.run(...row);
    });
    insert(initial);
  }

  const projectCount = db.prepare('SELECT COUNT(*) AS count FROM projects').get().count;
  if (projectCount === 0) {
    const stmt = db.prepare(
      'INSERT INTO projects (id, project, title, description, type, startedBy, startedAt, startedAtFull, status, sessionType, totalCouncillors, counts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const initial = [
      [1, 'Proyecto Nº 125/2026', 'Declaración de interés municipal la Feria del Libro 2026', 'Declarar de interés municipal la realización de la Feria del Libro 2026 a desarrollarse en nuestra ciudad.', 'Declaración', 'Bloque Unión por la Ciudad', '10:15 hs', '02 de julio de 2026 • 10:32 hs', 'abierta', 'Sesión Ordinaria', 12, JSON.stringify({ afirmativo: 8, negativo: 2, abstencion: 1 })],
      [2, 'Ordenanza Nº 216/2026', 'Regulación del uso de espacios verdes municipales', 'Establecer criterios de uso, protección y mantenimiento para los espacios verdes de la ciudad.', 'Ordenanza', 'Bloque Ciudadana', '09:40 hs', '01 de julio de 2026 • 09:40 hs', 'finalizada', 'Sesión Ordinaria', 12, JSON.stringify({ afirmativo: 9, negativo: 1, abstencion: 2 })],
      [3, 'Ordenanza Nº 220/2026', 'Actualización de la normativa de tránsito para ciclistas', 'Modificar la normativa de tránsito para mejorar la seguridad de ciclistas y peatones.', 'Ordenanza', 'Bloque Unión por la Ciudad', '11:05 hs', '03 de julio de 2026 • 11:05 hs', 'finalizada', 'Sesión Ordinaria', 12, JSON.stringify({ afirmativo: 7, negativo: 4, abstencion: 1 })]
    ];
    const insert = db.transaction(rows => {
      for (const row of rows) stmt.run(...row);
    });
    insert(initial);
  }

  const sessionCount = db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count;
  if (sessionCount === 0) {
    const stmt = db.prepare('INSERT INTO sessions (id, name, date, status, quorumRequired, projectCount, active) VALUES (?, ?, ?, ?, ?, ?, ?)');
    stmt.run(1, 'Sesión Ordinaria', '05 de agosto de 2026', 'abierta', 7, 3, 1);
    stmt.run(2, 'Sesión Extraordinaria', '02 de agosto de 2026', 'cerrada', 7, 2, 0);
  }

  const orderCount = db.prepare('SELECT COUNT(*) AS count FROM order_of_day').get().count;
  if (orderCount === 0) {
    const stmt = db.prepare('INSERT INTO order_of_day (id, title, status, presenter) VALUES (?, ?, ?, ?)');
    stmt.run(1, 'Proyecto Nº 125/2026', 'En discusión', 'Bloque Unión por la Ciudad');
    stmt.run(2, 'Ordenanza Nº 216/2026', 'Aprobado', 'Bloque Ciudadana');
    stmt.run(3, 'Ordenanza Nº 220/2026', 'Rechazado', 'Bloque Independiente');
  }

  const bloqueCount = db.prepare('SELECT COUNT(*) AS count FROM bloques').get().count;
  if (bloqueCount === 0) {
    const stmt = db.prepare('INSERT INTO bloques (id, nombre, sigla, color, fundado) VALUES (?, ?, ?, ?, ?)');
    stmt.run(1, 'Bloque Unión por la Ciudad', 'UxC', '#2fa84f', '2017');
    stmt.run(2, 'Bloque Ciudadana', 'CID', '#f3a312', '2019');
    stmt.run(3, 'Bloque Independiente', 'INDEP', '#4b7bec', '2021');
  }

  const municipioCount = db.prepare('SELECT COUNT(*) AS count FROM municipios').get().count;
  if (municipioCount === 0) {
    const stmt = db.prepare('INSERT INTO municipios (id, nombre, departamento, habitantes, distrito) VALUES (?, ?, ?, ?, ?)');
    stmt.run(1, 'Ciudad Central', 'Norte', 48200, 'Urbano');
    stmt.run(2, 'Villa del Río', 'Sur', 21750, 'Rural');
    stmt.run(3, 'San Cayetano', 'Este', 9840, 'Rural');
  }

  const configCount = db.prepare('SELECT COUNT(*) AS count FROM configuracion').get().count;
  if (configCount === 0) {
    const stmt = db.prepare('INSERT INTO configuracion (clave, valor) VALUES (?, ?)');
    stmt.run('municipio_sede', 'Ciudad Central');
    stmt.run('mayoria', 'Simple');
    stmt.run('duracion_votacion', '5');
    stmt.run('pantalla_publica', '1');
    stmt.run('notificaciones', '0');
  }

  const auditoriaCount = db.prepare('SELECT COUNT(*) AS count FROM auditoria').get().count;
  if (auditoriaCount === 0) {
    const stmt = db.prepare('INSERT INTO auditoria (timestamp, usuario, accion, detalle) VALUES (?, ?, ?, ?)');
    stmt.run('02/07/2026 09:38', 'system', 'Sistema iniciado', 'Base de datos creada y datos iniciales cargados');
    stmt.run('02/07/2026 10:05', 'sofia', 'Inicio de sesión', 'Presidenta ingresó al panel');
    stmt.run('02/07/2026 10:32', 'juan', 'Votación iniciada', 'Proyecto Nº 125/2026 • Sesión Ordinaria');
  }

  db.prepare('UPDATE councillors SET bloque_id = 1 WHERE id IN (1, 3, 4, 5, 6)').run();
  db.prepare('UPDATE councillors SET bloque_id = 2 WHERE id IN (2, 7, 8, 9)').run();
  db.prepare('UPDATE councillors SET bloque_id = 3 WHERE id IN (10, 11, 12)').run();
}

seedDatabase();

let activeProjectId = 1;
const tokens = new Map();
const SESSION_COOKIE = 'votacion_token';

function createToken() {
  return crypto.randomBytes(16).toString('hex');
}

function readCookies(req) {
  const header = req.headers.cookie;
  if (!header) {
    return {};
  }
  return header.split(';').reduce((acc, part) => {
    const index = part.indexOf('=');
    if (index === -1) {
      return acc;
    }
    acc[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    return acc;
  }, {});
}

function tokenFrom(req) {
  const header = req.headers['x-auth-token'];
  if (header) {
    return header;
  }
  return readCookies(req)[SESSION_COOKIE] || null;
}

function audit(usuario, accion, detalle) {
  const ahora = new Date();
  const two = value => String(value).padStart(2, '0');
  const timestamp = `${two(ahora.getDate())}/${two(ahora.getMonth() + 1)}/${ahora.getFullYear()} ${two(ahora.getHours())}:${two(ahora.getMinutes())}`;
  db.prepare('INSERT INTO auditoria (timestamp, usuario, accion, detalle) VALUES (?, ?, ?, ?)')
    .run(timestamp, usuario || 'anonimo', accion, detalle || null);
}

function getConfig() {
  const rows = db.prepare('SELECT clave, valor FROM configuracion ORDER BY clave').all();
  return rows.reduce((acc, row) => {
    acc[row.clave] = row.valor;
    return acc;
  }, {});
}

function setConfig(clave, valor) {
  db.prepare(
    'INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor'
  ).run(clave, String(valor));
}

/*
 * Registrar presencia en la sesión activa. El flag `connected` queda en true
 * desde el primer login y no vuelve a bajar, así que la pantalla pública
 * necesita una marca real (tabla asistencias) para decir quién está en sala.
 */
function registrarPresente(concejal, metodo, codigo) {
  const session = getActiveSession();
  if (!session || !concejal) {
    return false;
  }
  const yaRegistrado = db.prepare('SELECT 1 FROM asistencias WHERE sesion_id = ? AND concejal_id = ?')
    .get(session.id, concejal.id);
  if (yaRegistrado) {
    return false;
  }
  const ahora = new Date().toLocaleString('es-AR');
  db.prepare('INSERT INTO asistencias (sesion_id, concejal_id, codigo, metodo, creado_en) VALUES (?, ?, ?, ?, ?)')
    .run(session.id, concejal.id, codigo || null, metodo, ahora);
  audit(concejal.username, 'Presencia registrada', `${concejal.name} quedó registrado como presente (${metodo})`);
  return true;
}

function authMiddleware(req, res, next) {
  const token = tokenFrom(req);
  if (!token || !tokens.has(token)) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  req.user = tokens.get(token);
  req.token = token;
  next();
}

function getActiveProject() {
  return getProject(activeProjectId);
}

function computeCounts(project) {
  const totalVotes = project.counts.afirmativo + project.counts.negativo + project.counts.abstencion;
  return { ...project.counts, pendientes: project.totalCouncillors - totalVotes };
}

function getSessionOverview() {
  const activeProject = getActiveProject();
  if (!activeProject) {
    return null;
  }
  const connected = getAllCouncillors().filter(c => c.connected).length;
  return {
    ...activeProject,
    counts: computeCounts(activeProject),
    connectedCouncillors: connected
  };
}

function getActiveSession() {
  const sessions = getAllSessions();
  return sessions.find(session => session.active) || sessions[0] || null;
}

app.get('/api/session', (req, res) => {
  const overview = getSessionOverview();
  if (!overview) {
    return res.status(404).json({ error: 'No hay un proyecto en votación.' });
  }
  res.json(overview);
});

app.get('/api/projects', (req, res) => {
  res.json(getAllProjects().map(project => ({
    ...project,
    counts: computeCounts(project)
  })));
});

app.get('/api/history', (req, res) => {
  res.json(getAllProjects()
    .filter(project => project.status !== 'abierta')
    .map(project => ({
      ...project,
      counts: computeCounts(project)
    })));
});

app.get('/api/sessions', (req, res) => {
  res.json(getAllSessions());
});

app.get('/api/order-of-day', (req, res) => {
  res.json(getAllOrderOfDay());
});

app.get('/api/quorum', (req, res) => {
  const councillors = getAllCouncillors();
  const activeSession = getActiveSession();
  const connected = councillors.filter(c => c.connected).length;
  const quorumRequired = activeSession ? activeSession.quorumRequired : 0;
  res.json({
    activeSession,
    connected,
    totalCouncillors: councillors.length,
    quorumRequired,
    quorumReached: connected >= quorumRequired,
    present: connected,
    absent: councillors.length - connected
  });
});

app.get('/api/attendance', (req, res) => {
  const attendance = getAllCouncillors().map(c => ({
    id: c.id,
    name: c.name,
    role: c.role,
    connected: c.connected,
    vote: c.votes[activeProjectId] || 'Pendiente'
  }));
  res.json(attendance);
});

app.get('/api/reports', (req, res) => {
  const projects = getAllProjects();
  const councillors = getAllCouncillors();
  const totalProjects = projects.length;
  const openProjects = projects.filter(p => p.status === 'abierta').length;
  const closedProjects = totalProjects - openProjects;
  const approvedCount = projects.filter(p => p.counts.afirmativo > p.counts.negativo).length;
  const rejectedCount = projects.filter(p => p.counts.negativo > p.counts.afirmativo).length;
  res.json({
    totalProjects,
    openProjects,
    closedProjects,
    approvedCount,
    rejectedCount,
    totalCouncillors: councillors.length,
    connectedCouncillors: councillors.filter(c => c.connected).length
  });
});

app.get('/api/stats', (req, res) => {
  const projects = getAllProjects();
  const councillors = getAllCouncillors();
  const activeSession = getActiveSession();
  const affirmatives = projects.reduce((sum, project) => sum + project.counts.afirmativo, 0);
  const negatives = projects.reduce((sum, project) => sum + project.counts.negativo, 0);
  const abstentions = projects.reduce((sum, project) => sum + project.counts.abstencion, 0);
  const connected = councillors.filter(c => c.connected).length;
  res.json({
    activeSessionName: activeSession ? activeSession.name : 'Sin sesión activa',
    activeProjects: projects.filter(project => project.status === 'abierta').length,
    totalVotes: affirmatives + negatives + abstentions,
    affirmatives,
    negatives,
    abstentions,
    totalProjects: projects.length,
    connected,
    totalCouncillors: councillors.length,
    participationRate: councillors.length ? Math.round((connected / councillors.length) * 100) : 0
  });
});

app.get('/api/project/:id', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Proyecto no encontrado.' });
  }
  res.json({ ...project, counts: computeCounts(project) });
});

function getBloques() {
  const bloques = db.prepare('SELECT * FROM bloques ORDER BY id').all();
  const councillors = getAllCouncillors();
  return bloques.map(bloque => {
    const miembros = councillors.filter(c => c.bloqueId === bloque.id);
    return {
      ...bloque,
      miembros: miembros.length,
      presentes: miembros.filter(c => c.connected).length,
      concejales: miembros.map(c => ({ id: c.id, name: c.name, role: c.role, connected: c.connected }))
    };
  });
}

function bloqueName(id) {
  if (!id) {
    return 'Sin bloque';
  }
  const row = db.prepare('SELECT nombre FROM bloques WHERE id = ?').get(id);
  return row ? row.nombre : 'Sin bloque';
}

app.get('/api/bloques', (req, res) => {
  res.json(getBloques());
});

app.get('/api/municipios', (req, res) => {
  const municipios = db.prepare('SELECT * FROM municipios ORDER BY id').all();
  const total = municipios.reduce((sum, municipio) => sum + (municipio.habitantes || 0), 0);
  res.json({ municipios, totalHabitantes: total });
});

app.get('/api/auditoria', authMiddleware, (req, res) => {
  const desde = Number(req.query.limit) > 0 ? Number(req.query.limit) : 100;
  res.json(db.prepare('SELECT * FROM auditoria ORDER BY id DESC LIMIT ?').all(desde));
});

app.get('/api/usuarios', (req, res) => {
  const councillors = getAllCouncillors();
  res.json(councillors.map(councillor => ({
    id: councillor.id,
    name: councillor.name,
    role: councillor.role,
    username: councillor.username,
    email: `${councillor.username}@concejo.local`,
    bloque: bloqueName(councillor.bloqueId),
    conectado: councillor.connected,
    estado: councillor.connected ? 'Activo' : 'Inactivo',
    votosEmitidos: Object.keys(councillor.votes || {}).length
  })));
});

app.get('/api/councillors', (req, res) => {
  const activeProject = getActiveProject();
  const activeId = activeProject ? activeProject.id : null;
  res.json(getAllCouncillors().map(({ id, name, role, connected, votes, bloqueId }) => ({
    id,
    name,
    role,
    connected,
    bloqueId,
    bloque: bloqueName(bloqueId),
    voted: Boolean(votes[activeId]),
    vote: votes[activeId] || null
  })));
});

function publicUser(user) {
  const activeProject = getActiveProject();
  const activeId = activeProject ? activeProject.id : null;
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    voted: Boolean(user.votes[activeId]),
    vote: user.votes[activeId] || null
  };
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = getCouncillorByUsername(username);
  if (!user || user.password !== password) {
    audit(username, 'Intento fallido', 'Credenciales inválidas');
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  user.connected = true;
  updateCouncillor(user);
  registrarPresente(user, 'panel');

  const token = createToken();
  tokens.set(token, user);
  audit(user.username, 'Inicio de sesión', `${user.name} ingresó al panel`);

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`
  );
  res.json({ token, user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = tokenFrom(req);
  if (token && tokens.has(token)) {
    const usuario = tokens.get(token);
    audit(usuario.username, 'Fin de sesión', `${usuario.name} cerró su sesión en el panel`);
    tokens.delete(token);
  }
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ success: true });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post('/api/vote', authMiddleware, (req, res) => {
  const { option } = req.body;
  const activeProject = getActiveProject();

  if (!option || !['afirmativo', 'negativo', 'abstencion'].includes(option)) {
    return res.status(400).json({ error: 'Opción de voto inválida.' });
  }

  if (!activeProject) {
    return res.status(404).json({ error: 'No hay un proyecto activo.' });
  }

  if (activeProject.status !== 'abierta') {
    return res.status(400).json({ error: 'La votación ya está cerrada.' });
  }

  const user = req.user;
  if (user.votes[activeProject.id]) {
    return res.status(409).json({ error: 'Ya emitiste tu voto en esta ordenanza.' });
  }

  const counts = {
    ...activeProject.counts,
    [option]: (activeProject.counts[option] || 0) + 1
  };
  const updatedProject = updateProject(activeProject.id, { counts });

  user.votes = { ...user.votes, [activeProject.id]: option };
  user.connected = true;
  updateCouncillor(user);

  audit(user.username, 'Voto emitido', `${activeProject.project} • ${option}`);
  res.json({ success: true, counts: computeCounts(updatedProject) });
});

app.post('/api/project/:id/activate', authMiddleware, (req, res) => {
  const project = getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Proyecto no encontrado.' });
  }
  activeProjectId = project.id;
  audit(req.user.username, 'Proyecto activado', `${project.project} pasó a ser el proyecto en votación`);
  res.json({ activeProjectId });
});

app.post('/api/sessions/:id/activate', authMiddleware, (req, res) => {
  const session = getAllSessions().find(item => item.id === Number(req.params.id));
  if (!session) {
    return res.status(404).json({ error: 'Sesión no encontrada.' });
  }
  db.prepare('UPDATE sessions SET active = 0').run();
  db.prepare('UPDATE sessions SET active = 1, status = ? WHERE id = ?').run(session.status === 'cerrada' ? 'abierta' : session.status, session.id);
  audit(req.user.username, 'Sesión activada', `${session.name} • ${session.date}`);
  res.json({ activeSessionId: session.id });
});

app.get('/api/votaciones', (req, res) => {
  const councillors = getAllCouncillors();
  const projects = getAllProjects();
  res.json(projects.map(project => {
    const detalle = { afirmativo: [], negativo: [], abstencion: [], pendientes: [] };
    councillors.forEach(councillor => {
      const voto = councillor.votes[project.id];
      if (voto && detalle[voto]) {
        detalle[voto].push({ id: councillor.id, name: councillor.name, bloque: bloqueName(councillor.bloqueId) });
      } else {
        detalle.pendientes.push({ id: councillor.id, name: councillor.name, bloque: bloqueName(councillor.bloqueId) });
      }
    });
    return {
      id: project.id,
      project: project.project,
      title: project.title,
      type: project.type,
      status: project.status,
      startedAtFull: project.startedAtFull,
      counts: computeCounts(project),
      detalle
    };
  }));
});

app.get('/api/configuracion', authMiddleware, (req, res) => {
  const sessions = getAllSessions();
  const activeSession = sessions.find(session => session.active) || sessions[0] || null;
  res.json({ config: getConfig(), quorumSesion: activeSession ? activeSession.quorumRequired : null });
});

app.put('/api/configuracion', authMiddleware, (req, res) => {
  const permitidas = ['municipio_sede', 'mayoria', 'duracion_votacion', 'pantalla_publica', 'notificaciones'];
  const cambios = Object.entries(req.body || {}).filter(([clave]) => permitidas.includes(clave));
  if (cambios.length === 0) {
    return res.status(400).json({ error: 'No hay valores válidos para guardar.' });
  }
  cambios.forEach(([clave, valor]) => setConfig(clave, valor));
  audit(req.user.username, 'Configuración', cambios.map(([clave]) => clave).join(', '));
  res.json({ config: getConfig() });
});

function codigoActivo() {
  const config = getConfig();
  const sessions = getAllSessions();
  const activeSession = sessions.find(session => session.active) || sessions[0] || null;
  if (!activeSession) {
    return null;
  }
  const guardado = Number(config.qr_sesion || 0);
  if (guardado !== activeSession.id || !config.qr_codigo) {
    const codigo = crypto.randomBytes(4).toString('hex').toUpperCase();
    setConfig('qr_codigo', codigo);
    setConfig('qr_sesion', String(activeSession.id));
    return { codigo, sesion: activeSession, creada: true };
  }
  return { codigo: config.qr_codigo, sesion: activeSession, creada: false };
}

app.get('/api/asistencia/qr', authMiddleware, (req, res) => {
  const qr = codigoActivo();
  if (!qr) {
    return res.status(404).json({ error: 'No hay sesiones registradas.' });
  }
  const registrados = db.prepare('SELECT COUNT(*) AS count FROM asistencias WHERE sesion_id = ?').get(qr.sesion.id).count;
  const councillors = getAllCouncillors();
  res.json({
    codigo: qr.codigo,
    url: `/asistencia?codigo=${qr.codigo}`,
    sesion: qr.sesion,
    registrados,
    total: councillors.length,
    ausentes: councillors.filter(c => !c.connected).map(c => ({ id: c.id, name: c.name, bloque: bloqueName(c.bloqueId) }))
  });
});

app.get('/api/asistencia', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT a.id, a.creado_en AS creadoEn, a.metodo, a.codigo, a.concejal_id AS concejalId, c.name, c.role
    FROM asistencias a
    LEFT JOIN councillors c ON c.id = a.concejal_id
    ORDER BY a.id DESC
    LIMIT 50
  `).all();
  res.json(rows);
});

app.post('/api/asistencia/checkin', (req, res) => {
  const { codigo, username } = req.body || {};
  const config = getConfig();
  if (!codigo || codigo.toUpperCase() !== String(config.qr_codigo || '').toUpperCase()) {
    return res.status(400).json({ error: 'El código de asistencia no es válido.' });
  }
  const concejal = getCouncillorByUsername(String(username || '').trim().toLowerCase());
  if (!concejal) {
    return res.status(404).json({ error: 'Concejal no encontrado.' });
  }

  concejal.connected = true;
  updateCouncillor(concejal);

  const sessions = getAllSessions();
  const activeSession = sessions.find(session => session.active) || sessions[0] || null;
  const ahora = new Date().toLocaleString('es-AR');
  db.prepare('INSERT INTO asistencias (sesion_id, concejal_id, codigo, metodo, creado_en) VALUES (?, ?, ?, ?, ?)')
    .run(activeSession ? activeSession.id : null, concejal.id, String(codigo).toUpperCase(), 'qr', ahora);
  audit(concejal.username, 'Asistencia QR', `${concejal.name} marcó presencia`);
  res.json({ success: true, name: concejal.name });
});

app.get('/api/overview', (req, res) => {
  const activeProject = getActiveProject();
  if (!activeProject) {
    return res.status(404).json({ error: 'No hay un proyecto en votación.' });
  }
  res.json({
    project: activeProject.project,
    title: activeProject.title,
    description: activeProject.description,
    status: activeProject.status,
    counts: computeCounts(activeProject),
    sessionType: activeProject.sessionType,
    startedAtFull: activeProject.startedAtFull,
    result: getResult(activeProject)
  });
});

function getResult(project) {
  const { afirmativo, negativo } = project.counts;
  if (afirmativo > negativo) {
    return { label: 'APROBADO', color: 'green' };
  }
  if (negativo > afirmativo) {
    return { label: 'RECHAZADO', color: 'red' };
  }
  return { label: 'EMPATE', color: 'orange' };
}

function iniciales(nombre) {
  return String(nombre)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(parte => parte[0].toUpperCase())
    .join('');
}

// Marcas de presencia de la sesión activa, agrupadas por concejal.
function marcasDePresencia(sesionId) {
  if (!sesionId) {
    return new Map();
  }
  const rows = db.prepare(`
    SELECT concejal_id AS concejalId, MAX(creado_en) AS hora, GROUP_CONCAT(DISTINCT metodo) AS metodos
    FROM asistencias
    WHERE sesion_id = ? AND concejal_id IS NOT NULL
    GROUP BY concejal_id
  `).all(sesionId);
  return rows.reduce((acc, row) => acc.set(row.concejalId, row), new Map());
}

// Concejales con token vivo en memoria (verdadero "en línea").
function concejalesEnLinea() {
  const ids = new Set();
  for (const usuario of tokens.values()) {
    ids.add(usuario.id);
  }
  return ids;
}

/*
 * Punto único de datos de la pantalla pública: evita que /screen haga
 * 4 pedidos cada 3 segundos y agrega presencia fina (marca de asistencia
 * + token vivo) que las APIs históricas no exponían juntas.
 */
app.get('/api/screen', (req, res) => {
  const project = getActiveProject();
  const session = getActiveSession();
  const councillors = getAllCouncillors();
  const marcas = marcasDePresencia(session ? session.id : null);
  const enLinea = concejalesEnLinea();
  const bloques = new Map(getBloques().map(b => [b.id, b]));

  const total = councillors.length;
  const presentes = councillors.filter(c => c.connected || marcas.has(c.id)).length;
  const requerido = session ? session.quorumRequired : Math.ceil(total / 2);
  const counts = project ? computeCounts(project) : { afirmativo: 0, negativo: 0, abstencion: 0, pendientes: total };
  const emitidos = project ? counts.afirmativo + counts.negativo + counts.abstencion : 0;
  const mayoria = project && counts.afirmativo > Math.floor((counts.afirmativo + counts.negativo) / 2);

  res.json({
    sesion: session
      ? { id: session.id, nombre: session.name, fecha: session.date, estado: session.status, requerido: session.quorumRequired, proyectos: session.projectCount }
      : null,
    concejales: councillors.map(c => {
      const marca = marcas.get(c.id);
      return {
        id: c.id,
        name: c.name,
        role: c.role,
        iniciales: iniciales(c.name),
        bloque: bloqueName(c.bloqueId),
        bloqueSigla: bloques.get(c.bloqueId)?.sigla || '—',
        bloqueColor: bloques.get(c.bloqueId)?.color || '#5b6b8c',
        conectado: Boolean(c.connected),
        enLinea: enLinea.has(c.id),
        presente: Boolean(c.connected || marca),
        marca: marca ? marca.hora : null,
        metodo: marca ? marca.metodos : null,
        voto: c.votes[project ? project.id : -1] || null
      };
    }),
    presencia: {
      total,
      presentes,
      ausentes: total - presentes,
      enLinea: councillors.filter(c => enLinea.has(c.id)).length,
      porcentaje: total ? Math.round((presentes / total) * 100) : 0,
      quorumAlcanzado: presentes >= requerido
    },
    proyecto: project
      ? {
        project: project.project,
        title: project.title,
        description: project.description,
        type: project.type,
        status: project.status,
        sessionType: project.sessionType,
        startedAtFull: project.startedAtFull,
        counts,
        total: project.totalCouncillors || total,
        emitidos,
        participacion: total ? Math.round((emitidos / total) * 100) : 0,
        mayoria,
        resultado: getResult(project)
      }
      : null,
    serverAt: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  });
});

const VISTAS = {
  dashboard: { titulo: 'Votación en curso', descripcion: 'Sesión en tiempo real, resumen y emisión de votos.' },
  usuarios: { titulo: 'Usuarios', descripcion: 'Cuentas, roles y estado de conexión del cuerpo legislativo.' },
  concejales: { titulo: 'Concejales', descripcion: 'Datos de concejales, bloque y asistencia a la sesión.' },
  bloques: { titulo: 'Bloques', descripcion: 'Bloques políticos, integrantes y presencia por bloque.' },
  municipios: { titulo: 'Municipios', descripcion: 'Municipios del departamento y su peso electoral.' },
  sesiones: { titulo: 'Sesiones', descripcion: 'Sesiones convocadas, estado y quórum requerido.' },
  'asistencia-qr': { titulo: 'Asistencia QR', descripcion: 'Código de asistencia y marcas de presencia del día.' },
  quorum: { titulo: 'Quórum', descripcion: 'Concejales presentes, ausentes y validez del quórum.' },
  'orden-del-dia': { titulo: 'Orden del Día', descripcion: 'Puntos del orden del día y su estado de tratamiento.' },
  proyectos: { titulo: 'Proyectos', descripcion: 'Expedientes ingresados y su estado de votación.' },
  votaciones: { titulo: 'Votaciones', descripcion: 'Detalle voto a voto de cada proyecto tratado.' },
  reportes: { titulo: 'Reportes', descripcion: 'Indicadores consolidados y descarga de resultados.' },
  estadisticas: { titulo: 'Estadísticas', descripcion: 'Comportamiento histórico del cuerpo y participación.' },
  auditoria: { titulo: 'Auditoría', descripcion: 'Registro de acciones realizadas sobre el sistema.' },
  configuracion: { titulo: 'Configuración', descripcion: 'Parámetros de funcionamiento del sistema de votación.' }
};

const cacheVistas = new Map();

function leerVista(nombre) {
  if (!cacheVistas.has(nombre)) {
    cacheVistas.set(nombre, fs.readFileSync(path.join(__dirname, 'public', nombre), 'utf8'));
  }
  return cacheVistas.get(nombre);
}

function renderPagina(res, clave) {
  const vista = VISTAS[clave];
  const pagina = leerVista(`vistas/${clave}.html`);
  const nav = Object.entries(VISTAS)
    .map(([key, item]) => `<a class="nav-link${key === clave ? ' active' : ''}" href="/${key}">${item.titulo}</a>`)
    .join('\n        ');
  const html = leerVista('layout.html')
    .replace('{{NAV}}', () => nav)
    .replace('{{TITULO}}', () => `${vista.titulo} • Concejo Deliberante`)
    .replace('{{PAGE}}', () => clave)
    .replace('{{CABECERA}}', () => vista.titulo)
    .replace('{{DESCRIPCION}}', () => vista.descripcion)
    .replace('{{CONTENIDO}}', () => pagina);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

function paginaProtegida(req, res, next) {
  const token = tokenFrom(req);
  if (!token || !tokens.has(token)) {
    return res.redirect('/login');
  }
  next();
}

Object.keys(VISTAS).forEach(clave => {
  app.get(`/${clave}`, paginaProtegida, (req, res) => renderPagina(res, clave));
});

app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

app.get('/login', (req, res) => {
  const token = tokenFrom(req);
  if (token && tokens.has(token)) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/asistencia', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'asistencia.html'));
});

app.get('/screen', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'screen.html'));
});

app.get('*', (req, res) => {
  res.redirect('/dashboard');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor de votación corriendo en http://localhost:${port}`);
});
