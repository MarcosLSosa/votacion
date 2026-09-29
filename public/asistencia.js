const asistenciaForm = document.getElementById('asistenciaForm');
const asistenciaMensaje = document.getElementById('asistenciaMensaje');
const asistenciaBtn = document.getElementById('asistenciaBtn');
const codigoLabel = document.getElementById('codigoLabel');

const parametros = new URLSearchParams(window.location.search);
const codigo = parametros.get('codigo') || '';

codigoLabel.textContent = codigo ? codigo.toUpperCase() : 'sin código';

function mostrar(textoMensaje, color) {
  asistenciaMensaje.style.color = color;
  asistenciaMensaje.textContent = textoMensaje;
}

if (!codigo) {
  mostrar('Falta el código de la sesión. Pedile el link al presidente del cuerpo.', '#d93e4a');
}

asistenciaForm.addEventListener('submit', async event => {
  event.preventDefault();
  const username = document.getElementById('username').value.trim();

  if (!codigo) {
    mostrar('Falta el código de la sesión.', '#d93e4a');
    return;
  }
  if (!username) {
    mostrar('Ingresá tu usuario de concejal.', '#d93e4a');
    return;
  }

  asistenciaBtn.disabled = true;
  mostrar('Registrando presencia...', '#6f7a92');

  try {
    const response = await fetch('/api/asistencia/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, username })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'No se pudo registrar la asistencia.');
    }
    mostrar(`Listo, ${data.name}: tu presencia quedó registrada.`, '#2fa84f');
    asistenciaBtn.textContent = 'Presencia registrada';
  } catch (error) {
    mostrar(error.message, '#d93e4a');
    asistenciaBtn.disabled = false;
  }
});