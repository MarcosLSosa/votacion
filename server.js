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
const dbPath = path.join(dataDir, 'votacion.db');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
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
`);

function rowToCouncillor(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    username: row.username,
    password: row.password,
    connected: Boolean(row.connected),
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
}

seedDatabase();

let activeProjectId = 1;
const tokens = new Map();

function createToken() {
  return crypto.randomBytes(16).toString('hex');
}

function authMiddleware(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token || !tokens.has(token)) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  const user = tokens.get(token);
  req.user = user;
  next();
}

function getProject(projectId) {
  return projects.find(project => project.id === Number(projectId));
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
  const connected = councillors.filter(c => c.connected).length;
  return {
    ...activeProject,
    counts: computeCounts(activeProject),
    connectedCouncillors: connected
  };
}

app.get('/api/session', (req, res) => {
  res.json(getSessionOverview());
});

app.get('/api/projects', (req, res) => {
  res.json(projects.map(project => ({
    ...project,
    counts: computeCounts(project)
  })));
});

app.get('/api/history', (req, res) => {
  res.json(projects
    .filter(project => project.status !== 'abierta')
    .map(project => ({
      ...project,
      counts: computeCounts(project)
    })));
});

app.get('/api/sessions', (req, res) => {
  res.json(sessions);
});

app.get('/api/order-of-day', (req, res) => {
  res.json(orderOfDay);
});

app.get('/api/quorum', (req, res) => {
  const connected = councillors.filter(c => c.connected).length;
  const activeSession = sessions.find(session => session.active) || sessions[0];
  res.json({
    activeSession,
    connected,
    totalCouncillors: councillors.length,
    quorumRequired: activeSession.quorumRequired,
    quorumReached: connected >= activeSession.quorumRequired,
    present: connected,
    absent: councillors.length - connected
  });
});

app.get('/api/attendance', (req, res) => {
  const attendance = councillors.map(c => ({
    id: c.id,
    name: c.name,
    role: c.role,
    connected: c.connected,
    vote: c.votes[activeProjectId] || 'Pendiente'
  }));
  res.json(attendance);
});

app.get('/api/reports', (req, res) => {
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
  const activeSession = sessions.find(session => session.active) || sessions[0];
  const affirmatives = projects.reduce((sum, project) => sum + project.counts.afirmativo, 0);
  const negatives = projects.reduce((sum, project) => sum + project.counts.negativo, 0);
  const abstentions = projects.reduce((sum, project) => sum + project.counts.abstencion, 0);
  res.json({
    activeSessionName: activeSession.name,
    activeProjects: projects.filter(project => project.status === 'abierta').length,
    totalVotes: affirmatives + negatives + abstentions,
    affirmatives,
    negatives,
    abstentions,
    participationRate: Math.round((councillors.filter(c => c.connected).length / councillors.length) * 100)
  });
});

app.get('/api/project/:id', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Proyecto no encontrado.' });
  }
  res.json({ ...project, counts: computeCounts(project) });
});

app.get('/api/councillors', (req, res) => {
  const activeProject = getActiveProject();
  res.json(councillors.map(({ id, name, role, connected, votes }) => ({
    id,
    name,
    role,
    connected,
    voted: Boolean(votes[activeProject.id]),
    vote: votes[activeProject.id] || null
  })));
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = councillors.find(c => c.username === username && c.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  user.connected = true;
  const token = createToken();
  tokens.set(token, user);

  const activeProject = getActiveProject();
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      voted: Boolean(user.votes[activeProject.id]),
      vote: user.votes[activeProject.id] || null
    }
  });
});

app.post('/api/vote', authMiddleware, (req, res) => {
  const { option } = req.body;
  const activeProject = getActiveProject();

  if (!option || !['afirmativo', 'negativo', 'abstencion'].includes(option)) {
    return res.status(400).json({ error: 'Opción de voto inválida.' });
  }

  if (activeProject.status !== 'abierta') {
    return res.status(400).json({ error: 'La votación ya está cerrada.' });
  }

  const user = req.user;
  if (user.votes[activeProject.id]) {
    return res.status(409).json({ error: 'Ya emitiste tu voto en esta ordenanza.' });
  }

  activeProject.counts[option] += 1;
  user.votes[activeProject.id] = option;
  user.connected = true;

  res.json({ success: true, counts: computeCounts(activeProject) });
});

app.post('/api/project/:id/activate', authMiddleware, (req, res) => {
  const project = getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Proyecto no encontrado.' });
  }
  activeProjectId = project.id;
  res.json({ activeProjectId });
});

app.get('/api/overview', (req, res) => {
  const activeProject = getActiveProject();
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

app.get('/screen', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'screen.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor de votación corriendo en http://localhost:${port}`);
});
