const phoneForm = document.getElementById('phone-form');
const codeForm = document.getElementById('code-form');
const detailsForm = document.getElementById('details-form');
const phoneInput = document.getElementById('register-phone');
const codeInput = document.getElementById('register-code');
const demoCode = document.getElementById('demo-code');
const phoneMessage = document.getElementById('phone-message');
const codeMessage = document.getElementById('code-message');
const detailsMessage = document.getElementById('details-message');
let wrongCodeAttempts = 0;

// Send a verification code for the entered phone number.
async function requestCode(event) {
  event.preventDefault();
  setFormBusy(phoneForm, true);
  phoneMessage.textContent = '';
  demoCode.hidden = true;

  try {
    const result = await sendRequest('/api/auth/request-code', {
      phone: phoneInput.value,
    });

    if (result.error) {
      phoneMessage.textContent = result.error;
      return;
    }

    wrongCodeAttempts = 0;
    codeInput.value = '';
    codeMessage.textContent = '';
    codeForm.hidden = false;
    phoneForm.hidden = true;

    if (result.code !== undefined) {
      demoCode.textContent = `Demo mode: your verification code is ${result.code}`;
      demoCode.hidden = false;
    }
  } catch (error) {
    phoneMessage.textContent = error.message;
  } finally {
    setFormBusy(phoneForm, false);
  }
}

// Verify the phone code and move to account details on success.
async function verifyCode(event) {
  event.preventDefault();
  setFormBusy(codeForm, true);
  codeMessage.textContent = '';

  try {
    const result = await sendRequest('/api/auth/verify-code', {
      phone: phoneInput.value,
      code: codeInput.value,
    });

    if (result.error) {
      if (result.error === 'Verification code is incorrect') {
        wrongCodeAttempts += 1;
        const remaining = Math.max(0, 5 - wrongCodeAttempts);
        codeMessage.textContent = `${result.error}. ${remaining} attempts remaining.`;
      } else {
        codeMessage.textContent = result.error;
      }

      return;
    }

    codeForm.hidden = true;
    detailsForm.hidden = false;
    document.getElementById('register-name').focus();
  } catch (error) {
    codeMessage.textContent = error.message;
  } finally {
    setFormBusy(codeForm, false);
  }
}

// Create the account using the verified session and form details.
async function registerAccount(event) {
  event.preventDefault();
  detailsMessage.textContent = '';

  const formData = new FormData(detailsForm);
  if (formData.get('password') !== formData.get('confirmPassword')) {
    detailsMessage.textContent = 'Passwords do not match';
    return;
  }

  setFormBusy(detailsForm, true);
  try {
    const result = await sendRequest('/api/auth/register', {
      password: formData.get('password'),
      displayName: formData.get('displayName'),
    });

    if (result.error) {
      detailsMessage.textContent = result.error;
      return;
    }

    window.location.assign(getValidatedNextPath());
  } catch (error) {
    detailsMessage.textContent = error.message;
  } finally {
    setFormBusy(detailsForm, false);
  }
}

// Send JSON to an auth endpoint and return its response.
async function sendRequest(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();

  if (!response.ok && !result.error) {
    result.error = result.message || 'The request could not be completed.';
  }

  return result;
}

// Disable the submit buttons while their form is being sent.
function setFormBusy(form, busy) {
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = busy;
}

// Return to the phone step so a new code can be requested.
function changePhone() {
  codeForm.hidden = true;
  detailsForm.hidden = true;
  phoneForm.hidden = false;
  phoneMessage.textContent = '';
  demoCode.hidden = true;
  wrongCodeAttempts = 0;
  phoneInput.focus();
}

phoneForm.addEventListener('submit', requestCode);
codeForm.addEventListener('submit', verifyCode);
detailsForm.addEventListener('submit', registerAccount);
document.getElementById('change-phone').addEventListener('click', changePhone);
