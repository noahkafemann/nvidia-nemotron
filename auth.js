// auth.js
const PROXY_URL = 'https://nvidia-nemotron.onrender.com';

function initAuth() {
  const btnLogin = document.getElementById('btnLogin');
  const btnRegister = document.getElementById('btnRegister');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const authError = document.getElementById('authError');

  async function handleAuth(type) {
    const email = authEmail?.value?.trim();
    const password = authPassword?.value?.trim();

    if (!email || !password) {
      if (authError) authError.textContent = 'Bitte fülle alle Felder aus.';
      return;
    }

    const endpoint = type === 'login' ? '/auth/login' : '/auth/register';
    try {
      const response = await fetch(`${PROXY_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Ein Fehler ist aufgetreten');

      localStorage.setItem('userId', data.userId);
      window.location.href = 'chat.html';
    } catch (err) {
      if (authError) authError.textContent = err.message;
    }
  }

  if (btnLogin) btnLogin.addEventListener('click', () => handleAuth('login'));
  if (btnRegister) btnRegister.addEventListener('click', () => handleAuth('register'));
}

document.addEventListener('DOMContentLoaded', initAuth);
