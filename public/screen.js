const MOVIMIENTO_REDUCIDO = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const VOTOS = [
  { clave: 'afirmativo', etiqueta: 'Afirmativo', icono: '✓', clase: 'si' },
  { clave: 'negativo', etiqueta: 'Negativo', icono: '✕', clase: 'no' },
  { clave: 'abstencion', etiqueta: 'Abstención', icono: '–', clase: 'abst' },
  { clave: 'pendientes', etiqueta: 'Pendientes', icono: '○', clase: 'pend' }
];

const ETIQUETA_VOTO = { afirmativo: 'Afirmativo', negativo: 'Negativo', abstencion: 'Abstención' };

function texto(id, valor) {
  const nodo = document.getElementById(id);
  if (nodo) {
    nodo.textContent = valor === null || valor === undefined ? '—' : String(valor);
  }
}

function iniciales(nombre) {
  return String(nombre || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(parte => parte[0].toUpperCase())
    .join('');
}

async function leerJson(url) {
  try {
    const respuesta = await fetch(url, { cache: 'no-store' });
    return respuesta.ok ? await respuesta.json() : null;
  } catch (error) {
    return null;
  }
}

async function obtenerDatos() {
  return leerJson('/api/screen');
}

function animarNumero(nodo, destino) {
  if (!nodo) {
    return;
  }
  const desde = Number(nodo.dataset.valor || 0);
  nodo.dataset.valor = String(destino);
  if (desde === destino || MOVIMIENTO_REDUCIDO) {
    nodo.textContent = String(destino);
    return;
  }
  nodo.classList.remove('flash');
  void nodo.offsetWidth;
  nodo.classList.add('flash');
  const inicio = performance.now();
  const duracion = 650;
  const paso = ahora => {
    const t = Math.min((ahora - inicio) / duracion, 1);
    const suavizado = 1 - Math.pow(1 - t, 3);
    nodo.textContent = String(Math.round(desde + (destino - desde) * suavizado));
    if (t < 1) {
      requestAnimationFrame(paso);
    }
  };
  requestAnimationFrame(paso);
}

function construirTarjetas() {
  const cont = document.getElementById('voteCards');
  if (cont.childElementCount) {
    return;
  }
  cont.innerHTML = VOTOS.map(voto => `
    <article class="vcard ${voto.clase}" data-clave="${voto.clave}">
      <header>
        <span class="vicon">${voto.icono}</span>
        <span class="vlabel">${voto.etiqueta}</span>
      </header>
      <strong class="vnum" data-valor="0">0</strong>
      <div class="vbar"><i></i></div>
      <span class="vpct">0% del cuerpo</span>
    </article>
  `).join('');

  document.getElementById('donutLegend').innerHTML = VOTOS.map(voto => `
    <li class="${voto.clase}"><span class="punto"></span>${voto.etiqueta}<b data-valor="0">0</b></li>
  `).join('');
}

function pintarDistribucion(proyecto) {
  const total = proyecto.total || 1;
  const segmentos = [];
  let acumulado = 0;

  VOTOS.forEach(voto => {
    const valor = proyecto.counts[voto.clave] || 0;
    const porcentaje = (valor / total) * 100;
    const desde = acumulado;
    acumulado += porcentaje;
    segmentos.push(`var(--color-${voto.clase}) ${desde.toFixed(2)}% ${acumulado.toFixed(2)}%`);

    const tarjeta = document.querySelector(`.vcard[data-clave="${voto.clave}"]`);
    if (tarjeta) {
      animarNumero(tarjeta.querySelector('.vnum'), valor);
      tarjeta.querySelector('.vbar i').style.width = `${Math.min(porcentaje, 100)}%`;
      tarjeta.querySelector('.vpct').textContent = `${Math.round(porcentaje)}% del cuerpo`;
    }
    animarNumero(document.querySelector(`.leyenda .${voto.clase} b`), valor);
  });

  const donut = document.getElementById('voteDonut');
  donut.style.background = proyecto.emitidos > 0
    ? `conic-gradient(${segmentos.join(', ')})`
    : 'conic-gradient(var(--color-pend) 0 100%)';
  donut.classList.toggle('vacio', !(proyecto.emitidos > 0));
  animarNumero(document.getElementById('donutTotal'), proyecto.emitidos);
  texto('donutPart', `${proyecto.participacion}% del cuerpo`);
}

function estadoMarca(concejal) {
  if (concejal.enLinea) {
    return 'conectado ahora';
  }
  if (concejal.marca) {
    const hora = String(concejal.marca).split('•').pop().trim();
    return `${concejal.metodo === 'qr' ? 'presente por QR' : 'presente en panel'} · ${hora}`;
  }
  if (concejal.conectado) {
    return 'conectado al panel';
  }
  return 'sin registro de presencia';
}


const ICONO_VOTO = {
  afirmativo: '✓ Afirmativo',
  negativo: '✕ Negativo',
  abstencion: '– Abstención'
};

function pintarConcejales(concejales) {
  const cont = document.getElementById('councillorList');
  const existentes = new Map([...cont.children].map(nodo => [nodo.dataset.id, nodo]));

  concejales.forEach((concejal, indice) => {
    const clave = String(concejal.id);
    let ficha = existentes.get(clave);
    if (ficha) {
      existentes.delete(clave);
    } else {
      ficha = document.createElement('article');
      ficha.className = 'ficha';
      ficha.dataset.id = clave;
      ficha.style.setProperty('--delay', `${indice * 45}ms`);
      ficha.innerHTML = `
        <div class="ficha-cabeza">
          <span class="avatar"></span>
          <div class="who">
            <strong class="nombre"></strong>
            <span class="rol"></span>
          </div>
        </div>
        <div class="voton">
          <span class="voton-punto"></span>
          <div class="voton-texto"><strong></strong><em></em></div>
        </div>
        <div class="ficha-pie">
          <span class="bloque"></span>
          <span class="voto"></span>
        </div>`;
      cont.appendChild(ficha);
    }

    const presente = Boolean(concejal.presente || concejal.conectado);
    ficha.style.setProperty('--bloque', concejal.bloqueColor || '#5b6b8c');
    ficha.classList.toggle('presente', presente);
    ficha.classList.toggle('ausente', !presente);
    ficha.classList.toggle('envivo', Boolean(concejal.enLinea));
    ficha.querySelector('.avatar').textContent = concejal.iniciales || iniciales(concejal.name);
    ficha.querySelector('.nombre').textContent = concejal.name;
    ficha.querySelector('.rol').textContent = concejal.role;
    ficha.querySelector('.voton-texto strong').textContent = presente ? 'PRESENTE' : 'AUSENTE';
    ficha.querySelector('.voton-texto em').textContent = presente ? estadoMarca(concejal) : 'sin conexión ni presencia';
    ficha.querySelector('.bloque').textContent = concejal.bloqueSigla && concejal.bloqueSigla !== '—'
      ? concejal.bloqueSigla
      : concejal.bloque;
    const voto = ficha.querySelector('.voto');
    voto.className = `voto ${concejal.voto || 'ninguno'}`;
    voto.textContent = ICONO_VOTO[concejal.voto] || '○ Sin voto';
  });

  existentes.forEach(nodo => nodo.remove());
}

function pintarPresencia(presencia, sesion) {
  const requerido = sesion ? sesion.requerido : Math.ceil(presencia.total / 2);
  texto('screenPresent', presencia.presentes);
  texto('screenTotal', presencia.total);
  texto('screenQuorumRequired', requerido);

  const chip = document.getElementById('chipQuorum');
  texto('screenQuorumState', presencia.quorumAlcanzado ? 'QUÓRUM OK' : 'SIN QUÓRUM');
  chip.classList.toggle('verde', presencia.quorumAlcanzado);
  chip.classList.toggle('rojo', !presencia.quorumAlcanzado);

  document.getElementById('presenceFill').style.width = `${Math.min(presencia.porcentaje, 100)}%`;
  texto('presenceDetalle', `${presencia.presentes} de ${presencia.total} ediles en sala · ${presencia.enLinea} conectados en este momento`);
  texto('presenceBigText', `${presencia.presentes} PRESENT${presencia.presentes === 1 ? 'E' : 'ES'}`);
  texto('presenceBigSub', presencia.quorumAlcanzado
    ? `quórum alcanzado · ${presencia.porcentaje}% del cuerpo`
    : `faltan ${Math.max(requerido - presencia.presentes, 0)} para el quórum`);
  document.getElementById('presenceBig').classList.toggle('alerta', !presencia.quorumAlcanzado);
}

function pintarProyecto(proyecto, sesion, serverAt) {
  const alerta = document.getElementById('screenAlert');
  alerta.hidden = Boolean(proyecto);
  if (!proyecto) {
    alerta.textContent = 'No hay un proyecto en votación en este momento.';
    document.getElementById('screenProjectTag').textContent = 'Sesión sin proyecto en votación';
    return;
  }

  texto('screenSessionType', proyecto.sessionType || (sesion ? sesion.nombre : 'Sesión'));
  texto('screenSessionDate', sesion ? sesion.fecha : '');
  texto('screenProjectTag', proyecto.project);
  texto('screenTitle', proyecto.title);
  texto('screenDescription', proyecto.description);
  texto('screenStartedAt', proyecto.startedAtFull);
  texto('screenType', proyecto.type);
  texto('screenServerAt', serverAt || '—');

  const estado = document.getElementById('screenStatus');
  const abierta = proyecto.status === 'abierta';
  estado.textContent = abierta ? 'Votación abierta' : 'Votación cerrada';
  estado.classList.toggle('abierta', abierta);

  const banner = document.getElementById('resultBanner');
  banner.className = `result-banner ${proyecto.resultado.color === 'green' ? 'verde' : proyecto.resultado.color === 'red' ? 'roja' : 'ambar'}`;
  texto('screenResult', proyecto.resultado.label);
  texto('resultNote', `${proyecto.mayoria ? 'Mayoría simple alcanzada' : 'Sin mayoría simple'} · ${proyecto.counts.afirmativo} afirmativos vs ${proyecto.counts.negativo} negativos · ${proyecto.emitidos} votos emitidos`);
}

async function refrescar() {
  const alerta = document.getElementById('screenAlert');
  const datos = await obtenerDatos();

  if (!datos) {
    alerta.hidden = false;
    alerta.textContent = 'No se pudo leer la información de la sesión. Reintentando…';
    return;
  }

  construirTarjetas();
  pintarProyecto(datos.proyecto, datos.sesion, datos.serverAt);
  if (datos.proyecto) {
    pintarDistribucion(datos.proyecto);
  }
  pintarPresencia(datos.presencia, datos.sesion);
  pintarConcejales(datos.concejales || []);
}

function actualizarReloj() {
  // hour12:false -> 19:35:12 (sin "p. m."): en el proyector la hora tiene que ser inequívoca
  const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  texto('screenClock', hora);
}

actualizarReloj();
setInterval(actualizarReloj, 1000);
refrescar();
setInterval(refrescar, 3000);
