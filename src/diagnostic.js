// Server side of "Antes de empezar" (/antes). Separate from the writing practice: own tables, own student
// session, no AI. First attempts are saved before any feedback is returned and can never be changed;
// practice retries, follow-ups and revisions are stored as separate rows.
import express from 'express';
import crypto from 'node:crypto';
import * as C from './diagnostic-content.js';

const SECTION_KEYS = C.SECTIONS.map(s => s.key);
const MAX = 4000;

export function mountDiagnostic(app, deps) {
  const { db, requireTeacher, limit, parseCookies, setCookie, clearCookie, hmac, cleanName, nameKey } = deps;
  db.exec(`
CREATE TABLE IF NOT EXISTS diag_attempts (
  id TEXT PRIMARY KEY,
  diag_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  course TEXT NOT NULL,
  block TEXT NOT NULL,
  started_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  completed_at TEXT,
  supports_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS diag_entries (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES diag_attempts(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('first','retry','followup','revision')),
  data_json TEXT NOT NULL,
  result_json TEXT,
  saved_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS diag_one_first ON diag_entries(attempt_id, section) WHERE kind='first';
CREATE UNIQUE INDEX IF NOT EXISTS diag_one_followup ON diag_entries(attempt_id, section) WHERE kind IN ('followup','revision');
CREATE TRIGGER IF NOT EXISTS diag_first_immutable BEFORE UPDATE ON diag_entries WHEN OLD.kind IN ('first','followup','revision')
BEGIN SELECT RAISE(ABORT, 'saved responses are immutable'); END;
CREATE TABLE IF NOT EXISTS diag_sessions (
  token_hash TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES diag_attempts(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);`);

  const now = () => new Date().toISOString();
  const uid = () => crypto.randomUUID();
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const str = (v, n = MAX) => String(v ?? '').slice(0, n);
  const cleanBlock = s => String(s || '').replace(/\b(block|bloque)\b/ig, '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 20);
  const isOpen = () => (one("SELECT value FROM settings WHERE key='diag_open'")?.value ?? '1') === '1';
  const parse = s => (s ? JSON.parse(s) : null);

  // ---------- student session ----------
  function getAttempt(req) {
    const token = parseCookies(req).aw_d; if (!token) return null;
    const s = one('SELECT * FROM diag_sessions WHERE token_hash=?', hmac('d:' + token));
    if (!s || s.expires_at < now()) return null;
    return one('SELECT * FROM diag_attempts WHERE id=?', s.attempt_id) || null;
  }
  const requireAttempt = (req, res, next) => {
    const a = getAttempt(req);
    if (!a) return res.status(401).json({ error: 'Please start again with your name.' });
    req.attempt = a; next();
  };
  const touch = id => run('UPDATE diag_attempts SET last_activity_at=? WHERE id=?', now(), id);
  const entries = id => all('SELECT * FROM diag_entries WHERE attempt_id=? ORDER BY saved_at', id);
  const firstOf = (id, section) => one("SELECT * FROM diag_entries WHERE attempt_id=? AND section=? AND kind='first'", id, section);

  // ---------- validation + feedback per section ----------
  function evaluate(section, course, data, supports) {
    const d = data && typeof data === 'object' ? data : {};
    switch (section) {
      case 'background': {
        const answers = Object.fromEntries(C.BACKGROUND.map(q => [q.id, str(d.answers?.[q.id]).trim()]));
        if (!Object.values(answers).some(Boolean)) return { error: 'Write something for at least one question. “Not yet” is fine.' };
        return { data: { answers }, feedback: { message: 'Thank you! Your teacher will read these. There are no right or wrong answers here.' } };
      }
      case 'confidence': {
        const levels = C.CONFIDENCE_LEVELS.map(l => l.id);
        const ratings = {};
        for (const x of C.expressionsFor(course)) { const v = d.ratings?.[x.id]; if (!levels.includes(v)) return { error: 'Choose an answer for every expression.' }; ratings[x.id] = v; }
        return { data: { ratings }, feedback: { meanings: C.confidenceFeedback(course) } };
      }
      case 'context': case 'past': {
        const items = section === 'context' ? C.contextFor(course) : C.PAST;
        const answers = {};
        for (const q of items) {
          const v = d.answers?.[q.id];
          if (!C.validOption(q, v)) return { error: 'Answer every question. “I’m not sure yet” is always OK.' };
          answers[q.id] = v;
        }
        const result = section === 'context' ? C.scoreContext(course, answers) : C.scorePast(answers);
        return { data: { answers }, result, feedback: result };
      }
      case 'sequence': {
        const order = Array.isArray(d.order) ? d.order.map(String) : [];
        if (order.length !== 4 || new Set(order).size !== 4 || !order.every(x => C.STORY_ORDER.includes(x))) return { error: 'Put all four sentences in order.' };
        const questions = {};
        for (const q of C.SEQ_QUESTIONS) {
          const v = d.questions?.[q.id];
          if (!(v === C.NOT_SURE || C.STORY_ORDER.includes(v))) return { error: 'Answer all three questions. “I’m not sure yet” is always OK.' };
          questions[q.id] = v;
        }
        const result = C.scoreSequence({ order, questions });
        return { data: { order, questions }, result, feedback: result };
      }
      case 'story': {
        const text = str(d.text, 20000);
        if (!text.trim()) return { error: 'Write what you can in Spanish before submitting.' };
        const opened = !!supports['story'];
        const p = C.STORY_PROMPT[course];
        return { data: { text, words: (text.trim().match(/\S+/g) || []).length, supportsOpened: opened }, feedback: { checklist: p.checklist, model: p.model } };
      }
      case 'reflection': {
        const strength = C.STRENGTH_OPTIONS.includes(d.strength) ? d.strength : '';
        const help = str(d.help, 2000).trim();
        const expressions = Array.isArray(d.expressions) ? d.expressions.map(x => str(x, 80)).filter(x => C.expressionsFor(course).some(e => e.es === x)).slice(0, 2) : [];
        if (!strength) return { error: 'Choose what felt strongest.' };
        if (!help) return { error: 'Tell what you want help with. “Not sure yet” is fine.' };
        if (expressions.length !== 2) return { error: 'Choose two expressions.' };
        return { data: { strength, help, expressions }, feedback: { message: '¡Gracias!' } };
      }
    }
    return { error: 'Unknown section.' };
  }

  function followup(section, course, d = {}, supports) {
    if (section === 'context') {
      const exprs = C.expressionsFor(course).map(e => e.es);
      const sentences = (Array.isArray(d.sentences) ? d.sentences : []).slice(0, 2).map(s => ({ expression: exprs.includes(s?.expression) ? s.expression : '', text: str(s?.text, 600).trim() }));
      if (sentences.length !== 2 || sentences.some(s => !s.expression || !s.text)) return { error: 'Choose two expressions and write a sentence with each.' };
      return { data: { sentences, startersOpened: !!supports['context-starters'] } };
    }
    if (section === 'sequence') {
      const text = str(d.text, 2000).trim();
      if (!text) return { error: 'Add your sentence(s) before saving.' };
      return { data: { text, startersOpened: !!supports['sequence-starters'] } };
    }
    return { error: 'Not available for this part.' };
  }

  const view = a => {
    const es = entries(a.id);
    const sections = {};
    for (const key of SECTION_KEYS) {
      const f = es.find(e => e.section === key && e.kind === 'first');
      const fu = es.find(e => e.section === key && (e.kind === 'followup' || e.kind === 'revision'));
      sections[key] = f ? {
        savedAt: f.saved_at, data: parse(f.data_json),
        feedback: feedbackFor(key, a.course, parse(f.data_json), parse(f.result_json)),
        retries: es.filter(e => e.section === key && e.kind === 'retry').map(r => ({ savedAt: r.saved_at, data: parse(r.data_json), result: parse(r.result_json) })),
        followup: fu ? { kind: fu.kind, savedAt: fu.saved_at, data: parse(fu.data_json) } : null
      } : null;
    }
    return { attempt: { id: a.id, name: a.display_name, course: a.course, block: a.block, startedAt: a.started_at, completedAt: a.completed_at },
      supports: JSON.parse(a.supports_json), sections };
  };
  function feedbackFor(key, course, data, result) {
    if (result) return result;
    return evaluate(key, course, data, {}).feedback || null;
  }

  // ---------- student routes ----------
  const r = express.Router();
  r.get('/info', (req, res) => res.json({ open: isOpen(), title: C.DIAG_TITLE, courses: C.DIAG_COURSES, directions: C.DIRECTIONS }));

  r.post('/start', (req, res) => {
    if (limit('dstart:' + req.ip, 80, 15 * 60e3)) return res.status(429).json({ error: 'Too many attempts. Wait a few minutes.' });
    if (!isOpen()) return res.status(403).json({ error: 'This activity is closed right now. Ask your teacher.' });
    const name = cleanName(req.body.name), course = req.body.course, block = cleanBlock(req.body.block);
    if (name.length < 2 || !name.includes(' ')) return res.status(400).json({ error: 'Please enter your first and last name.' });
    if (!C.DIAG_COURSES.includes(course)) return res.status(400).json({ error: 'Choose your course.' });
    if (!block) return res.status(400).json({ error: 'Enter your class block.' });
    const id = uid(), t = now();
    run('INSERT INTO diag_attempts (id, diag_id, display_name, name_key, course, block, started_at, last_activity_at) VALUES (?,?,?,?,?,?,?,?)',
      id, C.DIAG_ID, name, nameKey(name), course, block, t, t);
    const token = crypto.randomBytes(32).toString('base64url');
    run('INSERT INTO diag_sessions (token_hash, attempt_id, expires_at) VALUES (?,?,?)', hmac('d:' + token), id, new Date(Date.now() + 12 * 3600e3).toISOString());
    setCookie(res, 'aw_d', token, 12);
    res.json({ ok: true });
  });

  r.post('/logout', (req, res) => {
    const token = parseCookies(req).aw_d; if (token) run('DELETE FROM diag_sessions WHERE token_hash=?', hmac('d:' + token));
    clearCookie(res, 'aw_d'); res.json({ ok: true });
  });

  r.get('/me', requireAttempt, (req, res) => res.json({ ...view(req.attempt), content: C.publicContent(req.attempt.course) }));

  r.post('/supports', requireAttempt, (req, res) => {
    const key = str(req.body.key, 40);
    if (!['context-starters', 'sequence-starters', 'story'].includes(key)) return res.status(400).json({ error: 'Unknown support.' });
    const s = JSON.parse(req.attempt.supports_json);
    s[key] = { firstOpenedAt: s[key]?.firstOpenedAt || now(), count: (s[key]?.count || 0) + 1 };
    run('UPDATE diag_attempts SET supports_json=?, last_activity_at=? WHERE id=?', JSON.stringify(s), now(), req.attempt.id);
    res.json({ ok: true });
  });

  const sectionKey = req => (SECTION_KEYS.includes(req.params.key) ? req.params.key : null);

  // First attempt: saved before feedback is returned. A repeat call returns the original (idempotent).
  r.post('/section/:key', requireAttempt, (req, res) => {
    const key = sectionKey(req); if (!key) return res.status(404).json({ error: 'Not found' });
    const a = req.attempt;
    const existing = firstOf(a.id, key);
    if (existing) return res.json({ ok: true, alreadySaved: true, savedAt: existing.saved_at, feedback: feedbackFor(key, a.course, parse(existing.data_json), parse(existing.result_json)) });
    const out = evaluate(key, a.course, req.body.data, JSON.parse(a.supports_json));
    if (out.error) return res.status(400).json({ error: out.error });
    const t = now();
    try {
      run("INSERT INTO diag_entries (id, attempt_id, section, kind, data_json, result_json, saved_at) VALUES (?,?,?,'first',?,?,?)",
        uid(), a.id, key, JSON.stringify(out.data), out.result ? JSON.stringify(out.result) : null, t);
    } catch {
      const e = firstOf(a.id, key); // a simultaneous double-submit
      if (e) return res.json({ ok: true, alreadySaved: true, savedAt: e.saved_at, feedback: feedbackFor(key, a.course, parse(e.data_json), parse(e.result_json)) });
      return res.status(500).json({ error: 'Could not save. Try again.' });
    }
    const done = one("SELECT COUNT(*) n FROM diag_entries WHERE attempt_id=? AND kind='first'", a.id).n;
    run('UPDATE diag_attempts SET last_activity_at=?, completed_at=COALESCE(completed_at, ?) WHERE id=?', t, done >= SECTION_KEYS.length ? t : null, a.id);
    res.json({ ok: true, savedAt: t, feedback: out.feedback, completed: done >= SECTION_KEYS.length });
  });

  // Practice retries: stored separately, never replace the first attempt.
  r.post('/section/:key/retry', requireAttempt, (req, res) => {
    const key = sectionKey(req);
    if (!['context', 'past', 'sequence'].includes(key)) return res.status(404).json({ error: 'Not found' });
    if (!firstOf(req.attempt.id, key)) return res.status(400).json({ error: 'Submit your first try before practicing again.' });
    if (one("SELECT COUNT(*) n FROM diag_entries WHERE attempt_id=? AND section=? AND kind='retry'", req.attempt.id, key).n >= 10) return res.status(400).json({ error: 'That’s plenty of practice for this part!' });
    const out = evaluate(key, req.attempt.course, req.body.data, {});
    if (out.error) return res.status(400).json({ error: out.error });
    const t = now();
    run("INSERT INTO diag_entries (id, attempt_id, section, kind, data_json, result_json, saved_at) VALUES (?,?,?,'retry',?,?,?)",
      uid(), req.attempt.id, key, JSON.stringify(out.data), JSON.stringify(out.result), t);
    touch(req.attempt.id);
    res.json({ ok: true, savedAt: t, feedback: out.feedback });
  });

  // Follow-ups after feedback (Part 3 sentences, Part 5 extension) and the optional story revision.
  r.post('/section/:key/followup', requireAttempt, (req, res) => {
    const key = sectionKey(req); if (!key) return res.status(404).json({ error: 'Not found' });
    const a = req.attempt;
    if (!firstOf(a.id, key)) return res.status(400).json({ error: 'Submit this part first.' });
    const prev = one("SELECT * FROM diag_entries WHERE attempt_id=? AND section=? AND kind IN ('followup','revision')", a.id, key);
    if (prev) return res.json({ ok: true, alreadySaved: true, savedAt: prev.saved_at });
    let out, kind = 'followup';
    if (key === 'story') {
      kind = 'revision';
      const text = str(req.body.data?.text, 20000);
      if (!text.trim()) return res.status(400).json({ error: 'Your revision is empty.' });
      out = { data: { text, words: (text.trim().match(/\S+/g) || []).length } };
    } else out = followup(key, a.course, req.body.data, JSON.parse(a.supports_json));
    if (out.error) return res.status(400).json({ error: out.error });
    const t = now();
    run('INSERT INTO diag_entries (id, attempt_id, section, kind, data_json, saved_at) VALUES (?,?,?,?,?,?)', uid(), a.id, key, kind, JSON.stringify(out.data), t);
    touch(a.id);
    res.json({ ok: true, savedAt: t });
  });

  app.use('/api/diag', r);

  // ---------- teacher ----------
  const t = express.Router();
  t.use(requireTeacher);

  function summarize(a, es) {
    const first = k => { const e = es.find(x => x.section === k && x.kind === 'first'); return e ? { data: parse(e.data_json), result: parse(e.result_json), savedAt: e.saved_at } : null; };
    const fu = k => { const e = es.find(x => x.section === k && (x.kind === 'followup' || x.kind === 'revision')); return e ? parse(e.data_json) : null; };
    const retries = k => es.filter(x => x.section === k && x.kind === 'retry').map(x => parse(x.result_json));
    const sup = JSON.parse(a.supports_json);
    const done = SECTION_KEYS.filter(k => first(k));
    const conf = first('confidence'), ctx = first('context'), past = first('past'), seq = first('sequence'), story = first('story'), refl = first('reflection'), bg = first('background');
    const confCounts = conf ? Object.values(conf.data.ratings).reduce((m, v) => (m[v]++, m), { use: 0, recognize: 0, new: 0 }) : null;
    const lastRetry = k => retries(k).at(-1);
    return {
      id: a.id, name: a.display_name, course: a.course, block: a.block, startedAt: a.started_at, lastActivityAt: a.last_activity_at, completedAt: a.completed_at,
      status: a.completed_at ? 'complete' : done.length ? 'in_progress' : 'started', sectionsDone: done.length, sectionsTotal: SECTION_KEYS.length,
      backgroundDone: !!bg,
      confidence: confCounts,
      context: ctx ? { correct: ctx.result.correct, notSure: ctx.result.notSure, total: ctx.result.total, retries: retries('context').length, bestRetry: lastRetry('context')?.correct ?? null } : null,
      contextSentences: !!fu('context'),
      past: past ? { correct: past.result.correct, notSure: past.result.notSure, total: past.result.total, retries: retries('past').length, bestRetry: lastRetry('past')?.correct ?? null } : null,
      sequence: seq ? { orderCorrect: seq.result.orderCorrect, positionsCorrect: seq.result.positionsCorrect, questionsCorrect: seq.result.questionsCorrect, retries: retries('sequence').length } : null,
      sequenceExtension: !!fu('sequence'),
      story: story ? { words: story.data.words, supportsOpened: !!sup.story, revised: !!fu('story') } : null,
      supports: { contextStarters: !!sup['context-starters'], sequenceStarters: !!sup['sequence-starters'], story: !!sup.story },
      reflection: refl ? refl.data : null
    };
  }

  function rows(q) {
    const atts = all('SELECT * FROM diag_attempts ORDER BY course, block, display_name');
    const es = all('SELECT * FROM diag_entries');
    const by = {}; es.forEach(e => (by[e.attempt_id] ||= []).push(e));
    return atts.map(a => summarize(a, by[a.id] || [])).filter(s =>
      (!q.course || s.course === q.course) && (!q.block || s.block === q.block) &&
      (!q.status || (q.status === 'complete' ? s.status === 'complete' : s.status !== 'complete')) &&
      (!q.student || nameKey(s.name).includes(nameKey(q.student))));
  }

  t.get('/status', (req, res) => res.json({ open: isOpen(), title: C.DIAG_TITLE, courses: C.DIAG_COURSES,
    blocks: all('SELECT DISTINCT block FROM diag_attempts ORDER BY block').map(x => x.block) }));
  t.post('/open', (req, res) => {
    run("INSERT INTO settings (key, value) VALUES ('diag_open', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", req.body.open ? '1' : '0');
    res.json({ open: isOpen() });
  });
  t.get('/rows', (req, res) => res.json(rows(req.query)));

  function detail(id) {
    const a = one('SELECT * FROM diag_attempts WHERE id=?', id); if (!a) return null;
    const es = entries(a.id);
    const v = view(a);
    return { ...v, summary: summarize(a, es), content: teacherContent(a.course) };
  }
  // Teacher view needs the questions with answers.
  const teacherContent = course => ({
    background: C.BACKGROUND, levels: C.CONFIDENCE_LEVELS, expressions: C.expressionsFor(course),
    context: C.contextFor(course), past: C.PAST, sentences: C.STORY_SENTENCES, seqQuestions: C.SEQ_QUESTIONS,
    storyPrompt: C.STORY_PROMPT[course].prompt, extension: C.SEQ_EXTENSION[course].task
  });
  t.get('/detail/:id', (req, res) => { const d = detail(req.params.id); d ? res.json(d) : res.status(404).json({ error: 'Not found' }); });
  t.delete('/attempts/:id', (req, res) => {
    if (req.body?.confirm !== 'DELETE') return res.status(400).json({ error: 'Confirmation required.' });
    run('DELETE FROM diag_attempts WHERE id=?', req.params.id); res.json({ ok: true });
  });

  const csvCell = v => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const frac = (o, k = 'correct') => o ? `${o[k]}/${o.total}` : '';
  t.get('/export.csv', (req, res) => {
    const exprIds = C.EXPRESSIONS;
    const head = ['Student', 'Course', 'Block', 'Status', 'Parts done', 'Started', 'Completed',
      ...C.BACKGROUND.map(b => `PR background: ${b.id}`),
      'Confidence: can use', 'Confidence: recognize', 'Confidence: new', ...exprIds.map(x => `Confidence: ${x.es}`),
      'Vocab in context (1st try)', 'Vocab in context: not sure', 'Vocab in context: retries', 'Vocab in context: last retry', 'Vocab sentences',
      'Past meaning (1st try)', 'Past meaning: not sure', 'Past meaning: retries', 'Past meaning: last retry',
      'Story order correct (1st try)', 'Story order: positions correct', 'Story questions (1st try)', 'Story extension',
      'Own story (original)', 'Own story words', 'Story supports opened', 'Own story revision', 'Context starters opened', 'Sequence starters opened',
      'Reflection: strongest', 'Reflection: help with', 'Reflection: expressions'];
    const lines = [head.map(csvCell).join(',')];
    for (const s of rows(req.query)) {
      const d = detail(s.id), sec = d.sections;
      const levelLabel = id => C.CONFIDENCE_LEVELS.find(l => l.id === id)?.label || '';
      lines.push([s.name, s.course, s.block, s.status, `${s.sectionsDone}/${s.sectionsTotal}`, s.startedAt, s.completedAt,
        ...C.BACKGROUND.map(b => sec.background?.data.answers[b.id] || ''),
        s.confidence?.use ?? '', s.confidence?.recognize ?? '', s.confidence?.new ?? '', ...exprIds.map(x => levelLabel(sec.confidence?.data.ratings[x.id])),
        frac(s.context), s.context?.notSure ?? '', s.context?.retries ?? '', s.context?.bestRetry ?? '',
        (sec.context?.followup?.data.sentences || []).map(x => `${x.expression}: ${x.text}`).join(' | '),
        frac(s.past), s.past?.notSure ?? '', s.past?.retries ?? '', s.past?.bestRetry ?? '',
        s.sequence ? (s.sequence.orderCorrect ? 'yes' : 'no') : '', s.sequence ? `${s.sequence.positionsCorrect}/4` : '', s.sequence ? `${s.sequence.questionsCorrect}/3` : '',
        sec.sequence?.followup?.data.text || '',
        sec.story?.data.text || '', s.story?.words ?? '', s.story ? (s.supports.story ? 'yes' : 'no') : '', sec.story?.followup?.data.text || '',
        s.supports.contextStarters ? 'yes' : 'no', s.supports.sequenceStarters ? 'yes' : 'no',
        s.reflection?.strength || '', s.reflection?.help || '', (s.reflection?.expressions || []).join('; ')].map(csvCell).join(','));
    }
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="antes-de-empezar-${new Date().toISOString().slice(0, 10)}.csv"` });
    res.send('﻿' + lines.join('\r\n'));
  });

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plain = s => String(s).replace(/\*\*/g, '');
  function detailHtml(d) {
    const s = d.summary, sec = d.sections, c = d.content;
    const choice = (items, sx) => sx ? `<ol>${items.map(q => { const it = sx.feedback.items.find(i => i.id === q.id); return `<li>${esc(plain(q.sentence))}${q.q ? ` — <i>${esc(q.q)}</i>` : ''}<br>Chose: <b>${esc(it.chosenText || '—')}</b> ${it.correct ? '✓' : it.notSure ? '(not sure yet)' : `✗ (meaning: ${esc(it.answer)})`}</li>`; }).join('')}</ol>` : '<p class="m">Not done.</p>';
    return `<section><h1>${esc(s.name)}</h1><p class="m">${esc(s.course)} · Block ${esc(s.block)} · ${s.status === 'complete' ? 'Complete' : `${s.sectionsDone} of ${s.sectionsTotal} parts`} · started ${esc(s.startedAt)}</p>
      <h2>1. ¿Qué sabes de Puerto Rico?</h2>${sec.background ? c.background.map(b => `<p><b>${esc(b.q)}</b><br>${esc(sec.background.data.answers[b.id] || '—')}</p>`).join('') : '<p class="m">Not done.</p>'}
      <h2>2. Vocabulary confidence</h2>${sec.confidence ? `<ul>${c.expressions.map(x => `<li>${esc(x.es)}: ${esc(c.levels.find(l => l.id === sec.confidence.data.ratings[x.id])?.label)}</li>`).join('')}</ul>` : '<p class="m">Not done.</p>'}
      <h2>3. Vocabulary in context — first try ${s.context ? `${s.context.correct}/${s.context.total}` : ''}</h2>${choice(c.context, sec.context)}
      ${s.context?.retries ? `<p class="m">Practice retries: ${s.context.retries} (last: ${s.context.bestRetry}/${s.context.total})</p>` : ''}
      ${sec.context?.followup ? `<p><b>Sentences${sec.context.followup.data.startersOpened ? ' (opened starters)' : ''}:</b></p><ul>${sec.context.followup.data.sentences.map(x => `<li><i>${esc(x.expression)}</i> — ${esc(x.text)}</li>`).join('')}</ul>` : ''}
      <h2>4. Understand the past — first try ${s.past ? `${s.past.correct}/${s.past.total}` : ''}</h2>${choice(c.past, sec.past)}
      ${s.past?.retries ? `<p class="m">Practice retries: ${s.past.retries} (last: ${s.past.bestRetry}/${s.past.total})</p>` : ''}
      <h2>5. Build a story</h2>${sec.sequence ? `<p>First-try order: ${sec.sequence.data.order.map(id => esc(c.sentences.find(x => x.id === id).text)).join(' → ')} ${s.sequence.orderCorrect ? '✓' : '✗'}</p>
        <p>Questions: ${s.sequence.questionsCorrect}/3</p>${sec.sequence.followup ? `<p><b>Added${sec.sequence.followup.data.startersOpened ? ' (opened starters)' : ''}:</b> ${esc(sec.sequence.followup.data.text)}</p>` : ''}` : '<p class="m">Not done.</p>'}
      <h2>6. Tell your own story</h2><p class="m">${esc(c.storyPrompt)}</p>${sec.story ? `<h3>Original (independent${s.supports.story ? ', opened optional supports' : ''}) · ${s.story.words} words</h3><pre>${esc(sec.story.data.text)}</pre>
        ${sec.story.followup ? `<h3>Revision after checklist and model</h3><pre>${esc(sec.story.followup.data.text)}</pre>` : ''}` : '<p class="m">Not done.</p>'}
      <h2>Final reflection</h2>${s.reflection ? `<p>Strongest: <b>${esc(s.reflection.strength)}</b></p><p>Wants help with: ${esc(s.reflection.help)}</p><p>Expressions to learn: ${esc(s.reflection.expressions.join(', '))}</p>` : '<p class="m">Not done.</p>'}
    </section>`;
  }
  const page = body => `<!doctype html><html><head><meta charset="utf-8"><title>Antes de empezar</title><style>
    body{font-family:Georgia,serif;max-width:760px;margin:2rem auto;padding:0 1rem;color:#2b2a24}h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:1.4rem;border-top:1px solid #ddd;padding-top:.8rem}h3{font-size:1rem}
    pre{white-space:pre-wrap;font-family:inherit;background:#f2f8f6;padding:.8rem;border-radius:6px}.m{color:#777;font-size:.85rem}section{page-break-after:always}li{margin-bottom:.35rem}</style></head><body>${body}</body></html>`;
  t.get('/download', (req, res) => {
    const ids = req.query.id ? [req.query.id] : rows(req.query).map(r => r.id);
    const body = ids.map(detail).filter(Boolean).map(detailHtml).join('');
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="antes-de-empezar-${new Date().toISOString().slice(0, 10)}.html"` });
    res.send(page(body || '<p>No work matches these filters.</p>'));
  });

  app.use('/api/teacher/diag', t);
}
