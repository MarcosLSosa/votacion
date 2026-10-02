const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const loginBtn = document.getElementById('loginBtn');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const passwordToggle = document.getElementById('passwordToggle');

passwordToggle.addEventListener('click', () => {
  const mostrar = passwordInput.type === 'password';
  passwordInput.type = mostrar ? 'text' : 'password';
  passwordToggle.textContent = mostrar ? 'Ocultar' : 'Mostrar';
  passwordToggle.setAttribute('aria-label', `${mostrar ? 'Ocultar' : 'Mostrar'} contraseña`);
  passwordToggle.setAttribute('aria-pressed', String(mostrar));
});

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    loginMessage.style.color = '#d93e4a';
    loginMessage.textContent = 'Ingresá usuario y contraseña.';
    (username ? passwordInput : usernameInput).focus();
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Verificando…';
  loginMessage.style.color = '#6f7a92';
  loginMessage.textContent = 'Ingresando...';

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'No se pudo iniciar sesión.');
    }
    localStorage.setItem('votacion:token', data.token);
    localStorage.setItem('votacion:user', JSON.stringify(data.user));
    window.location.href = '/dashboard';
  } catch (error) {
    loginMessage.style.color = '#d93e4a';
    loginMessage.textContent = error instanceof TypeError
      ? 'No se pudo conectar. Revisá tu conexión e intentá de nuevo.'
      : error.message;
    loginBtn.disabled = false;
    loginBtn.textContent = 'Ingresar al sistema';
  }
});