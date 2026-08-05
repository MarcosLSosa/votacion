const loginShell = document.getElementById('loginShell');
const appShell = document.getElementById('appShell');
const loginBtn = document.getElementById('loginBtn');
const loginMessage = document.getElementById('loginMessage');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const messageEl = document.getElementById('message');
const voteButtons = document.querySelectorAll('[data-option]');
const profileAvatar = document.getElementById('profileAvatar');
const profileName = document.getElementById('profileName');
const profileRole = document.getElementById('profileRole');
const projectTag = document.getElementById('projectTag');
const projectTitle = document.getElementById('projectTitle');
const projectDescription = document.getElementById('projectDescription');
const projectStartedBy = document.getElementById('projectStartedBy');
const projectType = document.getElementById('projectType');
const projectStartedAt = document.getElementById('projectStartedAt');
const affirmativeCount = document.getElementById('affirmativeCount');
const negativeCount = document.getElementById('negativeCount');
const abstentionCount = document.getElementById('abstentionCount');
const pendingCount = document.getElementById('pendingCount');
const connectedCount = document.getElementById('connectedCount');
const connectedBar = document.getElementById('connectedBar');
const sessionType = document.getElementById('sessionType');
const statusText = document.getElementById('statusText');
const projectList = document.getElementById('projectList');
const historyView = document.getElementById('historyView');
const sessionView = document.getElementById('sessionView');
const moduleView = document.getElementById('moduleView');
const historyList = document.getElementById('historyList');
const moduleTitle = document.getElementById('moduleTitle');
const moduleDescription = document.getElementById('moduleDescription');
const moduleObjective = document.getElementById('moduleObjective');
const moduleStatus = document.getElementById('moduleStatus');
const moduleActionPrimary = document.getElementById('moduleActionPrimary');
const moduleActionSecondary = document.getElementById('moduleActionSecondary');
const moduleContent = document.getElementById('moduleContent');
const navLinks = document.querySelectorAll('.nav-link');

const moduleDefinitions = {
  usuarios: {
    title: 'Usuarios',
    description: 'Administrar cuentas, roles y permisos del sistema.',
    objective: 'Gestionar usuarios activos y niveles de acceso.',
    status: 'Módulo listo para implementar gestión de usuarios.',
    primaryAction: 'Ver usuarios',
    secondaryAction: 'Agregar usuario'
  },
  concejales: {
    title: 'Concejales',
    description: 'Monitorear concejales, asistencia y representación por bloque.',
    objective: 'Gestionar datos personales y presencia en sesión.',
    status: 'Módulo listo para administrar concejales.',
    primaryAction: 'Ver concejales',
    secondaryAction: 'Agregar concejal'
  },
  bloques: {
    title: 'Bloques',
    description: 'Configurar bloques políticos y sus miembros.',
    objective: 'Organizar la representación por bloque.',
    status: 'Módulo listo para administrar bloques.',
    primaryAction: 'Ver bloques',
    secondaryAction: 'Nuevo bloque'
  },
  municipios: {
    title: 'Municipios',
    description: 'Registrar municipios y sus datos de referencia.',
    objective: 'Mantener la información de jurisdicción local.',
    status: 'Módulo listo para gestionar municipios.',
    primaryAction: 'Ver municipios',
    secondaryAction: 'Agregar municipio'
  },
  sesiones: {
    title: 'Sesiones',
    description: 'Administrar sesiones, quórum y orden del día.',
    objective: 'Controlar la agenda y el estado de la sesión.',
    status: 'Módulo listo para crear y abrir sesiones.',
    primaryAction: 'Ver sesiones',
    secondaryAction: 'Nueva sesión'
  },
  'asistencia-qr': {
    title: 'Asistencia QR',
    description: 'Registrar la asistencia mediante lectura de QR.',
    objective: 'Controlar la asistencia de concejales en tiempo real.',
    status: 'Módulo listo para implementar lectura QR.',
    primaryAction: 'Abrir lector QR',
    secondaryAction: 'Ver asistencias'
  },
  quorum: {
    title: 'Quórum',
    description: 'Verificar el quórum necesario para validar la sesión.',
    objective: 'Asegurar la presencia mínima requerida.',
    status: 'Módulo listo para monitorear quórum.',
    primaryAction: 'Ver quórum',
    secondaryAction: 'Actualizar asistentes'
  },
  'orden-del-dia': {
    title: 'Orden del Día',
    description: 'Definir los puntos a discutir en la sesión.',
    objective: 'Estructurar la agenda de votación.',
    status: 'Módulo listo para planificar el orden del día.',
    primaryAction: 'Ver agenda',
    secondaryAction: 'Agregar punto'
  },
  proyectos: {
    title: 'Proyectos',
    description: 'Administrar los proyectos en discusión y votación.',
    objective: 'Controlar el flujo de proyectos del concejo.',
    status: 'Módulo listo para gestionar proyectos.',
    primaryAction: 'Ver proyectos',
    secondaryAction: 'Nuevo proyecto'
  },
  votaciones: {
    title: 'Votaciones',
    description: 'Monitorear votaciones en curso y resultados finales.',
    objective: 'Supervisar los procesos de votación.',
    status: 'Módulo listo para registrar votos.',
    primaryAction: 'Ver votación',
    secondaryAction: 'Cerrar votación'
  },
  reportes: {
    title: 'Reportes',
    description: 'Generar reportes de votación, asistencia y gestión.',
    objective: 'Obtener información para auditoría y análisis.',
    status: 'Módulo listo para crear reportes.',
    primaryAction: 'Generar reporte',
    secondaryAction: 'Ver historial'
  },
  estadisticas: {
    title: 'Estadísticas',
    description: 'Visualizar métricas de votaciones y asistencia.',
    objective: 'Analizar la actividad del concejo.',
    status: 'Módulo listo para mostrar dashboards.',
    primaryAction: 'Ver métricas',
    secondaryAction: 'Explorar estadísticas'
  },
  auditoria: {
    title: 'Auditoría',
    description: 'Registrar eventos e historial de acciones.',
    objective: 'Guardar trazabilidad de cambios importantes.',
    status: 'Módulo listo para auditar operaciones.',
    primaryAction: 'Ver auditoría',
    secondaryAction: 'Descargar log'
  },
  configuracion: {
    title: 'Configuración',
    description: 'Ajustar parámetros generales del sistema.',
    objective: 'Personalizar comportamiento del sistema.',
    status: 'Módulo listo para configurar la plataforma.',
    primaryAction: 'Ver configuración',
    secondaryAction: 'Guardar cambios'
  }
};

const demoUsers = [
  { id: 1, name: 'Sofía Pérez', email: 'sofia@concejo.local', role: 'Presidenta', status: 'Activo' },
  { id: 2, name: 'Juan López', email: 'juan@concejo.local', role: 'Vicepresidente', status: 'Activo' },
  { id: 3, name: 'María Gómez', email: 'maria@concejo.local', role: 'Concejala', status: 'Activo' },
  { id: 4, name: 'Carlos Díaz', email: 'carlos@concejo.local', role: 'Concejal', status: 'Inactivo' }
];

const demoConcejales = [
  { id: 1, name: 'Sofía Pérez', bloque: 'Unión por la Ciudad', role: 'Presidenta', attendance: 'Presente' },
  { id: 2, name: 'Juan López', bloque: 'Ciudadana', role: 'Vicepresidente', attendance: 'Presente' },
  { id: 3, name: 'María Gómez', bloque: 'Unión por la Ciudad', role: 'Concejala', attendance: 'Presente' },
  { id: 4, name: 'Carlos Díaz', bloque: 'Independiente', role: 'Concejal', attendance: 'Ausente' }
];

const demoBloques = [
  { id: 1, name: 'Bloque Unión por la Ciudad', members: 5 },
  { id: 2, name: 'Bloque Ciudadana', members: 4 },
  { id: 3, name: 'Bloque Independiente', members: 3 }
];

const demoMunicipios = [
  { id: 1, name: 'Ciudad Central', department: 'Norte' },
  { id: 2, name: 'Villa del Río', department: 'Sur' }
];

const demoSessions = [
  { id: 1, name: 'Sesión Ordinaria', date: '05 de agosto de 2026', status: 'Abierta', quorum: '10 / 12' },
  { id: 2, name: 'Sesión Extraordinaria', date: '02 de agosto de 2026', status: 'Cerrada', quorum: '12 / 12' }
];

const demoAgenda = [
  { id: 1, topic: 'Proyecto 125/2026', status: 'En discusión' },
  { id: 2, topic: 'Ordenanza 216/2026', status: 'Aprobado' },
  { id: 3, topic: 'Ordenanza 220/2026', status: 'Rechazado' }
];

const demoAuditLog = [
  { timestamp: '05/08/2026 11:15', user: 'Sofía Pérez', action: 'Inició sesión' },
  { timestamp: '05/08/2026 11:18', user: 'Juan López', action: 'Registró voto' },
  { timestamp: '05/08/2026 11:22', user: 'María Gómez', action: 'Agregó proyecto' }
];

let authToken = null;
let currentUser = null;
let activeModule = null;

async function fetchSession() {
  const response = await fetch('/api/session');
  return response.json();
}

async function fetchProjects() {
  const response = await fetch('/api/projects');
  return response.json();
}

async function fetchHistory() {
  const response = await fetch('/api/history');
  return response.json();
}

async function fetchSessions() {
  const response = await fetch('/api/sessions');
  return response.json();
}

async function fetchOrderOfDay() {
  const response = await fetch('/api/order-of-day');
  return response.json();
}

async function fetchQuorum() {
  const response = await fetch('/api/quorum');
  return response.json();
}

async function login(username, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return response.json();
}

async function sendVote(option) {
  try {
    const response = await fetch('/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': authToken
      },
      body: JSON.stringify({ option })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Error al votar');
    }
    messageEl.textContent = '¡Voto registrado correctamente!';
    messageEl.style.color = '#2fa84f';
    disableVoteButtons();
    if (currentUser) {
      currentUser.voted = true;
    }
    return result;
  } catch (error) {
    messageEl.textContent = error.message;
    messageEl.style.color = '#d93e4a';
    console.error(error);
  }
}

function disableVoteButtons() {
  voteButtons.forEach(button => {
    button.disabled = true;
    button.style.opacity = 0.7;
    button.style.cursor = 'default';
  });
}

function enableVoteButtons() {
  voteButtons.forEach(button => {
    button.disabled = false;
    button.style.opacity = 1;
    button.style.cursor = 'pointer';
  });
}

function renderSession(data) {
  projectTag.textContent = data.project;
  projectTitle.textContent = data.title;
  projectDescription.textContent = data.description;
  projectStartedBy.textContent = data.startedBy;
  projectType.textContent = data.type;
  projectStartedAt.textContent = data.startedAt;
  affirmativeCount.textContent = data.counts.afirmativo;
  negativeCount.textContent = data.counts.negativo;
  abstentionCount.textContent = data.counts.abstencion;
  pendingCount.textContent = data.counts.pendientes;
  connectedCount.textContent = `${data.connectedCouncillors} / ${data.totalCouncillors}`;
  connectedBar.style.width = `${Math.round((data.connectedCouncillors / data.totalCouncillors) * 100)}%`;
  sessionType.textContent = data.sessionType;
  statusText.textContent = data.status === 'abierta' ? 'Votación abierta' : 'Votación cerrada';
}

function renderProjectList(projects) {
  projectList.innerHTML = '';
  projects.forEach(project => {
    const item = document.createElement('div');
    item.className = 'project-item';
    item.innerHTML = `<strong>${project.project}</strong><small>${project.title}</small><span>${project.status === 'abierta' ? 'En curso' : 'Finalizada'}</span>`;
    projectList.appendChild(item);
  });
}

function renderHistory(history) {
  historyList.innerHTML = '';
  history.forEach(project => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `<strong>${project.project}</strong><span>${project.title}</span><p>${project.counts.afirmativo} Afirmativo · ${project.counts.negativo} Negativo · ${project.counts.abstencion} Abstención</p>`;
    historyList.appendChild(item);
  });
}

function renderTable(headers, rows) {
  const table = document.createElement('table');
  table.className = 'module-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr>`;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach(row => {
    const tr = document.createElement('tr');
    row.forEach(cell => {
      const td = document.createElement('td');
      td.innerHTML = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  return table;
}

function renderUsersModule() {
  moduleContent.innerHTML = '';
  const table = renderTable(
    ['ID', 'Nombre', 'Email', 'Rol', 'Estado'],
    demoUsers.map(user => [user.id, user.name, user.email, user.role, user.status])
  );
  const info = document.createElement('p');
  info.textContent = 'Listado de usuarios registrados en el sistema.';
  moduleContent.appendChild(info);
  moduleContent.appendChild(table);
}

function renderConcejalesModule() {
  moduleContent.innerHTML = '';
  const table = renderTable(
    ['ID', 'Nombre', 'Bloque', 'Rol', 'Asistencia'],
    demoConcejales.map(member => [member.id, member.name, member.bloque, member.role, member.attendance])
  );
  const info = document.createElement('p');
  info.textContent = 'Concejales activos y su asistencia.';
  moduleContent.appendChild(info);
  moduleContent.appendChild(table);
}

function renderBloquesModule() {
  moduleContent.innerHTML = '';
  const table = renderTable(
    ['ID', 'Bloque', 'Miembros'],
    demoBloques.map(bloque => [bloque.id, bloque.name, bloque.members])
  );
  const info = document.createElement('p');
  info.textContent = 'Bloques políticos y cantidad de miembros.';
  moduleContent.appendChild(info);
  moduleContent.appendChild(table);
}

function renderMunicipiosModule() {
  moduleContent.innerHTML = '';
  const table = renderTable(
    ['ID', 'Municipio', 'Departamento'],
    demoMunicipios.map(municipio => [municipio.id, municipio.name, municipio.department])
  );
  const info = document.createElement('p');
  info.textContent = 'Municipios de jurisdicción con su departamento.';
  moduleContent.appendChild(info);
  moduleContent.appendChild(table);
}

async function renderSesionesModule() {
  moduleContent.innerHTML = '';
  const sessions = await fetchSessions();
  const table = renderTable(
    ['ID', 'Sesión', 'Fecha', 'Estado', 'Quórum requerido', 'Proyectos'],
    sessions.map(session => [session.id, session.name, session.date, session.status, session.quorumRequired, session.projectCount])
  );
  const info = document.createElement('p');
  info.textContent = 'Sesiones programadas y su estado actual.';
  moduleContent.appendChild(info);
  moduleContent.appendChild(table);
}

async function renderOrdenDelDiaModule() {
  moduleContent.innerHTML = '';
  const orderItems = await fetchOrderOfDay();
  const table = renderTable(
    ['ID', 'Punto', 'Estado', 'Presentador'],
    orderItems.map(point => [point.id, point.title, point.status, point.presenter])
  );
  const info = document.createElement('p');
  info.textContent = 'Orden del día con los proyectos en discusión.';
  moduleContent.appendChild(info);
  moduleContent.appendChild(table);
}

async function renderQuorumModule() {
  moduleContent.innerHTML = '';
  const quorum = await fetchQuorum();
  const summary = document.createElement('div');
  summary.className = 'quorum-summary';
  summary.innerHTML = `
    <div><strong>Sesión activa</strong><p>${quorum.activeSession.name}</p></div>
    <div><strong>Estado</strong><p>${quorum.activeSession.status}</p></div>
    <div><strong>Asistentes</strong><p>${quorum.present} / ${quorum.totalCouncillors}</p></div>
    <div><strong>Quórum necesario</strong><p>${quorum.quorumRequired}</p></div>
    <div><strong>Quórum alcanzado</strong><p>${quorum.quorumReached ? 'Sí' : 'No'}</p></div>
    <div><strong>Ausentes</strong><p>${quorum.absent}</p></div>
  `;
  moduleContent.appendChild(summary);
}

function renderReportesModule() {
  moduleContent.innerHTML = '';
  const info = document.createElement('p');
  info.textContent = 'Aquí aparecerán los reportes de votaciones, asistencia y auditoría.';
  moduleContent.appendChild(info);
}

function renderEstadisticasModule() {
  moduleContent.innerHTML = '';
  const info = document.createElement('p');
  info.textContent = 'Dashboard de estadísticas para métricas de votaciones y sesiones.';
  moduleContent.appendChild(info);
}

function renderAuditoriaModule() {
  moduleContent.innerHTML = '';
  const table = renderTable(
    ['Fecha y hora', 'Usuario', 'Acción'],
    demoAuditLog.map(log => [log.timestamp, log.user, log.action])
  );
  const info = document.createElement('p');
  info.textContent = 'Registro de eventos y cambios importantes.';
  moduleContent.appendChild(info);
  moduleContent.appendChild(table);
}

function renderConfiguracionModule() {
  moduleContent.innerHTML = '';
  const info = document.createElement('p');
  info.textContent = 'Opciones del sistema para personalizar la plataforma.';
  const options = document.createElement('ul');
  options.innerHTML = '<li>Preferencias generales</li><li>Notificaciones</li><li>Seguridad</li><li>Temas</li>';
  moduleContent.appendChild(info);
  moduleContent.appendChild(options);
}

async function renderVotacionesModule() {
  moduleContent.innerHTML = '';
  const sessionData = await fetchSession();
  const summary = document.createElement('div');
  summary.className = 'quorum-summary';
  summary.innerHTML = `
    <div><strong>Proyecto</strong><p>${sessionData.project}</p></div>
    <div><strong>Votos afirmativos</strong><p>${sessionData.counts.afirmativo}</p></div>
    <div><strong>Votos negativos</strong><p>${sessionData.counts.negativo}</p></div>
    <div><strong>Abstenciones</strong><p>${sessionData.counts.abstencion}</p></div>
    <div><strong>Pendientes</strong><p>${sessionData.counts.pendientes}</p></div>
    <div><strong>Estado</strong><p>${sessionData.status === 'abierta' ? 'Abierta' : 'Cerrada'}</p></div>
  `;
  moduleContent.appendChild(summary);
}

function renderAsistenciaQrModule() {
  moduleContent.innerHTML = '';
  const info = document.createElement('p');
  info.textContent = 'Aquí se habilitará la lectura de QR para registrar asistencia.';
  moduleContent.appendChild(info);
}

function renderProyectosModule() {
  moduleContent.innerHTML = '';
  const table = renderTable(
    ['ID', 'Proyecto', 'Tipo', 'Estado'],
    demoAgenda.map(point => [point.id, point.topic, 'Ordenanza', point.status])
  );
  const info = document.createElement('p');
  info.textContent = 'Proyectos en curso y su estado.';
  moduleContent.appendChild(info);
  moduleContent.appendChild(table);
}

async function renderModuleContent(view) {
  switch (view) {
    case 'usuarios':
      renderUsersModule();
      break;
    case 'concejales':
      renderConcejalesModule();
      break;
    case 'bloques':
      renderBloquesModule();
      break;
    case 'municipios':
      renderMunicipiosModule();
      break;
    case 'sesiones':
      await renderSesionesModule();
      break;
    case 'orden-del-dia':
      await renderOrdenDelDiaModule();
      break;
    case 'reportes':
      renderReportesModule();
      break;
    case 'estadisticas':
      renderEstadisticasModule();
      break;
    case 'auditoria':
      renderAuditoriaModule();
      break;
    case 'configuracion':
      renderConfiguracionModule();
      break;
    case 'votaciones':
      await renderVotacionesModule();
      break;
    case 'quorum':
      await renderQuorumModule();
      break;
    case 'asistencia-qr':
      renderAsistenciaQrModule();
      break;
    case 'proyectos':
      renderProyectosModule();
      break;
    default:
      moduleContent.innerHTML = '<p>Contenido no disponible.</p>';
  }
}

async function renderModuleView(view) {
  const module = moduleDefinitions[view];
  if (!module) {
    moduleTitle.textContent = 'Módulo no disponible';
    moduleDescription.textContent = 'Selecciona un módulo válido en la barra lateral.';
    moduleObjective.textContent = '';
    moduleStatus.textContent = '';
    moduleActionPrimary.textContent = 'Volver';
    moduleActionSecondary.textContent = 'Cerrar';
    moduleContent.innerHTML = '';
    return;
  }

  activeModule = view;
  moduleTitle.textContent = module.title;
  moduleDescription.textContent = module.description;
  moduleObjective.textContent = module.objective;
  moduleStatus.textContent = module.status;
  moduleActionPrimary.textContent = module.primaryAction;
  moduleActionSecondary.textContent = module.secondaryAction;
  await renderModuleContent(view);
}

async function setActiveView(view) {
  const isHistory = view === 'history';
  const isSession = view === 'session';
  const isModule = Boolean(moduleDefinitions[view]);

  sessionView.classList.toggle('hidden', !isSession);
  historyView.classList.toggle('hidden', !isHistory);
  moduleView.classList.toggle('hidden', !isModule);

  navLinks.forEach(link => link.classList.toggle('active', link.dataset.view === view));

  if (isSession) {
    loadSession();
  } else if (isHistory) {
    loadHistory();
  } else if (isModule) {
    await renderModuleView(view);
  }
}

loginBtn.addEventListener('click', async () => {
  loginMessage.textContent = '';
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    loginMessage.textContent = 'Completa usuario y contraseña.';
    return;
  }

  const result = await login(username, password);
  if (result.error) {
    loginMessage.textContent = result.error;
    return;
  }

  authToken = result.token;
  currentUser = result.user;
  profileAvatar.textContent = currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  profileName.textContent = currentUser.name;
  profileRole.textContent = currentUser.role;
  messageEl.textContent = '';
  showApp();
  setActiveView('session');
});

voteButtons.forEach(button => {
  button.addEventListener('click', async () => {
    const option = button.dataset.option;
    await sendVote(option);
    await loadSession();
  });
});

navLinks.forEach(link => {
  link.addEventListener('click', async event => {
    event.preventDefault();
    const view = link.dataset.view;
    if (!view) {
      return;
    }
    await setActiveView(view);
  });
});

moduleActionPrimary.addEventListener('click', async () => {
  if (!activeModule) return;
  await setActiveView(activeModule);
});

moduleActionSecondary.addEventListener('click', () => {
  if (!activeModule) return;
  const action = moduleDefinitions[activeModule]?.secondaryAction || 'Acción secundaria';
  alert(`${action} no está disponible aún.`);
});

async function loadSession() {
  const sessionData = await fetchSession();
  renderSession(sessionData);
  if (currentUser && currentUser.voted) {
    disableVoteButtons();
    messageEl.textContent = 'Ya emitiste tu voto.';
    messageEl.style.color = '#6f7a92';
  } else {
    enableVoteButtons();
    messageEl.textContent = 'Selecciona una opción para votar.';
    messageEl.style.color = '#13203b';
  }
  const projects = await fetchProjects();
  renderProjectList(projects);
}

async function loadHistory() {
  const historyData = await fetchHistory();
  renderHistory(historyData);
}

function showLogin() {
  loginShell.classList.remove('hidden');
  appShell.classList.add('hidden');
}

function showApp() {
  loginShell.classList.add('hidden');
  appShell.classList.remove('hidden');
}

window.addEventListener('DOMContentLoaded', () => {
  showLogin();
});
