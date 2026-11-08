const adminLoginForm = document.getElementById('admin-login-form');
const adminLoginSubmit = document.getElementById('admin-login-submit');
const adminLoginMessage = document.getElementById('admin-login-message');

async function submitAdminLogin(event) {
  event.preventDefault();
  adminLoginMessage.textContent = '';
  adminLoginSubmit.disabled = true;

  const formData = new FormData(adminLoginForm);
  try {
    const response = await fetch('/api/auth/staff-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: formData.get('username'),
        password: formData.get('password'),
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      adminLoginMessage.textContent = result.error || result.message || 'Login failed.';
      return;
    }

    if (result.role === 'staff') {
      window.location.assign('/staff.html');
    } else if (result.role === 'admin') {
      window.location.assign('/admin.html');
    } else {
      adminLoginMessage.textContent = 'Could not sign in to a staff account.';
    }
  } catch (error) {
    adminLoginMessage.textContent = 'Could not reach the server. Please try again.';
  } finally {
    adminLoginSubmit.disabled = false;
  }
}

adminLoginForm.addEventListener('submit', submitAdminLogin);
