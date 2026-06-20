/* Home page: genre filter, search, sort and paginated book grid. */
(function () {
  'use strict';

  UI.renderHeader('home');
  UI.renderFooter();

  const grid = document.getElementById('book-grid');
  const status = document.getElementById('grid-status');
  const summary = document.getElementById('results-summary');
  const pagination = document.getElementById('pagination');
  const chips = document.getElementById('genre-chips');
  const sortSelect = document.getElementById('sort-select');
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');

  // Initial state seeded from the URL so links/back button work.
  const params = new URLSearchParams(window.location.search);
  const state = {
    search: params.get('search') || '',
    genre: params.get('genre') || '',
    sort: params.get('sort') || 'newest',
    page: parseInt(params.get('page'), 10) || 1,
  };
  searchInput.value = state.search;
  sortSelect.value = state.sort;

  function syncUrl() {
    const qs = new URLSearchParams();
    if (state.search) qs.set('search', state.search);
    if (state.genre) qs.set('genre', state.genre);
    if (state.sort && state.sort !== 'newest') qs.set('sort', state.sort);
    if (state.page > 1) qs.set('page', state.page);
    const str = qs.toString();
    history.replaceState(null, '', str ? '?' + str : window.location.pathname);
  }

  async function loadGenres() {
    try {
      const { genres } = await Api.listGenres();
      const all =
        '<button class="chip ' + (state.genre ? '' : 'active') + '" data-genre="">All books</button>';
      chips.innerHTML = all + genres.map(function (g) {
        const active = state.genre === g.slug ? ' active' : '';
        return '<button class="chip' + active + '" data-genre="' + UI.escapeHtml(g.slug) + '">' +
          UI.escapeHtml(g.name) + '<span class="count">' + g.book_count + '</span></button>';
      }).join('');
    } catch (err) {
      chips.innerHTML = '<span class="muted">Could not load genres.</span>';
    }
  }

  function setActiveChip() {
    chips.querySelectorAll('.chip').forEach(function (c) {
      c.classList.toggle('active', (c.dataset.genre || '') === state.genre);
    });
  }

  async function loadBooks() {
    grid.innerHTML = '';
    status.innerHTML = '<div class="spinner" role="status" aria-label="Loading"></div>';
    pagination.innerHTML = '';
    summary.textContent = '';
    try {
      const data = await Api.listBooks(state);
      status.innerHTML = '';
      if (!data.books.length) {
        grid.innerHTML =
          '<div class="empty" style="grid-column:1/-1"><div class="big">🔍</div>' +
          '<p>No books match your search. Try a different term or genre.</p></div>';
        return;
      }
      grid.innerHTML = data.books.map(UI.bookCard).join('');

      const { total, page, pages } = data.pagination;
      const noun = total === 1 ? 'book' : 'books';
      summary.textContent =
        total + ' ' + noun +
        (state.search ? ' matching “' + state.search + '”' : '') +
        (state.genre ? ' in this genre' : '');

      if (pages > 1) {
        pagination.innerHTML =
          '<button class="btn outline sm" id="prev" ' + (page <= 1 ? 'disabled' : '') + '>← Prev</button>' +
          '<span class="page-info">Page ' + page + ' of ' + pages + '</span>' +
          '<button class="btn outline sm" id="next" ' + (page >= pages ? 'disabled' : '') + '>Next →</button>';
        const prev = document.getElementById('prev');
        const next = document.getElementById('next');
        if (prev) prev.addEventListener('click', function () { state.page -= 1; refresh(); });
        if (next) next.addEventListener('click', function () { state.page += 1; refresh(); });
      }
    } catch (err) {
      status.innerHTML = '<div class="empty"><div class="big">⚠️</div><p>' +
        UI.escapeHtml(err.message) + '</p></div>';
    }
  }

  function refresh() {
    syncUrl();
    setActiveChip();
    loadBooks();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Events -------------------------------------------------------------------
  searchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    state.search = searchInput.value.trim();
    state.page = 1;
    refresh();
  });

  sortSelect.addEventListener('change', function () {
    state.sort = sortSelect.value;
    state.page = 1;
    refresh();
  });

  chips.addEventListener('click', function (e) {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.genre = chip.dataset.genre || '';
    state.page = 1;
    refresh();
  });

  // Boot.
  loadGenres();
  loadBooks();
})();
