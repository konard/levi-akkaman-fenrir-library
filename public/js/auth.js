/* Login & registration. One script drives both pages. */
(function () {
  'use strict';

  UI.renderHeader(document.getElementById('login-form') ? 'login' : 'register');
  UI.renderFooter();

  // Already signed in? Send them home.
  if (Api.isLoggedIn()) {
    window.location.href = '/';
    return;
  }

  const errorBox = document.getElementById('form-error');
  function showError(message) {
    errorBox.innerHTML = '<div class="notice error">' + UI.escapeHtml(message) + '</div>';
  }

  // Where to go after a successful auth: ?next=… or home.
  function redirectTarget() {
    const next = UI.queryParam('next');
    return next && next.startsWith('/') ? next : '/';
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = loginForm.querySelector('button');
      btn.disabled = true;
      try {
        const { token, user } = await Api.login(
          document.getElementById('email').value.trim(),
          document.getElementById('password').value
        );
        Api.setSession(token, user);
        window.location.href = redirectTarget();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  }

  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = registerForm.querySelector('button');
      btn.disabled = true;
      try {
        const { token, user } = await Api.register(
          document.getElementById('email').value.trim(),
          document.getElementById('password').value,
          document.getElementById('name').value.trim()
        );
        Api.setSession(token, user);
        window.location.href = redirectTarget();
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
      }
    });
  }
})();
