const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const QRCode = require('qrcode');

const app = express();
app.disable('x-powered-by');
const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 10) {
  throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10.');
}
app.set('trust proxy', proxyHops);
const publicBaseUrl = process.env.PUBLIC_BASE_URL ? new URL(process.env.PUBLIC_BASE_URL) : null;
if (process.env.NODE_ENV === 'production') {
  if (!publicBaseUrl || publicBaseUrl.protocol !== 'https:' || publicBaseUrl.pathname !== '/' || publicBaseUrl.search || publicBaseUrl.hash || publicBaseUrl.username || publicBaseUrl.password) {
    throw new Error('Set PUBLIC_BASE_URL to the HTTPS origin used to access the application.');
  }
  if (proxyHops < 1) {
    throw new Error('Set TRUST_PROXY_HOPS to the number of trusted HTTPS proxy hops in production.');
  }
}
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"
  );
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const log = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? 'error' : 'info',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      remoteAddress: req.ip
    };
    process.stdout.write(`${JSON.stringify(log)}\n`);
  });
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.status(426).json({ error: 'Se requiere HTTPS. Configurá el proxy TLS y TRUST_PROXY_HOPS.' });
  }
  if (process.env.NODE_ENV === 'production' && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'deny', index: false }));

const dataDir = path.join(__dirname, 'data');
// VOTACION_DB permite aislar la base (pruebas automatizadas, demos) sin tocar data/votacion.db
const dbPath = process.env.VOTACION_DB ? path.resolve(process.env.VOTACION_DB) : path.join(dataDir, 'votacion.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');
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

  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES councillors(id) ON DELETE CASCADE,
    csrf_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    last_activity_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
  CREATE TABLE IF NOT EXISTS rate_limits (
    scope TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    window_started_at INTEGER NOT NULL,
    hit_count INTEGER NOT NULL,
    PRIMARY KEY (scope, key_hash)
  );
`);

const columnaBloque = db
  .prepare("SELECT COUNT(*) AS count FROM pragma_table_info('councillors') WHERE name = 'bloque_id'")
  .get().count;
if (columnaBloque === 0) {
  db.exec('ALTER TABLE councillors ADD COLUMN bloque_id INTEGER');
}

const columnaPerfil = db
  .prepare("SELECT COUNT(*) AS count FROM pragma_table_info('councillors') WHERE name = 'perfil'")
  .get().count;
if (columnaPerfil === 0) {
  db.exec('ALTER TABLE councillors ADD COLUMN perfil TEXT');
}

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const BOOTSTRAP_PASSWORD = process.env.VOTACION_BOOTSTRAP_PASSWORD || '';
const TEST_PASSWORD = process.env.NODE_ENV === 'test' ? process.env.VOTACION_TEST_PASSWORD || '' : '';

if (BOOTSTRAP_PASSWORD && BOOTSTRAP_PASSWORD.length < 12) {
  throw new Error('VOTACION_BOOTSTRAP_PASSWORD must be at least 12 characters long.');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verificarPassword(password, guardado) {
  const partes = String(guardado || '').split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') {
    return false;
  }
  const [, n, r, p, saltHex, hashHex] = partes;
  const parametros = { N: Number(n), r: Number(r), p: Number(p) };
  const salt = Buffer.from(saltHex, 'hex');
  const esperado = Buffer.from(hashHex, 'hex');
  if (
    parametros.N !== SCRYPT_N ||
    parametros.r !== SCRYPT_R ||
    parametros.p !== SCRYPT_P ||
    salt.length !== 16 ||
    esperado.length !== SCRYPT_KEY_LENGTH
  ) {
    return false;
  }
  const actual = crypto.scryptSync(password, salt, esperado.length, {
    ...parametros,
    maxmem: SCRYPT_MAXMEM
  });
  return crypto.timingSafeEqual(actual, esperado);
}

function passwordInicial(username) {
  if (TEST_PASSWORD) {
    return hashPassword(TEST_PASSWORD);
  }
  if (username === 'sofia' && BOOTSTRAP_PASSWORD) {
    return hashPassword(BOOTSTRAP_PASSWORD);
  }
  return hashPassword(crypto.randomBytes(32).toString('base64url'));
}

/*
 * Niveles de acceso del panel. `councillors.perfil` guarda el nivel asignado y,
 * si está vacío, se deduce del cargo (columna `role`).
 *   concejal (1): vota y consulta la sesión.
 *   mesa     (2): + auditoría, asistencia/QR y activar sesiones o proyectos.
 *   admin    (3): + gestión de usuarios y configuración del sistema.
 * Cada nivel incluye los permisos del anterior.
 */
const NIVELES = { concejal: 1, mesa: 2, admin: 3 };
const PERFILES = {
  concejal: { etiqueta: 'Concejal', nivel: NIVELES.concejal },
  mesa: { etiqueta: 'Mesa', nivel: NIVELES.mesa },
  admin: { etiqueta: 'Administrador', nivel: NIVELES.admin }
};

// Deducción del nivel a partir del cargo político ('Presidenta' → admin, etc).
function perfilPorCargo(cargo) {
  const texto = String(cargo || '').trim().toLowerCase();
  if (/administrad[oa]r|t[eé]cnico|sistema/.test(texto)) {
    return 'admin';
  }
  // 'Vicepresidente' se evalúa antes que 'Presidente': es mesa, no presidencia.
  if (/^vice|secretario|secretaria|prosecretario/.test(texto)) {
    return 'mesa';
  }
  if (/president[ea]/.test(texto)) {
    return 'admin';
  }
  return 'concejal';
}

function normalizarPerfil(valor, cargo) {
  const perfil = String(valor || '').trim().toLowerCase();
  return PERFILES[perfil] ? perfil : perfilPorCargo(cargo);
}

function nivelDe(perfil) {
  return PERFILES[perfil] ? PERFILES[perfil].nivel : PERFILES.concejal.nivel;
}

function permite(perfil, minimo) {
  return nivelDe(normalizarPerfil(perfil)) >= (NIVELES[minimo] || 1);
}

/*
 * Las bases previas a los roles no tienen `perfil`: se completa una sola vez
 * según el cargo de cada concejal. Después manda lo que diga la columna.
 */
function sincronizarPerfiles() {
  const pendientes = db.prepare("SELECT id, role FROM councillors WHERE perfil IS NULL OR perfil = ''").all();
  if (pendientes.length === 0) {
    return;
  }
  const asignar = db.prepare('UPDATE councillors SET perfil = ? WHERE id = ?');
  const aplicar = db.transaction(rows => {
    for (const row of rows) {
      asignar.run(perfilPorCargo(row.role), row.id);
    }
  });
  aplicar(pendientes);
}

function rowToCouncillor(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    perfil: normalizarPerfil(row.perfil, row.role),
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
  const normalized = String(username || '').trim().toLowerCase();
  const row = db.prepare('SELECT * FROM councillors WHERE username = ?').get(normalized);
  return row ? rowToCouncillor(row) : null;
}

function getCouncillorById(id) {
  const row = db.prepare('SELECT * FROM councillors WHERE id = ?').get(id);
  return row ? rowToCouncillor(row) : null;
}

function updateCouncillor(updated) {
  db.prepare(
    'UPDATE councillors SET name = ?, role = ?, username = ?, password = ?, connected = ?, votes = ?, perfil = ? WHERE id = ?'
  ).run(
    updated.name,
    updated.role,
    updated.username,
    updated.password,
    updated.connected ? 1 : 0,
    JSON.stringify(updated.votes || {}),
    normalizarPerfil(updated.perfil, updated.role),
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
  if (process.env.NODE_ENV === 'test' && process.env.VOTACION_EMPTY_START === '1') {
    const administratorCount = db.prepare('SELECT COUNT(*) AS count FROM councillors').get().count;
    if (administratorCount === 0) {
      if (!TEST_PASSWORD) {
        throw new Error('Set VOTACION_TEST_PASSWORD when using VOTACION_EMPTY_START.');
      }
      db.prepare(`
        INSERT INTO councillors (id, name, role, username, password, connected, votes, perfil)
        VALUES (1, 'Sofía Pérez', 'Presidenta', 'sofia', ?, 0, '{}', 'admin')
      `).run(passwordInicial('sofia'));
    }
    const configDefaults = [
      ['municipio_sede', ''],
      ['mayoria', 'Simple'],
      ['duracion_votacion', '5'],
      ['pantalla_publica', '1'],
      ['notificaciones', '0']
    ];
    const saveConfig = db.prepare('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)');
    configDefaults.forEach(([key, value]) => saveConfig.run(key, value));
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    const requiredTables = ['councillors', 'projects', 'sessions', 'bloques', 'municipios', 'configuracion'];
    const emptyTables = requiredTables.filter(table => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count === 0);
    const administratorExists = db.prepare('SELECT id, role, perfil FROM councillors')
      .all()
      .some(user => normalizarPerfil(user.perfil, user.role) === 'admin');
    if (emptyTables.length || !administratorExists) {
      const missing = [...emptyTables, ...(!administratorExists ? ['administrador'] : [])].join(', ');
      throw new Error(`Production startup requires provisioned official data; refusing demo seed. Missing: ${missing}.`);
    }
    return;
  }

  const councillorCount = db.prepare('SELECT COUNT(*) AS count FROM councillors').get().count;
  if (councillorCount === 0) {
    if (!TEST_PASSWORD && !BOOTSTRAP_PASSWORD) {
      throw new Error('Set VOTACION_BOOTSTRAP_PASSWORD (at least 12 characters) before initializing accounts.');
    }
    const stmt = db.prepare(
      'INSERT INTO councillors (id, name, role, username, password, connected, votes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const initial = [
      [1, 'Sofía Pérez', 'Presidenta', 'sofia', 1, JSON.stringify({ 1: 'afirmativo' })],
      [2, 'Juan López', 'Vicepresidente', 'juan', 1, JSON.stringify({ 1: 'afirmativo' })],
      [3, 'María Gómez', 'Concejala', 'maria', 1, JSON.stringify({ 1: 'afirmativo' })],
      [4, 'Carlos Díaz', 'Concejal', 'carlos', 1, JSON.stringify({ 1: 'afirmativo' })],
      [5, 'Ana Ruiz', 'Concejala', 'ana', 1, JSON.stringify({ 1: 'afirmativo' })],
      [6, 'Pedro Martínez', 'Concejal', 'pedro', 1, JSON.stringify({ 1: 'afirmativo' })],
      [7, 'Lucía Fernández', 'Concejala', 'lucia', 1, JSON.stringify({ 1: 'negativo' })],
      [8, 'Diego Torres', 'Concejal', 'diego', 1, JSON.stringify({ 1: 'negativo' })],
      [9, 'Marta Silva', 'Concejala', 'marta', 0, JSON.stringify({ 1: 'abstencion' })],
      [10, 'Raúl Pérez', 'Concejal', 'raul', 1, JSON.stringify({})],
      [11, 'Patricia Ortiz', 'Concejala', 'patricia', 0, JSON.stringify({ 1: 'afirmativo' })],
      [12, 'Leo Ramos', 'Concejal', 'leo', 0, JSON.stringify({ 1: 'afirmativo' })]
    ];
    const insert = db.transaction(rows => {
      for (const [id, name, role, username, connected, votes] of rows) {
        stmt.run(id, name, role, username, passwordInicial(username), connected, votes);
      }
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
function migrarPasswordsPlanas() {
  const sinHash = db.prepare("SELECT id, username FROM councillors WHERE password NOT LIKE 'scrypt$%' OR password IS NULL").all();
  if (sinHash.length === 0) {
    return;
  }
  if (!TEST_PASSWORD && !BOOTSTRAP_PASSWORD) {
    throw new Error('Legacy plaintext passwords found. Set VOTACION_BOOTSTRAP_PASSWORD before restarting to rotate them securely.');
  }
  const actualizar = db.prepare('UPDATE councillors SET password = ? WHERE id = ?');
  const migrar = db.transaction(rows => {
    for (const usuario of rows) {
      const password = TEST_PASSWORD
        ? TEST_PASSWORD
        : usuario.username === 'sofia'
          ? BOOTSTRAP_PASSWORD
          : crypto.randomBytes(32).toString('base64url');
      actualizar.run(hashPassword(password), usuario.id);
    }
  });
  migrar(sinHash);
}
migrarPasswordsPlanas();
sincronizarPerfiles();

let activeProjectId = Number(getConfig().active_project_id || 1);
const SESSION_COOKIE = 'votacion_token';
const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 30 * 60 * 1000;
db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ? OR last_activity_at <= ?')
  .run(Date.now(), Date.now() - SESSION_IDLE_MS);

function createToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashOpaqueToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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
    try {
      acc[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return acc;
    }
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

function reqActivityHeader(req) {
  return req ? req.get('x-user-activity-at') : null;
}

function findAuthSession(token, req) {
  if (typeof token !== 'string' || !token) {
    return null;
  }
  const session = db.prepare('SELECT * FROM auth_sessions WHERE token_hash = ?').get(hashOpaqueToken(token));
  if (!session) {
    return null;
  }
  const now = Date.now();
  if (session.expires_at <= now || session.last_activity_at <= now - SESSION_IDLE_MS) {
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(session.token_hash);
    return null;
  }
  const activityAt = Number(reqActivityHeader(req));
  if (Number.isSafeInteger(activityAt) && activityAt >= session.last_activity_at && activityAt <= now) {
    db.prepare('UPDATE auth_sessions SET last_seen_at = ?, last_activity_at = ? WHERE token_hash = ?')
      .run(now, activityAt, session.token_hash);
  } else if (now - session.last_seen_at >= 60_000) {
    db.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?').run(now, session.token_hash);
  }
  return session;
}

function sameOrigin(req) {
  const origin = req.get('origin');
  const referer = req.get('referer');
  if (!origin && !referer) {
    return false;
  }
  try {
    const actual = new URL(origin || referer);
    const expectedOrigin = publicBaseUrl ? publicBaseUrl.origin : `${req.protocol}://${req.get('host')}`;
    return actual.origin === expectedOrigin;
  } catch {
    return false;
  }
}

function csrfProtection(req, res, next) {
  const endpoint = req.originalUrl.split('?')[0];
  const credentialEndpoints = ['/api/auth/login', '/api/asistencia/checkin'];
  const credentialEndpoint = credentialEndpoints.includes(endpoint);
  if (
    ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ||
    (req.headers['x-auth-token'] && !credentialEndpoint)
  ) {
    return next();
  }
  if (!sameOrigin(req)) {
    return res.status(403).json({ error: 'Origen de solicitud no permitido.' });
  }
  if (credentialEndpoint) {
    return next();
  }
  const cookieToken = readCookies(req)[SESSION_COOKIE];
  const session = cookieToken ? findAuthSession(cookieToken, req) : null;
  if (!session) {
    return next();
  }
  const csrfToken = req.get('x-csrf-token') || '';
  const suppliedHash = Buffer.from(hashOpaqueToken(csrfToken), 'hex');
  const expectedHash = Buffer.from(session.csrf_hash, 'hex');
  if (
    !csrfToken ||
    suppliedHash.length !== expectedHash.length ||
    !crypto.timingSafeEqual(suppliedHash, expectedHash)
  ) {
    return res.status(403).json({ error: 'Token CSRF inválido o ausente.' });
  }
  next();
}

function rateLimit(scope, maxHits, windowMs) {
  let requestsSinceCleanup = 0;
  return (req, res, next) => {
    let secret = getConfig().rate_limit_secret;
    if (!secret) {
      secret = crypto.randomBytes(32).toString('hex');
      setConfig('rate_limit_secret', secret);
    }
    const identity = `${req.ip || req.socket.remoteAddress || 'unknown'}`;
    const keyHash = crypto.createHmac('sha256', secret).update(identity).digest('hex');
    const now = Date.now();
    const updateLimit = db.transaction(() => {
      const existing = db.prepare('SELECT window_started_at, hit_count FROM rate_limits WHERE scope = ? AND key_hash = ?')
        .get(scope, keyHash);
      if (!existing || existing.window_started_at <= now - windowMs) {
        db.prepare(`
          INSERT INTO rate_limits (scope, key_hash, window_started_at, hit_count)
          VALUES (?, ?, ?, 1)
          ON CONFLICT(scope, key_hash) DO UPDATE SET window_started_at = excluded.window_started_at, hit_count = 1
        `).run(scope, keyHash, now);
        return { count: 1, windowStartedAt: now };
      }
      const count = existing.hit_count + 1;
      db.prepare('UPDATE rate_limits SET hit_count = ? WHERE scope = ? AND key_hash = ?')
        .run(count, scope, keyHash);
      return { count, windowStartedAt: existing.window_started_at };
    });
    const result = updateLimit();
    requestsSinceCleanup += 1;
    if (requestsSinceCleanup >= 500) {
      db.prepare('DELETE FROM rate_limits WHERE window_started_at < ?').run(now - windowMs * 3);
      requestsSinceCleanup = 0;
    }
    if (result.count > maxHits) {
      const retryAfter = Math.max(1, Math.ceil((result.windowStartedAt + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Demasiados intentos. Esperá antes de volver a intentar.', retryAfter });
    }
    next();
  };
}

app.use('/api', csrfProtection);

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
  const sesion = findAuthSession(token, req);
  if (!sesion) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  const usuario = getCouncillorById(sesion.user_id);
  if (!usuario) {
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(sesion.token_hash);
    return res.status(401).json({ error: 'No autorizado.' });
  }

  req.user = usuario;
  req.token = token;
  req.sessionHash = sesion.token_hash;
  req.perfil = normalizarPerfil(usuario.perfil, usuario.role);
  req.nivel = nivelDe(req.perfil);
  next();
}

/*
 * Exige un nivel mínimo (concejal < mesa < admin). Responde 403 y deja constancia
 * en la auditoría de quién intentó entrar a una sección que no le corresponde.
 */
function requirePerfil(minimo) {
  return (req, res, next) => {
    if (permite(req.perfil, minimo)) {
      return next();
    }
    audit(
      req.user ? req.user.username : 'anonimo',
      'Acceso denegado',
      `${req.method} ${req.originalUrl} requiere ${PERFILES[minimo].etiqueta} (nivel de ${req.user ? req.user.username : 'anonimo'}: ${PERFILES[req.perfil] ? PERFILES[req.perfil].etiqueta : 'concejal'})`
    );
    return res.status(403).json({
      error: `Esta sección requiere el nivel ${PERFILES[minimo].etiqueta}. Tu nivel actual es ${PERFILES[req.perfil] ? PERFILES[req.perfil].etiqueta : 'Concejal'}.`,
      requiere: minimo
    });
  };
}

function getActiveProject() {
  let project = getProject(activeProjectId);
  const deadline = Number(getConfig().voting_deadline_at || 0);
  if (project && project.status === 'abierta' && deadline > 0 && Date.now() >= deadline) {
    project = updateProject(project.id, { status: 'finalizada' });
    setConfig('voting_deadline_at', '');
    audit('system', 'Votación cerrada automáticamente', `${project.project} alcanzó el límite de duración configurado`);
  }
  return project;
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
  const activeSession = getActiveSession();
  return {
    ...activeProject,
    counts: computeCounts(activeProject),
    connectedCouncillors: connected,
    votingDeadline: Number(getConfig().voting_deadline_at || 0) || null,
    activeSession: activeSession ? { id: activeSession.id, name: activeSession.name, date: activeSession.date } : null
  };
}

function getActiveSession() {
  const sessions = getAllSessions();
  return sessions.find(session => session.active) || sessions[0] || null;
}

app.get('/api/session', authMiddleware, (req, res) => {
  const overview = getSessionOverview();
  if (!overview) {
    return res.status(404).json({ error: 'No hay un proyecto en votación.' });
  }
  res.json(overview);
});

if (!getProject(activeProjectId)) {
  activeProjectId = getAllProjects().find(project => project.status === 'abierta')?.id || getAllProjects()[0]?.id || 0;
  setConfig('active_project_id', String(activeProjectId));
}
if (
  activeProjectId &&
  getActiveProject()?.status === 'abierta' &&
  (!Number.isFinite(Number(getConfig().voting_deadline_at)) || Number(getConfig().voting_deadline_at) <= 0)
) {
  const durationMinutes = Number(getConfig().duracion_votacion);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 120) {
    throw new Error('duracion_votacion must be an integer between 1 and 120 minutes.');
  }
  setConfig('voting_deadline_at', String(Date.now() + durationMinutes * 60_000));
}
const votingTimer = setInterval(() => getActiveProject(), 1000);
votingTimer.unref();

app.get('/api/projects', authMiddleware, (req, res) => {
  res.json(getAllProjects().map(project => ({
    ...project,
    active: project.status === 'abierta' && project.id === activeProjectId,
    counts: computeCounts(project)
  })));
});

app.post('/api/projects', authMiddleware, requirePerfil('mesa'), (req, res) => {
  const body = req.body || {};
  const project = typeof body.project === 'string' ? body.project.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const type = typeof body.type === 'string' ? body.type.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!project || project.length > 80 || !title || title.length > 200 || !type || type.length > 80 || description.length > 2000) {
    return res.status(400).json({ error: 'Completá expediente, título y tipo; revisá los límites de longitud.' });
  }
  if (db.prepare('SELECT id FROM projects WHERE lower(project) = lower(?)').get(project)) {
    return res.status(409).json({ error: 'Ya existe un expediente con ese identificador.' });
  }
  const councillors = getAllCouncillors();
  if (!councillors.length) {
    return res.status(409).json({ error: 'Creá al menos un concejal antes de cargar un proyecto.' });
  }

  const now = new Date();
  const activeSession = getActiveSession();
  const sessionType = activeSession ? activeSession.name : String(body.sessionType || '').trim();
  if (!sessionType || sessionType.length > 120) {
    return res.status(400).json({ error: 'Indicá la sesión a la que pertenece el proyecto.' });
  }
  const projectRecord = createProject({
    project,
    title,
    description,
    type,
    startedBy: req.user.name,
    startedAt: now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
    startedAtFull: now.toLocaleString('es-AR'),
    status: 'abierta',
    sessionType,
    totalCouncillors: councillors.length,
    counts: { afirmativo: 0, negativo: 0, abstencion: 0 }
  });
  db.prepare('INSERT INTO order_of_day (title, status, presenter) VALUES (?, ?, ?)')
    .run(project, 'Pendiente', req.user.name);
  if (activeSession) {
    db.prepare('UPDATE sessions SET projectCount = projectCount + 1 WHERE id = ?').run(activeSession.id);
  }
  audit(req.user.username, 'Proyecto creado', `${project} • ${title}`);
  res.status(201).json({ project: projectRecord });
});

app.get('/api/history', authMiddleware, requirePerfil('mesa'), (req, res) => {
  res.json(getAllProjects()
    .filter(project => project.status !== 'abierta')
    .map(project => ({
      ...project,
      counts: computeCounts(project)
    })));
});

app.get('/api/sessions', authMiddleware, requirePerfil('mesa'), (req, res) => {
  res.json(getAllSessions());
});

app.post('/api/sessions', authMiddleware, requirePerfil('mesa'), (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const date = typeof body.date === 'string' ? body.date.trim() : '';
  const quorumRequired = Number(body.quorumRequired);
  const active = body.active === true;
  const councillorCount = getAllCouncillors().length;
  if (!name || name.length > 120 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`))) {
    return res.status(400).json({ error: 'Ingresá un nombre de sesión y una fecha válida.' });
  }
  if (!Number.isInteger(quorumRequired) || quorumRequired < 1 || quorumRequired > councillorCount) {
    return res.status(400).json({ error: `El quórum debe ser un número entre 1 y ${councillorCount}.` });
  }
  const session = createSession({
    name,
    date,
    status: 'abierta',
    quorumRequired,
    projectCount: db.prepare('SELECT COUNT(*) AS count FROM projects WHERE sessionType = ?').get(name).count,
    active
  });
  if (active) {
    setConfig('qr_codigo', '');
    setConfig('qr_sesion', '');
  }
  audit(req.user.username, 'Sesión creada', `${name} • ${date}${active ? ' • activada' : ''}`);
  res.status(201).json({ session });
});

app.get('/api/order-of-day', authMiddleware, (req, res) => {
  res.json(getAllOrderOfDay());
});

app.get('/api/quorum', authMiddleware, (req, res) => {
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

app.get('/api/asistencia/qr.png', authMiddleware, requirePerfil('mesa'), (req, res, next) => {
  const qr = codigoActivo();
  if (!qr) {
    return res.status(404).json({ error: 'No hay sesiones registradas.' });
  }
  const base = publicBaseUrl ? publicBaseUrl.origin : `${req.protocol}://${req.get('host')}`;
  const url = new URL(`/asistencia?codigo=${encodeURIComponent(qr.codigo)}`, base).href;
  QRCode.toBuffer(url, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 480 })
    .then(buffer => {
      res.type('png').setHeader('Cache-Control', 'private, no-store').send(buffer);
    })
    .catch(next);
});

app.get('/api/attendance', authMiddleware, (req, res) => {
  const attendance = getAllCouncillors().map(c => ({
    id: c.id,
    name: c.name,
    role: c.role,
    connected: c.connected,
    vote: c.votes[activeProjectId] || 'Pendiente'
  }));
  res.json(attendance);
});

app.get('/api/reports', authMiddleware, requirePerfil('mesa'), (req, res) => {
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

app.get('/api/stats', authMiddleware, requirePerfil('mesa'), (req, res) => {
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

app.get('/api/project/:id', authMiddleware, requirePerfil('mesa'), (req, res) => {
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

app.get('/api/bloques', authMiddleware, requirePerfil('mesa'), (req, res) => {
  res.json(getBloques());
});

app.post('/api/bloques', authMiddleware, requirePerfil('admin'), (req, res) => {
  const body = req.body || {};
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const sigla = typeof body.sigla === 'string' ? body.sigla.trim() : '';
  const color = typeof body.color === 'string' ? body.color.trim() : '#3569a8';
  const fundado = typeof body.fundado === 'string' ? body.fundado.trim() : '';
  if (!nombre || nombre.length > 100 || !sigla || sigla.length > 12 || fundado.length > 20 || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return res.status(400).json({ error: 'Completá nombre y sigla, y elegí un color hexadecimal válido.' });
  }
  if (db.prepare('SELECT id FROM bloques WHERE lower(nombre) = lower(?) OR lower(sigla) = lower(?)').get(nombre, sigla)) {
    return res.status(409).json({ error: 'Ya existe un bloque con ese nombre o sigla.' });
  }
  const result = db.prepare('INSERT INTO bloques (nombre, sigla, color, fundado) VALUES (?, ?, ?, ?)')
    .run(nombre, sigla, color, fundado);
  audit(req.user.username, 'Bloque creado', `${nombre} (${sigla})`);
  res.status(201).json({
    bloque: {
      id: Number(result.lastInsertRowid),
      nombre,
      sigla,
      color,
      fundado,
      miembros: 0,
      presentes: 0,
      concejales: []
    }
  });
});

app.get('/api/municipios', authMiddleware, requirePerfil('mesa'), (req, res) => {
  const municipios = db.prepare('SELECT * FROM municipios ORDER BY id').all();
  const total = municipios.reduce((sum, municipio) => sum + (municipio.habitantes || 0), 0);
  res.json({ municipios, totalHabitantes: total });
});

app.get('/api/auditoria', authMiddleware, requirePerfil('mesa'), (req, res) => {
  const desde = Number(req.query.limit) > 0 ? Number(req.query.limit) : 100;
  res.json(db.prepare('SELECT * FROM auditoria ORDER BY id DESC LIMIT ?').all(desde));
});

/*
 * Cuenta por cuenta del cuerpo: usernames, emails y estado de conexión.
 * Es información de administración, así que sólo la ve el nivel admin.
 */
app.get('/api/usuarios', authMiddleware, requirePerfil('admin'), (req, res) => {
  const councillors = getAllCouncillors();
  res.json(councillors.map(councillor => ({
    id: councillor.id,
    name: councillor.name,
    role: councillor.role,
    perfil: councillor.perfil,
    nivel: PERFILES[councillor.perfil].etiqueta,
    username: councillor.username,
    email: `${councillor.username}@concejo.local`,
    bloque: bloqueName(councillor.bloqueId),
    conectado: councillor.connected,
    estado: councillor.connected ? 'Activo' : 'Inactivo',
    votosEmitidos: Object.keys(councillor.votes || {}).length
  })));
});

app.post('/api/usuarios', authMiddleware, requirePerfil('admin'), (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const role = typeof body.role === 'string' ? body.role.trim() : '';
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const perfil = typeof body.perfil === 'string' ? body.perfil.trim().toLowerCase() : 'concejal';
  const bloqueId = body.bloqueId === '' || body.bloqueId === null || body.bloqueId === undefined
    ? null
    : Number(body.bloqueId);
  if (
    !name || name.length > 120 ||
    !role || role.length > 80 ||
    !/^[a-z0-9._-]{3,40}$/.test(username) ||
    password.length < 12 || password.length > 256 ||
    !PERFILES[perfil]
  ) {
    return res.status(400).json({ error: 'Revisá nombre, cargo, usuario (3–40 caracteres), nivel y contraseña (12–256 caracteres).' });
  }
  if (bloqueId !== null && (!Number.isInteger(bloqueId) || !db.prepare('SELECT id FROM bloques WHERE id = ?').get(bloqueId))) {
    return res.status(400).json({ error: 'El bloque seleccionado no existe.' });
  }
  if (getCouncillorByUsername(username)) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese nombre de usuario.' });
  }

  const result = db.prepare(`
    INSERT INTO councillors (name, role, username, password, connected, votes, bloque_id, perfil)
    VALUES (?, ?, ?, ?, 0, '{}', ?, ?)
  `).run(name, role, username, hashPassword(password), bloqueId, perfil);
  const councillorCount = getAllCouncillors().length;
  db.prepare('UPDATE projects SET totalCouncillors = ?').run(councillorCount);
  db.prepare('UPDATE sessions SET quorumRequired = MIN(quorumRequired, ?) WHERE quorumRequired > ?')
    .run(councillorCount, councillorCount);
  audit(req.user.username, 'Usuario creado', `${name} (${username}) • ${PERFILES[perfil].etiqueta}`);
  res.status(201).json({
    usuario: {
      id: Number(result.lastInsertRowid),
      name,
      role,
      username,
      perfil,
      nivel: PERFILES[perfil].etiqueta,
      bloque: bloqueName(bloqueId),
      estado: 'Inactivo',
      votosEmitidos: 0
    }
  });
});

/*
 * Cambio de nivel desde /usuarios. Solo admin, no se puede uno degradar a sí
 * mismo (así siempre queda alguien pudiendo volver a subirlo) y las sesiones
 * vivas del usuario se actualizan para que el cambio tome efecto sin logout.
 */
app.put('/api/usuarios/:id/perfil', authMiddleware, requirePerfil('admin'), (req, res) => {
  const destino = getCouncillorById(Number(req.params.id));
  if (!destino) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }
  const perfil = String((req.body || {}).perfil || '').trim().toLowerCase();
  if (!PERFILES[perfil]) {
    return res.status(400).json({ error: 'Nivel inválido. Usá concejal, mesa o admin.' });
  }
  if (destino.id === req.user.id) {
    return res.status(400).json({ error: 'No podés cambiar tu propio nivel.' });
  }

  db.prepare('UPDATE councillors SET perfil = ? WHERE id = ?').run(perfil, destino.id);

  audit(
    req.user.username,
    'Cambio de nivel',
    `${destino.name} (${destino.username}) pasó de ${PERFILES[destino.perfil].etiqueta} a ${PERFILES[perfil].etiqueta}`
  );
  res.json({ success: true, usuario: { id: destino.id, username: destino.username, perfil, nivel: PERFILES[perfil].etiqueta } });
});

app.put('/api/usuarios/:id/password', authMiddleware, requirePerfil('admin'), (req, res) => {
  const destino = getCouncillorById(Number(req.params.id));
  if (!destino) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }
  const password = (req.body || {}).password;
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    return res.status(400).json({ error: 'La contraseña debe tener entre 12 y 256 caracteres.' });
  }

  db.prepare('UPDATE councillors SET password = ? WHERE id = ?').run(hashPassword(password), destino.id);
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(destino.id);
  audit(req.user.username, 'Credenciales actualizadas', `Se cambió la contraseña de ${destino.name} (${destino.username})`);
  res.json({ success: true, sesionCerrada: destino.id === req.user.id });
});

app.get('/api/councillors', authMiddleware, requirePerfil('mesa'), (req, res) => {
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
  const perfil = normalizarPerfil(user.perfil, user.role);
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    perfil,
    nivel: PERFILES[perfil].etiqueta,
    puede: {
      gestionarSesion: permite(perfil, 'mesa'),
      administrar: permite(perfil, 'admin')
    },
    paginas: paginasPermitidas(perfil),
    voted: Boolean(user.votes[activeId]),
    vote: user.votes[activeId] || null
  };
}

app.post('/api/auth/login', rateLimit('login', 10, 15 * 60 * 1000), (req, res) => {
  const body = req.body || {};
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const user = getCouncillorByUsername(username);
  if (!user || !password || !verificarPassword(password, user.password)) {
    audit(username || 'desconocido', 'Intento fallido', 'Credenciales inválidas');
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  user.connected = true;
  updateCouncillor(user);
  registrarPresente(user, 'panel');

  const token = createToken();
  const csrfToken = createToken();
  const now = Date.now();
  db.prepare(`
    INSERT INTO auth_sessions (token_hash, user_id, csrf_hash, created_at, last_seen_at, last_activity_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(hashOpaqueToken(token), user.id, hashOpaqueToken(csrfToken), now, now, now, now + SESSION_ABSOLUTE_MS);
  audit(user.username, 'Inicio de sesión', `${user.name} ingresó al panel`);

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
  );
  res.json({ token, csrfToken, user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = tokenFrom(req);
  const sesion = findAuthSession(token, req);
  if (sesion) {
    const usuario = getCouncillorById(sesion.user_id);
    audit(usuario.username, 'Fin de sesión', `${usuario.name} cerró su sesión en el panel`);
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(sesion.token_hash);
  }
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
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

app.post('/api/project/:id/activate', authMiddleware, requirePerfil('mesa'), (req, res) => {
  const project = getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Proyecto no encontrado.' });
  }
  if (project.status !== 'abierta') {
    return res.status(409).json({ error: 'Este proyecto ya está finalizado y no se puede reabrir desde la votación.' });
  }
  const durationMinutes = Number(getConfig().duracion_votacion);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 120) {
    return res.status(500).json({ error: 'La duración configurada debe ser un número entero entre 1 y 120 minutos.' });
  }
  activeProjectId = project.id;
  setConfig('active_project_id', String(project.id));
  const votingDeadline = Date.now() + durationMinutes * 60_000;
  setConfig('voting_deadline_at', String(votingDeadline));
  audit(req.user.username, 'Proyecto activado', `${project.project} pasó a ser el proyecto en votación`);
  res.json({ activeProjectId, votingDeadline });
});

app.post('/api/sessions/:id/activate', authMiddleware, requirePerfil('mesa'), (req, res) => {
  const session = getAllSessions().find(item => item.id === Number(req.params.id));
  if (!session) {
    return res.status(404).json({ error: 'Sesión no encontrada.' });
  }
  db.prepare('UPDATE sessions SET active = 0').run();
  db.prepare('UPDATE sessions SET active = 1, status = ? WHERE id = ?').run(session.status === 'cerrada' ? 'abierta' : session.status, session.id);
  audit(req.user.username, 'Sesión activada', `${session.name} • ${session.date}`);
  res.json({ activeSessionId: session.id });
});

app.get('/api/votaciones', authMiddleware, (req, res) => {
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
      votingDeadline: Number(getConfig().voting_deadline_at || 0) || null,
      counts: computeCounts(project),
      detalle
    };
  }));
});

function csvCell(value) {
  const raw = String(value ?? '');
  const protectedValue = /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

function sendCsv(res, filename, rows) {
  const content = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'private, no-store'
  }).send(content);
}

app.get('/api/export/votaciones.csv', authMiddleware, requirePerfil('mesa'), (req, res) => {
  const projects = getAllProjects();
  const rows = [[
    'Expediente', 'Título', 'Tipo', 'Estado', 'Resultado',
    'Afirmativo', 'Negativo', 'Abstención', 'Pendientes', 'Fecha'
  ]];
  projects.forEach(project => {
    const counts = computeCounts(project);
    rows.push([
      project.project,
      project.title,
      project.type,
      project.status,
      getResult(project).label,
      counts.afirmativo,
      counts.negativo,
      counts.abstencion,
      counts.pendientes,
      project.startedAtFull
    ]);
  });
  sendCsv(res, 'votaciones.csv', rows);
});

app.get('/api/export/asistencia.csv', authMiddleware, requirePerfil('mesa'), (req, res) => {
  const rows = db.prepare(`
    SELECT s.name AS sesion, s.date AS fechaSesion, a.creado_en AS fechaRegistro,
           c.name AS concejal, c.username, a.metodo, a.codigo
    FROM asistencias a
    LEFT JOIN sessions s ON s.id = a.sesion_id
    LEFT JOIN councillors c ON c.id = a.concejal_id
    ORDER BY a.id DESC
  `).all();
  sendCsv(res, 'asistencia.csv', [
    ['Sesión', 'Fecha de sesión', 'Fecha de registro', 'Concejal', 'Usuario', 'Método', 'Código'],
    ...rows.map(row => [row.sesion, row.fechaSesion, row.fechaRegistro, row.concejal, row.username, row.metodo, row.codigo])
  ]);
});

app.get('/api/export/auditoria.csv', authMiddleware, requirePerfil('mesa'), (req, res) => {
  const rows = db.prepare('SELECT timestamp, usuario, accion, detalle FROM auditoria ORDER BY id DESC LIMIT 10000').all();
  sendCsv(res, 'auditoria.csv', [
    ['Fecha y hora', 'Usuario', 'Acción', 'Detalle'],
    ...rows.map(row => [row.timestamp, row.usuario, row.accion, row.detalle])
  ]);
});

app.get('/api/configuracion', authMiddleware, requirePerfil('admin'), (req, res) => {
  const sessions = getAllSessions();
  const activeSession = sessions.find(session => session.active) || sessions[0] || null;
  res.json({ config: getConfig(), quorumSesion: activeSession ? activeSession.quorumRequired : null });
});

app.put('/api/configuracion', authMiddleware, requirePerfil('admin'), (req, res) => {
  const permitidas = ['municipio_sede', 'mayoria', 'duracion_votacion', 'pantalla_publica', 'notificaciones'];
  const cambios = Object.entries(req.body || {}).filter(([clave]) => permitidas.includes(clave));
  if (cambios.length === 0) {
    return res.status(400).json({ error: 'No hay valores válidos para guardar.' });
  }
  const duration = cambios.find(([key]) => key === 'duracion_votacion');
  if (duration && (!Number.isInteger(Number(duration[1])) || Number(duration[1]) < 1 || Number(duration[1]) > 120)) {
    return res.status(400).json({ error: 'La duración de votación debe ser un número entero entre 1 y 120 minutos.' });
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

app.get('/api/asistencia/qr', authMiddleware, requirePerfil('mesa'), (req, res) => {
  const qr = codigoActivo();
  if (!qr) {
    return res.status(404).json({ error: 'No hay sesiones registradas.' });
  }
  const registrados = db.prepare('SELECT COUNT(*) AS count FROM asistencias WHERE sesion_id = ?').get(qr.sesion.id).count;
  const councillors = getAllCouncillors();
  res.json({
    codigo: qr.codigo,
    url: `/asistencia?codigo=${qr.codigo}`,
    imageUrl: '/api/asistencia/qr.png',
    sesion: qr.sesion,
    registrados,
    total: councillors.length,
    ausentes: councillors.filter(c => !c.connected).map(c => ({ id: c.id, name: c.name, bloque: bloqueName(c.bloqueId) }))
  });
});

app.get('/api/asistencia', authMiddleware, requirePerfil('mesa'), (req, res) => {
  const rows = db.prepare(`
    SELECT a.id, a.creado_en AS creadoEn, a.metodo, a.codigo, a.concejal_id AS concejalId, c.name, c.role
    FROM asistencias a
    LEFT JOIN councillors c ON c.id = a.concejal_id
    ORDER BY a.id DESC
    LIMIT 50
  `).all();
  res.json(rows);
});

app.post('/api/asistencia/checkin', rateLimit('attendance-checkin', 20, 15 * 60 * 1000), (req, res) => {
  const { codigo, username, password } = req.body || {};
  const checkin = codigoActivo();
  if (!checkin) {
    return res.status(404).json({ error: 'No hay una sesión activa para registrar asistencia.' });
  }
  if (typeof codigo !== 'string' || codigo.trim().toUpperCase() !== checkin.codigo) {
    return res.status(400).json({ error: 'El código de asistencia no es válido.' });
  }
  const concejal = getCouncillorByUsername(username);
  if (
    !concejal ||
    typeof password !== 'string' ||
    !verificarPassword(password, concejal.password)
  ) {
    audit(typeof username === 'string' ? username.trim().toLowerCase() : 'desconocido', 'Intento de asistencia fallido', 'Credenciales inválidas');
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  if (!registrarPresente(concejal, 'qr', checkin.codigo)) {
    return res.status(409).json({ error: 'Tu asistencia ya está registrada para esta sesión.' });
  }
  concejal.connected = true;
  updateCouncillor(concejal);

  res.json({ success: true, name: concejal.name });
});

app.get('/api/overview', authMiddleware, requirePerfil('mesa'), (req, res) => {
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

// Concejales con sesión persistida y actividad reciente (verdadero "en línea").
function concejalesEnLinea() {
  const now = Date.now();
  return new Set(db.prepare(`
    SELECT DISTINCT user_id
    FROM auth_sessions
    WHERE expires_at > ? AND last_activity_at > ?
  `).all(now, now - SESSION_IDLE_MS).map(session => session.user_id));
}

/*
 * Punto único de datos de la pantalla pública: evita que /screen haga
 * 4 pedidos cada 3 segundos y agrega presencia fina (marca de asistencia
 * + token vivo) que las APIs históricas no exponían juntas.
 */
app.get('/api/screen', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
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

/*
 * Páginas del panel. `nivel` es el nivel mínimo exigido para verla:
 * concejal (todos los logueados), mesa y admin. La nav se filtra con esto.
 */
const VISTAS = {
  dashboard: { titulo: 'Votación en curso', descripcion: 'Sesión en tiempo real, resumen y emisión de votos.', nivel: 'concejal' },
  usuarios: { titulo: 'Usuarios', descripcion: 'Cuentas, niveles y estado de conexión del cuerpo legislativo.', nivel: 'admin' },
  concejales: { titulo: 'Concejales', descripcion: 'Datos de concejales, bloque y asistencia a la sesión.', nivel: 'mesa' },
  bloques: { titulo: 'Bloques', descripcion: 'Bloques políticos, integrantes y presencia por bloque.', nivel: 'mesa' },
  municipios: { titulo: 'Municipios', descripcion: 'Municipios del departamento y su peso electoral.', nivel: 'mesa' },
  sesiones: { titulo: 'Sesiones', descripcion: 'Sesiones convocadas, estado y quórum requerido.', nivel: 'mesa' },
  'asistencia-qr': { titulo: 'Asistencia QR', descripcion: 'Código de asistencia y marcas de presencia del día.', nivel: 'mesa' },
  quorum: { titulo: 'Quórum', descripcion: 'Concejales presentes, ausentes y validez del quórum.', nivel: 'concejal' },
  'orden-del-dia': { titulo: 'Orden del Día', descripcion: 'Puntos del orden del día y su estado de tratamiento.', nivel: 'concejal' },
  proyectos: { titulo: 'Proyectos', descripcion: 'Expedientes ingresados y su estado de votación.', nivel: 'mesa' },
  votaciones: { titulo: 'Votaciones', descripcion: 'Detalle voto a voto de cada proyecto tratado.', nivel: 'concejal' },
  reportes: { titulo: 'Reportes', descripcion: 'Indicadores consolidados y descarga de resultados.', nivel: 'mesa' },
  estadisticas: { titulo: 'Estadísticas', descripcion: 'Comportamiento histórico del cuerpo y participación.', nivel: 'mesa' },
  auditoria: { titulo: 'Auditoría', descripcion: 'Registro de acciones realizadas sobre el sistema.', nivel: 'mesa' },
  configuracion: { titulo: 'Configuración', descripcion: 'Parámetros de funcionamiento del sistema de votación.', nivel: 'admin' }
};

function paginasPermitidas(perfil) {
  return Object.entries(VISTAS)
    .filter(([, vista]) => permite(perfil, vista.nivel))
    .map(([clave]) => clave);
}

const cacheVistas = new Map();

function leerVista(nombre) {
  if (!cacheVistas.has(nombre)) {
    cacheVistas.set(nombre, fs.readFileSync(path.join(__dirname, 'public', nombre), 'utf8'));
  }
  return cacheVistas.get(nombre);
}

// Nav filtrada: cada nivel ve sólo las páginas que tiene permitidas.
function navPara(clave, perfil) {
  return Object.entries(VISTAS)
    .filter(([, item]) => permite(perfil, item.nivel))
    .map(([key, item]) => `<a class="nav-link${key === clave ? ' active' : ''}" href="/${key}">${item.titulo}</a>`)
    .join('\n        ');
}

function paginaBloqueada(clave, perfil) {
  const vista = VISTAS[clave];
  return `<div class="table-card">
  <div class="table-head">
    <h3>Acceso restringido</h3>
    <p class="muted">La sección <strong>${vista.titulo}</strong> exige el nivel <strong>${PERFILES[vista.nivel].etiqueta}</strong> y tu cuenta tiene el nivel <strong>${PERFILES[perfil].etiqueta}</strong>.</p>
  </div>
  <p class="muted">Con tu nivel podés votar y consultar la votación en curso, el orden del día, el quórum y las votaciones. Si necesitás acceso a <strong>${vista.titulo.toLowerCase()}</strong>, la Presidencia puede revisar tus permisos desde la sección <em>Usuarios</em>.</p>
  <div class="page-actions">
    <a class="btn" href="/dashboard">Volver al panel</a>
  </div>
</div>`;
}

function renderPagina(res, clave, perfil, opciones = {}) {
  const vista = VISTAS[clave];
  const bloqueada = Boolean(opciones.bloqueada);
  const cabecera = bloqueada ? 'Acceso restringido' : vista.titulo;
  const descripcion = bloqueada ? 'Tu nivel de acceso no alcanza para ver esta sección.' : vista.descripcion;
  const pagina = bloqueada ? paginaBloqueada(clave, perfil) : leerVista(`vistas/${clave}.html`);
  const html = leerVista('layout.html')
    .replace('{{NAV}}', () => navPara(clave, perfil))
    .replace('{{TITULO}}', () => `${cabecera} • Concejo Deliberante`)
    // data-page="sin-acceso" evita que app.js intente cargar los datos de la página bloqueada.
    .replace('{{PAGE}}', () => (bloqueada ? 'sin-acceso' : clave))
    .replace('{{CABECERA}}', () => cabecera)
    .replace('{{DESCRIPCION}}', () => descripcion)
    .replace('{{CONTENIDO}}', () => pagina);
  if (bloqueada) {
    res.status(403);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

/*
 * Sesión de una página del panel. No reusa authMiddleware porque acá no tener
 * sesión es un redirect a /login, no un 401 JSON.
 */
function paginaProtegida(req, res, next) {
  const token = tokenFrom(req);
  const sesion = findAuthSession(token, req);
  if (!sesion) {
    return res.redirect('/login');
  }

  const usuario = getCouncillorById(sesion.user_id);
  if (!usuario) {
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(sesion.token_hash);
    return res.redirect('/login');
  }

  req.user = usuario;
  req.perfil = normalizarPerfil(usuario.perfil, usuario.role);
  req.token = token;
  next();
}

Object.keys(VISTAS).forEach(clave => {
  app.get(`/${clave}`, paginaProtegida, (req, res) => {
    const vista = VISTAS[clave];
    if (permite(req.perfil, vista.nivel)) {
      return renderPagina(res, clave, req.perfil);
    }
    audit(
      req.user.username,
      'Acceso denegado',
      `/${clave} requiere ${PERFILES[vista.nivel].etiqueta} y ${req.user.username} es ${PERFILES[req.perfil].etiqueta}`
    );
    return renderPagina(res, clave, req.perfil, { bloqueada: true });
  });
});

app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

app.get('/login', (req, res) => {
  const token = tokenFrom(req);
  if (findAuthSession(token, req)) {
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
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint no encontrado.' });
  }
  res.redirect('/dashboard');
});

app.use((error, req, res, next) => {
  process.stderr.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    method: req.method,
    path: req.path,
    error: error.message,
    code: error.code || null
  })}\n`);
  if (res.headersSent) {
    return next(error);
  }
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  res.status(status).json({ error: status === 500 ? 'Error interno del servidor.' : error.message });
});

const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    event: 'server_started',
    port: server.address().port,
    environment: process.env.NODE_ENV || 'development',
    publicBaseUrl: publicBaseUrl ? publicBaseUrl.origin : null
  })}\n`);
});
server.requestTimeout = 30_000;
server.headersTimeout = 35_000;

function shutdown(signal) {
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', event: 'server_shutdown', signal })}\n`);
  clearInterval(votingTimer);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  const forcedExit = setTimeout(() => process.exit(1), 10_000);
  forcedExit.unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
