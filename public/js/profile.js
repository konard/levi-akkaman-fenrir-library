/* Profile page: change display name, upload/replace avatar, log out. */
(function () {
  'use strict';

  UI.renderHeader();
  UI.renderFooter();

  // Guard: must be logged in.
  if (!Api.isLoggedIn()) {
    window.location.href = '/login.html?next=/profile.html';
    return;
  }

  const statusEl = document.getElementById('profile-status');
  const contentEl = document.getElementById('profile-content');

  function paint(user) {
    document.getElementById('profile-avatar').innerHTML = UI.avatarMarkup(user, 84);
    document.getElementById('profile-name').textContent = user.name;
    document.getElementById('profile-email').textContent = user.email;
    document.getElementById('profile-since').textContent =
      'Member since ' + UI.formatDate(user.created_at);
    document.getElementById('name-input').value = user.name;
    document.getElementById('avatar-url').value = user.avatar_url || '';
    // Keep the cached user (and header) in sync.
    Api.updateUser(user);
    UI.renderHeader();
  }

  async function onUpdated(promise, okMessage) {
    try {
      const { user } = await promise;
      paint(user);
      UI.toast(okMessage, 'ok');
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  }

  document.getElementById('name-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const name = document.getElementById('name-input').value.trim();
    if (!name) return;
    onUpdated(Api.updateProfile({ name }), 'Name updated.');
  });

  document.getElementById('avatar-url-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const url = document.getElementById('avatar-url').value.trim();
    onUpdated(Api.updateProfile({ avatar_url: url || null }), 'Avatar updated.');
  });

  document.getElementById('avatar-clear').addEventListener('click', function () {
    onUpdated(Api.updateProfile({ avatar_url: null }), 'Avatar removed.');
  });

  document.getElementById('avatar-upload-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const input = document.getElementById('avatar-file');
    const file = input.files && input.files[0];
    if (!file) {
      UI.toast('Choose an image file first.', 'error');
      return;
    }
    onUpdated(Api.uploadAvatar(file), 'Avatar uploaded.').then(function () {
      input.value = '';
    });
  });

  document.getElementById('logout').addEventListener('click', function () {
    Api.clearSession();
    window.location.href = '/';
  });

  // Load the freshest profile from the server (falls back to cached user).
  Api.me()
    .then(function (data) {
      statusEl.classList.add('hidden');
      contentEl.classList.remove('hidden');
      paint(data.user);
    })
    .catch(function (err) {
      if (err.status === 401) {
        Api.clearSession();
        window.location.href = '/login.html?next=/profile.html';
        return;
      }
      statusEl.innerHTML = '<div class="notice error">' + UI.escapeHtml(err.message) + '</div>';
    });
})();
