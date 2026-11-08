const accountLinks = document.getElementById('account-links');
const svgNamespace = 'http://www.w3.org/2000/svg';

function createIcon(kind) {
  const icon = document.createElementNS(svgNamespace, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');

  if (kind === 'cart') {
    const basket = document.createElementNS(svgNamespace, 'path');
    basket.setAttribute('d', 'M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 1.9-1.4L21 8H6');
    const wheels = document.createElementNS(svgNamespace, 'path');
    wheels.setAttribute('d', 'M9 20h.01M18 20h.01');
    icon.append(basket, wheels);
  } else {
    const head = document.createElementNS(svgNamespace, 'circle');
    head.setAttribute('cx', '12');
    head.setAttribute('cy', '8');
    head.setAttribute('r', '3.5');
    const shoulders = document.createElementNS(svgNamespace, 'path');
    shoulders.setAttribute('d', 'M5 20a7 7 0 0 1 14 0');
    icon.append(head, shoulders);
  }

  return icon;
}

function createIconLink(kind, label, href) {
  const link = document.createElement('a');
  link.className = 'header-icon-link';
  link.href = href;
  link.setAttribute('aria-label', label);
  link.append(createIcon(kind));
  return link;
}

function createMenuLink(label, href) {
  const link = document.createElement('a');
  link.className = 'account-menu-link';
  link.href = href;
  link.textContent = label;
  return link;
}

function createAccountMenu(user) {
  const container = document.createElement('div');
  container.className = 'account-menu-container';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'header-icon-button';
  toggle.setAttribute('aria-label', 'Account menu');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-haspopup', 'true');
  toggle.append(createIcon('account'));

  const menu = document.createElement('div');
  menu.className = 'account-menu';
  menu.hidden = true;
  menu.append(createMenuLink('My orders', '/orders.html'));
  if (user.role === 'staff' || user.role === 'admin') {
    menu.append(createMenuLink('Staff', '/staff.html'));
  }
  if (user.role === 'admin') {
    menu.append(createMenuLink('Admin', '/admin.html'));
  }

  const logoutButton = document.createElement('button');
  logoutButton.type = 'button';
  logoutButton.className = 'account-menu-link account-menu-logout';
  logoutButton.textContent = 'Logout';
  logoutButton.addEventListener('click', logout);
  menu.append(logoutButton);

  toggle.addEventListener('click', () => {
    const isOpen = !menu.hidden;
    menu.hidden = isOpen;
    toggle.setAttribute('aria-expanded', String(!isOpen));
  });

  container.append(toggle, menu);
  return container;
}

// Replace the account area with the current session controls.
async function loadAccountNavigation() {
  if (!accountLinks) {
    return;
  }

  accountLinks.replaceChildren();

  let user = null;
  try {
    const response = await fetch('/api/auth/me');
    if (response.ok) {
      user = await response.json();
    }
  } catch (error) {
    user = null;
  }

  const cartHref = user ? '/cart.html' : '/login.html?next=cart.html';
  accountLinks.append(createIconLink('cart', 'Cart', cartHref));

  if (user) {
    accountLinks.append(createAccountMenu(user));
  } else {
    accountLinks.append(createIconLink('account', 'Login', '/login.html'));
  }
}

// Validate the optional post-authentication destination.
function getValidatedNextPath() {
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next) {
    return '/index.html';
  }

  if (next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')) {
    try {
      const destination = new URL(next, window.location.origin);
      if (destination.origin === window.location.origin) {
        return `${destination.pathname}${destination.search}${destination.hash}`;
      }
    } catch (error) {
      return '/index.html';
    }
  }

  if (/^[A-Za-z0-9._~-]+(?:\?[^#]*)?$/.test(next)) {
    const filename = next.split('?')[0];
    if (filename !== '.' && filename !== '..') {
      return next;
    }
  }

  return '/index.html';
}

// Log out and reload the current page.
async function logout(event) {
  const button = event.currentTarget;
  button.disabled = true;

  try {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (!response.ok) {
      throw new Error('Could not log out. Please try again.');
    }
    if (window.location.pathname === '/staff.html' || window.location.pathname === '/admin.html') {
      window.location.assign('/admin-login.html');
    } else {
      window.location.reload();
    }
  } catch (error) {
    button.disabled = false;
    button.textContent = error.message;
  }
}

window.logout = logout;

document.addEventListener('click', (event) => {
  const menu = document.querySelector('.account-menu-container');
  if (menu && !menu.contains(event.target)) {
    const toggle = menu.querySelector('.header-icon-button');
    const dropdown = menu.querySelector('.account-menu');
    dropdown.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }

  const placeholder = event.target.closest('.footer-placeholder');
  if (placeholder) {
    event.preventDefault();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') {
    return;
  }
  const menu = document.querySelector('.account-menu-container');
  if (menu) {
    menu.querySelector('.account-menu').hidden = true;
    menu.querySelector('.header-icon-button').setAttribute('aria-expanded', 'false');
  }
});

const pagesWithoutStorefrontNavigation = new Set([
  '/admin.html',
  '/admin-login.html',
  '/staff.html',
]);
if (!pagesWithoutStorefrontNavigation.has(window.location.pathname)) {
  loadAccountNavigation();
}
