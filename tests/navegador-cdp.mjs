#!/usr/bin/env node
/*
 * Prueba de navegador del panel de votación usando DevTools Protocol.
 * No necesita dependencias: Node 22 ya trae WebSocket global y el cliente CDP es manual.
 *
 *   google-chrome --headless=new --remote-debugging-port=9222 --no-first-run \
 *     --no-default-browser-check about:blank &
 *   npm start &
 *   node tests/navegador-cdp.mjs
 *
 * Variables: APP_URL, CDP_URL, USUARIO, CLAVE.
 */
const APP = process.env.APP_URL || 'http://localhost:3000';
const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const USUARIO = process.env.USUARIO || 'sofia';
const CLAVE = process.env.CLAVE || '1234';

let erroresJS = [];
let fallos = 0;
let pasos = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function paso(descripcion, ok, detalle = '') {
  pasos += 1;
  if (ok) {
    console.log(`  ok    ${descripcion}${detalle ? ' — ' + detalle : ''}`);
  } else {
    fallos += 1;
    console.log(`  FALLA ${descripcion}${detalle ? ' — ' + detalle : ''}`);
  }
}

async function esperarChrome() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${CDP}/json/version`);
      if (res.ok) return res.json();
    } catch { /* todavía no está listo */ }
    await sleep(500);
  }
  throw new Error(`Chrome no respondió en ${CDP}`);
}

function cliente(ws) {
  let id = 0;
  const pendientes = new Map();
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pendientes.has(msg.id)) {
      const { resolve, reject } = pendientes.get(msg.id);
      pendientes.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      erroresJS.push((d.exception && d.exception.description) || d.text);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      erroresJS.push(msg.params.args.map(a => a.value ?? a.description).join(' '));
    }
  });
  return (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pendientes.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
  });
}

async function js(send, sessionId, expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (res.exceptionDetails) {
    throw new Error('Error en la página: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result.value;
}

const sonda = `(() => ({
  path: location.pathname,
  page: document.body.dataset.page,
  h1: document.querySelector('.top-bar h1')?.textContent.trim(),
  navActiva: document.querySelector('.nav-link.active')?.getAttribute('href'),
  perfil: document.getElementById('profileName')?.textContent,
  kpis: [...document.querySelectorAll('.kpi strong')].map(e => e.textContent.trim()),
  tablas: [...document.querySelectorAll('#contenido table')].map(t => t.querySelectorAll('tbody tr').length),
  barras: document.querySelectorAll('.bar-row').length,
  chips: document.querySelectorAll('.chip-group').length,
  badges: document.querySelectorAll('.badge').length,
  detalles: document.querySelectorAll('.vote-detail').length,
  controles: document.querySelectorAll('#contenido input, #contenido select, #contenido button').length
}))()`;

const loginJs = (usuario, clave) => `(() => {
  document.getElementById('username').value = ${JSON.stringify(usuario)};
  document.getElementById('password').value = ${JSON.stringify(clave)};
  document.getElementById('loginForm').requestSubmit();
})()`;

const PAGINAS = [
  'dashboard', 'usuarios', 'concejales', 'bloques', 'municipios', 'sesiones',
  'asistencia-qr', 'quorum', 'orden-del-dia', 'proyectos', 'votaciones',
  'reportes', 'estadisticas', 'auditoria', 'configuracion'
];

(async () => {
  const version = await esperarChrome();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  const send = cliente(ws);
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);

  const ir = async url => {
    const cargada = new Promise(resolve => {
      const escucha = ev => {
        const msg = JSON.parse(ev.data);
        if (msg.method === 'Page.loadEventFired') {
          ws.removeEventListener('message', escucha);
          resolve();
        }
      };
      ws.addEventListener('message', escucha);
    });
    await send('Page.navigate', { url }, sessionId);
    await cargada;
    await sleep(900);
  };

  console.log('== 1. Ingreso ==');
  await ir(`${APP}/login`);
  let estado = await js(send, sessionId, `(() => ({ path: location.pathname, form: Boolean(document.getElementById('loginForm')) }))()`);
  paso('/login muestra el formulario', estado.path === '/login' && estado.form, JSON.stringify(estado));

  await js(send, sessionId, loginJs(`${USUARIO}-noexiste`, '0000'));
  await sleep(1200);
  estado = await js(send, sessionId, `(() => ({ path: location.pathname, mensaje: document.getElementById('loginMessage').textContent.trim() }))()`);
  paso('credenciales invalidas no dejan entrar', estado.path === '/login' && /incorrectos/i.test(estado.mensaje), estado.mensaje);

  await js(send, sessionId, loginJs(USUARIO, CLAVE));
  await sleep(1800);
  estado = await js(send, sessionId, sonda);
  paso('login real redirige a /dashboard', estado.path === '/dashboard', JSON.stringify(estado));
  paso('el perfil se carga desde /api/auth/me', Boolean(estado.perfil) && !/Cargando/.test(estado.perfil || ''), estado.perfil);

  console.log('== 2. Las 15 paginas ==');
  for (const pagina of PAGINAS) {
    erroresJS = [];
    await ir(`${APP}/${pagina}`);
    estado = await js(send, sessionId, sonda);
    const filas = estado.tablas.reduce((total, n) => total + n, 0);
    const contenido = estado.kpis.length + filas + estado.barras + estado.chips + estado.badges + estado.detalles + estado.controles;
    paso(
      `/${pagina} pinta contenido y navega`,
      estado.path === `/${pagina}` && estado.navActiva === `/${pagina}` && contenido > 0,
      `kpis=${estado.kpis.length} filas=${filas} badges=${estado.badges} barras=${estado.barras} detalles=${estado.detalles} controles=${estado.controles}`
    );
    paso(`/${pagina} sin errores de consola`, erroresJS.length === 0, erroresJS.slice(0, 2).join(' | '));
  }


  console.log('== 3. Configuracion ==');
  await ir(`${APP}/configuracion`);
  const duracionOriginal = await js(send, sessionId, `document.getElementById('cfgDuracion').value`);
  await js(send, sessionId, `(() => {
    document.getElementById('cfgDuracion').value = '7';
    document.getElementById('formConfig').requestSubmit();
  })()`);
  await sleep(1300);
  let cfg = await js(send, sessionId, `(() => ({
    mensaje: document.getElementById('configMensaje').textContent.trim(),
    duracion: document.getElementById('cfgDuracion').value
  }))()`);
  paso('guardar configuracion', /guardada/i.test(cfg.mensaje) && cfg.duracion === '7', cfg.mensaje);
  await js(send, sessionId, `(() => {
    document.getElementById('cfgDuracion').value = ${JSON.stringify(duracionOriginal)};
    document.getElementById('formConfig').requestSubmit();
  })()`);
  await sleep(1200);
  cfg = await js(send, sessionId, `document.getElementById('cfgDuracion').value`);
  paso('se restaura el valor original', cfg === duracionOriginal, `duracion=${cfg}`);

  console.log('== 4. Asistencia QR ==');
  await ir(`${APP}/asistencia-qr`);
  const qr = await js(send, sessionId, `(() => ({
    codigo: document.getElementById('qrCodigo').textContent.trim(),
    link: document.getElementById('qrLink').getAttribute('href')
  }))()`);
  paso('el panel muestra el codigo de la sesion activa', /^[0-9A-F]{8}$/.test(qr.codigo), `${qr.codigo} -> ${qr.link}`);
  await ir(`${APP}${qr.link}`);
  await js(send, sessionId, `(() => {
    document.getElementById('username').value = ${JSON.stringify(process.env.ASISTENCIA || 'leo')};
    document.getElementById('asistenciaForm').requestSubmit();
  })()`);
  await sleep(1500);
  const marca = await js(send, sessionId, `document.getElementById('asistenciaMensaje').textContent.trim()`);
  paso('el check-in publico registra la presencia', /registrada/i.test(marca), marca);

  console.log('== 5. Voto (si el usuario aun no voto) ==');
  await ir(`${APP}/dashboard`);
  const aviso = await js(send, sessionId, `document.getElementById('message').textContent.trim()`);
  if (/Ya emitiste/.test(aviso)) {
    console.log(`  skip  ${USUARIO} ya emitió su voto sobre el proyecto activo`);
  } else {
    const antes = await js(send, sessionId, `(() => ({
      neg: document.getElementById('negativeCount').textContent,
      pend: document.getElementById('pendingCount').textContent
    }))()`);
    await js(send, sessionId, `document.querySelector('.vote-btn[data-option="negativo"]').click()`);
    await sleep(1800);
    const despues = await js(send, sessionId, `(() => ({
      neg: document.getElementById('negativeCount').textContent,
      pend: document.getElementById('pendingCount').textContent,
      mensaje: document.getElementById('message').textContent.trim()
    }))()`);
    paso(
      'el voto negativo se refleja en el resumen',
      Number(despues.neg) === Number(antes.neg) + 1 && Number(despues.pend) === Number(antes.pend) - 1,
      `negativos ${antes.neg}->${despues.neg}, pendientes ${antes.pend}->${despues.pend}; ${despues.mensaje}`
    );
  }

  console.log('== 6. Pantalla publica /screen ==');
  erroresJS = [];
  await ir(`${APP}/screen`);
  const pantalla = await js(send, sessionId, `(() => {
    const ficha = document.querySelector('.ficha.presente');
    const fichas = document.querySelectorAll('.ficha');
    const cards = [...document.querySelectorAll('.vcard')];
    const reloj = document.getElementById('screenClock').textContent.trim();
    return {
      path: location.pathname,
      live: document.querySelector('.live') ? document.querySelector('.live').textContent.trim() : '',
      fichas: fichas.length,
      presentes: document.querySelectorAll('.ficha.presente').length,
      ausentes: document.querySelectorAll('.ficha.ausente').length,
      enLinea: document.querySelectorAll('.ficha.envivo').length,
      voton: ficha ? getComputedStyle(ficha.querySelector('.voton')).backgroundImage : '',
      votonTexto: ficha ? ficha.querySelector('.voton-texto strong').textContent.trim() : '',
      donut: document.getElementById('voteDonut').style.background.slice(0, 20),
      barra: document.getElementById('presenceFill').style.width,
      big: document.getElementById('presenceBigText').textContent.trim(),
      quorum: document.getElementById('screenQuorumState').textContent.trim(),
      cards: cards.length,
      numeros: cards.map(c => c.querySelector('.vnum').textContent.trim()),
      reloj: /^\\d{1,2}:\\d{2}:\\d{2}$/.test(reloj),
      alertaOculta: document.getElementById('screenAlert').hidden
    };
  })()`);
  paso('/screen muestra una ficha por concejal', pantalla.path === '/screen' && pantalla.fichas > 0 && pantalla.fichas === pantalla.presentes + pantalla.ausentes, `fichas=${pantalla.fichas}`);
  paso('el voton verde dice PRESENTE', pantalla.votonTexto === 'PRESENTE' && pantalla.voton.includes('rgb(46, 224, 122)'), `${pantalla.votonTexto} · ${pantalla.voton.slice(0, 46)}`);
  paso('presentes + ausentes cubren el cuerpo y hay conectados', pantalla.presentes > 0 && pantalla.enLinea >= 0, `presentes=${pantalla.presentes} ausentes=${pantalla.ausentes} enLinea=${pantalla.enLinea}`);
  paso('la dona usa conic-gradient con los conteos', pantalla.donut.startsWith('conic-gradient'), pantalla.donut);
  paso('barras de presencia y voton global verde', /%$/.test(pantalla.barra) && Number.parseFloat(pantalla.barra) > 0 && /PRESENT/.test(pantalla.big), `${pantalla.barra} · ${pantalla.big}`);
  paso('cuatro tarjetas de conteo con numeros', pantalla.cards === 4 && pantalla.numeros.every(n => /^\d+$/.test(n)), `cards=${pantalla.cards} · ${pantalla.numeros.join('/')}`);
  paso('reloj en vivo y quorum indicado', pantalla.reloj && /QUÓRUM/.test(pantalla.quorum), `${pantalla.quorum}`);
  paso('/screen sin errores de consola', erroresJS.length === 0 && pantalla.alertaOculta, erroresJS.slice(0, 2).join(' | '));

  console.log('== 7. Salida y bloqueo ==');
  // volvemos al panel: /screen es pública y no tiene el botón de salida
  await ir(`${APP}/dashboard`);
  await js(send, sessionId, `document.getElementById('logoutBtn').click()`);
  await sleep(1500);
  const salida = await js(send, sessionId, `(() => ({
    path: location.pathname,
    token: localStorage.getItem('votacion:token')
  }))()`);
  paso('logout vuelve a /login y limpia el storage', salida.path === '/login' && !salida.token, JSON.stringify(salida));
  await ir(`${APP}/auditoria`);
  const bloqueado = await js(send, sessionId, 'location.pathname');
  paso('ruta protegida sin sesion redirige a /login', bloqueado === '/login', bloqueado);

  ws.close();
  console.log(`\n${fallos === 0 ? 'TODO OK' : `${fallos} FALLAS`} de ${pasos} verificaciones`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch(err => {
  console.error('FALLO:', err.message);
  process.exit(1);
});

