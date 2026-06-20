/* Book detail page: metadata, reactions and comments. */
(function () {
  'use strict';

  UI.renderHeader();
  UI.renderFooter();

  const statusEl = document.getElementById('book-status');
  const contentEl = document.getElementById('book-content');
  const bookId = UI.queryParam('id');

  let reactionState = { counts: {}, mine: [] };

  if (!bookId) {
    statusEl.innerHTML = '<div class="empty"><div class="big">📕</div><p>No book selected.</p></div>';
    return;
  }

  function fact(label, value) {
    if (!value) return '';
    return '<div class="fact"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>';
  }

  function renderReactions() {
    const user = Api.isLoggedIn();
    return UI.REACTIONS.map(function (r) {
      const active = reactionState.mine.indexOf(r.type) !== -1 ? ' active' : '';
      const count = reactionState.counts[r.type] || 0;
      return '<button class="reaction' + active + '" data-type="' + r.type + '"' +
        (user ? '' : ' data-guest="1"') + ' title="' + r.label + '">' +
        '<span class="emoji">' + r.emoji + '</span><span class="count">' + count + '</span></button>';
    }).join('');
  }

  function renderBook(book, reactions) {
    reactionState = reactions;
    document.title = book.title + ' — Fenrir Library';
    const cover = book.cover_url || UI.PLACEHOLDER_COVER;
    const genreLinks = (book.genres || []).map(function (g) {
      return '<a class="tag" href="/?genre=' + encodeURIComponent(g.toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')) +
        '">' + UI.escapeHtml(g) + '</a>';
    }).join(' ');

    const sourceLink = book.source_url
      ? '<a href="' + UI.escapeHtml(book.source_url) + '" target="_blank" rel="noopener">Read / download →</a>'
      : '';

    contentEl.innerHTML =
      '<div class="book-detail">' +
        '<div class="cover-col">' +
          '<img class="cover" src="' + UI.escapeHtml(cover) + '" alt="Cover of ' + UI.escapeHtml(book.title) +
            '" onerror="this.onerror=null;this.src=\'' + UI.PLACEHOLDER_COVER + '\'">' +
        '</div>' +
        '<div class="info-col">' +
          '<h1>' + UI.escapeHtml(book.title) + '</h1>' +
          '<div class="byline">by <strong>' + UI.escapeHtml(book.author) + '</strong></div>' +
          '<div class="tags">' + genreLinks + '</div>' +
          '<div class="facts">' +
            fact('License', UI.escapeHtml(book.license || '—')) +
            fact('Language', UI.escapeHtml(book.language || '—')) +
            fact('Year', book.year ? UI.escapeHtml(book.year) : '—') +
            fact('Source', sourceLink || UI.escapeHtml(book.source || '—')) +
          '</div>' +
          '<p class="description">' + UI.escapeHtml(book.description || 'No description available.') + '</p>' +
          '<h2 style="font-size:1.1rem;margin-bottom:.4rem">How do you feel about this book?</h2>' +
          '<div class="reactions" id="reactions">' + renderReactions() + '</div>' +
        '</div>' +
      '</div>' +
      '<section class="comments" id="comments">' +
        '<h2>Comments</h2>' +
        '<div id="comment-form-host"></div>' +
        '<ul class="comment-list" id="comment-list"></ul>' +
      '</section>';

    wireReactions();
    renderCommentForm();
    loadComments();
  }

  function wireReactions() {
    const host = document.getElementById('reactions');
    host.addEventListener('click', async function (e) {
      const btn = e.target.closest('.reaction');
      if (!btn) return;
      if (btn.dataset.guest) {
        UI.toast('Log in to leave a reaction.', 'error');
        return;
      }
      try {
        const { reactions } = await Api.toggleReaction(bookId, btn.dataset.type);
        reactionState = reactions;
        host.innerHTML = renderReactions();
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  }

  function renderCommentForm() {
    const host = document.getElementById('comment-form-host');
    if (!Api.isLoggedIn()) {
      host.innerHTML =
        '<div class="notice">Please <a href="/login.html">log in</a> or ' +
        '<a href="/register.html">create an account</a> to comment.</div>';
      return;
    }
    host.innerHTML =
      '<form class="comment-form" id="comment-form">' +
        '<textarea id="comment-body" maxlength="2000" placeholder="Share your thoughts…" required></textarea>' +
        '<div class="row"><button class="btn" type="submit">Post comment</button></div>' +
      '</form>';
    document.getElementById('comment-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const ta = document.getElementById('comment-body');
      const body = ta.value.trim();
      if (!body) return;
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        await Api.addComment(bookId, body);
        ta.value = '';
        UI.toast('Comment posted.', 'ok');
        loadComments();
      } catch (err) {
        UI.toast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function commentMarkup(c) {
    const me = Api.currentUser();
    const canDelete = me && me.id === c.user_id;
    return (
      '<li class="comment" data-id="' + c.id + '">' +
        UI.avatarMarkup({ name: c.user_name, avatar_url: c.user_avatar }, 42) +
        '<div class="c-body">' +
          '<div class="c-head">' +
            '<span class="c-name">' + UI.escapeHtml(c.user_name) + '</span>' +
            '<span class="c-date">' + UI.formatDate(c.created_at) + '</span>' +
          '</div>' +
          '<div class="c-text">' + UI.escapeHtml(c.body) + '</div>' +
          (canDelete ? '<button class="c-delete" data-id="' + c.id + '">Delete</button>' : '') +
        '</div>' +
      '</li>'
    );
  }

  async function loadComments() {
    const list = document.getElementById('comment-list');
    try {
      const { comments } = await Api.getComments(bookId);
      if (!comments.length) {
        list.innerHTML = '<li class="muted">No comments yet — be the first to share your thoughts.</li>';
        return;
      }
      list.innerHTML = comments.map(commentMarkup).join('');
      list.querySelectorAll('.c-delete').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          if (!confirm('Delete this comment?')) return;
          try {
            await Api.deleteComment(bookId, btn.dataset.id);
            loadComments();
          } catch (err) {
            UI.toast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      list.innerHTML = '<li class="muted">Could not load comments.</li>';
    }
  }

  async function boot() {
    try {
      const { book, reactions } = await Api.getBook(bookId);
      statusEl.innerHTML = '';
      renderBook(book, reactions);
    } catch (err) {
      statusEl.innerHTML = '<div class="empty"><div class="big">📕</div><p>' +
        UI.escapeHtml(err.status === 404 ? 'Book not found.' : err.message) + '</p>' +
        '<p><a href="/">Return to the library</a></p></div>';
    }
  }

  boot();
})();
