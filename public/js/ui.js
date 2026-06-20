/* Shared UI helpers: header, avatars, toasts, book cards, formatting. */
(function (global) {
  'use strict';

  const PLACEHOLDER_COVER = '/img/placeholder.svg';

  // Emoji + label for each reaction type (must match the server's list).
  const REACTIONS = [
    { type: 'like', emoji: '👍', label: 'Like' },
    { type: 'love', emoji: '❤️', label: 'Love' },
    { type: 'funny', emoji: '😄', label: 'Funny' },
    { type: 'wow', emoji: '😮', label: 'Wow' },
    { type: 'sad', emoji: '😢', label: 'Sad' },
  ];

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
  }

  // Render an avatar: the uploaded/linked image, or initials on a coloured disc.
  function avatarMarkup(user, sizePx) {
    const size = sizePx || 36;
    const style = 'width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size / 2.4) + 'px;';
    const name = (user && user.name) || '';
    const url = user && (user.avatar_url || user.user_avatar);
    if (url) {
      return (
        '<span class="avatar" style="' + style + '">' +
        '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(name) +
        '" style="width:100%;height:100%;object-fit:cover" ' +
        'onerror="this.parentNode.textContent=\'' + escapeHtml(initials(name)) + '\'"></span>'
      );
    }
    return '<span class="avatar" style="' + style + '">' + escapeHtml(initials(name)) + '</span>';
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // Inject the site header into #app-header, reflecting the auth state.
  function renderHeader(active) {
    const host = document.getElementById('app-header');
    if (!host) return;
    const user = Api.currentUser();
    const isHome = active === 'home';
    const account = user
      ? '<a href="/profile.html" class="nav-user" title="Your profile">' +
        avatarMarkup(user, 34) +
        '<span class="name">' + escapeHtml(user.name) + '</span></a>' +
        '<button class="btn ghost sm" id="logout-btn">Log out</button>'
      : '<a href="/login.html" class="' + (active === 'login' ? 'active' : '') + '">Log in</a>' +
        '<a href="/register.html" class="btn gold sm">Sign up</a>';

    host.className = 'site-header';
    host.innerHTML =
      '<div class="container">' +
        '<a class="brand" href="/"><span class="mark">📚</span> Fenrir<span class="gold">Library</span></a>' +
        '<nav class="nav">' +
          '<a href="/" class="nav-link-browse ' + (isHome ? 'active' : '') + '">Browse</a>' +
          account +
        '</nav>' +
      '</div>';

    const logout = document.getElementById('logout-btn');
    if (logout) {
      logout.addEventListener('click', function () {
        Api.clearSession();
        window.location.href = '/';
      });
    }
  }

  function renderFooter() {
    const host = document.getElementById('app-footer');
    if (!host) return;
    host.className = 'site-footer';
    host.innerHTML =
      '<div class="container">' +
        '<span>📚 Fenrir Library — a public-domain reading room.</span>' +
        '<span>Books courtesy of <a href="https://www.gutenberg.org" target="_blank" rel="noopener">Project Gutenberg</a>.</span>' +
      '</div>';
  }

  // Toast notifications ------------------------------------------------------
  function toast(message, kind) {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(function () { el.remove(); }, 300);
    }, 3200);
  }

  // A single book card for the grid.
  function bookCard(book) {
    const cover = book.cover_url || PLACEHOLDER_COVER;
    const href = '/book.html?id=' + book.id;
    const tags = (book.genres || []).slice(0, 3)
      .map((g) => '<span class="tag">' + escapeHtml(g) + '</span>').join('');
    return (
      '<article class="book-card">' +
        '<a class="cover-link" href="' + href + '">' +
          '<img class="cover" loading="lazy" src="' + escapeHtml(cover) + '" alt="Cover of ' +
            escapeHtml(book.title) + '" onerror="this.onerror=null;this.src=\'' + PLACEHOLDER_COVER + '\'">' +
        '</a>' +
        '<div class="body">' +
          '<h3 class="title"><a href="' + href + '">' + escapeHtml(book.title) + '</a></h3>' +
          '<div class="author">' + escapeHtml(book.author) + '</div>' +
          '<div class="meta">' +
            '<span title="Reactions">❤ ' + (book.reaction_count || 0) + '</span>' +
            '<span title="Comments">💬 ' + (book.comment_count || 0) + '</span>' +
          '</div>' +
          '<div class="tags">' + tags + '</div>' +
        '</div>' +
      '</article>'
    );
  }

  // Read a query-string parameter.
  function queryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  global.UI = {
    REACTIONS,
    PLACEHOLDER_COVER,
    escapeHtml,
    initials,
    avatarMarkup,
    formatDate,
    renderHeader,
    renderFooter,
    toast,
    bookCard,
    queryParam,
  };
})(window);
