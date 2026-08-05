const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const councillors = [
  { id: 1, name: 'Sofía Pérez', role: 'Presidenta', username: 'sofia', password: '1234', connected: true, votes: { 1: 'afirmativo' } },
  { id: 2, name: 'Juan López', role: 'Vicepresidente', username: 'juan', password: '1234', connected: true, votes: { 1: 'afirmativo' } },
  { id: 3, name: 'María Gómez', role: 'Concejala', username: 'maria', password: '1234', connected: true, votes: { 1: 'afirmativo' } },
  { id: 4, name: 'Carlos Díaz', role: 'Concejal', username: 'carlos', password: '1234', connected: true, votes: { 1: 'afirmativo' } },
  { id: 5, name: 'Ana Ruiz', role: 'Concejala', username: 'ana', password: '1234', connected: true, votes: { 1: 'afirmativo' } },
  { id: 6, name: 'Pedro Martínez', role: 'Concejal', username: 'pedro', password: '1234', connected: true, votes: { 1: 'afirmativo' } },
  { id: 7, name: 'Lucía Fernández', role: 'Concejala', username: 'lucia', password: '1234', connected: true, votes: { 1: 'negativo' } },
  { id: 8, name: 'Diego Torres', role: 'Concejal', username: 'diego', password: '1234', connected: true, votes: { 1: 'negativo' } },
  { id: 9, name: 'Marta Silva', role: 'Concejala', username: 'marta', password: '1234', connected: false, votes: { 1: 'abstencion' } },
  { id: 10, name: 'Raúl Pérez', role: 'Concejal', username: 'raul', password: '1234', connected: true, votes: {} },
  { id: 11, name: 'Patricia Ortiz', role: 'Concejala', username: 'patricia', password: '1234', connected: false, votes: { 1: 'afirmativo' } },
  { id: 12, name: 'Leo Ramos', role: 'Concejal', username: 'leo', password: '1234', connected: false, votes: { 1: 'afirmativo' } }
];

const projects = [
  {
    id: 1,
    project: 'Proyecto Nº 125/2026',
    title: 'Declaración de interés municipal la Feria del Libro 2026',
    description: 'Declarar de interés municipal la realización de la Feria del Libro 2026 a desarrollarse en nuestra ciudad.',
    type: 'Declaración',
    startedBy: 'Bloque Unión por la Ciudad',
    startedAt: '10:15 hs',
    startedAtFull: '02 de julio de 2026 • 10:32 hs',
    status: 'abierta',
    sessionType: 'Sesión Ordinaria',
    totalCouncillors: 12,
    counts: { afirmativo: 8, negativo: 2, abstencion: 1 }
  },
  {
    id: 2,
    project: 'Ordenanza Nº 216/2026',
    title: 'Regulación del uso de espacios verdes municipales',
    description: 'Establecer criterios de uso, protección y mantenimiento para los espacios verdes de la ciudad.',
    type: 'Ordenanza',
    startedBy: 'Bloque Ciudadana',
    startedAt: '09:40 hs',
    startedAtFull: '01 de julio de 2026 • 09:40 hs',
    status: 'finalizada',
    sessionType: 'Sesión Ordinaria',
    totalCouncillors: 12,
    counts: { afirmativo: 9, negativo: 1, abstencion: 2 }
  },
  {
    id: 3,
    project: 'Ordenanza Nº 220/2026',
    title: 'Actualización de la normativa de tránsito para ciclistas',
    description: 'Modificar la normativa de tránsito para mejorar la seguridad de ciclistas y peatones.',
    type: 'Ordenanza',
    startedBy: 'Bloque Unión por la Ciudad',
    startedAt: '11:05 hs',
    startedAtFull: '03 de julio de 2026 • 11:05 hs',
    status: 'finalizada',
    sessionType: 'Sesión Ordinaria',
    totalCouncillors: 12,
    counts: { afirmativo: 7, negativo: 4, abstencion: 1 }
  }
];

const sessions = [
  {
    id: 1,
    name: 'Sesión Ordinaria',
    date: '05 de agosto de 2026',
    status: 'abierta',
    quorumRequired: 7,
    projectCount: 3,
    active: true
  },
  {
    id: 2,
    name: 'Sesión Extraordinaria',
    date: '02 de agosto de 2026',
    status: 'cerrada',
    quorumRequired: 7,
    projectCount: 2,
    active: false
  }
];

const orderOfDay = [
  { id: 1, title: 'Proyecto Nº 125/2026', status: 'En discusión', presenter: 'Bloque Unión por la Ciudad' },
  { id: 2, title: 'Ordenanza Nº 216/2026', status: 'Aprobado', presenter: 'Bloque Ciudadana' },
  { id: 3, title: 'Ordenanza Nº 220/2026', status: 'Rechazado', presenter: 'Bloque Independiente' }
];

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
