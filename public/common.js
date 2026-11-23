// Shared by every page. The token lives in sessionStorage; every permission check happens on the
// server. Strings from the server (code, statements, constraint texts) are only ever set with
// textContent, never parsed as HTML.
'use strict';

const Lk = {
  token: () => sessionStorage.getItem('token'),
  user: () => JSON.parse(sessionStorage.getItem('user') || 'null'),

  /** Calls the API. Resolves to { ok, status, body }; a 401 sends the user back to sign in. */
  async api(method, path, body, headers = {}) {
    const h = { ...headers };
    if (Lk.token()) h.authorization = `Bearer ${Lk.token()}`;
    if (body !== undefined) h['content-type'] = 'application/json';
    const res = await fetch(path, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { detail: text };
    }
    if (res.status === 401 && path !== '/auth/login') {
      Lk.signOut();
    }
    return { ok: res.ok, status: res.status, body: data };
  },

  /** el('tr', {className: 'x'}, child, 'text', …): children are nodes or strings (set as text). */
  el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node[k] = v;
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined) continue;
      node.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return node;
  },

  /** Replaces the children of the element with this id. */
  fill(id, ...children) {
    const node = document.getElementById(id);
    node.replaceChildren(...children.flat().filter((c) => c !== null && c !== undefined));
    return node;
  },

  /** Shows a problem (RFC 9457) or any error in the element with this id. */
  showError(id, res) {
    const b = res.body || {};
    const lines = [b.detail || `HTTP ${res.status}`];
    for (const e of b.errors || []) lines.push(`${e.pointer || '(body)'}: ${e.detail}`);
    Lk.fill(id, Lk.el('div', { className: 'error' }, lines.join('\n')));
  },

  signOut() {
    sessionStorage.clear();
    location.href = '/';
  },

  /** Every page except sign-in: needs a user with one of these roles. */
  requireRole(...roles) {
    const u = Lk.user();
    if (!Lk.token() || !u || !roles.includes(u.role)) {
      Lk.signOut();
      return null;
    }
    Lk.fill(
      'who',
      `${u.name} (${u.role}) `,
      Lk.el('button', { type: 'button', on: { click: Lk.signOut } }, 'Sign out'),
    );
    return u;
  },

  when: (iso) => new Date(iso).toLocaleString(),

  /** Source code with line numbers, as text. */
  codeBlock(code, highlight = []) {
    const lines = code.replace(/\r\n?/g, '\n').split('\n');
    return Lk.el(
      'pre',
      { className: 'code' },
      lines.map((line, i) =>
        Lk.el(
          'div',
          { className: highlight.includes(i + 1) ? 'hl' : '' },
          Lk.el('span', { className: 'ln' }, String(i + 1)),
          line,
        ),
      ),
    );
  },
};
