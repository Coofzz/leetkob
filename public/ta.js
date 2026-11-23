'use strict';

const { el, fill } = Lk;
let tests = [];

document.getElementById('constraints').value = JSON.stringify(
  [
    { id: 'C1', text: 'Do not call a library sort function: `std::sort`, `std::stable_sort`.', deduction: 3 },
    { id: 'C2', text: 'Sort with a merge sort you wrote yourself.', deduction: 4 },
  ],
  null,
  2,
);

async function loadLabs() {
  const res = await Lk.api('GET', '/labs');
  if (!res.ok) return Lk.showError('labs', res);
  if (res.body.labs.length === 0) return fill('labs', 'No labs yet. Create one below.');
  const classes = [...new Set(res.body.labs.map((l) => l.classId))];
  if (classes.length > 0 && !document.getElementById('class-id').value) {
    document.getElementById('class-id').value = classes[0];
  }
  fill(
    'labs',
    el(
      'table',
      {},
      el('tr', {}, el('th', {}, 'Lab'), el('th', {}, 'Class'), el('th', {}, 'Deadline'), el('th', {}, '')),
      res.body.labs.map((l) =>
        el(
          'tr',
          {},
          el('td', {}, `#${l.id} ${l.title}`),
          el('td', {}, `${l.className} (id ${l.classId})`),
          el('td', {}, Lk.when(l.deadlineAt)),
          el(
            'td',
            {},
            el(
              'button',
              { type: 'button', className: 'link', on: { click: () => openQueue(l) } },
              'Review queue',
            ),
          ),
        ),
      ),
    ),
  );
}

async function openQueue(lab) {
  const res = await Lk.api('GET', `/labs/${lab.id}/review-queue`);
  document.getElementById('queue-section').hidden = false;
  fill('queue-title', `Review queue — ${lab.title}`);
  if (!res.ok) return Lk.showError('queue', res);
  const q = res.body;
  fill(
    'queue-meta',
    `${q.countedSubmissions} counted submissions (${q.pendingSubmissions} not reviewed yet) · ${q.passVerdicts} pass verdicts, ${q.sampledPass} sampled · nothing here is a mark until a TA publishes`,
  );
  if (q.items.length === 0) return fill('queue', el('p', { className: 'muted' }, 'Nothing to review yet.'));
  fill(
    'queue',
    el(
      'table',
      {},
      el(
        'tr',
        {},
        ['Student', 'Submission', 'Constraint', 'Deduction', 'Verdict', 'Source', 'Evidence', 'Why'].map(
          (h) => el('th', {}, h),
        ),
      ),
      q.items.map((i) =>
        el(
          'tr',
          {},
          el('td', {}, i.studentName),
          el(
            'td',
            {},
            el(
              'button',
              { type: 'button', className: 'link', on: { click: () => openSubmission(i.submissionId) } },
              `#${i.submissionId}`,
            ),
          ),
          el('td', {}, `${i.constraint}: ${i.text}`),
          el('td', {}, String(i.deduction)),
          el('td', { className: `v-${i.verdict}` }, i.verdict + (i.inSample ? ' (sample)' : '')),
          el('td', {}, i.source),
          el(
            'td',
            {},
            i.evidence.map((e) => el('div', {}, el('code', {}, `${e.line}: ${e.text.trim()}`))),
          ),
          el('td', {}, [i.unsureReason, i.reason].filter(Boolean).join(' — ')),
        ),
      ),
    ),
  );
}

async function openSubmission(id) {
  const res = await Lk.api('GET', `/submissions/${id}`);
  document.getElementById('submission-section').hidden = false;
  fill('submission-title', `Submission #${id}`);
  if (!res.ok) return Lk.showError('submission', res);
  const s = res.body;
  const evidenceLines = (s.review?.verdicts || []).flatMap((v) => v.evidence.map((e) => e.line));
  fill(
    'submission',
    el(
      'p',
      {},
      `Student ${s.studentId} · ${Lk.when(s.submittedAt)} · status `,
      el('span', { className: `v-${s.status}` }, s.status),
    ),
    s.result?.tests?.length
      ? el(
          'p',
          {},
          'Tests: ',
          s.result.tests.map((t) => el('span', { className: `v-${t.verdict}` }, `${t.verdict} `)),
        )
      : null,
    el('p', { className: 'muted' }, `Review: ${s.review?.state ?? '—'}`),
    Lk.codeBlock(s.code, evidenceLines),
  );
}

document.getElementById('tests').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  const byName = new Map();
  for (const f of files) {
    const m = /^(.*)\.(in|out)$/.exec(f.name);
    if (!m) continue;
    const entry = byName.get(m[1]) || {};
    entry[m[2]] = await f.text();
    byName.set(m[1], entry);
  }
  const names = [...byName.keys()].sort();
  tests = names
    .filter((n) => byName.get(n).in !== undefined && byName.get(n).out !== undefined)
    .map((n) => ({
      input: byName.get(n).in,
      output: byName.get(n).out,
    }));
  const unpaired = names.filter((n) => byName.get(n).in === undefined || byName.get(n).out === undefined);
  fill(
    'tests-info',
    `${tests.length} tests` + (unpaired.length ? ` · without a pair: ${unpaired.join(', ')}` : ''),
  );
});

document.getElementById('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  let constraints;
  try {
    constraints = JSON.parse(document.getElementById('constraints').value || '[]');
  } catch {
    return fill('create-message', el('div', { className: 'error' }, 'Constraints are not valid JSON.'));
  }
  const local = document.getElementById('deadline').value;
  const res = await Lk.api('POST', `/classes/${document.getElementById('class-id').value}/labs`, {
    title: document.getElementById('title').value,
    statement: document.getElementById('statement').value,
    deadlineAt: local ? new Date(local).toISOString() : '',
    limits: {
      cpuMs: Number(document.getElementById('cpu').value),
      memoryMb: Number(document.getElementById('memory').value),
    },
    tests,
    constraints,
  });
  if (!res.ok) return Lk.showError('create-message', res);
  fill(
    'create-message',
    el(
      'p',
      {},
      `Lab #${res.body.id} created with ${res.body.testCount} tests and ${res.body.constraints.length} constraints.`,
    ),
  );
  await loadLabs();
});

if (Lk.requireRole('ta', 'admin')) loadLabs();
