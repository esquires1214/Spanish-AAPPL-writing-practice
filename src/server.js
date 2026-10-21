import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { PROMPTS, CLASSES, DIRECTIONS, COURSE_TARGETS, LABEL, promptAsText } from './content.js';
import { categoryLabel, RUBRIC_VERSION } from './rubric.js';
import * as ev from './evaluator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(opts = {}) {
  const db = openDb(opts.dbFile || process.env.DB_FILE || path.join(__dirname, '..', 'data', 'writing.db'));
  const SECRET = opts.secret || process.env.APP_SECRET;
  const TEACHER_PASSWORD = opts.teacherPassword ?? process.env.TEACHER_PASSWORD;
  if (!SECRET || SECRET.length < 24) throw new Error('APP_SECRET must be set (at least 24 characters).');
  if (!TEACHER_PASSWORD || TEACHER_PASSWORD.length < 10) throw new Error('TEACHER_PASSWORD must be set (at least 10 characters).');
  const SECURE_COOKIES = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1';
  const MAX_TEXT = 20000;
  const MAX_REVISIONS = 3;

  const now = () => new Date().toISOString();
  const uid = () => crypto.randomUUID();
  const hmac = s => crypto.createHmac('sha256', SECRET).update(String(s)).digest('hex');
  const nameKey = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const cleanName = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '200kb' }));
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" });
    next();
  });

  // ---------- cookies & sessions ----------
  const parseCookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  const setCookie = (res, name, value, hours) => res.append('Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.round(hours * 3600)}${SECURE_COOKIES ? '; Secure' : ''}`);
  const clearCookie = (res, name) => res.append('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${SECURE_COOKIES ? '; Secure' : ''}`);
  function newSession(res, role, hours, studentId = null, assignmentId = null) {
    const token = crypto.randomBytes(32).toString('base64url');
    run('INSERT INTO sessions (token_hash, role, student_id, assignment_id, expires_at) VALUES (?,?,?,?,?)',
      hmac(token), role, studentId, assignmentId, new Date(Date.now() + hours * 3600e3).toISOString());
    setCookie(res, role === 'teacher' ? 'aw_t' : 'aw_s', token, hours);
  }
  function getSession(req, role) {
    const token = parseCookies(req)[role === 'teacher' ? 'aw_t' : 'aw_s'];
    if (!token) return null;
    const s = one('SELECT * FROM sessions WHERE token_hash=? AND role=?', hmac(token), role);
    if (!s || s.expires_at < now()) return null;
    return s;
  }

  // State-changing API calls must come from our own scripts (CSRF defense with SameSite cookies).
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && req.get('X-Requested-With') !== 'fetch') return res.status(403).json({ error: 'Bad request origin' });
    next();
  });

  // Simple in-memory rate limiter
  const hits = new Map();
  const limit = (key, max, windowMs) => {
    const t = Date.now(); const arr = (hits.get(key) || []).filter(x => t - x < windowMs);
    arr.push(t); hits.set(key, arr); return arr.length > max;
  };

  const requireStudent = (req, res, next) => {
    const s = getSession(req, 'student');
    if (!s) return res.status(401).json({ error: 'Please sign in again.' });
    const student = one('SELECT * FROM students WHERE id=?', s.student_id);
    const assignment = one('SELECT * FROM assignments WHERE id=?', s.assignment_id);
    if (!student || !assignment) return res.status(401).json({ error: 'Please sign in again.' });
    req.student = student; req.assignment = assignment; next();
  };
  const requireTeacher = (req, res, next) => {
    if (!getSession(req, 'teacher')) return res.status(401).json({ error: 'Teacher sign-in required.' });
    next();
  };

  // ---------- helpers ----------
  const RETURN_WORDS = ['MANZANA', 'PERA', 'UVA', 'FRESA', 'MANGO', 'CEREZA', 'KIWI', 'COCO', 'LIMON', 'MELON', 'NARANJA', 'BANANA'];
  const newReturnCode = () => `${RETURN_WORDS[crypto.randomInt(RETURN_WORDS.length)]}-${crypto.randomInt(1000, 10000)}`;
  const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const newClassCode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (;;) { let c = ''; for (let i = 0; i < 6; i++) c += alphabet[crypto.randomInt(alphabet.length)]; if (!one('SELECT 1 FROM assignments WHERE class_code=?', c)) return c; }
  };
  const evalFor = (kind, col, id) => one(`SELECT * FROM evaluations WHERE kind=? AND ${col}=?`, kind, id);
  const publicEval = e => e ? {
    status: e.status, attempts: e.attempts, error: e.status === 'failed' ? 'Feedback could not be generated yet.' : null,
    result: e.status === 'ready' ? JSON.parse(e.result_json) : null,
    rubricVersion: e.rubric_version, evaluatorVersion: e.evaluator_version, completedAt: e.completed_at
  } : null;

  function responseStatus(r, initialEval) {
    if (!r) return 'not_started';
    if (!r.initial_text) return r.draft_text.trim() ? 'draft_saved' : 'not_started';
    if (one('SELECT 1 FROM revisions WHERE response_id=? AND submitted_text IS NOT NULL', r.id)) return 'revised';
    return initialEval?.status === 'ready' ? 'feedback_ready' : 'submitted';
  }

  function responseView(r) {
    const initialEval = r ? evalFor('initial', 'response_id', r.id) : null;
    const revisions = r ? all('SELECT * FROM revisions WHERE response_id=? ORDER BY number', r.id).map(v => ({
      id: v.id, number: v.number, focus: v.focus, draftText: v.draft_text, draftClientTs: v.draft_client_ts, startedAt: v.started_at, lastSavedAt: v.last_saved_at,
      submittedText: v.submitted_text, submittedAt: v.submitted_at, reflectionChange: v.reflection_change, reflectionReader: v.reflection_reader,
      evaluation: publicEval(evalFor('revision', 'revision_id', v.id))
    })) : [];
    return {
      status: responseStatus(r, initialEval),
      draftText: r?.draft_text || '', draftClientTs: r?.draft_client_ts || 0,
      startedAt: r?.started_at || null, lastSavedAt: r?.last_saved_at || null,
      initialText: r?.initial_text ?? null, submittedAt: r?.submitted_at || null,
      evaluation: publicEval(initialEval), revisions
    };
  }

  // ---------- evaluation queue ----------
  const running = new Set();
  async function processEval(id) {
    if (running.has(id)) return;
    const e = one('SELECT * FROM evaluations WHERE id=?', id);
    if (!e || e.status === 'ready') return;
    running.add(id);
    run("UPDATE evaluations SET status='pending', attempts=attempts+1 WHERE id=?", id);
    try {
      let result, estimate;
      if (e.kind === 'initial') {
        const r = one('SELECT * FROM responses WHERE id=?', e.response_id);
        const a = one('SELECT * FROM assignments WHERE id=?', r.assignment_id);
        const p = PROMPTS[r.prompt_no - 1];
        const rating = await cachedRate(p, r.initial_text);
        estimate = ev.deriveEstimate(rating);
        const coaching = await ev.coach({ promptText: promptAsText(p), text: r.initial_text, rating, estimate, cls: a.class_name });
        result = { rating, estimate, coaching, courseTarget: COURSE_TARGETS[a.class_name].target };
      } else if (e.kind === 'revision') {
        const v = one('SELECT * FROM revisions WHERE id=?', e.revision_id);
        const r = one('SELECT * FROM responses WHERE id=?', v.response_id);
        const p = PROMPTS[r.prompt_no - 1];
        const prev = v.number > 1 ? one('SELECT submitted_text FROM revisions WHERE response_id=? AND number=?', r.id, v.number - 1)?.submitted_text : null;
        const rating = await cachedRate(p, v.submitted_text);
        estimate = ev.deriveEstimate(rating);
        const comparison = await ev.compareRevision({ promptText: promptAsText(p), initial: prev || r.initial_text, revised: v.submitted_text, focus: v.focus });
        result = { rating, estimate, comparison, supported: true };
      } else {
        const rows = all('SELECT r.*, e.estimate_label FROM responses r JOIN evaluations e ON e.response_id=r.id AND e.kind=\'initial\' WHERE r.student_id=? AND r.assignment_id=? ORDER BY r.prompt_no', e.student_id, e.assignment_id);
        const tasks = rows.map(r => ({ no: r.prompt_no, promptText: promptAsText(PROMPTS[r.prompt_no - 1]), text: r.initial_text, estimate: r.estimate_label }));
        const o = await ev.overall({ tasks });
        estimate = ev.deriveEstimate(o);
        result = { overall: o, estimate };
      }
      run("UPDATE evaluations SET status='ready', result_json=?, estimate_code=?, estimate_label=?, last_error=NULL, model=?, completed_at=? WHERE id=?",
        JSON.stringify(result), estimate?.code ?? 'INSUFFICIENT', estimate?.label ?? '', ev.modelName(), now(), id);
      if (e.kind === 'initial') maybeQueueOverall(e.response_id);
    } catch (err) {
      run("UPDATE evaluations SET status='failed', last_error=? WHERE id=?", String(err.message || err).slice(0, 500), id);
    } finally { running.delete(id); }
  }

  async function cachedRate(p, text) {
    const hash = ev.textHash(RUBRIC_VERSION, ev.EVALUATOR_VERSION, ev.modelName(), String(p.no), text.normalize('NFC'));
    const hit = one('SELECT rating_json FROM rating_cache WHERE hash=?', hash);
    if (hit) return JSON.parse(hit.rating_json);
    const rating = await ev.rate({ promptText: promptAsText(p), text });
    run('INSERT OR IGNORE INTO rating_cache (hash, rating_json, created_at) VALUES (?,?,?)', hash, JSON.stringify(rating), now());
    return rating;
  }

  function newEval(kind, refs) {
    const id = uid();
    run(`INSERT OR IGNORE INTO evaluations (id, kind, response_id, revision_id, student_id, assignment_id, status, rubric_version, evaluator_version, created_at)
         VALUES (?,?,?,?,?,?,'pending',?,?,?)`, id, kind, refs.response_id || null, refs.revision_id || null, refs.student_id || null, refs.assignment_id || null,
      RUBRIC_VERSION, ev.EVALUATOR_VERSION, now());
    const row = kind === 'overall' ? one("SELECT id FROM evaluations WHERE kind='overall' AND student_id=? AND assignment_id=?", refs.student_id, refs.assignment_id)
      : kind === 'initial' ? one("SELECT id FROM evaluations WHERE kind='initial' AND response_id=?", refs.response_id)
        : one("SELECT id FROM evaluations WHERE kind='revision' AND revision_id=?", refs.revision_id);
    return row.id;
  }

  function maybeQueueOverall(responseId) {
    const r = one('SELECT student_id, assignment_id FROM responses WHERE id=?', responseId);
    const ready = one(`SELECT COUNT(*) n FROM responses r JOIN evaluations e ON e.response_id=r.id AND e.kind='initial' AND e.status='ready'
                       WHERE r.student_id=? AND r.assignment_id=?`, r.student_id, r.assignment_id).n;
    if (ready === 3) { const id = newEval('overall', r); processEval(id); }
  }

  // Recovery sweep: retry failed evaluations a few times, and pick up anything interrupted by a restart.
  const sweep = () => {
    if (!ev.aiConfigured()) return;
    const stale = new Date(Date.now() - 3 * 60e3).toISOString();
    for (const e of all("SELECT id FROM evaluations WHERE (status='failed' AND attempts < 4) OR (status='pending' AND created_at < ?) LIMIT 20", stale)) processEval(e.id);
  };
  const sweepTimer = opts.noSweep ? null : setInterval(sweep, 2 * 60e3);
  if (sweepTimer) sweepTimer.unref();

  // ---------- public config ----------
  app.get('/api/config', (req, res) => res.json({ classes: CLASSES, label: LABEL }));

  // ---------- student auth ----------
  function findAssignment(className, classCode) {
    const a = one('SELECT * FROM assignments WHERE class_code=?', normCode(classCode));
    if (!a || a.class_name !== className) return { error: 'That class code does not match the class you chose. Check with your teacher.' };
    if (!a.is_open) return { error: 'This activity is closed right now. Ask your teacher.' };
    return { a };
  }

  app.post('/api/student/start', (req, res) => {
    if (limit('start:' + req.ip, 60, 15 * 60e3)) return res.status(429).json({ error: 'Too many attempts. Wait a few minutes.' });
    const name = cleanName(req.body.name), className = req.body.className;
    if (name.length < 2) return res.status(400).json({ error: 'Please enter your first and last name.' });
    if (!CLASSES.includes(className)) return res.status(400).json({ error: 'Choose your class.' });
    const { a, error } = findAssignment(className, req.body.classCode);
    if (error) return res.status(400).json({ error });
    const code = newReturnCode(), id = uid();
    run('INSERT INTO students (id, display_name, name_key, class_name, return_code_hash, created_at) VALUES (?,?,?,?,?,?)', id, name, nameKey(name), className, hmac(normCode(code)), now());
    newSession(res, 'student', 10, id, a.id);
    const sameName = one('SELECT COUNT(*) n FROM students WHERE name_key=? AND class_name=?', nameKey(name), className).n > 1;
    res.json({ ok: true, returnCode: code, sameNameNotice: sameName });
  });

  app.post('/api/student/return', (req, res) => {
    if (limit('return:' + req.ip, 30, 15 * 60e3)) return res.status(429).json({ error: 'Too many attempts. Wait a few minutes or ask your teacher.' });
    const name = cleanName(req.body.name), className = req.body.className;
    if (!CLASSES.includes(className)) return res.status(400).json({ error: 'Choose your class.' });
    const { a, error } = findAssignment(className, req.body.classCode);
    if (error) return res.status(400).json({ error });
    const h = hmac(normCode(req.body.returnCode));
    const s = one('SELECT * FROM students WHERE name_key=? AND class_name=? AND return_code_hash=?', nameKey(name), className, h);
    if (!s) return res.status(400).json({ error: 'We could not find your work with that name and return code. Check the spelling, or ask your teacher to look up your code.' });
    newSession(res, 'student', 10, s.id, a.id);
    res.json({ ok: true });
  });

  app.post('/api/student/logout', (req, res) => {
    const token = parseCookies(req).aw_s; if (token) run('DELETE FROM sessions WHERE token_hash=?', hmac(token));
    clearCookie(res, 'aw_s'); res.json({ ok: true });
  });

  // ---------- student work (every query is scoped to req.student) ----------
  const getResponse = (req, no) => one('SELECT * FROM responses WHERE student_id=? AND assignment_id=? AND prompt_no=?', req.student.id, req.assignment.id, no);
  const promptNo = req => { const n = Number(req.params.no); return [1, 2, 3].includes(n) ? n : null; };

  app.get('/api/student/me', requireStudent, (req, res) => {
    const prompts = PROMPTS.map(p => ({ no: p.no, title: p.title, status: responseView(getResponse(req, p.no)).status }));
    const ov = one("SELECT * FROM evaluations WHERE kind='overall' AND student_id=? AND assignment_id=?", req.student.id, req.assignment.id);
    res.json({
      student: { id: req.student.id, name: req.student.display_name, className: req.student.class_name },
      assignment: { title: req.assignment.title, timerMinutes: req.assignment.timer_minutes, isOpen: !!req.assignment.is_open },
      directions: DIRECTIONS, prompts, overall: publicEval(ov), label: LABEL, courseTarget: COURSE_TARGETS[req.assignment.class_name].target
    });
  });

  app.get('/api/student/prompt/:no', requireStudent, (req, res) => {
    const no = promptNo(req); if (!no) return res.status(404).json({ error: 'Not found' });
    res.json({ prompt: PROMPTS[no - 1], ...responseView(getResponse(req, no)) });
  });

  const textOk = t => typeof t === 'string' && t.length <= MAX_TEXT;

  app.put('/api/student/prompt/:no/draft', requireStudent, (req, res) => {
    const no = promptNo(req); if (!no) return res.status(404).json({ error: 'Not found' });
    const { text, clientTs } = req.body;
    if (!textOk(text)) return res.status(400).json({ error: 'Text is too long.' });
    if (!req.assignment.is_open) return res.status(403).json({ error: 'This activity is closed.' });
    const ts = Number(clientTs) || Date.now();
    const out = tx(() => {
      let r = getResponse(req, no);
      if (r?.initial_text != null) return { locked: true };
      if (!r) {
        run('INSERT INTO responses (id, student_id, assignment_id, prompt_no, started_at) VALUES (?,?,?,?,?)', uid(), req.student.id, req.assignment.id, no, now());
        r = getResponse(req, no);
      }
      if (ts < r.draft_client_ts) return { stale: true, savedAt: r.last_saved_at }; // an older autosave arriving late
      const t = now();
      run('UPDATE responses SET draft_text=?, draft_client_ts=?, last_saved_at=? WHERE id=?', text, ts, t, r.id);
      return { savedAt: t };
    });
    if (out.locked) return res.status(409).json({ error: 'This response was already submitted.' });
    res.json({ ok: true, ...out });
  });

  app.post('/api/student/prompt/:no/submit', requireStudent, (req, res) => {
    const no = promptNo(req); if (!no) return res.status(404).json({ error: 'Not found' });
    const { text } = req.body;
    if (!textOk(text)) return res.status(400).json({ error: 'Text is too long.' });
    if (!text.trim()) return res.status(400).json({ error: 'Write something in Spanish before submitting.' });
    if (!req.assignment.is_open) return res.status(403).json({ error: 'This activity is closed.' });
    // Save first, then request feedback. Idempotent: a repeat submit returns the original receipt.
    const out = tx(() => {
      let r = getResponse(req, no);
      if (r?.initial_text != null) return { already: true, r };
      const t = now();
      if (!r) { run('INSERT INTO responses (id, student_id, assignment_id, prompt_no, started_at) VALUES (?,?,?,?,?)', uid(), req.student.id, req.assignment.id, no, t); r = getResponse(req, no); }
      run('UPDATE responses SET draft_text=?, last_saved_at=?, initial_text=?, initial_word_count=?, submitted_at=? WHERE id=?', text, t, text, ev.wordCount(text), t, r.id);
      return { already: false, r: getResponse(req, no) };
    });
    const evalId = newEval('initial', { response_id: out.r.id });
    if (!out.already) processEval(evalId);
    res.json({ ok: true, alreadySubmitted: out.already, receivedAt: out.r.submitted_at, wordCount: out.r.initial_word_count });
  });

  app.post('/api/student/prompt/:no/retry', requireStudent, (req, res) => {
    const r = getResponse(req, promptNo(req));
    if (!r?.initial_text) return res.status(404).json({ error: 'Not submitted yet.' });
    if (limit('retry:' + req.student.id, 20, 60 * 60e3)) return res.status(429).json({ error: 'Please wait before retrying again.' });
    const e = evalFor('initial', 'response_id', r.id);
    const id = e ? e.id : newEval('initial', { response_id: r.id });
    if (!e || e.status !== 'ready') processEval(id);
    res.json({ ok: true });
  });

  app.post('/api/student/prompt/:no/revisions', requireStudent, (req, res) => {
    const r = getResponse(req, promptNo(req));
    if (!r?.initial_text) return res.status(400).json({ error: 'Submit your first version before revising.' });
    const e = evalFor('initial', 'response_id', r.id);
    if (e?.status !== 'ready') return res.status(400).json({ error: 'Feedback is not ready yet.' });
    const focus = String(req.body.focus || '').trim().slice(0, 120);
    if (!focus) return res.status(400).json({ error: 'Choose one focus for your revision.' });
    const out = tx(() => {
      const open = one('SELECT * FROM revisions WHERE response_id=? AND submitted_text IS NULL', r.id);
      if (open) { run('UPDATE revisions SET focus=? WHERE id=?', focus, open.id); return open.id; }
      const last = one('SELECT * FROM revisions WHERE response_id=? ORDER BY number DESC LIMIT 1', r.id);
      if ((last?.number || 0) >= MAX_REVISIONS) return null;
      const id = uid();
      run('INSERT INTO revisions (id, response_id, number, focus, draft_text, started_at) VALUES (?,?,?,?,?,?)',
        id, r.id, (last?.number || 0) + 1, focus, last?.submitted_text || r.initial_text, now());
      return id;
    });
    if (!out) return res.status(400).json({ error: `You have reached the limit of ${MAX_REVISIONS} revisions for this prompt.` });
    res.json({ ok: true, revisionId: out });
  });

  const ownRevision = (req, id) => one(`SELECT v.*, r.prompt_no FROM revisions v JOIN responses r ON r.id=v.response_id
                                        WHERE v.id=? AND r.student_id=? AND r.assignment_id=?`, id, req.student.id, req.assignment.id);

  app.put('/api/student/revisions/:id/draft', requireStudent, (req, res) => {
    const v = ownRevision(req, req.params.id); if (!v) return res.status(404).json({ error: 'Not found' });
    if (!textOk(req.body.text)) return res.status(400).json({ error: 'Text is too long.' });
    if (v.submitted_text != null) return res.status(409).json({ error: 'This revision was already submitted.' });
    const ts = Number(req.body.clientTs) || Date.now();
    if (ts < v.draft_client_ts) return res.json({ ok: true, stale: true, savedAt: v.last_saved_at });
    const t = now();
    run('UPDATE revisions SET draft_text=?, draft_client_ts=?, last_saved_at=? WHERE id=?', req.body.text, ts, t, v.id);
    res.json({ ok: true, savedAt: t });
  });

  app.post('/api/student/revisions/:id/submit', requireStudent, (req, res) => {
    const v = ownRevision(req, req.params.id); if (!v) return res.status(404).json({ error: 'Not found' });
    const { text } = req.body;
    const change = String(req.body.reflectionChange || '').trim().slice(0, 600), reader = String(req.body.reflectionReader || '').trim().slice(0, 600);
    if (!textOk(text) || !text.trim()) return res.status(400).json({ error: 'Your revision is empty.' });
    if (!change || !reader) return res.status(400).json({ error: 'Please finish both parts of the reflection.' });
    let already = v.submitted_text != null;
    if (!already) {
      const t = now();
      run('UPDATE revisions SET draft_text=?, last_saved_at=?, submitted_text=?, submitted_at=?, reflection_change=?, reflection_reader=? WHERE id=? AND submitted_text IS NULL',
        text, t, text, t, change, reader, v.id);
    }
    const evalId = newEval('revision', { revision_id: v.id });
    if (!already) processEval(evalId);
    res.json({ ok: true, alreadySubmitted: already, receivedAt: one('SELECT submitted_at FROM revisions WHERE id=?', v.id).submitted_at });
  });

  app.post('/api/student/revisions/:id/retry', requireStudent, (req, res) => {
    const v = ownRevision(req, req.params.id); if (!v?.submitted_text) return res.status(404).json({ error: 'Not found' });
    if (limit('retry:' + req.student.id, 20, 60 * 60e3)) return res.status(429).json({ error: 'Please wait before retrying again.' });
    const e = evalFor('revision', 'revision_id', v.id);
    const id = e ? e.id : newEval('revision', { revision_id: v.id });
    if (!e || e.status !== 'ready') processEval(id);
    res.json({ ok: true });
  });

  app.post('/api/student/overall/retry', requireStudent, (req, res) => {
    const e = one("SELECT * FROM evaluations WHERE kind='overall' AND student_id=? AND assignment_id=?", req.student.id, req.assignment.id);
    if (!e) return res.status(404).json({ error: 'Not available yet.' });
    if (e.status !== 'ready') processEval(e.id);
    res.json({ ok: true });
  });

  // ---------- teacher ----------
  const pwHash = crypto.scryptSync(TEACHER_PASSWORD, SECRET, 64);
  app.post('/api/teacher/login', (req, res) => {
    if (limit('tlogin:' + req.ip, 10, 15 * 60e3)) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes.' });
    const given = crypto.scryptSync(String(req.body.password || ''), SECRET, 64);
    if (!crypto.timingSafeEqual(given, pwHash)) return res.status(401).json({ error: 'Incorrect password.' });
    newSession(res, 'teacher', 12);
    res.json({ ok: true });
  });
  app.post('/api/teacher/logout', (req, res) => {
    const token = parseCookies(req).aw_t; if (token) run('DELETE FROM sessions WHERE token_hash=?', hmac(token));
    clearCookie(res, 'aw_t'); res.json({ ok: true });
  });

  const t = express.Router();
  t.use(requireTeacher);

  t.get('/status', (req, res) => {
    const c = one("SELECT SUM(status='pending') pending, SUM(status='failed') failed FROM evaluations");
    res.json({ aiConfigured: ev.aiConfigured(), model: ev.modelName(), rubricVersion: RUBRIC_VERSION, evaluatorVersion: ev.EVALUATOR_VERSION,
      pending: c.pending || 0, failed: c.failed || 0, classes: CLASSES, prompts: PROMPTS.map(p => ({ no: p.no, title: p.title })), label: LABEL });
  });

  // Assignments
  t.get('/assignments', (req, res) => res.json(all(`SELECT a.*, (SELECT COUNT(DISTINCT student_id) FROM responses r WHERE r.assignment_id=a.id) students
                                                    FROM assignments a ORDER BY created_at DESC`)));
  t.post('/assignments', (req, res) => {
    const { className } = req.body;
    if (!CLASSES.includes(className)) return res.status(400).json({ error: 'Choose a class.' });
    const title = cleanName(req.body.title) || 'Presentational Writing Practice';
    const timer = req.body.timerMinutes === null ? null : Math.min(60, Math.max(1, Number(req.body.timerMinutes) || 12));
    const id = uid();
    run('INSERT INTO assignments (id, title, class_name, class_code, is_open, timer_minutes, created_at) VALUES (?,?,?,?,1,?,?)', id, title, className, newClassCode(), timer, now());
    res.json(one('SELECT * FROM assignments WHERE id=?', id));
  });
  t.patch('/assignments/:id', (req, res) => {
    const a = one('SELECT * FROM assignments WHERE id=?', req.params.id); if (!a) return res.status(404).json({ error: 'Not found' });
    const b = req.body;
    if ('isOpen' in b) run('UPDATE assignments SET is_open=? WHERE id=?', b.isOpen ? 1 : 0, a.id);
    if ('timerMinutes' in b) run('UPDATE assignments SET timer_minutes=? WHERE id=?', b.timerMinutes === null ? null : Math.min(60, Math.max(1, Number(b.timerMinutes) || 12)), a.id);
    if ('title' in b && cleanName(b.title)) run('UPDATE assignments SET title=? WHERE id=?', cleanName(b.title), a.id);
    if ('roster' in b) run('UPDATE assignments SET roster=? WHERE id=?', String(b.roster).slice(0, 20000), a.id);
    res.json(one('SELECT * FROM assignments WHERE id=?', a.id));
  });
  t.post('/assignments/:id/new-code', (req, res) => {
    const a = one('SELECT * FROM assignments WHERE id=?', req.params.id); if (!a) return res.status(404).json({ error: 'Not found' });
    run('UPDATE assignments SET class_code=? WHERE id=?', newClassCode(), a.id);
    res.json(one('SELECT * FROM assignments WHERE id=?', a.id));
  });
  // Assign again: a new round with a new code. Earlier rounds keep all their work.
  t.post('/assignments/:id/assign-again', (req, res) => {
    const a = one('SELECT * FROM assignments WHERE id=?', req.params.id); if (!a) return res.status(404).json({ error: 'Not found' });
    const round = one('SELECT MAX(round) m FROM assignments WHERE title=? AND class_name=?', a.title, a.class_name).m + 1;
    const id = uid();
    run('INSERT INTO assignments (id, title, class_name, class_code, is_open, timer_minutes, round, previous_assignment_id, roster, created_at) VALUES (?,?,?,?,1,?,?,?,?,?)',
      id, a.title, a.class_name, newClassCode(), a.timer_minutes, round, a.id, a.roster, now());
    res.json(one('SELECT * FROM assignments WHERE id=?', id));
  });
  t.delete('/assignments/:id', (req, res) => {
    if (req.body?.confirm !== 'DELETE') return res.status(400).json({ error: 'Confirmation required.' });
    run('DELETE FROM assignments WHERE id=?', req.params.id); res.json({ ok: true });
  });

  // Rows for the dashboard (one row per student × prompt, plus roster names with no work).
  function buildRows(q) {
    const assignments = all('SELECT * FROM assignments');
    const aById = Object.fromEntries(assignments.map(a => [a.id, a]));
    const students = all('SELECT id, display_name, name_key, class_name FROM students');
    const sById = Object.fromEntries(students.map(s => [s.id, s]));
    const responses = all('SELECT * FROM responses');
    const evals = all('SELECT * FROM evaluations');
    const evInit = Object.fromEntries(evals.filter(e => e.kind === 'initial').map(e => [e.response_id, e]));
    const evOverall = Object.fromEntries(evals.filter(e => e.kind === 'overall').map(e => [e.student_id + '|' + e.assignment_id, e]));
    const revs = all('SELECT * FROM revisions ORDER BY number');
    const reviews = all('SELECT * FROM teacher_reviews ORDER BY created_at');
    const revByResp = {}; revs.forEach(v => (revByResp[v.response_id] ||= []).push(v));
    const reviewByResp = {}; reviews.filter(r => r.scope === 'response').forEach(r => (reviewByResp[r.response_id] ||= []).push(r));
    const reviewOverall = {}; reviews.filter(r => r.scope === 'overall').forEach(r => (reviewOverall[r.student_id + '|' + r.assignment_id] ||= []).push(r));

    const pairs = new Map(); // student|assignment
    responses.forEach(r => pairs.set(r.student_id + '|' + r.assignment_id, { s: sById[r.student_id], a: aById[r.assignment_id] }));
    const rows = [];
    for (const { s, a } of pairs.values()) {
      if (!s || !a) continue;
      const ov = evOverall[s.id + '|' + a.id];
      const ovReview = (reviewOverall[s.id + '|' + a.id] || []).at(-1);
      for (const p of PROMPTS) {
        const r = responses.find(x => x.student_id === s.id && x.assignment_id === a.id && x.prompt_no === p.no);
        const e = r ? evInit[r.id] : null;
        const rv = r ? (revByResp[r.id] || []) : [];
        const submittedRevs = rv.filter(v => v.submitted_text != null);
        const rvw = r ? (reviewByResp[r.id] || []).at(-1) : null;
        rows.push({
          studentId: s.id, studentName: s.display_name, className: a.class_name, assignmentId: a.id,
          assignment: `${a.title}${a.round > 1 ? ' (round ' + a.round + ')' : ''}`, promptNo: p.no, promptTitle: p.title, responseId: r?.id || null,
          status: responseStatus(r, e), feedback: e ? e.status : null,
          startedAt: r?.started_at || null, lastSavedAt: r?.last_saved_at || null, submittedAt: r?.submitted_at || null,
          estimateCode: e?.status === 'ready' ? e.estimate_code : null, estimateLabel: e?.status === 'ready' ? e.estimate_label : null,
          overallCode: ov?.status === 'ready' ? ov.estimate_code : null, overallLabel: ov?.status === 'ready' ? ov.estimate_label : null,
          revisionCount: submittedRevs.length, revisionFocus: rv.map(v => v.focus).join('; '),
          teacherRating: rvw?.teacher_rating || null, teacherReviewed: !!rvw, overallTeacherRating: ovReview?.teacher_rating || null,
          rubricVersion: e?.rubric_version || null, evaluatorVersion: e?.evaluator_version || null
        });
      }
    }
    // Roster names with no work yet show as not started.
    for (const a of assignments) {
      const roster = a.roster.split(/\r?\n/).map(cleanName).filter(Boolean);
      for (const name of roster) {
        const seen = rows.some(x => x.assignmentId === a.id && nameKey(x.studentName) === nameKey(name));
        if (seen) continue;
        for (const p of PROMPTS) rows.push({ studentId: null, studentName: name, className: a.class_name, assignmentId: a.id,
          assignment: `${a.title}${a.round > 1 ? ' (round ' + a.round + ')' : ''}`, promptNo: p.no, promptTitle: p.title, responseId: null,
          status: 'not_started', feedback: null, startedAt: null, lastSavedAt: null, submittedAt: null, estimateCode: null, estimateLabel: null,
          overallCode: null, overallLabel: null, revisionCount: 0, revisionFocus: '', teacherRating: null, teacherReviewed: false, overallTeacherRating: null,
          rubricVersion: null, evaluatorVersion: null, rosterOnly: true });
      }
    }
    const f = rows.filter(x =>
      (!q.className || x.className === q.className) &&
      (!q.assignmentId || x.assignmentId === q.assignmentId) &&
      (!q.promptNo || x.promptNo === Number(q.promptNo)) &&
      (!q.status || (q.status === 'not_submitted' ? ['not_started', 'draft_saved'].includes(x.status) : x.status === q.status)) &&
      (!q.student || nameKey(x.studentName).includes(nameKey(q.student))));
    f.sort((x, y) => x.className.localeCompare(y.className) || x.studentName.localeCompare(y.studentName) || x.assignment.localeCompare(y.assignment) || x.promptNo - y.promptNo);
    return f;
  }
  t.get('/rows', (req, res) => res.json(buildRows(req.query)));

  function studentDetail(studentId, assignmentId) {
    const s = one('SELECT id, display_name, class_name, created_at FROM students WHERE id=?', studentId);
    const a = one('SELECT * FROM assignments WHERE id=?', assignmentId);
    if (!s || !a) return null;
    const prompts = PROMPTS.map(p => {
      const r = one('SELECT * FROM responses WHERE student_id=? AND assignment_id=? AND prompt_no=?', s.id, a.id, p.no);
      return { prompt: p, responseId: r?.id || null, ...responseView(r),
        reviews: r ? all("SELECT * FROM teacher_reviews WHERE response_id=? AND scope='response' ORDER BY created_at", r.id) : [] };
    });
    const ov = one("SELECT * FROM evaluations WHERE kind='overall' AND student_id=? AND assignment_id=?", s.id, a.id);
    return { student: s, assignment: a, prompts, overall: publicEval(ov),
      overallReviews: all("SELECT * FROM teacher_reviews WHERE scope='overall' AND student_id=? AND assignment_id=? ORDER BY created_at", s.id, a.id) };
  }
  t.get('/detail/:studentId/:assignmentId', (req, res) => {
    const d = studentDetail(req.params.studentId, req.params.assignmentId);
    d ? res.json(d) : res.status(404).json({ error: 'Not found' });
  });

  t.post('/reviews', (req, res) => {
    const { scope, responseId, studentId, assignmentId } = req.body;
    const rating = String(req.body.teacherRating || '').trim().slice(0, 40) || null;
    const note = String(req.body.note || '').trim().slice(0, 2000) || null;
    if (!rating && !note) return res.status(400).json({ error: 'Add a rating or a note.' });
    if (scope === 'response') {
      const r = one('SELECT * FROM responses WHERE id=?', responseId); if (!r) return res.status(404).json({ error: 'Not found' });
      run("INSERT INTO teacher_reviews (id, response_id, student_id, assignment_id, scope, teacher_rating, note, created_at) VALUES (?,?,?,?,'response',?,?,?)",
        uid(), r.id, r.student_id, r.assignment_id, rating, note, now());
    } else if (scope === 'overall') {
      if (!one('SELECT 1 FROM responses WHERE student_id=? AND assignment_id=?', studentId, assignmentId)) return res.status(404).json({ error: 'Not found' });
      run("INSERT INTO teacher_reviews (id, student_id, assignment_id, scope, teacher_rating, note, created_at) VALUES (?,?,?,'overall',?,?,?)",
        uid(), studentId, assignmentId, rating, note, now());
    } else return res.status(400).json({ error: 'Bad scope' });
    res.json({ ok: true });
  });

  t.post('/students/:id/reset-code', (req, res) => {
    const s = one('SELECT * FROM students WHERE id=?', req.params.id); if (!s) return res.status(404).json({ error: 'Not found' });
    const code = newReturnCode();
    run('UPDATE students SET return_code_hash=? WHERE id=?', hmac(normCode(code)), s.id);
    run('DELETE FROM sessions WHERE student_id=?', s.id);
    res.json({ returnCode: code });
  });
  t.delete('/students/:id', (req, res) => {
    if (req.body?.confirm !== 'DELETE') return res.status(400).json({ error: 'Confirmation required.' });
    run('DELETE FROM students WHERE id=?', req.params.id); res.json({ ok: true });
  });
  t.post('/retry-pending', (req, res) => {
    if (!ev.aiConfigured()) return res.status(400).json({ error: 'The AI service is not configured on the server.' });
    const ids = all("SELECT id FROM evaluations WHERE status IN ('failed','pending')").map(e => e.id);
    ids.forEach(id => processEval(id));
    res.json({ ok: true, queued: ids.length });
  });

  // CSV export (formula-injection safe)
  const csvCell = v => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  t.get('/export.csv', (req, res) => {
    const STATUS = { not_started: 'not started', draft_saved: 'draft saved', submitted: 'submitted (feedback pending)', feedback_ready: 'feedback ready', revised: 'revised' };
    const head = ['Student', 'Class', 'Assignment', 'Prompt', 'Status', 'Started', 'Last saved', 'Submitted', 'AI practice estimate (initial)', 'AI overall practice estimate',
      'Revision count', 'Revision focus', 'Teacher rating (prompt)', 'Teacher rating (overall)', 'Teacher reviewed', 'Rubric version', 'Evaluator version', 'Note'];
    const lines = [head.map(csvCell).join(',')];
    for (const r of buildRows(req.query)) lines.push([r.studentName, r.className, r.assignment, `${r.promptNo}. ${r.promptTitle}`, STATUS[r.status],
      r.startedAt, r.lastSavedAt, r.submittedAt, r.estimateCode, r.overallCode, r.revisionCount, r.revisionFocus, r.teacherRating, r.overallTeacherRating,
      r.teacherReviewed ? 'yes' : 'no', r.rubricVersion, r.evaluatorVersion, LABEL].map(csvCell).join(','));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="writing-practice-${new Date().toISOString().slice(0, 10)}.csv"` });
    res.send('﻿' + lines.join('\r\n'));
  });

  // Printable download of writing + feedback (one student, or everyone matching filters)
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function detailHtml(d) {
    const fb = e => {
      if (!e) return '<p class="m">No feedback yet.</p>';
      if (e.status !== 'ready') return '<p class="m">Feedback pending.</p>';
      const r = e.result, c = r.coaching;
      return `<p><b>${esc(LABEL)}:</b> ${esc(r.estimate.label)} · evidence: ${esc(r.estimate.evidence)}</p><p>${esc(r.rating.plain_explanation)}</p>
        ${c ? `<p><b>Strengths</b></p><ul>${c.strengths.map(s => `<li>${esc(s.point)} — “${esc(s.quote)}”</li>`).join('')}</ul>
        <p><b>Priorities</b></p><ul>${c.priorities.map(p => `<li>${esc(p.point)} ${p.quote ? '— “' + esc(p.quote) + '”' : '(' + esc(p.evidence_note) + ')'}</li>`).join('')}</ul>
        <p><b>Revision task:</b> ${esc(c.revision_task.instructions)}</p>
        ${c.examples.map(x => `<p>“${esc(x.original)}” → “${esc(x.improved)}” <i>${esc(x.why)}</i></p>`).join('')}` : ''}
        ${r.comparison ? `<p><b>Comparison:</b> ${esc(r.comparison.summary)}</p><ul>${r.comparison.improved.map(x => `<li>Improved: ${esc(x.point)}</li>`).join('')}${r.comparison.still_needs.map(x => `<li>Still needs: ${esc(x)}</li>`).join('')}</ul>` : ''}
        <p class="m">Rubric ${esc(e.rubricVersion)} · evaluator ${esc(e.evaluatorVersion)}</p>`;
    };
    return `<section><h1>${esc(d.student.display_name)} — ${esc(d.assignment.class_name)}</h1><p class="m">${esc(d.assignment.title)}${d.assignment.round > 1 ? ' (round ' + d.assignment.round + ')' : ''}</p>
      ${d.prompts.map(p => `<h2>${p.prompt.no}. ${esc(p.prompt.title)}</h2>
        <h3>Initial response (independent) ${p.submittedAt ? '· submitted ' + esc(p.submittedAt) : '· not submitted'}</h3>
        <pre>${esc(p.initialText ?? p.draftText ?? '')}</pre>${fb(p.evaluation)}
        ${p.revisions.filter(v => v.submittedText).map(v => `<h3>Revision ${v.number} — after feedback (supported practice) · focus: ${esc(v.focus)}</h3><pre>${esc(v.submittedText)}</pre>
          <p><b>Reflection:</b> One change I made was ${esc(v.reflectionChange)}. It helped my reader because ${esc(v.reflectionReader)}.</p>${fb(v.evaluation)}`).join('')}
        ${p.reviews.map(r => `<p><b>Teacher:</b> ${esc(r.teacher_rating || '')} ${esc(r.note || '')} <span class="m">${esc(r.created_at)}</span></p>`).join('')}`).join('')}
      ${d.overall?.status === 'ready' ? `<h2>Overall (initial responses only)</h2><p><b>${esc(LABEL)}:</b> ${esc(d.overall.result.estimate.label)}</p><p>${esc(d.overall.result.overall.consistency)}</p><p>${esc(d.overall.result.overall.variation)}</p>` : ''}
    </section>`;
  }
  const page = body => `<!doctype html><html><head><meta charset="utf-8"><title>Writing and feedback</title><style>
    body{font-family:Georgia,serif;max-width:760px;margin:2rem auto;padding:0 1rem;color:#2b2a24}h1{font-size:1.4rem}h2{font-size:1.15rem;margin-top:1.6rem;border-top:1px solid #ddd;padding-top:1rem}h3{font-size:1rem}
    pre{white-space:pre-wrap;font-family:inherit;background:#faf6ea;padding:.8rem;border-radius:6px}.m{color:#777;font-size:.85rem}section{page-break-after:always}</style></head><body>${body}</body></html>`;
  t.get('/download', (req, res) => {
    let pairs;
    if (req.query.studentId) pairs = [[req.query.studentId, req.query.assignmentId]];
    else pairs = [...new Set(buildRows(req.query).filter(r => r.studentId).map(r => r.studentId + '|' + r.assignmentId))].map(k => k.split('|'));
    const body = pairs.map(([s, a]) => studentDetail(s, a)).filter(Boolean).map(detailHtml).join('');
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="writing-and-feedback-${new Date().toISOString().slice(0, 10)}.html"` });
    res.send(page(body || '<p>No work matches these filters.</p>'));
  });

  app.use('/api/teacher', t);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // ---------- pages ----------
  const pub = path.join(__dirname, '..', 'public');
  app.get('/teacher', (req, res) => res.sendFile(path.join(pub, 'teacher.html')));
  app.use(express.static(pub, { index: 'index.html', extensions: ['html'] }));

  app.locals.db = db; app.locals.processEval = processEval; app.locals.sweep = sweep;
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`Writing practice running on http://localhost:${port}  (AI ${ev.aiConfigured() ? 'configured: ' + ev.modelName() : 'NOT configured'})`));
}
