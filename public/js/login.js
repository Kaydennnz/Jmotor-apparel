const loginForm = document.getElementById('login-form');
const loginSubmit = document.getElementById('login-submit');
const loginMessage = document.getElementById('login-message');

// Send login credentials and show the server's error if sign-in fails.
async function submitLogin(event) {
  event.preventDefault();
  loginMessage.textContent = '';
  loginSubmit.disabled = true;

  const formData = new FormData(loginForm);
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: formData.get('phone'),
        password: formData.get('password'),
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      loginMessage.textContent = result.error || result.message || 'Login failed.';
      return;
    }

    window.location.assign(getValidatedNextPath());
  } catch (error) {
    loginMessage.textContent = 'Could not reach the server. Please try again.';
  } finally {
    loginSubmit.disabled = false;
  }
}

loginForm.addEventListener('submit', submitLogin);
