async function fetchOverview() {
  const response = await fetch('/api/overview');
  return response.json();
}

async function fetchCouncillors() {
  const response = await fetch('/api/councillors');
  return response.json();
}

function renderScreen(data, councillors) {
  document.getElementById('screenProjectTag').textContent = data.project;
  document.getElementById('screenTitle').textContent = data.title;
  document.getElementById('screenDescription').textContent = data.description;
  document.getElementById('screenStatus').textContent = data.status;
  document.getElementById('screenStartedAt').textContent = data.startedAtFull;
  document.getElementById('screenAffirmative').textContent = data.counts.afirmativo;
  document.getElementById('screenNegative').textContent = data.counts.negativo;
  document.getElementById('screenAbstention').textContent = data.counts.abstencion;
  document.getElementById('screenPending').textContent = data.counts.pendientes;

  const resultEl = document.getElementById('screenResult');
  resultEl.textContent = data.result.label;
  resultEl.style.background = data.result.color === 'green' ? '#2fa84f' : data.result.color === 'red' ? '#d93e4a' : '#f3a312';

  const list = document.getElementById('councillorList');
  list.innerHTML = '';
  councillors.forEach(councillor => {
    const item = document.createElement('div');
    item.className = 'councillor-item';
    item.innerHTML = `
      <strong>${councillor.name}</strong>
      <span>${councillor.role}</span>
      <span>${councillor.connected ? 'Conectado' : 'Desconectado'}</span>
    `;
    list.appendChild(item);
  });
}

async function refresh() {
  const [overview, councillors] = await Promise.all([fetchOverview(), fetchCouncillors()]);
  renderScreen(overview, councillors);
}

refresh();
setInterval(refresh, 3000);
