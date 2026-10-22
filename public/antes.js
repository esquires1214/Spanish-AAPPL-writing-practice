/* global h, api */
// "Antes de empezar: Puerto Rico y nuestras historias" — student page.
// First attempts are sent to the server and saved before any feedback is shown.
const app = document.getElementById('app');
const stepsNav = document.getElementById('steps');
let me = null, info = null;
const NS = 'ns';

window.addEventListener('hashchange', () => render());
document.getElementById('summaryBtn').onclick = () => downloadSummary();
boot();

async function boot() {
  info = await api('GET', '/api/diag/info').catch(() => null);
  await loadMe();
  render();
}
async function loadMe() {
  try { me = await api('GET', '/api/diag/me'); } catch { me = null; }
  document.getElementById('who').textContent = me ? `${me.attempt.name} · ${me.attempt.course} · Block ${me.attempt.block}` : '';
  document.getElementById('summaryBtn').classList.toggle('hidden', !me);
  stepsNav.classList.toggle('hidden', !me);
}

// ---------- small helpers ----------
const C = () => me.content;
const saved = key => me.sections[key];
const isH = () => me.attempt.course === 'Spanish 4H';
const sectionList = () => C().sections;
// A part is finished when its first try is saved, plus the follow-up writing for Parts 3 and 5.
const finished = key => !!saved(key) && (!['context', 'sequence'].includes(key) || !!saved(key).followup);
const firstUnsaved = () => sectionList().findIndex(s => !finished(s.key));
const unlocked = i => sectionList().slice(0, i).every(s => finished(s.key)) || !!saved(sectionList()[i].key);
function store(k, v) { try { localStorage.setItem(`antes:${me.attempt.id}:${k}`, JSON.stringify(v)); } catch {} }
function recall(k) { try { return JSON.parse(localStorage.getItem(`antes:${me.attempt.id}:${k}`)); } catch { return null; } }
function forget(k) { try { localStorage.removeItem(`antes:${me.attempt.id}:${k}`); } catch {} }
// Bold expressions are written **like this** in the content.
function rich(text, tag = 'strong') { return String(text).split('**').map((part, i) => (i % 2 ? h(tag, {}, part) : part)); }
function seededShuffle(arr, seed) {
  let x = 0; for (const c of seed) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { x = (x * 1103515245 + 12345) >>> 0; const j = x % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const CHECK = () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = '<circle cx="12" cy="12" r="11" fill="#2a9d8f"/><path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'; return s; };
const savedTag = at => h('span', { class: 'saved-tag' }, '✓ Saved', at ? ` ${new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : '');
const errBox = () => h('div', { class: 'error', role: 'alert' });
function logSupport(key) { api('POST', '/api/diag/supports', { key }).then(() => { me.supports[key] = me.supports[key] || { count: 1 }; }).catch(() => {}); }

function accentBar(ta) {
  let upper = false;
  const chars = ['á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ', '¿', '¡'];
  const btns = chars.map(c => h('button', { type: 'button', class: 'accent', 'data-c': c, onmousedown: e => e.preventDefault(), onclick: () => insert(c) }, c));
  const shift = h('button', { type: 'button', class: 'accent shift', 'aria-pressed': 'false', title: 'Capital letters', onclick: () => {
    upper = !upper; shift.setAttribute('aria-pressed', String(upper)); btns.forEach(b => { b.textContent = upper ? b.dataset.c.toUpperCase() : b.dataset.c; });
  } }, '⇧');
  function insert(c) {
    const ch = upper ? c.toUpperCase() : c, s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + ch + ta.value.slice(e); ta.selectionStart = ta.selectionEnd = s + ch.length; ta.focus(); ta.dispatchEvent(new Event('input'));
  }
  return h('div', { class: 'editor-tools', 'aria-label': 'Accent marks' }, btns, shift);
}

function confirmDialog(title, body, yes = 'Submit') {
  const d = document.getElementById('confirm');
  document.getElementById('confirmTitle').textContent = title; document.getElementById('confirmBody').textContent = body;
  document.getElementById('confirmYes').textContent = yes;
  return new Promise(res => {
    d.showModal();
    document.getElementById('confirmYes').onclick = () => { d.close(); res(true); };
    document.getElementById('confirmNo').onclick = () => { d.close(); res(false); };
    d.oncancel = () => res(false);
  });
}

// ---------- routing ----------
function render() {
  if (!me) return welcome();
  renderSteps();
  const m = location.hash.match(/^#\/p\/(\d)$/);
  let i = m ? Number(m[1]) - 1 : -1;
  if (location.hash === '#/done' && me.attempt.completedAt) return doneView();
  if (i < 0 || i >= sectionList().length || !unlocked(i)) {
    const f = firstUnsaved();
    if (f === -1) { location.replace('#/done'); return doneView(); }
    i = f;
  }
  renderSteps(i);
  window.scrollTo(0, 0);
  const sec = sectionList()[i];
  const body = { background: partBackground, confidence: partConfidence, context: partContext, past: partPast, sequence: partSequence, story: partStory, reflection: partReflection }[sec.key](sec, i);
  app.replaceChildren(header(sec), body, navFoot(i));
}
const go = i => { location.hash = `#/p/${i + 1}`; };

function renderSteps(current = -1) {
  stepsNav.replaceChildren(...sectionList().map((s, i) => h('button', {
    type: 'button', class: finished(s.key) ? 'done' : '', 'aria-current': i === current ? 'step' : null, disabled: !unlocked(i),
    'aria-label': `Part ${s.no}: ${s.title}${saved(s.key) ? ' (saved)' : ''}`, onclick: () => go(i)
  }, h('span', { class: 'n' }, finished(s.key) ? '✓' : s.no), h('span', { class: 'lbl' }, s.key === 'reflection' ? 'Reflection' : s.title))));
}
function header(sec) {
  return h('div', { class: 'part-head' },
    h('div', { class: 'eyebrow' }, sec.key === 'reflection' ? 'Final step' : `Part ${sec.no} of 6`),
    h('h1', { lang: /[¿áéíóú]/.test(sec.title) ? 'es' : null }, sec.title), h('div', { class: 'time' }, `About ${sec.minutes}`));
}
function navFoot(i) {
  const sec = sectionList()[i];
  const next = sectionList()[i + 1];
  return h('div', { class: 'nav-foot' },
    i > 0 ? h('button', { class: 'btn', type: 'button', onclick: () => go(i - 1) }, '← Back') : h('span'),
    !saved(sec.key) ? h('span')
      : (['context', 'sequence'].includes(sec.key) && !saved(sec.key).followup) ? h('span', { class: 'small muted' }, sec.key === 'context' ? 'Save your two sentences to continue.' : 'Save your addition to the story to continue.')
      : next ? h('button', { class: 'btn primary', type: 'button', onclick: () => go(i + 1) }, `Next: ${next.key === 'reflection' ? 'Final reflection' : 'Part ' + next.no} →`)
        : me.attempt.completedAt ? h('a', { class: 'btn primary', href: '#/done' }, 'Finish →') : h('span'));
}

async function saveFirst(key, data, btn, err) {
  err.textContent = ''; btn.disabled = true; const label = btn.textContent; btn.textContent = 'Saving…';
  try {
    const r = await api('POST', `/api/diag/section/${key}`, { data });
    me.sections[key] = { savedAt: r.savedAt, data, feedback: r.feedback, retries: [], followup: null };
    try { const fresh = await api('GET', '/api/diag/me'); me = fresh; } catch {} // show exactly what the server saved
    forget(key);
    if (key === 'reflection') { location.hash = '#/done'; return; }
    render();
  } catch (e) {
    err.textContent = e.offline ? 'Not saved — no connection. Your answers are still here. Check your connection and try again.' : e.message;
    btn.disabled = false; btn.textContent = label;
  }
}

// ---------- welcome / start ----------
function welcome() {
  stepsNav.classList.add('hidden');
  const closed = info && !info.open;
  const name = h('input', { type: 'text', id: 'nm', autocomplete: 'name', maxlength: 80 });
  const course = h('div', { class: 'conf-choices', role: 'radiogroup', 'aria-labelledby': 'courseLbl' },
    (info?.courses || ['Spanish 4CP', 'Spanish 4H']).map(c => h('label', { class: 'chip' }, h('input', { type: 'radio', name: 'course', value: c }), c)));
  const block = h('input', { type: 'text', id: 'blk', maxlength: 20, placeholder: 'e.g. B or 3', style: 'max-width:12rem' });
  const err = errBox();
  const startBtn = h('button', { class: 'btn primary', type: 'submit', disabled: closed }, 'Start  →');
  app.replaceChildren(h('div', { class: 'welcome' },
    h('div', { class: 'part-head' }, h('div', { class: 'eyebrow' }, 'Unidad 2 · Spanish 4H & 4CP'), h('h1', { lang: 'es' }, 'Antes de empezar: Puerto Rico y nuestras historias')),
    h('div', { class: 'card' },
      (info?.directions || []).map((p, i) => h('p', { class: i === 0 ? 'lead' : '' }, p)),
      h('p', { class: 'small muted' }, 'About 35–45 minutes · 6 parts and a short reflection · your answers save as you finish each part.')),
    h('div', { class: 'wave', 'aria-hidden': 'true' }),
    closed ? h('p', { class: 'notice warn' }, 'This activity is closed right now. Ask your teacher.') : null,
    h('form', { class: 'card', onsubmit: async e => {
      e.preventDefault(); err.textContent = '';
      const c = course.querySelector('input:checked')?.value;
      if (!c) { err.textContent = 'Choose your course.'; return; }
      startBtn.disabled = true;
      try { await api('POST', '/api/diag/start', { name: name.value, course: c, block: block.value }); await loadMe(); location.hash = '#/p/1'; render(); }
      catch (x) { err.textContent = x.message; startBtn.disabled = false; }
    } },
      h('h2', {}, 'About you'),
      h('label', { for: 'nm' }, 'First and last name'), name,
      h('label', { id: 'courseLbl' }, 'Course'), course,
      h('label', { for: 'blk' }, 'Class / block'), block,
      err, h('div', { class: 'row end', style: 'margin-top:1rem' }, startBtn))));
  name.focus();
}

// ---------- Part 1 ----------
function partBackground(sec) {
  const s = saved('background');
  if (s) return h('div', {},
    h('p', { class: 'notice' }, s.feedback?.message || 'Saved for your teacher.'), savedTag(s.savedAt),
    C().background.map(q => h('div', { class: 'q', style: 'margin-top:.8rem' }, h('div', { class: 'qtext' }, q.q), h('p', { style: 'white-space:pre-wrap;margin:0' }, s.data.answers[q.id] || '—'))));
  const draft = recall('background') || {};
  const tas = {};
  const err = errBox();
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Save my answers');
  return h('form', { onsubmit: e => { e.preventDefault(); saveFirst('background', { answers: Object.fromEntries(Object.entries(tas).map(([k, t]) => [k, t.value])) }, btn, err); } },
    h('p', {}, 'Share what you know — English or Spanish is fine. These are not marked right or wrong. “Not yet” or “I’m not sure yet” are fine answers.'),
    C().background.map((q, i) => {
      const ta = tas[q.id] = h('textarea', { id: 'b_' + q.id, rows: 3, maxlength: 4000 });
      ta.value = draft[q.id] || '';
      ta.oninput = () => { draft[q.id] = ta.value; store('background', draft); };
      return h('div', { class: 'q' }, h('label', { for: 'b_' + q.id, style: 'margin-top:0' }, h('span', { class: 'qnum' }, `${i + 1}.`), q.q), ta);
    }), err, h('div', { class: 'row end' }, btn));
}

// ---------- Part 2 ----------
function partConfidence() {
  const s = saved('confidence');
  const levels = C().confidence.levels;
  if (s) {
    const meaning = Object.fromEntries((s.feedback?.meanings || []).map(m => [m.id, m.en]));
    const counts = levels.map(l => [l.label, Object.values(s.data.ratings).filter(v => v === l.id).length]);
    return h('div', {},
      h('div', { class: 'row' }, savedTag(s.savedAt), h('span', { class: 'muted small' }, 'Here are the meanings. Notice which ones you knew!')),
      h('div', { class: 'tally' }, counts.map(([l, n]) => h('span', {}, h('b', {}, n), ' · ', l))),
      h('div', { class: 'card', style: 'padding:0' }, C().confidence.expressions.map(x => h('div', { class: 'conf-row' },
        h('div', {}, h('span', { class: 'expr', lang: 'es' }, x.es), h('span', { class: 'meaning' }, meaning[x.id] || '')),
        h('div', { class: 'small muted' }, 'You said: ', h('b', {}, levels.find(l => l.id === s.data.ratings[x.id])?.label))))));
  }
  const draft = recall('confidence') || {};
  const err = errBox();
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Save and see the meanings');
  const form = h('form', { onsubmit: e => {
    e.preventDefault();
    const ratings = {};
    for (const x of C().confidence.expressions) { const v = form.querySelector(`input[name="c_${x.id}"]:checked`)?.value; if (!v) { err.textContent = `Choose an answer for “${x.es}”.`; return; } ratings[x.id] = v; }
    saveFirst('confidence', { ratings }, btn, err);
  } },
    h('p', {}, 'For each expression, choose how well you know it. Be honest — this helps us plan. Meanings appear after you save.'),
    h('div', { class: 'card', style: 'padding:0' }, C().confidence.expressions.map(x => h('fieldset', { class: 'conf-row', style: 'border:0;margin:0' },
      h('legend', { class: 'sr' }, x.es), h('span', { class: 'expr', lang: 'es', 'aria-hidden': 'true' }, x.es),
      h('div', { class: 'conf-choices' }, levels.map(l => h('label', { class: 'chip' },
        h('input', { type: 'radio', name: 'c_' + x.id, value: l.id, checked: draft[x.id] === l.id, onchange: () => { draft[x.id] = l.id; store('confidence', draft); } }), l.label)))))),
    err, h('div', { class: 'row end', style: 'margin-top:1rem' }, btn));
  return form;
}

// ---------- multiple choice (Parts 3 and 4) ----------
function mcForm(items, key, { locked = {}, showQ = false, attempt = 'first' } = {}) {
  const draft = attempt === 'first' ? (recall(key) || {}) : {};
  const el = h('div', {}, items.map((q, i) => {
    const lock = locked[q.id];
    const opts = seededShuffle(q.options, me.attempt.id + q.id + attempt);
    return h('fieldset', { class: 'q' },
      h('legend', {}, h('span', { class: 'qnum' }, `${i + 1}.`), h('span', { class: 'sentence', lang: 'es' }, rich(q.sentence))),
      showQ ? h('div', { class: 'qtext', style: 'font-weight:400' }, q.q) : h('div', { class: 'qtext', style: 'font-weight:400' }, 'What does the bold expression mean?'),
      lock ? h('p', { class: 'fb right', style: 'margin:0' }, h('span', { class: 'verdict' }, '✓ You already got this one: '), q.options.find(o => o.id === lock).text)
        : h('div', { class: 'opts' }, [...opts, { id: NS, text: 'I’m not sure yet' }].map(o => h('label', { class: 'opt' + (o.id === NS ? ' unsure' : '') },
          h('input', { type: 'radio', name: `${key}_${attempt}_${q.id}`, value: o.id, checked: draft[q.id] === o.id, onchange: () => { if (attempt === 'first') { draft[q.id] = o.id; store(key, draft); } } }), o.text))));
  }));
  el.collect = () => {
    const answers = {};
    for (const q of items) {
      const v = locked[q.id] || el.querySelector(`input[name="${key}_${attempt}_${q.id}"]:checked`)?.value;
      if (!v) return { missing: items.indexOf(q) + 1 };
      answers[q.id] = v;
    }
    return { answers };
  };
  return el;
}

function mcFeedback(items, fb, { showQ = false, marks = false } = {}) {
  return h('div', {},
    h('div', { class: 'tally' }, h('span', {}, h('b', {}, fb.correct), ` of ${fb.total} matched the meaning`), fb.notSure ? h('span', {}, h('b', {}, fb.notSure), ' marked “not sure yet”') : null),
    fb.items.map((it, i) => {
      const q = items.find(x => x.id === it.id);
      const cls = it.correct ? 'right' : it.notSure ? 'unsure' : 'miss';
      return h('div', { class: 'fb ' + cls },
        h('div', { class: 'sentence', lang: 'es' }, h('span', { class: 'qnum' }, `${i + 1}.`), rich(q.sentence, marks ? 'mark' : 'strong')),
        showQ ? h('div', { class: 'small muted' }, q.q) : null,
        h('div', { class: 'verdict' }, it.correct ? '✓ Yes!' : it.notSure ? 'Not sure yet — here’s the meaning:' : `You chose “${it.chosenText}”. The meaning is:`, ' ', h('span', { style: 'font-weight:400' }, it.correct ? it.answer : `“${it.answer}”`)),
        h('div', { class: 'small' }, it.explain));
    }));
}

function practiceBlock(key, items, fb, opts) {
  const host = h('div', {});
  const missed = fb.items.filter(x => !x.correct);
  const lastRetry = saved(key).retries.at(-1);
  if (!missed.length) return host;
  const btn = h('button', { class: 'btn', type: 'button', onclick: () => open() }, `Practice the ${missed.length} I missed`);
  host.append(h('div', { class: 'card', style: 'margin-top:1rem' },
    h('h2', {}, 'Optional practice'),
    h('p', { class: 'small muted' }, 'Your first try is already saved. Practice tries are saved separately and don’t replace it.'),
    lastRetry ? h('p', { class: 'small' }, `Last practice: ${lastRetry.result.correct} of ${lastRetry.result.total}.`) : null, btn));
  function open() {
    const locked = Object.fromEntries(fb.items.filter(x => x.correct).map(x => [x.id, x.chosen]));
    const n = saved(key).retries.length + 1;
    const form = mcForm(items, key, { ...opts, locked, attempt: 'retry' + n });
    const err = errBox();
    const submit = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      const c = form.collect(); if (c.missing) { err.textContent = `Answer question ${c.missing}.`; return; }
      submit.disabled = true;
      try {
        const r = await api('POST', `/api/diag/section/${key}/retry`, { data: { answers: c.answers } });
        saved(key).retries.push({ savedAt: r.savedAt, data: { answers: c.answers }, result: r.feedback });
        host.replaceChildren(h('div', { class: 'card', style: 'margin-top:1rem' }, h('h2', {}, 'Practice results'), savedTag(r.savedAt),
          mcFeedback(items, { ...r.feedback, items: r.feedback.items.filter(x => !locked[x.id]) }, opts),
          h('button', { class: 'btn', type: 'button', onclick: () => render() }, 'Done')));
      } catch (e) { err.textContent = e.message; submit.disabled = false; }
    } }, 'Check my practice');
    host.replaceChildren(h('div', { class: 'card', style: 'margin-top:1rem' }, h('h2', {}, 'Practice'), form, err, h('div', { class: 'row end' }, submit)));
  }
  return host;
}

// ---------- Part 3 ----------
function partContext() {
  const items = C().context;
  const s = saved('context');
  if (s) return h('div', {}, savedTag(s.savedAt), h('h2', { style: 'margin-top:1rem' }, 'Feedback'),
    mcFeedback(items, s.feedback), practiceBlock('context', items, s.feedback, {}), sentencesBlock());
  const form = mcForm(items, 'context');
  const err = errBox();
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Save and check');
  return h('form', { onsubmit: e => { e.preventDefault(); const c = form.collect(); if (c.missing) { err.textContent = `Answer question ${c.missing}. “I’m not sure yet” is always OK.`; return; } saveFirst('context', { answers: c.answers }, btn, err); } },
    h('p', {}, 'Read each sentence and choose the meaning of the bold expression. Use the rest of the sentence as a clue.'), form, err, h('div', { class: 'row end' }, btn));
}

function sentencesBlock() {
  const s = saved('context');
  if (s.followup) return h('div', { class: 'card', style: 'margin-top:1rem' }, h('h2', {}, 'Your sentences'), savedTag(s.followup.savedAt),
    h('ul', {}, s.followup.data.sentences.map(x => h('li', { lang: 'es' }, h('b', {}, x.expression), ' — ', x.text))));
  const exprs = C().allExpressions;
  const rows = [0, 1].map(i => {
    const sel = h('select', { 'aria-label': `Expression ${i + 1}` }, h('option', { value: '' }, 'Choose an expression'), exprs.map(x => h('option', { value: x }, x)));
    const inp = h('input', { type: 'text', maxlength: 600, 'aria-label': `Sentence ${i + 1}`, lang: 'es', placeholder: 'Escribe tu oración…' });
    return { sel, inp, el: h('div', { class: 'sentence-builder' }, sel, inp) };
  });
  const starters = h('div', { class: 'starter-list hidden' }, C().contextStarters.map(x => h('span', { lang: 'es' }, x)));
  const starterBtn = h('button', { class: 'btn small', type: 'button', onclick: () => { starters.classList.remove('hidden'); starterBtn.classList.add('hidden'); logSupport('context-starters'); } }, 'Show sentence starters');
  const hint = h('span', { class: 'small muted' });
  if (isH()) {
    starterBtn.disabled = true; hint.textContent = 'Try on your own first. Starters unlock after you write a sentence or in 2 minutes.';
    const unlock = () => { starterBtn.disabled = false; hint.textContent = ''; };
    const t = setTimeout(unlock, 120000);
    rows.forEach(r => r.inp.addEventListener('input', () => { if (r.inp.value.trim().split(/\s+/).length >= 3) { clearTimeout(t); unlock(); } }));
  }
  const err = errBox();
  const btn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    const sentences = rows.map(r => ({ expression: r.sel.value, text: r.inp.value }));
    if (sentences.some(x => !x.expression || !x.text.trim())) { err.textContent = 'Choose two expressions and write a sentence with each.'; return; }
    if (sentences[0].expression === sentences[1].expression) { err.textContent = 'Choose two different expressions.'; return; }
    btn.disabled = true; err.textContent = '';
    try { const r = await api('POST', '/api/diag/section/context/followup', { data: { sentences } }); s.followup = { savedAt: r.savedAt, data: { sentences } }; render(); }
    catch (e) { err.textContent = e.message; btn.disabled = false; }
  } }, 'Save my sentences');
  return h('div', { class: 'card', style: 'margin-top:1rem' },
    h('h2', {}, 'Use two expressions'),
    h('p', {}, 'Choose two expressions from today and write a meaningful Spanish sentence with each — something true about you, your family, or your community.'),
    rows.map(r => r.el), h('div', { class: 'row' }, starterBtn, hint), starters, err, h('div', { class: 'row end' }, btn));
}

// ---------- Part 4 ----------
function partPast() {
  const items = C().past;
  const s = saved('past');
  if (s) return h('div', {}, savedTag(s.savedAt),
    h('p', { class: 'notice', style: 'margin-top:1rem' }, 'The highlighted words are the clues that tell you when something happened and who did it.'),
    mcFeedback(items, s.feedback, { showQ: true, marks: true }), practiceBlock('past', items, s.feedback, { showQ: true }));
  const plainItems = items.map(q => ({ ...q, sentence: q.sentence.replace(/\*\*/g, '') }));
  const form = mcForm(plainItems, 'past', { showQ: true });
  const err = errBox();
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Save and check');
  return h('form', { onsubmit: e => { e.preventDefault(); const c = form.collect(); if (c.missing) { err.textContent = `Answer question ${c.missing}. “I’m not sure yet” is always OK.`; return; } saveFirst('past', { answers: c.answers }, btn, err); } },
    h('p', { class: 'notice' }, 'Focus on what the sentence communicates. You do not need to name a verb tense.'), form, err, h('div', { class: 'row end' }, btn));
}

// ---------- Part 5 ----------
function sorter(initialIds, onChange) {
  let order = initialIds.slice();
  const byId = Object.fromEntries(C().sequence.sentences.map(s => [s.id, s.text]));
  const list = h('ol', { class: 'sorter', 'aria-label': 'Story sentences in your order' });
  const live = h('div', { class: 'sr', 'aria-live': 'assertive' });
  let dragId = null;
  function move(id, to) { const from = order.indexOf(id); if (to < 0 || to >= order.length || from === to) return; order.splice(from, 1); order.splice(to, 0, id); draw(id); onChange?.(order); live.textContent = `Moved to position ${to + 1}.`; }
  function draw(focusId, focusDir) {
    list.replaceChildren(...order.map((id, i) => {
      const up = h('button', { type: 'button', 'aria-label': `Move up: ${byId[id]}`, disabled: i === 0, onclick: () => move(id, i - 1) }, '↑');
      const down = h('button', { type: 'button', 'aria-label': `Move down: ${byId[id]}`, disabled: i === order.length - 1, onclick: () => move(id, i + 1) }, '↓');
      const li = h('li', { draggable: 'true', 'data-id': id,
        ondragstart: e => { dragId = id; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); },
        ondragend: () => { li.classList.remove('dragging'); list.querySelectorAll('.over').forEach(x => x.classList.remove('over')); },
        ondragover: e => { e.preventDefault(); li.classList.add('over'); },
        ondragleave: () => li.classList.remove('over'),
        ondrop: e => { e.preventDefault(); if (dragId) move(dragId, order.indexOf(id)); dragId = null; } },
      h('span', { class: 'pos' }, i + 1), h('span', { class: 'txt', lang: 'es' }, byId[id]), h('span', { class: 'arrows' }, up, down));
      return li;
    }));
    if (focusId) { const li = list.querySelector(`[data-id="${focusId}"]`); const b = li?.querySelector('button:not(:disabled)'); b?.focus(); }
  }
  draw();
  const wrap = h('div', {}, list, live);
  wrap.getOrder = () => order.slice();
  return wrap;
}

function sequenceForm(attempt) {
  const sents = C().sequence.sentences;
  const startOrder = attempt === 'first' && recall('sequence')?.order?.length === 4 ? recall('sequence').order : seededShuffle(sents.map(s => s.id), me.attempt.id + attempt);
  // Never start already in the right order.
  if (startOrder.join() === 's1,s2,s3,s4') startOrder.reverse();
  const draft = attempt === 'first' ? (recall('sequence') || {}) : {};
  const sort = sorter(startOrder, o => { if (attempt === 'first') { draft.order = o; store('sequence', draft); } });
  const qs = C().sequence.questions.map((q, i) => h('fieldset', { class: 'q' },
    h('legend', {}, h('span', { class: 'qnum' }, `${i + 1}.`), q.q),
    h('div', { class: 'opts' }, [...sents.map(s => ({ id: s.id, text: s.text })), { id: NS, text: 'I’m not sure yet' }].map(o => h('label', { class: 'opt' + (o.id === NS ? ' unsure' : ''), lang: o.id === NS ? null : 'es' },
      h('input', { type: 'radio', name: `seq_${attempt}_${q.id}`, value: o.id, checked: draft.questions?.[q.id] === o.id,
        onchange: () => { if (attempt === 'first') { draft.questions = { ...(draft.questions || {}), [q.id]: o.id }; store('sequence', draft); } } }), o.text)))));
  const el = h('div', {},
    h('h2', {}, 'Put the story in order'),
    h('p', { class: 'small muted' }, 'Drag the sentences, or use the ↑ ↓ buttons.'), sort,
    h('h2', { style: 'margin-top:1.2rem' }, 'Then answer'), qs);
  el.collect = () => {
    const questions = {};
    for (const q of C().sequence.questions) { const v = el.querySelector(`input[name="seq_${attempt}_${q.id}"]:checked`)?.value; if (!v) return { error: 'Answer all three questions. “I’m not sure yet” is always OK.' }; questions[q.id] = v; }
    return { order: sort.getOrder(), questions };
  };
  return el;
}

function sequenceFeedback(fb, theirOrder) {
  const byId = Object.fromEntries(C().sequence.sentences.map(s => [s.id, s.text]));
  return h('div', {},
    h('div', { class: 'fb ' + (fb.orderCorrect ? 'right' : 'miss') },
      h('div', { class: 'verdict' }, fb.orderCorrect ? '✓ Your order tells the story clearly!' : `${fb.positionsCorrect} of 4 sentences were in the expected spot. Here is the order that tells the story clearly:`),
      h('ol', { lang: 'es', style: 'margin:.4rem 0 0' }, fb.correctOrder.map(id => h('li', {}, byId[id]))),
      fb.orderCorrect ? null : h('p', { class: 'small', style: 'margin:.4rem 0 0' }, 'Your order: ', theirOrder.map(id => byId[id]).join(' → ')),
      h('p', { class: 'small', style: 'margin:.4rem 0 0' }, 'Clues: El verano pasado starts the story · Cuando llegué connects to the arrival · Después de comer comes next · Al final del día ends it.')),
    fb.questions.map((q, i) => h('div', { class: 'fb ' + (q.correct ? 'right' : q.notSure ? 'unsure' : 'miss') },
      h('div', {}, h('span', { class: 'qnum' }, `${i + 1}.`), q.q),
      h('div', { class: 'verdict' }, q.correct ? '✓ Yes: ' : 'Answer: ', h('span', { lang: 'es', style: 'font-weight:400' }, q.answerText)),
      h('div', { class: 'small' }, q.explain))));
}

function partSequence() {
  const s = saved('sequence');
  if (!s) {
    const form = sequenceForm('first');
    const err = errBox();
    const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Save and check');
    return h('form', { onsubmit: e => { e.preventDefault(); const c = form.collect(); if (c.error) { err.textContent = c.error; return; } saveFirst('sequence', c, btn, err); } },
      h('p', {}, 'These four sentences tell one short story, but they are mixed up. Arrange them so the story makes sense.'), form, err, h('div', { class: 'row end' }, btn));
  }
  const host = h('div', {}, savedTag(s.savedAt), h('h2', { style: 'margin-top:1rem' }, 'Feedback'), sequenceFeedback(s.feedback, s.data.order));
  if (!s.feedback.orderCorrect || s.feedback.questionsCorrect < 3) {
    const prac = h('div', {});
    const last = s.retries.at(-1);
    prac.append(h('div', { class: 'card', style: 'margin-top:1rem' }, h('h2', {}, 'Optional practice'),
      h('p', { class: 'small muted' }, 'Your first try is saved. Practice is saved separately.'),
      last ? h('p', { class: 'small' }, `Last practice: order ${last.result.orderCorrect ? 'correct' : 'not yet'}, questions ${last.result.questionsCorrect}/3.`) : null,
      h('button', { class: 'btn', type: 'button', onclick: () => {
        const n = s.retries.length + 1;
        const form = sequenceForm('retry' + n); const err = errBox();
        const b = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          const c = form.collect(); if (c.error) { err.textContent = c.error; return; }
          b.disabled = true;
          try {
            const r = await api('POST', '/api/diag/section/sequence/retry', { data: c });
            s.retries.push({ savedAt: r.savedAt, data: c, result: r.feedback });
            prac.replaceChildren(h('div', { class: 'card', style: 'margin-top:1rem' }, h('h2', {}, 'Practice results'), savedTag(r.savedAt), sequenceFeedback(r.feedback, c.order),
              h('button', { class: 'btn', type: 'button', onclick: () => render() }, 'Done')));
          } catch (e) { err.textContent = e.message; b.disabled = false; }
        } }, 'Check my practice');
        prac.replaceChildren(h('div', { class: 'card', style: 'margin-top:1rem' }, form, err, h('div', { class: 'row end' }, b)));
      } }, 'Try again')));
    host.append(prac);
  }
  host.append(extensionBlock());
  return host;
}

function extensionBlock() {
  const s = saved('sequence'), ext = C().sequence.extension;
  if (s.followup) return h('div', { class: 'card', style: 'margin-top:1rem' }, h('h2', {}, 'Your addition'), savedTag(s.followup.savedAt), h('p', { lang: 'es', style: 'white-space:pre-wrap' }, s.followup.data.text));
  const ta = h('textarea', { rows: isH() ? 4 : 3, lang: 'es', maxlength: 2000, 'aria-label': 'Your addition to the story' });
  ta.value = recall('seq-ext') || ''; ta.oninput = () => store('seq-ext', ta.value);
  const starters = ext.starters.length ? h('div', { class: 'starter-list hidden' }, ext.starters.map(x => h('span', { lang: 'es' }, x))) : null;
  const starterBtn = ext.starters.length ? h('button', { class: 'btn small', type: 'button', onclick: () => { starters.classList.remove('hidden'); starterBtn.classList.add('hidden'); logSupport('sequence-starters'); } }, 'Show optional starters') : null;
  const err = errBox();
  const btn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    if (!ta.value.trim()) { err.textContent = 'Write your addition first.'; return; }
    btn.disabled = true;
    try { const r = await api('POST', '/api/diag/section/sequence/followup', { data: { text: ta.value } }); s.followup = { savedAt: r.savedAt, data: { text: ta.value } }; forget('seq-ext'); render(); }
    catch (e) { err.textContent = e.message; btn.disabled = false; }
  } }, 'Save my addition');
  return h('div', { class: 'card', style: 'margin-top:1rem' }, h('h2', {}, 'Add to the story'), h('p', {}, ext.task),
    starterBtn, starters, accentBar(ta), ta, err, h('div', { class: 'row end', style: 'margin-top:.5rem' }, btn));
}

// ---------- Part 6 ----------
function partStory() {
  const st = C().story;
  const s = saved('story');
  const prompt = h('div', { class: 'prompt-box' }, h('p', { style: 'margin:0' }, st.prompt), st.note ? h('p', { class: 'small', style: 'margin:.5rem 0 0' }, st.note) : null);
  if (s) {
    const host = h('div', {}, prompt, h('div', { class: 'receipt' }, CHECK(), h('div', {}, h('b', {}, 'Your original story is saved.'), h('div', { class: 'small' }, `${s.data.words} words · ${new Date(s.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`))),
      h('div', { class: 'initial-text', lang: 'es' }, s.data.text),
      h('div', { class: 'card', style: 'margin-top:1rem' }, h('h2', {}, 'Check your story'), h('ul', {}, (s.feedback?.checklist || []).map(x => h('li', {}, x))),
        h('h3', {}, 'One example story'), h('p', { class: 'small muted' }, 'This is just one way to do it. Yours can be completely different.'), h('div', { class: 'model', lang: 'es' }, s.feedback?.model || '')));
    if (s.followup) host.append(h('div', { class: 'card', style: 'margin-top:1rem' }, h('h2', {}, 'Your revised version'), savedTag(s.followup.savedAt), h('div', { class: 'initial-text', lang: 'es' }, s.followup.data.text)));
    else {
      const ta = h('textarea', { class: 'writing', lang: 'es', 'aria-label': 'Revised story', style: 'min-height:220px' });
      ta.value = recall('story-rev') ?? s.data.text; ta.oninput = () => store('story-rev', ta.value);
      const err = errBox();
      const btn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        if (!ta.value.trim()) { err.textContent = 'Your revision is empty.'; return; }
        btn.disabled = true;
        try { const r = await api('POST', '/api/diag/section/story/followup', { data: { text: ta.value } }); s.followup = { savedAt: r.savedAt, data: { text: ta.value } }; forget('story-rev'); render(); }
        catch (e) { err.textContent = e.message; btn.disabled = false; }
      } }, 'Save revision');
      host.append(h('details', { class: 'card', style: 'margin-top:1rem' }, h('summary', { style: 'cursor:pointer;font-weight:700' }, 'Optional: add a detail or fix something (saved separately)'),
        h('p', { class: 'small muted', style: 'margin-top:.6rem' }, 'Your original stays exactly as you submitted it.'), accentBar(ta), ta, err, h('div', { class: 'row end', style: 'margin-top:.5rem' }, btn)));
    }
    return host;
  }
  const ta = h('textarea', { class: 'writing', id: 'story', lang: 'es', 'aria-label': 'Your story in Spanish', placeholder: 'Escribe aquí…' });
  ta.value = recall('story') || '';
  const count = h('span', {});
  const upd = () => { const n = (ta.value.trim().match(/\S+/g) || []).length; count.textContent = `${n} word${n === 1 ? '' : 's'}`; store('story', ta.value); };
  ta.oninput = upd; upd();
  const sup = h('details', { class: 'supports', ontoggle: () => { if (sup.open && !sup.dataset.logged) { sup.dataset.logged = '1'; logSupport('story'); } } },
    h('summary', {}, 'Optional support'), h('div', { class: 'starter-list' }, st.supports.map(x => h('span', { lang: 'es' }, x))));
  if (me.supports.story) sup.dataset.logged = '1';
  const err = errBox();
  const btn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    if (!ta.value.trim()) { err.textContent = 'Write what you can in Spanish before submitting.'; return; }
    if (await confirmDialog('Submit your story?', 'Your original story will be saved for your teacher. After that you’ll see a checklist and an example, and you can add a revised version.')) saveFirst('story', { text: ta.value }, btn, err);
  } }, 'Submit my story');
  return h('div', {}, prompt,
    h('p', { class: 'small muted' }, 'Write in Spanish. There is no required length — useful details and connected ideas matter most. Work on your own: no translators, AI, or internet.'),
    sup, accentBar(ta), ta, h('div', { class: 'editor-foot' }, count, h('span', {}, 'Kept on this device until you submit')), err, h('div', { class: 'row end', style: 'margin-top:.6rem' }, btn));
}

// ---------- Final reflection ----------
function partReflection() {
  const s = saved('reflection');
  if (s) return h('div', {}, savedTag(s.savedAt), h('div', { class: 'card', style: 'margin-top:1rem' },
    h('p', {}, h('b', {}, 'Strongest: '), s.data.strength), h('p', {}, h('b', {}, 'I want help with: '), s.data.help), h('p', {}, h('b', {}, 'Expressions I want to learn: '), h('span', { lang: 'es' }, s.data.expressions.join(', ')))));
  const draft = recall('reflection') || {};
  const strength = h('div', { class: 'opts' }, C().strengths.map(x => h('label', { class: 'opt' }, h('input', { type: 'radio', name: 'strength', value: x, checked: draft.strength === x, onchange: () => { draft.strength = x; store('reflection', draft); } }), x)));
  const help = h('textarea', { id: 'help', rows: 3, maxlength: 2000 }); help.value = draft.help || ''; help.oninput = () => { draft.help = help.value; store('reflection', draft); };
  const picks = h('div', { class: 'conf-choices pick-two' }, C().allExpressions.map(x => h('label', { class: 'chip', lang: 'es' }, h('input', { type: 'checkbox', value: x, checked: (draft.expressions || []).includes(x), onchange: syncPicks }), x)));
  function syncPicks() {
    const chosen = [...picks.querySelectorAll('input:checked')].map(i => i.value);
    picks.querySelectorAll('input').forEach(i => { i.disabled = !i.checked && chosen.length >= 2; i.parentElement.classList.toggle('disabled', i.disabled); });
    draft.expressions = chosen; store('reflection', draft);
  }
  syncPicks();
  const err = errBox();
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Finish and save');
  return h('form', { onsubmit: e => {
    e.preventDefault();
    const data = { strength: strength.querySelector('input:checked')?.value, help: help.value, expressions: [...picks.querySelectorAll('input:checked')].map(i => i.value) };
    if (!data.strength) { err.textContent = 'Choose what felt strongest.'; return; }
    if (!data.help.trim()) { err.textContent = 'Tell what you want help with. “Not sure yet” is fine.'; return; }
    if (data.expressions.length !== 2) { err.textContent = 'Choose two expressions.'; return; }
    saveFirst('reflection', data, btn, err);
  } },
    h('fieldset', { class: 'q' }, h('legend', {}, h('span', { class: 'qnum' }, '1.'), 'Which felt strongest today?'), strength),
    h('div', { class: 'q' }, h('label', { for: 'help', style: 'margin-top:0' }, h('span', { class: 'qnum' }, '2.'), 'What do you want help with?'), help),
    h('fieldset', { class: 'q' }, h('legend', {}, h('span', { class: 'qnum' }, '3.'), 'Choose two expressions from today that you want to learn to use confidently.'), picks),
    err, h('div', { class: 'row end' }, btn));
}

// ---------- finished ----------
function doneView() {
  renderSteps();
  window.scrollTo(0, 0);
  app.replaceChildren(h('div', { class: 'card big-done' }, CHECK(),
    h('h1', { style: 'margin-top:.8rem' }, 'Your work has been saved.'),
    h('p', { class: 'lead' }, `¡Gracias, ${me.attempt.name.split(' ')[0]}! Your teacher can see everything you did today.`),
    h('p', { class: 'small muted' }, 'Want a copy for yourself? Download your summary. You can look back at any part using the buttons at the top.'),
    h('div', { class: 'row', style: 'justify-content:center' }, h('button', { class: 'btn primary', type: 'button', onclick: downloadSummary }, 'Download my summary'))));
}

// ---------- student summary (backup copy) ----------
function downloadSummary() {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const p = s => String(s).replace(/\*\*/g, '');
  const sec = me.sections, c = C(), at = me.attempt;
  const choice = (items, s) => s ? `<ol>${items.map(q => { const it = s.feedback.items.find(x => x.id === q.id); return `<li>${esc(p(q.sentence))}${q.q ? ` — <i>${esc(q.q)}</i>` : ''}<br>My answer: ${esc(it?.chosenText || '—')} ${it?.correct ? '✓' : `(meaning: ${esc(it?.answer)})`}</li>`; }).join('')}</ol>` : '<p><i>Not finished.</i></p>';
  const byId = Object.fromEntries(c.sequence.sentences.map(s => [s.id, s.text]));
  const levels = Object.fromEntries(c.confidence.levels.map(l => [l.id, l.label]));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Antes de empezar — ${esc(at.name)}</title><style>body{font-family:Georgia,serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#2b2a24}h2{font-size:1.1rem;border-top:1px solid #ddd;padding-top:.8rem;margin-top:1.4rem}pre{white-space:pre-wrap;font-family:inherit;background:#eef7f5;padding:.8rem;border-radius:6px}.m{color:#777}</style></head><body>
  <h1>Antes de empezar: Puerto Rico y nuestras historias</h1>
  <p class="m">${esc(at.name)} · ${esc(at.course)} · Block ${esc(at.block)} · started ${esc(new Date(at.startedAt).toLocaleString())}${at.completedAt ? ' · completed ' + esc(new Date(at.completedAt).toLocaleString()) : ' · not finished'}</p>
  <h2>1. ¿Qué sabes de Puerto Rico?</h2>${sec.background ? c.background.map(q => `<p><b>${esc(q.q)}</b><br>${esc(sec.background.data.answers[q.id] || '—')}</p>`).join('') : '<p><i>Not finished.</i></p>'}
  <h2>2. Vocabulary confidence</h2>${sec.confidence ? `<ul>${(sec.confidence.feedback?.meanings || []).map(m => `<li><b>${esc(m.es)}</b> (${esc(m.en)}): ${esc(levels[sec.confidence.data.ratings[m.id]])}</li>`).join('')}</ul>` : '<p><i>Not finished.</i></p>'}
  <h2>3. Vocabulary in context</h2>${choice(c.context, sec.context)}${sec.context?.followup ? `<p><b>My sentences:</b></p><ul>${sec.context.followup.data.sentences.map(x => `<li>${esc(x.expression)} — ${esc(x.text)}</li>`).join('')}</ul>` : ''}
  <h2>4. Understand the past</h2>${choice(c.past, sec.past)}
  <h2>5. Build a story</h2>${sec.sequence ? `<p>My order: ${sec.sequence.data.order.map(id => esc(byId[id])).join(' → ')}</p>${sec.sequence.followup ? `<p><b>My addition:</b> ${esc(sec.sequence.followup.data.text)}</p>` : ''}` : '<p><i>Not finished.</i></p>'}
  <h2>6. My story</h2>${sec.story ? `<pre>${esc(sec.story.data.text)}</pre>${sec.story.followup ? `<p><b>Revised version:</b></p><pre>${esc(sec.story.followup.data.text)}</pre>` : ''}` : '<p><i>Not finished.</i></p>'}
  <h2>Final reflection</h2>${sec.reflection ? `<p>Strongest: ${esc(sec.reflection.data.strength)}</p><p>I want help with: ${esc(sec.reflection.data.help)}</p><p>Expressions I want to learn: ${esc(sec.reflection.data.expressions.join(', '))}</p>` : '<p><i>Not finished.</i></p>'}
  </body></html>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = `antes-de-empezar-${at.name.replace(/[^\w]+/g, '-').toLowerCase()}.html`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
