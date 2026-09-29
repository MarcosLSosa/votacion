const TOKEN_KEY = 'votacion:token';
const USER_KEY = 'votacion:user';

const pagina = document.body.dataset.page || 'dashboard';

function el(id) {
  return document.getElementById(id);
}

function texto(id, valor) {
  const nodo = el(id);
  if (nodo) {
    nodo.textContent = valor === null || valor === undefined ? '—' : String(valor);
  }
}

function leerSesion() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function guardarSesion(token, usuario) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(usuario));
}

function borrarSesion() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function tokenActual() {
  return localStorage.getItem(TOKEN_KEY);
}

async function api(ruta, opciones = {}) {
  const cabeceras = { 'Content-Type': 'application/json' };
  if (tokenActual()) {
    cabeceras['x-auth-token'] = tokenActual();
  }

  const response = await fetch(ruta, {
    method: opciones.method || 'GET',
    headers: { ...cabeceras, ...(opciones.headers || {}) },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
    credentials: 'same-origin'
  });

  if (response.status === 401) {
    borrarSesion();
    window.location.href = '/login';
    throw new Error('La sesión expiró.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'El servidor respondió un error.');
  }
  return data;
}

function celda(contenido) {
  const td = document.createElement('td');
  if (contenido instanceof Node) {
    td.appendChild(contenido);
  } else {
    td.textContent = contenido === null || contenido === undefined || contenido === '' ? '—' : String(contenido);
  }
  return td;
}

function fila(celdas) {
  const tr = document.createElement('tr');
  celdas.forEach(item => tr.appendChild(celda(item)));
  return tr;
}

function etiqueta(textoLabel, clase) {
  const span = document.createElement('span');
  span.className = `badge ${clase || ''}`.trim();
  span.textContent = textoLabel;
  return span;
}

function boton(textoBoton, accion) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn chico';
  button.textContent = textoBoton;
  button.addEventListener('click', accion);
  return button;
}

function vaciar(id) {
  const nodo = el(id);
  if (nodo) {
    nodo.innerHTML = '';
  }
  return nodo;
}

function cuerpo(id, filas, columnas) {
  const tabla = el(id);
  if (!tabla) {
    return;
  }
  tabla.innerHTML = '';
  if (filas.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = columnas;
    td.className = 'muted';
    td.textContent = 'No hay registros cargados.';
    tr.appendChild(td);
    tabla.appendChild(tr);
    return;
  }
  filas.forEach(f => tabla.appendChild(f));
}

function kpis(contenedor, items) {
  const caja = el(contenedor);
  if (!caja) {
    return;
  }
  caja.innerHTML = '';
  items.forEach(([valor, descripcion]) => {
    const div = document.createElement('div');
    div.className = 'kpi';
    const strong = document.createElement('strong');
    strong.textContent = valor === null || valor === undefined ? '—' : String(valor);
    const span = document.createElement('span');
    span.textContent = descripcion;
    div.append(strong, span);
    caja.appendChild(div);
  });
}

function barra(contenedor, titulo, valor, maximo, clase) {
  const filaBarra = document.createElement('div');
  filaBarra.className = 'bar-row';
  const label = document.createElement('div');
  label.className = 'bar-label';
  const nombre = document.createElement('span');
  nombre.textContent = titulo;
  const importe = document.createElement('strong');
  importe.textContent = String(valor);
  label.append(nombre, importe);
  const progreso = document.createElement('div');
  progreso.className = 'bar-track';
  const interna = document.createElement('div');
  interna.className = `bar-fill ${clase || ''}`.trim();
  interna.style.width = `${maximo > 0 ? Math.round((valor / maximo) * 100) : 0}%`;
  progreso.appendChild(interna);
  filaBarra.append(label, progreso);
  contenedor.appendChild(filaBarra);
}

function fmtNumero(valor) {
  return new Intl.NumberFormat('es-AR').format(valor || 0);
}

async function cargarCabecera() {
  try {
    const sessions = await api('/api/sessions');
    const activa = sessions.find(session => session.active) || sessions[0];
    if (activa) {
      texto('sessionType', `${activa.name} • ${activa.date}`);
    }
  } catch (error) {
    console.error(error);
  }
}

function pintarPerfil(usuario) {
  if (!usuario) {
    return;
  }
  texto('profileName', usuario.name);
  texto('profileRole', usuario.role);
  const avatar = el('profileAvatar');
  if (avatar) {
    avatar.textContent = usuario.name
      .split(' ')
      .map(parte => parte[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}

async function cerrarSesion() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    console.error(error);
  }
  borrarSesion();
  window.location.href = '/login';
}

async function cargarDashboard() {
  const message = el('message');
  let session;
  try {
    session = await api('/api/session');
  } catch (error) {
    texto('projectTitle', 'No hay un proyecto en votación');
    if (message) {
      message.textContent = error.message;
    }
    return;
  }

  texto('projectTag', session.project);
  texto('projectTitle', session.title);
  texto('projectDescription', session.description);
  texto('projectStartedBy', session.startedBy);
  texto('projectType', session.type);
  texto('projectStartedAt', session.startedAt);
  texto('mobileProjectTag', session.project);
  texto('mobileProjectTitle', session.title);
  texto('affirmativeCount', session.counts.afirmativo);
  texto('negativeCount', session.counts.negativo);
  texto('abstentionCount', session.counts.abstencion);
  texto('pendingCount', session.counts.pendientes);
  texto('connectedCount', `${session.connectedCouncillors} / ${session.totalCouncillors}`);
  texto('statusText', session.status === 'abierta' ? 'Votación abierta' : 'Votación cerrada');

  const bar = el('connectedBar');
  if (bar) {
    bar.style.width = `${Math.round((session.connectedCouncillors / session.totalCouncillors) * 100)}%`;
  }

  const usuario = leerSesion();
  if (message && usuario) {
    if (usuario.voted) {
      message.style.color = '#6f7a92';
      message.textContent = `Ya emitiste tu voto: ${String(usuario.vote).toUpperCase()}`;
    } else if (session.status === 'abierta') {
      message.style.color = '#13203b';
      message.textContent = 'Selecciona una opción para votar.';
    } else {
      message.style.color = '#d93e4a';
      message.textContent = 'La votación de este proyecto está cerrada.';
    }
  }

  await cargarProyectosDashboard();
}

async function cargarProyectosDashboard() {
  const lista = vaciar('projectList');
  if (!lista) {
    return;
  }
  const projects = await api('/api/projects');
  projects.forEach(project => {
    const item = document.createElement('article');
    item.className = 'project-item';

    const titulo = document.createElement('h4');
    titulo.textContent = `${project.project} — ${project.title}`;
    const meta = document.createElement('p');
    meta.textContent = `${project.type} • Afirmativo ${project.counts.afirmativo} • Negativo ${project.counts.negativo} • Abstención ${project.counts.abstencion} • Pendientes ${project.counts.pendientes}`;
    item.append(titulo, meta);

    const acciones = document.createElement('div');
    acciones.className = 'project-item-actions';
    acciones.appendChild(project.status === 'abierta' ? etiqueta('En votación', 'verde') : etiqueta('Finalizado', 'gris'));
    acciones.appendChild(boton('Activar', async () => {
      try {
        await api(`/api/project/${project.id}/activate`, { method: 'POST' });
        await cargarDashboard();
      } catch (error) {
        console.error(error);
      }
    }));
    item.appendChild(acciones);
    lista.appendChild(item);
  });
}

async function votar(option) {
  const message = el('message');
  try {
    await api('/api/vote', { method: 'POST', body: { option } });
    const usuario = leerSesion();
    if (usuario) {
      guardarSesion(tokenActual(), { ...usuario, voted: true, vote: option });
    }
    if (message) {
      message.style.color = '#2fa84f';
      message.textContent = `Voto registrado: ${option.toUpperCase()}`;
    }
  } catch (error) {
    if (message) {
      message.style.color = '#d93e4a';
      message.textContent = error.message;
    }
  }
  await cargarDashboard();
}

function conectarVotos() {
  document.querySelectorAll('.vote-btn, .mobile-btn').forEach(button => {
    button.addEventListener('click', () => votar(button.dataset.option));
  });
}

async function cargarUsuarios() {
  const usuarios = await api('/api/usuarios');
  texto('usuariosTotal', usuarios.length);
  texto('usuariosActivos', usuarios.filter(u => u.conectado).length);
  texto('usuariosVotos', usuarios.reduce((sum, u) => sum + u.votosEmitidos, 0));
  cuerpo('tbodyUsuarios', usuarios.map(u => fila([
    u.id,
    u.name,
    u.role,
    u.username,
    u.email,
    u.bloque,
    etiqueta(u.estado, u.conectado ? 'verde' : 'gris'),
    u.votosEmitidos
  ])), 8);
}

async function cargarConcejales() {
  const concejales = await api('/api/councillors');
  const presentes = concejales.filter(c => c.connected).length;
  texto('concejalesTotal', concejales.length);
  texto('concejalesPresentes', presentes);
  texto('concejalesAusentes', concejales.length - presentes);
  cuerpo('tbodyConcejales', concejales.map(c => fila([
    c.id,
    c.name,
    c.bloque,
    c.role,
    etiqueta(c.connected ? 'Presente' : 'Ausente', c.connected ? 'verde' : 'rojo'),
    c.vote ? etiqueta(String(c.vote).toUpperCase(), 'azul') : 'Pendiente'
  ])), 6);
}

async function cargarBloques() {
  const bloques = await api('/api/bloques');
  texto('bloquesTotal', bloques.length);
  texto('bloquesIntegrantes', bloques.reduce((sum, b) => sum + b.miembros, 0));
  texto('bloquesPresentes', bloques.reduce((sum, b) => sum + b.presentes, 0));
  cuerpo('tbodyBloques', bloques.map(b => fila([
    b.id,
    b.nombre,
    b.sigla,
    b.miembros,
    `${b.presentes} / ${b.miembros}`,
    b.fundado
  ])), 6);

  const detalle = vaciar('detalleBloques');
  if (!detalle) {
    return;
  }
  bloques.forEach(bloque => {
    const grupo = document.createElement('div');
    grupo.className = 'chip-group';
    const titulo = document.createElement('h4');
    titulo.textContent = bloque.nombre;
    grupo.appendChild(titulo);
    bloque.concejales.forEach(concejal => {
      grupo.appendChild(etiqueta(
        `${concejal.name}${concejal.connected ? '' : ' (ausente)'}`,
        concejal.connected ? 'verde' : 'gris'
      ));
    });
    detalle.appendChild(grupo);
  });
}

async function cargarMunicipios() {
  const datos = await api('/api/municipios');
  const municipios = datos.municipios;
  const mayor = municipios.reduce((mejor, m) => (!mejor || m.habitantes > mejor.habitantes ? m : mejor), null);
  texto('municipiosTotal', municipios.length);
  texto('municipiosHabitantes', fmtNumero(datos.totalHabitantes));
  texto('municipiosMayor', mayor ? mayor.nombre : '—');
  cuerpo('tbodyMunicipios', municipios.map(m => fila([
    m.id,
    m.nombre,
    m.departamento,
    m.distrito,
    fmtNumero(m.habitantes),
    datos.totalHabitantes ? `${((m.habitantes / datos.totalHabitantes) * 100).toFixed(1)}%` : '—'
  ])), 6);
}

async function cargarSesiones() {
  const sesiones = await api('/api/sessions');
  const activa = sesiones.find(s => s.active) || sesiones[0];
  texto('sesionesTotal', sesiones.length);
  texto('sesionActiva', activa ? activa.name : '—');
  texto('sesionQuorum', activa ? activa.quorumRequired : 0);
  cuerpo('tbodySesiones', sesiones.map(s => fila([
    s.id,
    s.name,
    s.date,
    etiqueta(s.status === 'abierta' ? 'Abierta' : 'Cerrada', s.status === 'abierta' ? 'verde' : 'gris'),
    s.quorumRequired,
    s.projectCount,
    s.active
      ? etiqueta('En curso', 'azul')
      : boton('Activar', async () => {
        try {
          await api(`/api/sessions/${s.id}/activate`, { method: 'POST' });
          await cargarSesiones();
        } catch (error) {
          console.error(error);
        }
      })
  ])), 7);
}

async function cargarAsistenciaQr() {
  const qr = await api('/api/asistencia/qr');
  const marcas = await api('/api/asistencia');
  texto('qrRegistrados', qr.registrados);
  texto('qrTotal', qr.total);
  texto('qrPendiente', Math.max(qr.total - qr.registrados, 0));
  texto('qrSesion', `${qr.sesion.name} • ${qr.sesion.date}`);
  texto('qrCodigo', qr.codigo);

  const link = el('qrLink');
  if (link) {
    link.href = qr.url;
  }

  const copiar = el('qrCopiar');
  if (copiar && !copiar.dataset.listo) {
    copiar.dataset.listo = '1';
    copiar.addEventListener('click', async () => {
      const url = `${window.location.origin}${qr.url}`;
      const mensaje = el('qrMensaje');
      try {
        await navigator.clipboard.writeText(url);
        if (mensaje) {
          mensaje.textContent = 'Link copiado al portapapeles.';
        }
      } catch (error) {
        if (mensaje) {
          mensaje.textContent = `Copiá manualmente: ${url}`;
        }
      }
    });
  }

  cuerpo('tbodyAsistencias', marcas.map(a => fila([
    a.creadoEn,
    a.name || `Concejal ${a.concejalId}`,
    a.role,
    (a.metodo || 'qr').toUpperCase(),
    a.codigo
  ])), 5);
}

async function cargarQuorum() {
  const [quorum, asistencia] = await Promise.all([api('/api/quorum'), api('/api/attendance')]);
  texto('quorumPresentes', quorum.present);
  texto('quorumAusentes', quorum.absent);
  texto('quorumRequerido', quorum.quorumRequired);
  texto('quorumEstado', quorum.quorumReached ? 'Alcanzado' : 'No alcanzado');
  const status = el('statusText');
  if (status) {
    status.textContent = quorum.quorumReached ? 'Quórum válido' : 'Sin quórum';
  }
  cuerpo('tbodyQuorum', asistencia.map(a => fila([
    a.id,
    a.name,
    a.role,
    etiqueta(a.connected ? 'Presente' : 'Ausente', a.connected ? 'verde' : 'rojo'),
    a.vote || 'Pendiente'
  ])), 5);
}

async function cargarOrden() {
  const [orden, proyectos] = await Promise.all([api('/api/order-of-day'), api('/api/projects')]);
  cuerpo('tbodyOrden', orden.map(item => {
    const proyecto = proyectos.find(p => p.project === item.title);
    return fila([
      item.id,
      item.title,
      item.presenter,
      etiqueta(item.status, proyecto && proyecto.status === 'abierta' ? 'verde' : 'gris'),
      proyecto
        ? boton('Activar votación', async () => {
          try {
            await api(`/api/project/${proyecto.id}/activate`, { method: 'POST' });
            await cargarOrden();
          } catch (error) {
            console.error(error);
          }
        })
        : etiqueta('Sin expediente', 'gris')
    ]);
  }), 5);
}

async function cargarProyectos() {
  const proyectos = await api('/api/projects');
  texto('proyectosTotal', proyectos.length);
  texto('proyectosAbiertos', proyectos.filter(p => p.status === 'abierta').length);
  texto('proyectosCerrados', proyectos.filter(p => p.status !== 'abierta').length);
  cuerpo('tbodyProyectos', proyectos.map(p => fila([
    p.id,
    p.project,
    p.title,
    p.type,
    etiqueta(p.status === 'abierta' ? 'En votación' : 'Finalizado', p.status === 'abierta' ? 'verde' : 'gris'),
    p.counts.afirmativo,
    p.counts.negativo,
    p.counts.abstencion,
    boton('Activar', async () => {
      try {
        await api(`/api/project/${p.id}/activate`, { method: 'POST' });
        await cargarProyectos();
      } catch (error) {
        console.error(error);
      }
    })
  ])), 9);
}

function seccionVotacion(contenedor, votacion) {
  const card = document.createElement('article');
  card.className = 'vote-detail';

  const cabecera = document.createElement('header');
  const titulo = document.createElement('h3');
  titulo.textContent = `${votacion.project} — ${votacion.title}`;
  const estado = etiqueta(
    votacion.status === 'abierta' ? 'En votación' : 'Finalizado',
    votacion.status === 'abierta' ? 'verde' : 'gris'
  );
  cabecera.append(titulo, estado);
  card.appendChild(cabecera);

  const resumen = document.createElement('div');
  resumen.className = 'vote-detail-counts';
  [['Afirmativo', votacion.counts.afirmativo], ['Negativo', votacion.counts.negativo], ['Abstención', votacion.counts.abstencion], ['Pendientes', votacion.counts.pendientes]]
    .forEach(([nombre, valor]) => {
      const item = document.createElement('div');
      item.className = 'kpi';
      const strong = document.createElement('strong');
      strong.textContent = String(valor);
      const span = document.createElement('span');
      span.textContent = nombre;
      item.append(strong, span);
      resumen.appendChild(item);
    });
  card.appendChild(resumen);

  const listas = document.createElement('div');
  listas.className = 'vote-detail-lists';
  [['Afirmativo', votacion.detalle.afirmativo], ['Negativo', votacion.detalle.negativo], ['Abstención', votacion.detalle.abstencion], ['Pendientes', votacion.detalle.pendientes]]
    .forEach(([nombre, personas]) => {
      const bloque = document.createElement('div');
      const sub = document.createElement('h4');
      sub.textContent = `${nombre} (${personas.length})`;
      bloque.appendChild(sub);
      if (personas.length === 0) {
        const vacio = document.createElement('p');
        vacio.className = 'muted';
        vacio.textContent = 'Sin registros.';
        bloque.appendChild(vacio);
      }
      personas.forEach(persona => bloque.appendChild(etiqueta(persona.name, 'gris')));
      listas.appendChild(bloque);
    });
  card.appendChild(listas);
  contenedor.appendChild(card);
}

async function cargarVotaciones() {
  const votaciones = await api('/api/votaciones');
  const contenedor = vaciar('votacionesList');
  if (!contenedor) {
    return;
  }
  votaciones.forEach(votacion => seccionVotacion(contenedor, votacion));
}

function resultadoDe(votacion) {
  if (votacion.counts.afirmativo > votacion.counts.negativo) {
    return 'Aprobado';
  }
  if (votacion.counts.negativo > votacion.counts.afirmativo) {
    return 'Rechazado';
  }
  return 'Empate';
}

async function cargarReportes() {
  const [reporte, historial] = await Promise.all([api('/api/reports'), api('/api/history')]);
  kpis('reportesKpis', [
    [reporte.totalProjects, 'Proyectos totales'],
    [reporte.approvedCount, 'Aprobados'],
    [reporte.rejectedCount, 'Rechazados'],
    [`${reporte.connectedCouncillors} / ${reporte.totalCouncillors}`, 'Concejales conectados']
  ]);

  cuerpo('tbodyReportes', historial.map(p => fila([
    p.project,
    p.title,
    p.type,
    etiqueta(resultadoDe(p), resultadoDe(p) === 'Aprobado' ? 'verde' : 'rojo'),
    p.counts.afirmativo,
    p.counts.negativo,
    p.counts.abstencion,
    p.startedAtFull
  ])), 8);

  const csvBtn = el('csvBtn');
  if (csvBtn && !csvBtn.dataset.listo) {
    csvBtn.dataset.listo = '1';
    csvBtn.addEventListener('click', () => {
      const cabecera = 'Expediente,Titulo,Tipo,Resultado,Afirmativo,Negativo,Abstencion,Fecha';
      const lineas = historial.map(p => [
        p.project,
        p.title.replace(/,/g, ';'),
        p.type,
        resultadoDe(p),
        p.counts.afirmativo,
        p.counts.negativo,
        p.counts.abstencion,
        p.startedAtFull
      ].join(','));
      const blob = new Blob([[cabecera, ...lineas].join('\n')], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'reporte-votaciones.csv';
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }

  const imprimir = el('imprimirBtn');
  if (imprimir && !imprimir.dataset.listo) {
    imprimir.dataset.listo = '1';
    imprimir.addEventListener('click', () => window.print());
  }
}

async function cargarEstadisticas() {
  const [stats, proyectos] = await Promise.all([api('/api/stats'), api('/api/projects')]);
  kpis('statsKpis', [
    [stats.totalVotes, 'Votos emitidos'],
    [`${stats.participationRate}%`, 'Participación'],
    [`${stats.connected} / ${stats.totalCouncillors}`, 'Concejales conectados'],
    [stats.activeProjects, 'Votaciones abiertas']
  ]);

  const barras = vaciar('statsBarras');
  if (barras) {
    barras.innerHTML = '';
    barra(barras, 'Afirmativos', stats.affirmatives, stats.totalVotes, 'verde');
    barra(barras, 'Negativos', stats.negatives, stats.totalVotes, 'rojo');
    barra(barras, 'Abstenciones', stats.abstentions, stats.totalVotes, 'gris');
  }

  const porProyecto = vaciar('statsProyectos');
  if (porProyecto) {
    porProyecto.innerHTML = '';
    proyectos.forEach(proyecto => {
      const emitidos = proyecto.counts.afirmativo + proyecto.counts.negativo + proyecto.counts.abstencion;
      barra(porProyecto, proyecto.project, emitidos, proyecto.totalCouncillors, 'azul');
    });
  }
}

async function cargarAuditoria() {
  const eventos = await api('/api/auditoria?limit=150');
  texto('auditoriaTotal', eventos.length);
  texto('auditoriaUsuarios', new Set(eventos.map(e => e.usuario)).size);
  texto('auditoriaUltimo', eventos.length ? eventos[0].timestamp : '—');
  cuerpo('tbodyAuditoria', eventos.map(e => fila([
    e.timestamp,
    e.usuario,
    e.accion,
    e.detalle
  ])), 4);
}

async function cargarConfiguracion() {
  const [datos, municipios] = await Promise.all([api('/api/configuracion'), api('/api/municipios')]);
  const config = datos.config;

  const selectMunicipio = el('cfgMunicipioSede');
  if (selectMunicipio) {
    selectMunicipio.innerHTML = '';
    municipios.municipios.forEach(municipio => {
      const option = document.createElement('option');
      option.value = municipio.nombre;
      option.textContent = municipio.nombre;
      if (config.municipio_sede === municipio.nombre) {
        option.selected = true;
      }
      selectMunicipio.appendChild(option);
    });
  }

  texto('cfgQuorum', datos.quorumSesion === null ? 'Sin sesión activa' : `${datos.quorumSesion} concejales`);
  if (el('cfgMayoria')) {
    el('cfgMayoria').value = config.mayoria || 'Simple';
  }
  if (el('cfgDuracion')) {
    el('cfgDuracion').value = config.duracion_votacion || 5;
  }
  if (el('cfgPantalla')) {
    el('cfgPantalla').checked = config.pantalla_publica === '1';
  }
  if (el('cfgNotificaciones')) {
    el('cfgNotificaciones').checked = config.notificaciones === '1';
  }

  const form = el('formConfig');
  if (form && !form.dataset.listo) {
    form.dataset.listo = '1';
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const mensaje = el('configMensaje');
      try {
        await api('/api/configuracion', {
          method: 'PUT',
          body: {
            municipio_sede: selectMunicipio ? selectMunicipio.value : '',
            mayoria: el('cfgMayoria').value,
            duracion_votacion: el('cfgDuracion').value,
            pantalla_publica: el('cfgPantalla').checked ? '1' : '0',
            notificaciones: el('cfgNotificaciones').checked ? '1' : '0'
          }
        });
        if (mensaje) {
          mensaje.style.color = '#2fa84f';
          mensaje.textContent = 'Configuración guardada.';
        }
      } catch (error) {
        if (mensaje) {
          mensaje.style.color = '#d93e4a';
          mensaje.textContent = error.message;
        }
      }
    });
  }

  const recargar = el('configRecargar');
  if (recargar && !recargar.dataset.listo) {
    recargar.dataset.listo = '1';
    recargar.addEventListener('click', cargarConfiguracion);
  }
}

const CARGADORES = {
  dashboard: cargarDashboard,
  usuarios: cargarUsuarios,
  concejales: cargarConcejales,
  bloques: cargarBloques,
  municipios: cargarMunicipios,
  sesiones: cargarSesiones,
  'asistencia-qr': cargarAsistenciaQr,
  quorum: cargarQuorum,
  'orden-del-dia': cargarOrden,
  proyectos: cargarProyectos,
  votaciones: cargarVotaciones,
  reportes: cargarReportes,
  estadisticas: cargarEstadisticas,
  auditoria: cargarAuditoria,
  configuracion: cargarConfiguracion
};

async function cargarPagina() {
  const cargador = CARGADORES[pagina];
  if (!cargador) {
    return;
  }
  try {
    await cargador();
  } catch (error) {
    console.error(`No se pudo cargar ${pagina}:`, error);
  }
}

async function iniciar() {
  const logout = el('logoutBtn');
  if (logout) {
    logout.addEventListener('click', cerrarSesion);
  }

  let usuario;
  try {
    const datos = await api('/api/auth/me');
    usuario = datos.user;
    if (tokenActual()) {
      guardarSesion(tokenActual(), usuario);
    }
  } catch (error) {
    return;
  }

  pintarPerfil(usuario);
  await cargarCabecera();
  if (pagina === 'dashboard') {
    conectarVotos();
  }
  await cargarPagina();
  setInterval(cargarPagina, 5000);
}

iniciar();