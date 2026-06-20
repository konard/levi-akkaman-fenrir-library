/* Tiny API client + session storage shared by every page. */
(function (global) {
  'use strict';

  const TOKEN_KEY = 'fenrir_token';
  const USER_KEY = 'fenrir_user';

  const Api = {
    token() {
      return localStorage.getItem(TOKEN_KEY);
    },
    currentUser() {
      try {
        return JSON.parse(localStorage.getItem(USER_KEY));
      } catch (e) {
        return null;
      }
    },
    isLoggedIn() {
      return Boolean(this.token());
    },
    setSession(token, user) {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    },
    updateUser(user) {
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    },
    clearSession() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    },

    async request(path, options) {
      const opts = options || {};
      const headers = Object.assign({}, opts.headers);
      const token = this.token();
      if (token) headers.Authorization = 'Bearer ' + token;

      const fetchOpts = { method: opts.method || 'GET', headers };
      if (opts.body !== undefined) {
        if (opts.raw) {
          fetchOpts.body = opts.body; // e.g. FormData — let the browser set headers
        } else {
          headers['Content-Type'] = 'application/json';
          fetchOpts.body = JSON.stringify(opts.body);
        }
      }

      const res = await fetch('/api' + path, fetchOpts);
      let data = null;
      if ((res.headers.get('content-type') || '').includes('application/json')) {
        data = await res.json();
      }
      if (!res.ok) {
        const err = new Error((data && data.error) || 'Request failed (' + res.status + ')');
        err.status = res.status;
        throw err;
      }
      return data;
    },

    // --- Endpoint helpers --------------------------------------------------
    listBooks(params) {
      const qs = new URLSearchParams();
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.set(k, v);
      });
      const q = qs.toString();
      return this.request('/books' + (q ? '?' + q : ''));
    },
    getBook(id) { return this.request('/books/' + id); },
    listGenres() { return this.request('/genres'); },
    getComments(id) { return this.request('/books/' + id + '/comments'); },
    addComment(id, body) {
      return this.request('/books/' + id + '/comments', { method: 'POST', body: { body } });
    },
    deleteComment(id, commentId) {
      return this.request('/books/' + id + '/comments/' + commentId, { method: 'DELETE' });
    },
    toggleReaction(id, type) {
      return this.request('/books/' + id + '/reactions', { method: 'POST', body: { type } });
    },
    register(email, password, name) {
      return this.request('/auth/register', { method: 'POST', body: { email, password, name } });
    },
    login(email, password) {
      return this.request('/auth/login', { method: 'POST', body: { email, password } });
    },
    me() { return this.request('/auth/me'); },
    updateProfile(fields) {
      return this.request('/users/me', { method: 'PUT', body: fields });
    },
    uploadAvatar(file) {
      const fd = new FormData();
      fd.append('avatar', file);
      return this.request('/users/me/avatar', { method: 'POST', body: fd, raw: true });
    },
  };

  global.Api = Api;
})(window);
