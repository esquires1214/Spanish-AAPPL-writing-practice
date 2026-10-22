import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONTEXT, PAST, optId } from '../src/diagnostic-content.js';

let server, base, app;
const TPW = 'correct-horse-battery';
function device() {
  const jar = {};
  return async function call(method, url, body) {
    const headers = { 'X-Requested-With': 'fetch', cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) jar[k] = v; else delete jar[k]; }
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
  };
}
before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diag-'));
  const { createApp } = await import('../src/server.js');
  app = createApp({ dbFile: path.join(dir, 't.db'), secret: 'y'.repeat(32), teacherPassword: TPW, noSweep: true });
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

const right = q => optId(q, q.options[0]);
const wrong = q => optId(q, q.options[1]);
const allRight = items => Object.fromEntries(items.map(q => [q.id, right(q)]));

let h4, cp, teacher;

test('start requires name, course and block', async () => {
  h4 = device();
  assert.equal((await h4('POST', '/api/diag/start', { name: 'Ana', course: 'Spanish 4H', block: 'B' })).status, 400);
  assert.equal((await h4('POST', '/api/diag/start', { name: 'Ana Ruiz', course: 'Spanish 5', block: 'B' })).status, 400);
  assert.equal((await h4('POST', '/api/diag/start', { name: 'Ana Ruiz', course: 'Spanish 4H', block: '' })).status, 400);
  assert.equal((await h4('POST', '/api/diag/start', { name: 'Ana Ruiz', course: 'Spanish 4H', block: 'Block b' })).status, 200);
  const me = (await h4('GET', '/api/diag/me')).data;
  assert.equal(me.attempt.block, 'B');
  assert.equal(me.content.context.length, 12);
  assert.equal(me.content.confidence.expressions.length, 18);
  cp = device();
  await cp('POST', '/api/diag/start', { name: 'Ben Cruz', course: 'Spanish 4CP', block: '3' });
  const m2 = (await cp('GET', '/api/diag/me')).data;
  assert.equal(m2.content.context.length, 8);
  assert.equal(m2.content.confidence.expressions.length, 10);
});

test('page content never reveals answers or meanings', async () => {
  const me = (await h4('GET', '/api/diag/me')).data;
  const json = JSON.stringify(me.content);
  assert.ok(!json.includes('"explain"'));
  assert.ok(!json.includes('to displace'));
  assert.ok(!json.includes('"answer"'));
  // correct option is not always in the same position
  const positions = me.content.context.map((q, i) => q.options.findIndex(o => o.id === right(CONTEXT[i])));
  assert.ok(new Set(positions).size > 1);
});

test('first attempt is saved before feedback and cannot be changed; retries are separate', async () => {
  const items = CONTEXT;
  const answers = allRight(items); answers.c1 = wrong(items[0]); answers.c2 = 'ns';
  const r = await h4('POST', '/api/diag/section/context', { data: { answers } });
  assert.equal(r.status, 200);
  assert.equal(r.data.feedback.correct, 10);
  assert.equal(r.data.feedback.notSure, 1);
  // A second "first" submit returns the original, unchanged
  const again = await h4('POST', '/api/diag/section/context', { data: { answers: allRight(items) } });
  assert.equal(again.data.alreadySaved, true);
  assert.equal(again.data.feedback.correct, 10);
  // DB refuses edits
  assert.throws(() => app.locals.db.exec("UPDATE diag_entries SET data_json='{}' WHERE kind='first'"));
  // Retry saved separately
  const rt = await h4('POST', '/api/diag/section/context/retry', { data: { answers: allRight(items) } });
  assert.equal(rt.data.feedback.correct, 12);
  const me = (await h4('GET', '/api/diag/me')).data;
  assert.equal(me.sections.context.feedback.correct, 10);
  assert.equal(me.sections.context.retries.length, 1);
});

test('validation: every question needs an answer; not sure is fine', async () => {
  assert.equal((await cp('POST', '/api/diag/section/past', { data: { answers: { p1: 'ns' } } })).status, 400);
  const answers = Object.fromEntries(PAST.map(q => [q.id, 'ns']));
  const r = await cp('POST', '/api/diag/section/past', { data: { answers } });
  assert.equal(r.status, 200);
  assert.equal(r.data.feedback.notSure, 8);
});

test('full run completes and shows in the dashboard with separate categories', async () => {
  const me = (await h4('GET', '/api/diag/me')).data;
  const ratings = Object.fromEntries(me.content.confidence.expressions.map(x => [x.id, 'recognize']));
  const steps = [
    ['background', { answers: { know: 'Es una isla en el Caribe.', wonder: 'Not yet' } }],
    ['confidence', { ratings }],
    ['past', { answers: allRight(PAST) }],
    ['sequence', { order: ['s2', 's1', 's3', 's4'], questions: { when: 's1', happening: 's2', felt: 'ns' } }],
    ['story', { text: 'El año pasado fui a una boda. Estaba muy nervioso.' }],
    ['reflection', { strength: 'Vocabulary', help: 'the past', expressions: ['boricua', 'dejar huella'] }]
  ];
  for (const [k, data] of steps) {
    const r = await h4('POST', `/api/diag/section/${k}`, { data });
    assert.equal(r.status, 200, k + ' ' + JSON.stringify(r.data));
    if (k === 'sequence') { assert.equal(r.data.feedback.orderCorrect, false); assert.equal(r.data.feedback.questionsCorrect, 2); }
    if (k === 'confidence') assert.equal(r.data.feedback.meanings.find(m => m.id === 'desplazar').en, 'to displace');
    if (k === 'reflection') assert.equal(r.data.completed, true);
  }
  assert.equal((await h4('POST', '/api/diag/section/story/followup', { data: { text: 'El año pasado fui a una boda en Ponce.' } })).status, 200);
  assert.equal((await h4('POST', '/api/diag/supports', { key: 'story' })).status, 200);

  const anon = device();
  assert.equal((await anon('GET', '/api/teacher/diag/rows')).status, 401);
  assert.equal((await h4('GET', '/api/teacher/diag/rows')).status, 401);
  teacher = device();
  await teacher('POST', '/api/teacher/login', { password: TPW });
  const rows = (await teacher('GET', '/api/teacher/diag/rows?course=Spanish%204H')).data;
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.status, 'complete');
  assert.deepEqual(r.context, { correct: 10, notSure: 1, total: 12, retries: 1, bestRetry: 12 });
  assert.equal(r.past.correct, 8);
  assert.equal(r.story.revised, true);
  assert.equal(r.confidence.recognize, 18);
  assert.ok(!('overall' in r) && !('score' in r));
  const blockB = (await teacher('GET', '/api/teacher/diag/rows?block=3')).data;
  assert.equal(blockB.length, 1); assert.equal(blockB[0].name, 'Ben Cruz');
  const csv = (await teacher('GET', '/api/teacher/diag/export.csv')).data;
  assert.match(csv, /Vocab in context \(1st try\)/);
  assert.match(csv, /El año pasado fui a una boda\. Estaba muy nervioso\./);
  const dl = (await teacher('GET', `/api/teacher/diag/download?id=${r.id}`)).data;
  assert.match(dl, /Revision after checklist and model/);
});

test('closing the activity stops new starts', async () => {
  await teacher('POST', '/api/teacher/diag/open', { open: false });
  assert.equal((await device()('POST', '/api/diag/start', { name: 'Late Kid', course: 'Spanish 4CP', block: '3' })).status, 403);
  await teacher('POST', '/api/teacher/diag/open', { open: true });
});
