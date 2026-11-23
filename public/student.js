'use strict';

const { el, fill } = Lk;
let currentLab = null;
let pendingKey = null; // the Idempotency-Key of a submission not yet confirmed: a retry reuses it
let pollTimer = null;
const IN_PROGRESS = ['queued', 'judging'];

async function loadLabs() {
  const res = await Lk.api('GET', '/labs');
  if (!res.ok) return Lk.showError('labs', res);
  if (res.body.labs.length === 0) return fill('labs', 'No labs yet.');
  fill(
    'labs',
    el(
      'table',
      {},
      el('tr', {}, el('th', {}, 'Lab'), el('th', {}, 'Class'), el('th', {}, 'Deadline')),
      res.body.labs.map((l) =>
        el(
          'tr',
          {},
          el(
            'td',
            {},
            el('button', { type: 'button', className: 'link', on: { click: () => openLab(l.id) } }, l.title),
          ),
          el('td', {}, l.className),
          el('td', {}, Lk.when(l.deadlineAt)),
        ),
      ),
    ),
  );
}

async function openLab(id) {
  const res = await Lk.api('GET', `/labs/${id}`);
  if (!res.ok) return Lk.showError('labs', res);
  currentLab = res.body;
  pendingKey = null;
  document.getElementById('lab-section').hidden = false;
  document.getElementById('submit-section').hidden = false;
  document.getElementById('mine-section').hidden = false;
  document.getElementById('result-section').hidden = true;
  fill('lab-title', currentLab.title);
  fill(
    'lab-meta',
    `Deadline ${Lk.when(currentLab.deadlineAt)} · CPU ${currentLab.limits.cpuMs} ms per test · memory ${currentLab.limits.memoryMb} MB · ${currentLab.testCount} tests`,
  );
  fill('lab-statement', currentLab.statement);
  fill(
    'lab-constraints',
    currentLab.constraints.length === 0
      ? el('p', { className: 'muted' }, 'No constraints.')
      : el(
          'table',
          {},
          el('tr', {}, el('th', {}, 'Id'), el('th', {}, 'Constraint'), el('th', {}, 'Deduction (of 10)')),
          currentLab.constraints.map((c) =>
            el('tr', {}, el('td', {}, c.id), el('td', {}, c.text), el('td', {}, String(c.deduction))),
          ),
        ),
  );
  renderMine(currentLab.mySubmissions);
}

function renderMine(list) {
  fill(
    'mine',
    list.length === 0
      ? el('p', { className: 'muted' }, 'No submissions yet.')
      : el(
          'table',
          {},
          el('tr', {}, el('th', {}, '#'), el('th', {}, 'Submitted'), el('th', {}, 'Status')),
          list.map((s) =>
            el(
              'tr',
              {},
              el(
                'td',
                {},
                el(
                  'button',
                  { type: 'button', className: 'link', on: { click: () => openSubmission(s.id) } },
                  `#${s.id}`,
                ),
              ),
              el('td', {}, Lk.when(s.submittedAt)),
              el('td', { className: `v-${s.status}` }, s.status),
            ),
          ),
        ),
  );
}

async function openSubmission(id) {
  clearTimeout(pollTimer);
  const res = await Lk.api('GET', `/submissions/${id}`);
  document.getElementById('result-section').hidden = false;
  fill('result-title', `Submission #${id}`);
  if (!res.ok) return Lk.showError('result', res);
  const s = res.body;
  const parts = [el('p', {}, 'Status: ', el('span', { className: `v-${s.status}` }, s.status))];
  if (s.result?.compileError) parts.push(el('pre', { className: 'code' }, s.result.compileError));
  if (s.result?.tests?.length) {
    parts.push(
      el(
        'table',
        {},
        el('tr', {}, el('th', {}, 'Test'), el('th', {}, 'Verdict'), el('th', {}, 'Time')),
        s.result.tests.map((t) =>
          el(
            'tr',
            {},
            el('td', {}, String(t.idx + 1)),
            el('td', { className: `v-${t.verdict}` }, t.verdict),
            el('td', {}, `${t.timeMs} ms`),
          ),
        ),
      ),
    );
  }
  parts.push(el('h2', {}, 'Code'), Lk.codeBlock(s.code));
  fill('result', parts);
  if (IN_PROGRESS.includes(s.status)) {
    pollTimer = setTimeout(async () => {
      await openSubmission(id);
      const lab = await Lk.api('GET', `/labs/${currentLab.id}`);
      if (lab.ok) renderMine(lab.body.mySubmissions);
    }, 2000);
  }
}

document.getElementById('code-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) document.getElementById('code').value = await file.text();
});

document.getElementById('submit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentLab) return;
  pendingKey = pendingKey || crypto.randomUUID();
  const res = await Lk.api(
    'POST',
    `/labs/${currentLab.id}/submissions`,
    { language: 'cpp', code: document.getElementById('code').value },
    { 'idempotency-key': pendingKey },
  );
  if (!res.ok) return Lk.showError('submit-message', res);
  pendingKey = null;
  fill('submit-message', el('p', {}, `Submitted as #${res.body.id}. It is queued for judging.`));
  await openLab(currentLab.id);
  await openSubmission(res.body.id);
});

if (Lk.requireRole('student')) loadLabs();
