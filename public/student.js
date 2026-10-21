/* global h, api, fmtClock, fmtTime, STATUS_TEXT, wordCount */
const app = document.getElementById('app');
let me = null;
let cleanup = [];
const onCleanup = fn => cleanup.push(fn);
function clearView() { cleanup.forEach(fn => { try { fn(); } catch {} }); cleanup = []; app.replaceChildren(); window.scrollTo(0, 0); }

const CHECK = () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = '<circle cx="12" cy="12" r="11" fill="#6f9a5c"/><path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'; return s; };

document.getElementById('signOut').onclick = async () => { await api('POST', '/api/student/logout').catch(() => {}); me = null; location.hash = '#/'; route(); };
document.getElementById('homeBtn').onclick = () => { location.hash = '#/'; };
window.addEventListener('hashchange', route);
route();

async function loadMe() {
  try { me = await api('GET', '/api/student/me'); } catch { me = null; }
  document.getElementById('who').textContent = me ? `${me.student.name} · ${me.student.className}` : '';
  document.getElementById('signOut').classList.toggle('hidden', !me);
  document.getElementById('homeBtn').classList.toggle('hidden', !me);
  return me;
}

async function route() {
  await loadMe();
  clearView();
  if (!me) return signIn();
  const m = location.hash.match(/^#\/prompt\/([123])(?:\/revise\/([\w-]+))?/);
  if (m) return promptView(Number(m[1]), m[2]);
  home();
}

// ---------------- sign in ----------------
async function signIn() {
  const cfg = await api('GET', '/api/config').catch(() => ({ classes: ['Spanish 4CP', 'Spanish 4H', 'Spanish 5'] }));
  let mode = 'first';
  const err = h('div', { class: 'error', role: 'alert' });
  const name = h('input', { type: 'text', id: 'name', autocomplete: 'name', maxlength: 80 });
  const cls = h('select', { id: 'cls' }, h('option', { value: '' }, 'Choose your class'), cfg.classes.map(c => h('option', { value: c }, c)));
  const code = h('input', { type: 'text', id: 'code', autocomplete: 'off', maxlength: 12, style: 'text-transform:uppercase' });
  const ret = h('input', { type: 'text', id: 'ret', autocomplete: 'off', maxlength: 20, style: 'text-transform:uppercase', placeholder: 'e.g. MANGO-4821' });
  const retWrap = h('div', { class: 'hidden' }, h('label', { for: 'ret' }, 'Your return code'), ret, h('p', { class: 'hint' }, 'You got this code the first time you signed in. Forgot it? Ask your teacher.'));
  const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Start writing');
  const tabFirst = h('button', { type: 'button', 'aria-selected': 'true', onclick: () => setMode('first') }, 'First time');
  const tabBack = h('button', { type: 'button', 'aria-selected': 'false', onclick: () => setMode('return') }, "I've been here before");
  function setMode(m) { mode = m; tabFirst.setAttribute('aria-selected', m === 'first'); tabBack.setAttribute('aria-selected', m === 'return'); retWrap.classList.toggle('hidden', m === 'first'); submit.textContent = m === 'first' ? 'Start writing' : 'Find my work'; err.textContent = ''; }

  const form = h('form', { class: 'card', onsubmit: async e => {
    e.preventDefault(); err.textContent = ''; submit.disabled = true;
    try {
      const body = { name: name.value, className: cls.value, classCode: code.value };
      if (mode === 'first') {
        const r = await api('POST', '/api/student/start', body);
        showReturnCode(r.returnCode, r.sameNameNotice);
      } else {
        await api('POST', '/api/student/return', { ...body, returnCode: ret.value });
        location.hash = '#/'; route();
      }
    } catch (x) { err.textContent = x.message; } finally { submit.disabled = false; }
  } },
    h('div', { class: 'tabs', role: 'tablist' }, tabFirst, tabBack),
    h('label', { for: 'name' }, 'First and last name'), name,
    h('label', { for: 'cls' }, 'Class'), cls,
    h('label', { for: 'code' }, 'Class code from your teacher'), code,
    retWrap, err, h('div', { class: 'row end' }, submit));
  app.append(h('div', { class: 'narrow' },
    h('h1', {}, '¡Hola! Let’s write.'),
    h('p', { class: 'muted' }, 'Three short writing prompts. You’ll get feedback, then a chance to revise.'), form));
  name.focus();
}

function showReturnCode(code, sameName) {
  clearView();
  app.append(h('div', { class: 'narrow card' },
    h('h1', {}, 'Your return code'),
    h('p', {}, 'Write this down. You’ll need it with your name to come back to your work on another day or another computer.'),
    h('div', { class: 'code-big' }, code),
    sameName ? h('p', { class: 'notice' }, 'Another student in your class has the same name. Your return code keeps your work separate.') : null,
    h('div', { class: 'row end' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { location.hash = '#/'; route(); } }, 'I wrote it down — continue'))));
}

// ---------------- home ----------------
function home() {
  const a = me.assignment;
  app.append(
    h('h1', {}, a.title),
    h('div', { class: 'card' },
      h('span', { class: 'lang-note' }, 'Prompts in English · Write in Spanish'),
      me.directions.map(d => h('p', {}, d))),
    !a.isOpen ? h('p', { class: 'notice warn' }, 'This activity is closed right now. You can still read your work and feedback.') : null,
    h('div', { class: 'prompt-list' }, me.prompts.map(p =>
      h('button', { class: 'card prompt-card', type: 'button', onclick: () => { location.hash = `#/prompt/${p.no}`; } },
        h('span', { class: 'num' }, `Prompt ${p.no}`),
        h('h2', {}, p.title),
        h('span', { class: `status ${p.status}` }, STATUS_TEXT[p.status])))),
    overallCard());
}

function overallCard() {
  const done = me.prompts.filter(p => !['not_started', 'draft_saved'].includes(p.status)).length;
  if (done < 3) return h('p', { class: 'muted small', style: 'margin-top:1rem' }, `${done} of 3 first versions submitted. After all three, you’ll see an overall practice estimate.`);
  const o = me.overall;
  if (!o || o.status !== 'ready') {
    const card = h('div', { class: 'card', style: 'margin-top:1rem' }, h('h2', {}, 'Overall practice estimate'),
      o?.status === 'failed'
        ? [h('p', {}, 'Your overall estimate is pending.'), h('button', { class: 'btn small', type: 'button', onclick: async () => { await api('POST', '/api/student/overall/retry').catch(() => {}); route(); } }, 'Try again')]
        : h('p', {}, h('span', { class: 'spinner' }), ' Putting together your overall estimate…'));
    if (!o || o.status === 'pending') { const t = setTimeout(route, 5000); onCleanup(() => clearTimeout(t)); }
    return card;
  }
  const r = o.result;
  return h('div', { class: 'card estimate', style: 'margin-top:1rem' },
    h('div', { class: 'label-official' }, me.label),
    h('h2', {}, 'Overall, across your three first versions'),
    h('div', { class: 'cat' }, r.estimate.label), evidenceMeter(r.estimate.evidence),
    h('p', {}, h('b', {}, 'What stays consistent: '), r.overall.consistency),
    h('p', {}, h('b', {}, 'What varied: '), r.overall.variation),
    h('p', {}, h('b', {}, 'Next step: '), r.overall.next_step),
    h('p', { class: 'muted small' }, 'Based on your first versions only. Revisions are practice with support, so they are not included.'));
}

function evidenceMeter(level) {
  const n = { insufficient: 0, limited: 1, moderate: 2, strong: 3 }[level] ?? 0;
  const txt = { insufficient: 'not enough evidence yet', limited: 'limited evidence', moderate: 'moderate evidence', strong: 'strong evidence' }[level];
  return h('p', { class: 'small muted' }, 'How much your writing shows:', h('span', { class: 'evidence', 'aria-hidden': 'true' }, [1, 2, 3].map(i => h('i', { class: i <= n ? 'on' : '' }))), txt);
}

// ---------------- prompt ----------------
async function promptView(no, reviseId) {
  let data;
  try { data = await api('GET', `/api/student/prompt/${no}`); } catch (e) { app.append(h('p', { class: 'notice err' }, e.message)); return; }
  const p = data.prompt;
  if (data.initialText == null) return writeView(p, data);
  const openRev = data.revisions.find(r => r.submittedText == null);
  if (reviseId && openRev && openRev.id === reviseId) return reviseView(p, data, openRev);
  feedbackView(p, data);
}

function promptPanel(p) {
  return h('aside', { class: 'card prompt-panel' },
    h('span', { class: 'lang-note' }, 'Write in Spanish'),
    h('div', { class: 'phase' }, `Prompt ${p.no}`),
    h('h2', {}, p.title), h('p', {}, p.intro),
    h('ul', {}, p.bullets.map(b => h('li', {}, b))),
    h('details', {}, h('summary', {}, 'Directions'), me.directions.map(d => h('p', {}, d))));
}

// Text area with autosave, accent buttons, timer, word count
function makeEditor({ text, serverTs, saveUrl, localKey, timerKey, label }) {
  const ta = h('textarea', { class: 'writing', 'aria-label': label, spellcheck: 'false', lang: 'es' });
  ta.value = text || '';
  const state = h('span', { class: 'save-state', role: 'status' }, h('span', { class: 'dot' }), h('span', { class: 'txt' }, 'Saved'));
  const wc = h('span', { class: 'small' });
  let lastEdit = serverTs || 0, dirty = false, saving = false, retryT = null, debounceT = null;

  try { // restore a newer copy kept on this device (e.g., saved offline before a refresh)
    const local = JSON.parse(localStorage.getItem(localKey) || 'null');
    if (local && local.ts > lastEdit && local.text !== ta.value) { ta.value = local.text; lastEdit = local.ts; dirty = true; }
  } catch {}

  const setState = (cls, msg) => { state.className = 'save-state ' + cls; state.querySelector('.txt').textContent = msg; };
  const updateWc = () => { wc.textContent = `${wordCount(ta.value)} words`; };
  updateWc();
  setState('', serverTs ? 'All changes saved' : 'Your writing saves automatically');

  async function save() {
    if (!dirty || saving) return;
    saving = true; dirty = false; setState('saving', 'Saving…');
    const body = { text: ta.value, clientTs: lastEdit };
    try {
      const r = await api('PUT', saveUrl, body);
      setState('', `Saved ${fmtClock(r.savedAt)}`);
      if (!dirty) try { localStorage.removeItem(localKey); } catch {}
    } catch (e) {
      dirty = true;
      if (e.status === 409) { setState('unsaved', 'Already submitted'); dirty = false; }
      else if (e.status === 401) setState('unsaved', 'Signed out — your text is kept on this device. Sign in again to save.');
      else { setState('unsaved', 'Not saved yet — kept on this device. Retrying…'); clearTimeout(retryT); retryT = setTimeout(save, 5000); }
    } finally { saving = false; if (dirty && !retryT) schedule(); }
  }
  function schedule() { clearTimeout(debounceT); debounceT = setTimeout(() => { retryT = null; save(); }, 1200); }
  ta.addEventListener('input', () => {
    lastEdit = Date.now(); dirty = true; updateWc(); timer?.autostart();
    try { localStorage.setItem(localKey, JSON.stringify({ text: ta.value, ts: lastEdit })); } catch {}
    setState('saving', 'Saving…'); schedule();
  });
  const onOnline = () => { if (dirty) save(); };
  window.addEventListener('online', onOnline);
  const onUnload = e => { if (dirty) { fetch(saveUrl, { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ text: ta.value, clientTs: lastEdit }) }); e.preventDefault(); } };
  window.addEventListener('beforeunload', onUnload);
  onCleanup(() => { window.removeEventListener('online', onOnline); window.removeEventListener('beforeunload', onUnload); clearTimeout(debounceT); clearTimeout(retryT); if (dirty) save(); });
  if (dirty) schedule();

  // accent buttons
  let upper = false;
  const accents = ['á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ', '¿', '¡'];
  const btns = accents.map(ch => h('button', { class: 'accent', type: 'button', 'data-ch': ch, 'aria-label': `Insert ${ch}`,
    onmousedown: e => e.preventDefault(),
    onclick: () => {
      const c = upper && ch.toUpperCase() !== ch ? ch.toUpperCase() : ch;
      const s = ta.selectionStart, en = ta.selectionEnd;
      ta.setRangeText(c, s, en, 'end'); ta.focus(); ta.dispatchEvent(new Event('input'));
      if (upper) { upper = false; shift.setAttribute('aria-pressed', 'false'); relabel(); }
    } }, ch));
  const relabel = () => btns.forEach(b => { const ch = b.dataset.ch; b.textContent = upper ? ch.toUpperCase() : ch; });
  const shift = h('button', { class: 'accent shift', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Capital letter', title: 'Capital letter', onmousedown: e => e.preventDefault(),
    onclick: () => { upper = !upper; shift.setAttribute('aria-pressed', String(upper)); relabel(); ta.focus(); } }, '⇧');

  const timer = timerKey && me.assignment.timerMinutes ? makeTimer(timerKey, me.assignment.timerMinutes) : null;
  const tools = h('div', { class: 'editor-tools' }, btns, shift, h('span', { class: 'spacer' }), timer?.el);
  const foot = h('div', { class: 'editor-foot' }, state, wc);
  return { el: h('div', {}, tools, ta, foot), ta, getText: () => ta.value, async flush() { clearTimeout(debounceT); clearTimeout(retryT); retryT = null; if (dirty) await save(); return !dirty; }, clearLocal() { dirty = false; try { localStorage.removeItem(localKey); } catch {} } };
}

function makeTimer(key, minutes) {
  let st; try { st = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
  if (!st || st.total !== minutes * 60) st = { total: minutes * 60, remaining: minutes * 60, running: false, started: false };
  const out = h('span', {}), btn = h('button', { type: 'button' }), hide = h('button', { type: 'button', title: 'Hide timer' }, 'Hide');
  const el = h('span', { class: 'timer', role: 'timer', 'aria-label': 'Suggested writing time' }, '⏱ ', out, btn, hide);
  const persist = () => { try { localStorage.setItem(key, JSON.stringify(st)); } catch {} };
  const draw = () => {
    const m = Math.floor(st.remaining / 60), s = st.remaining % 60;
    if (st.remaining <= 0) { out.textContent = 'Suggested time is up — keep going if you need to.'; el.classList.add('done'); btn.classList.add('hidden'); }
    else { out.textContent = `${m}:${String(s).padStart(2, '0')} suggested`; btn.textContent = st.running ? 'Pause' : (st.started ? 'Resume' : 'Start'); }
  };
  const tick = setInterval(() => { if (st.running && st.remaining > 0) { st.remaining--; if (st.remaining <= 0) st.running = false; persist(); draw(); } }, 1000);
  onCleanup(() => clearInterval(tick));
  btn.onclick = () => { st.running = !st.running; st.started = true; persist(); draw(); };
  hide.onclick = () => { el.classList.add('hidden'); };
  draw();
  return { el, autostart() { if (!st.started) { st.started = true; st.running = true; persist(); draw(); } } };
}

function writeView(p, data) {
  const editor = makeEditor({ text: data.draftText, serverTs: data.draftClientTs, saveUrl: `/api/student/prompt/${p.no}/draft`,
    localKey: `aw:draft:${me.student.id}:${p.no}`, timerKey: `aw:timer:${me.student.id}:${p.no}`, label: `Your response to prompt ${p.no}, in Spanish` });
  const err = h('div', { class: 'error', role: 'alert' });
  const closed = !me.assignment.isOpen;
  const nextNo = me.prompts.find(x => x.no !== p.no && ['not_started', 'draft_saved'].includes(x.status))?.no;
  const saveBtn = h('button', { class: 'btn', type: 'button', onclick: async () => {
    err.textContent = '';
    if (!(await editor.flush())) { err.textContent = 'We could not reach the server. Your writing is kept on this device; try again in a moment.'; return; }
    location.hash = nextNo ? `#/prompt/${nextNo}` : '#/';
  } }, nextNo ? 'Save and continue' : 'Save and go back');
  const submitBtn = h('button', { class: 'btn primary', type: 'button', disabled: closed, onclick: async () => {
    err.textContent = '';
    const text = editor.getText();
    if (!text.trim()) { err.textContent = 'Write something in Spanish before submitting.'; return; }
    const ok = await confirmDialog(`Submit Prompt ${p.no} for feedback?`, 'Your first version will be kept exactly as it is. After feedback, you’ll be able to revise it.');
    if (!ok) return;
    submitBtn.disabled = true; submitBtn.textContent = 'Sending…';
    try {
      await editor.flush().catch(() => {});
      await api('POST', `/api/student/prompt/${p.no}/submit`, { text });
      editor.clearLocal();
      route();
    } catch (e) { err.textContent = e.offline ? 'Not sent — no connection. Your writing is kept on this device. Try Submit again when you are back online.' : e.message; submitBtn.disabled = false; submitBtn.textContent = 'Submit for feedback'; }
  } }, 'Submit for feedback');
  app.append(h('div', { class: 'workspace' }, promptPanel(p),
    h('section', { class: 'card' },
      closed ? h('p', { class: 'notice warn' }, 'This activity is closed, so writing can’t be saved or submitted right now.') : null,
      editor.el, err, h('div', { class: 'row end', style: 'margin-top:.8rem' }, saveBtn, submitBtn))));
  editor.ta.focus();
}

function confirmDialog(title, body, yes = 'Submit') {
  const d = document.getElementById('confirm');
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmBody').textContent = body;
  document.getElementById('confirmYes').textContent = yes;
  return new Promise(res => {
    const done = v => { d.close(); res(v); };
    document.getElementById('confirmYes').onclick = () => done(true);
    document.getElementById('confirmNo').onclick = () => done(false);
    d.oncancel = () => res(false);
    d.showModal();
  });
}

function receipt(at, what) {
  return h('div', { class: 'receipt', role: 'status' }, CHECK(), h('div', {}, h('b', {}, `Your teacher received your ${what}.`), h('div', { class: 'small' }, `Submitted ${fmtTime(at)}`)));
}

function pendingBlock(evaluation, retryUrl) {
  const failed = evaluation?.status === 'failed';
  const box = h('div', { class: 'card' }, h('h2', {}, 'Feedback pending'),
    failed
      ? [h('p', {}, 'Your writing is saved and your teacher has it. Feedback could not be created yet.'),
        h('button', { class: 'btn', type: 'button', onclick: async e => { e.target.disabled = true; await api('POST', retryUrl).catch(x => alert(x.message)); route(); } }, 'Try again')]
      : h('p', {}, h('span', { class: 'spinner' }), ' Reading your writing… this usually takes under a minute. Your work is already saved.'));
  if (!failed) { const t = setTimeout(route, 4000); onCleanup(() => clearTimeout(t)); }
  return box;
}

function estimateCard(result, heading, note) {
  return h('div', { class: 'card estimate' },
    h('div', { class: 'label-official' }, me.label),
    h('div', { class: 'phase' }, heading),
    h('div', { class: 'cat' }, result.estimate.label),
    evidenceMeter(result.estimate.evidence),
    h('p', {}, result.rating.plain_explanation),
    note ? h('p', { class: 'muted small' }, note) : null);
}

function feedbackView(p, data) {
  const e = data.evaluation;
  const parts = [h('div', { class: 'phase' }, `Prompt ${p.no}`), h('h1', {}, p.title), receipt(data.submittedAt, 'first version')];
  parts.push(h('details', { class: 'card' }, h('summary', {}, h('b', {}, 'Your first version (kept exactly as submitted)')), h('div', { class: 'initial-text', lang: 'es', style: 'margin-top:.6rem' }, data.initialText)));
  if (!e || e.status !== 'ready') { parts.push(pendingBlock(e, `/api/student/prompt/${p.no}/retry`)); app.append(...parts); return; }
  const r = e.result, c = r.coaching;
  parts.push(h('h2', { style: 'margin-top:1.4rem' }, 'Initial performance'));
  parts.push(estimateCard(r, 'Your first version', `Course goal for ${me.student.className}: ${r.courseTarget}. ${c.target_note}`));
  parts.push(h('div', { class: 'fb-grid' },
    h('div', { class: 'card' }, h('h3', {}, 'What’s working'), c.strengths.length ? c.strengths.map(s => h('div', { class: 'fb-item' }, s.point, h('blockquote', { lang: 'es' }, `“${s.quote}”`))) : h('p', { class: 'muted' }, 'Write a little more so we can point to strengths.')),
    h('div', { class: 'card' }, h('h3', {}, 'What to work on'), c.priorities.map(x => h('div', { class: 'fb-item' }, h('b', {}, x.focus_label + ': '), x.point,
      x.quote ? h('blockquote', { lang: 'es' }, `“${x.quote}”`) : h('div', { class: 'small muted' }, x.evidence_note))))));
  if (c.examples.length) parts.push(h('div', { class: 'card' }, h('h3', {}, 'Ideas using your own words'), c.examples.map(x =>
    h('div', {}, h('div', { class: 'example' }, h('span', { lang: 'es' }, `“${x.original}”`), h('span', { class: 'arrow', 'aria-label': 'could become' }, '→'), h('span', { lang: 'es' }, h('b', {}, `“${x.improved}”`))), h('p', { class: 'small muted' }, x.why)))));
  parts.push(h('p', { class: 'muted' }, c.encouragement));

  // revisions so far
  const submittedRevs = data.revisions.filter(v => v.submittedText != null);
  submittedRevs.forEach(v => parts.push(revisionResult(p, v)));

  // choose a focus / continue
  const openRev = data.revisions.find(v => v.submittedText == null);
  if (openRev) parts.push(h('div', { class: 'row', style: 'margin-top:1rem' }, h('a', { class: 'btn primary', href: `#/prompt/${p.no}/revise/${openRev.id}` }, `Continue revision ${openRev.number}`)));
  else if (data.revisions.length < 3 && me.assignment.isOpen) parts.push(focusChooser(p, c, submittedRevs.length));
  parts.push(h('div', { class: 'row', style: 'margin-top:1.2rem' }, h('a', { class: 'btn', href: '#/' }, 'Back to my prompts')));
  app.append(...parts);
}

function focusChooser(p, c, count) {
  const opts = [...c.priorities.map(x => ({ label: x.focus_label, desc: x.point })), { label: c.revision_task.focus_label, desc: c.revision_task.instructions }]
    .filter((o, i, arr) => arr.findIndex(z => z.label.toLowerCase() === o.label.toLowerCase()) === i);
  const err = h('div', { class: 'error', role: 'alert' });
  const form = h('form', { class: 'card', style: 'margin-top:1rem', onsubmit: async e => {
    e.preventDefault();
    const chosen = form.querySelector('input[name=focus]:checked');
    if (!chosen) { err.textContent = 'Choose one focus.'; return; }
    try { const r = await api('POST', `/api/student/prompt/${p.no}/revisions`, { focus: chosen.value }); location.hash = `#/prompt/${p.no}/revise/${r.revisionId}`; }
    catch (x) { err.textContent = x.message; }
  } },
    h('h2', {}, count ? 'Revise again?' : 'Revise: choose one focus'),
    h('p', {}, h('b', {}, 'Suggested task: '), c.revision_task.instructions),
    opts.map((o, i) => h('label', { class: 'focus-choice' }, h('input', { type: 'radio', name: 'focus', value: o.label }), h('span', {}, h('b', {}, o.label), h('br'), h('span', { class: 'small muted' }, o.desc)))),
    err, h('div', { class: 'row end' }, h('button', { class: 'btn primary', type: 'submit' }, 'Start my revision')));
  return form;
}

function revisionResult(p, v) {
  const box = h('div', { style: 'margin-top:1.4rem' }, h('h2', {}, `Performance after feedback — revision ${v.number}`),
    receipt(v.submittedAt, `revision ${v.number}`),
    h('p', { class: 'small' }, h('b', {}, 'Focus: '), v.focus),
    h('details', { class: 'card' }, h('summary', {}, h('b', {}, 'Your revision')), h('div', { class: 'initial-text', lang: 'es', style: 'margin-top:.6rem' }, v.submittedText)),
    h('p', { class: 'card small' }, h('b', {}, 'Your reflection: '), `One change I made was ${v.reflectionChange}. It helped my reader because ${v.reflectionReader}.`));
  const e = v.evaluation;
  if (!e || e.status !== 'ready') { box.append(pendingBlock(e, `/api/student/revisions/${v.id}/retry`)); return box; }
  const cmp = e.result.comparison;
  box.append(h('div', { class: 'card' }, h('h3', {}, { yes: 'You worked on your focus.', partly: 'You started on your focus.', not_yet: 'Your focus still needs work.' }[cmp.focus_addressed]),
    h('p', {}, cmp.summary),
    cmp.improved.map(x => h('div', { class: 'fb-item' }, h('b', {}, 'Improved: '), x.point, h('blockquote', { lang: 'es' }, `“${x.quote}”`))),
    cmp.still_needs.map(x => h('div', { class: 'fb-item' }, h('b', {}, 'Still needs work: '), x))));
  box.append(estimateCard(e.result, 'Revised version — after feedback', 'This revision was written with feedback, so it is practice with support, not independent evidence. Your initial estimate above stays as it was.'));
  return box;
}

function reviseView(p, data, rev) {
  const editor = makeEditor({ text: rev.draftText, serverTs: rev.draftClientTs, saveUrl: `/api/student/revisions/${rev.id}/draft`,
    localKey: `aw:rev:${rev.id}`, timerKey: null, label: `Your revision of prompt ${p.no}, in Spanish` });
  const change = h('input', { type: 'text', id: 'rc', maxlength: 600 }), reader = h('input', { type: 'text', id: 'rr', maxlength: 600 });
  const err = h('div', { class: 'error', role: 'alert' });
  const coaching = data.evaluation.result.coaching;
  const submitBtn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    err.textContent = '';
    if (!change.value.trim() || !reader.value.trim()) { err.textContent = 'Please finish both parts of the reflection.'; return; }
    if (!(await confirmDialog('Submit your revision?', 'Your first version stays exactly as it was. You’ll see what improved.'))) return;
    submitBtn.disabled = true;
    try {
      await api('POST', `/api/student/revisions/${rev.id}/submit`, { text: editor.getText(), reflectionChange: change.value, reflectionReader: reader.value });
      editor.clearLocal(); location.hash = `#/prompt/${p.no}`;
    } catch (e) { err.textContent = e.offline ? 'Not sent — no connection. Your revision is kept on this device.' : e.message; submitBtn.disabled = false; }
  } }, 'Submit revision');
  const prev = data.revisions.filter(v => v.submittedText != null).at(-1);
  app.append(h('div', { class: 'workspace' },
    h('aside', { class: 'prompt-panel' },
      h('div', { class: 'card' }, h('div', { class: 'phase' }, `Revision ${rev.number} · your focus`), h('h2', {}, rev.focus),
        h('p', { class: 'small' }, coaching.revision_task.instructions)),
      h('div', { class: 'card' }, h('div', { class: 'phase' }, prev ? `Revision ${prev.number}` : 'First version (kept exactly as submitted)'),
        h('div', { class: 'initial-text', lang: 'es' }, prev ? prev.submittedText : data.initialText)),
      h('details', { class: 'card' }, h('summary', {}, `Prompt ${p.no}: ${p.title}`), h('p', {}, p.intro), h('ul', {}, p.bullets.map(b => h('li', {}, b))))),
    h('section', { class: 'card' }, h('h2', {}, 'Your revision'),
      h('p', { class: 'small muted' }, 'Change only what helps your focus. You don’t need to rewrite everything.'),
      editor.el,
      h('h3', { style: 'margin-top:1.2rem' }, 'Reflection'),
      h('div', { class: 'reflection-line' }, h('label', { for: 'rc', style: 'margin:0' }, 'One change I made was'), change),
      h('div', { class: 'reflection-line' }, h('label', { for: 'rr', style: 'margin:0' }, 'It helped my reader because'), reader),
      err, h('div', { class: 'row end', style: 'margin-top:.8rem' }, h('a', { class: 'btn', href: `#/prompt/${p.no}` }, 'Back to feedback'), submitBtn))));
}
