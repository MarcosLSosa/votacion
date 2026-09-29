const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const loginBtn = document.getElementById('loginBtn');

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!username || !password) {
    loginMessage.style.color = '#d93e4a';
    loginMessage.textContent = 'Ingresá usuario y contraseña.';
    return;
  }

  loginBtn.disabled = true;
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
    loginMessage.textContent = error.message;
    loginBtn.disabled = false;
  }
});