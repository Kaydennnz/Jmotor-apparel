const accountLinks = document.getElementById('account-links');

// Add an account link with a safe text label.
function addAccountLink(label, href) {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  accountLinks.append(link);
}

// Replace the account area with the current session controls.
async function loadAccountNavigation() {
  if (!accountLinks) {
    return;
  }

  accountLinks.replaceChildren();

  try {
    const response = await fetch('/api/auth/me');
    if (response.ok) {
      const user = await response.json();
      const greeting = document.createElement('span');
      greeting.className = 'account-greeting';
      greeting.textContent = `Hi, ${user.displayName}`;

      const cartLink = document.createElement('a');
      cartLink.href = '/cart.html';
      cartLink.textContent = 'Cart';

      const ordersLink = document.createElement('a');
      ordersLink.href = '/orders.html';
      ordersLink.textContent = 'My orders';

      const staffLink = document.createElement('a');
      staffLink.href = '/staff.html';
      staffLink.textContent = 'Staff';

      const logoutButton = document.createElement('button');
      logoutButton.type = 'button';
      logoutButton.className = 'nav-button';
      logoutButton.textContent = 'Logout';
      logoutButton.addEventListener('click', logout);

      if (user.role === 'staff' || user.role === 'admin') {
        accountLinks.append(cartLink, ordersLink, staffLink, greeting, logoutButton);
      } else {
        accountLinks.append(cartLink, ordersLink, greeting, logoutButton);
      }
      return;
    }

    addAccountLink('Login', '/login.html');
    addAccountLink('Register', '/register.html');
  } catch (error) {
    addAccountLink('Login', '/login.html');
    addAccountLink('Register', '/register.html');
  }
}

// Log out and reload the current page.
async function logout() {
  const button = accountLinks.querySelector('button');
  if (button) {
    button.disabled = true;
  }

  try {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (!response.ok) {
      throw new Error('Could not log out. Please try again.');
    }
    window.location.reload();
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = error.message;
    }
  }
}

loadAccountNavigation();
