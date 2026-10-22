/* global h, api, fmtTime, STATUS_TEXT */
const app = document.getElementById('app');
let status = null, assignments = [], tab = location.hash === '#antes' ? 'antes' : 'work';
const filters = { className: '', assignmentId: '', promptNo: '', status: '', student: '' };
const ARC_OPTIONS = ['N-NE', 'N-SE', 'N-MM', 'N-MF', 'I-NE', 'I-SE', 'I-MM', 'I-MF', 'A-NE', 'A-SE', 'A-MM', 'A-MF', 'Insufficient evidence'];

document.getElementById('signOut').onclick = async () => { await api('POST', '/api/teacher/logout').catch(() => {}); location.reload(); };
start();

async function start() {
  try { status = await api('GET', '/api/teacher/status'); } catch { return login(); }
  document.getElementById('signOut').classList.remove('hidden');
  document.getElementById('aiStatus').textContent = status.aiConfigured ? `AI: ${status.model}` : 'AI not configured';
  await loadAssignments();
  render();
}

function login() {
  const pw = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password' });
  const err = h('div', { class: 'error', role: 'alert' });
  app.replaceChildren(h('form', { class: 'narrow card', onsubmit: async e => {
    e.preventDefault(); err.textContent = '';
    try { await api('POST', '/api/teacher/login', { password: pw.value }); app.replaceChildren(); start(); } catch (x) { err.textContent = x.message; }
  } }, h('h1', {}, 'Teacher sign-in'), h('label', { for: 'pw' }, 'Password'), pw, err, h('div', { class: 'row end' }, h('button', { class: 'btn primary', type: 'submit' }, 'Sign in'))));
  pw.focus();
}

async function loadAssignments() { assignments = await api('GET', '/api/teacher/assignments'); }
const roundName = a => `${a.title}${a.round > 1 ? ` (round ${a.round})` : ''}`;

function render() {
  const tabs = h('div', { class: 'tabs', role: 'tablist' },
    h('button', { type: 'button', 'aria-selected': String(tab === 'work'), onclick: () => { tab = 'work'; render(); } }, 'Student work'),
    h('button', { type: 'button', 'aria-selected': String(tab === 'activities'), onclick: () => { tab = 'activities'; render(); } }, 'Activities & class codes'),
    h('button', { type: 'button', 'aria-selected': String(tab === 'antes'), onclick: () => { tab = 'antes'; render(); } }, 'Antes de empezar'));
  const banner = [];
  if (tab !== 'antes' && !status.aiConfigured) banner.push(h('p', { class: 'notice warn' }, 'The AI service is not configured on the server (ANTHROPIC_API_KEY). Students can still write and submit; feedback will show as pending until it is configured.'));
  if (tab !== 'antes' && (status.failed || status.pending)) banner.push(h('p', { class: 'notice' }, `${status.pending} feedback request(s) pending, ${status.failed} waiting for retry. `,
    h('button', { class: 'btn small', type: 'button', onclick: async () => { try { const r = await api('POST', '/api/teacher/retry-pending'); alert(`Retrying ${r.queued}.`); } catch (e) { alert(e.message); } } }, 'Retry now')));
  app.replaceChildren(tabs, ...banner, h('div', { id: 'tabBody' }));
  if (tab === 'antes') return window.diagTab(document.getElementById('tabBody'));
  tab === 'work' ? workTab() : activitiesTab();
}

// ---------------- activities ----------------
function activitiesTab() {
  const body = document.getElementById('tabBody');
  const cls = h('select', { id: 'nc' }, status.classes.map(c => h('option', { value: c }, c)));
  const title = h('input', { type: 'text', id: 'nt', value: 'Presentational Writing Practice', maxlength: 80 });
  const timer = h('input', { type: 'number', id: 'nm', value: 12, min: 1, max: 60 });
  const noTimer = h('input', { type: 'checkbox', id: 'nn' });
  body.append(h('form', { class: 'card', onsubmit: async e => {
    e.preventDefault();
    await api('POST', '/api/teacher/assignments', { className: cls.value, title: title.value, timerMinutes: noTimer.checked ? null : Number(timer.value) });
    await loadAssignments(); render();
  } }, h('h2', {}, 'Open the activity for a class'),
    h('div', { class: 'filters' },
      h('div', {}, h('label', { for: 'nc' }, 'Class'), cls),
      h('div', {}, h('label', { for: 'nt' }, 'Title'), title),
      h('div', {}, h('label', { for: 'nm' }, 'Suggested minutes per prompt'), timer),
      h('div', {}, h('label', { style: 'font-weight:400' }, noTimer, ' No timer')),
      h('div', {}, h('button', { class: 'btn primary', type: 'submit' }, 'Create class code')))));

  if (!assignments.length) body.append(h('p', { class: 'muted', style: 'margin-top:1rem' }, 'No activities yet. Create one per class; each gets its own class code.'));
  for (const a of assignments) body.append(assignmentCard(a));
}

function assignmentCard(a) {
  const timer = h('input', { type: 'number', min: 1, max: 60, value: a.timer_minutes ?? 12, style: 'width:6rem', 'aria-label': 'Suggested minutes' });
  const roster = h('textarea', { rows: 4, placeholder: 'Optional: one student name per line, so students who haven’t started show up as “not started”.' }); roster.value = a.roster;
  const patch = async body => { await api('PATCH', `/api/teacher/assignments/${a.id}`, body); await loadAssignments(); render(); };
  return h('div', { class: 'card' },
    h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, `${a.class_name} · ${roundName(a)}`), h('span', { class: 'spacer', style: 'flex:1' }),
      h('span', { class: `status ${a.is_open ? 'feedback_ready' : ''}` }, a.is_open ? 'Open' : 'Closed')),
    h('p', { style: 'margin-top:.6rem' }, 'Class code: ', h('span', { class: 'code-pill' }, a.class_code), h('span', { class: 'muted small' }, `  ·  ${a.students} student(s) with work  ·  created ${fmtTime(a.created_at)}`)),
    h('div', { class: 'row' },
      h('button', { class: 'btn small', type: 'button', onclick: () => patch({ isOpen: !a.is_open }) }, a.is_open ? 'Close activity' : 'Reopen activity'),
      h('span', { class: 'small' }, 'Timer:'), timer,
      h('button', { class: 'btn small', type: 'button', onclick: () => patch({ timerMinutes: Number(timer.value) }) }, 'Set minutes'),
      h('button', { class: 'btn small', type: 'button', onclick: () => patch({ timerMinutes: null }) }, a.timer_minutes ? 'Turn timer off' : 'Timer is off'),
      h('button', { class: 'btn small', type: 'button', onclick: async () => { if (confirm('Make a new class code? The old code will stop working.')) { await api('POST', `/api/teacher/assignments/${a.id}/new-code`); await loadAssignments(); render(); } } }, 'New code'),
      h('button', { class: 'btn small', type: 'button', onclick: async () => { if (confirm('Assign again as a new round with a new code? Earlier work stays as it is.')) { await api('POST', `/api/teacher/assignments/${a.id}/assign-again`); await loadAssignments(); render(); } } }, 'Assign again'),
      h('button', { class: 'btn small danger', type: 'button', onclick: async () => {
        if (prompt(`Type DELETE to permanently delete "${roundName(a)}" for ${a.class_name} and ALL student work in it.`) === 'DELETE') { await api('DELETE', `/api/teacher/assignments/${a.id}`, { confirm: 'DELETE' }); await loadAssignments(); render(); }
      } }, 'Delete')),
    h('details', { style: 'margin-top:.6rem' }, h('summary', {}, 'Roster (optional)'), roster,
      h('div', { class: 'row end', style: 'margin-top:.4rem' }, h('button', { class: 'btn small', type: 'button', onclick: () => patch({ roster: roster.value }) }, 'Save roster'))));
}

// ---------------- student work ----------------
function qs() { return new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString(); }

async function workTab() {
  const body = document.getElementById('tabBody');
  const sel = (key, label, options) => {
    const s = h('select', { id: 'f_' + key, onchange: () => { filters[key] = s.value; workTab(); } }, h('option', { value: '' }, 'All'), options.map(([v, t]) => h('option', { value: v, selected: String(filters[key]) === String(v) }, t)));
    return h('div', {}, h('label', { for: 'f_' + key }, label), s);
  };
  const search = h('input', { type: 'text', id: 'f_student', value: filters.student, placeholder: 'Name…' });
  let st; search.oninput = () => { clearTimeout(st); st = setTimeout(() => { filters.student = search.value; loadTable(); }, 300); };
  const quick = (label, val) => h('button', { class: 'btn small', type: 'button', 'aria-pressed': String(filters.status === val), onclick: () => { filters.status = filters.status === val ? '' : val; workTab(); } }, label);
  const tableHost = h('div', {});
  const summaryHost = h('div', { class: 'row', style: 'margin-top:1rem' });
  body.replaceChildren(
    h('div', { class: 'card' },
      h('div', { class: 'filters' },
        sel('className', 'Class', status.classes.map(c => [c, c])),
        sel('assignmentId', 'Activity', assignments.map(a => [a.id, `${a.class_name} · ${roundName(a)}`])),
        sel('promptNo', 'Prompt', status.prompts.map(p => [p.no, `${p.no}. ${p.title}`])),
        sel('status', 'Status', [['not_submitted', 'Not submitted (any)'], ...Object.entries(STATUS_TEXT)]),
        h('div', {}, h('label', { for: 'f_student' }, 'Student'), search)),
      h('div', { class: 'row', style: 'margin-top:.8rem' }, quick('Not submitted', 'not_submitted'), quick('Revised', 'revised'), quick('Feedback ready', 'feedback_ready'),
        h('span', { style: 'flex:1' }),
        h('a', { class: 'btn small', href: `/api/teacher/export.csv?${qs()}` }, 'Export CSV'),
        h('a', { class: 'btn small', href: `/api/teacher/download?${qs()}` }, 'Download writing & feedback'))),
    summaryHost, tableHost);
  loadTable();

  async function loadTable() {
    const rows = await api('GET', `/api/teacher/rows?${qs()}`);
    const students = new Set(rows.map(r => r.studentName + '|' + r.assignmentId));
    const count = s => rows.filter(r => r.status === s).length;
    summaryHost.replaceChildren(
      h('span', { class: 'stat' }, h('b', {}, students.size), 'students'),
      h('span', { class: 'stat' }, h('b', {}, count('not_started') + count('draft_saved')), 'prompts not submitted'),
      h('span', { class: 'stat' }, h('b', {}, count('feedback_ready') + count('submitted')), 'submitted'),
      h('span', { class: 'stat' }, h('b', {}, count('revised')), 'revised'),
      h('span', { class: 'small muted' }, status.label));
    if (!rows.length) { tableHost.replaceChildren(h('p', { class: 'muted', style: 'margin-top:1rem' }, 'No work matches these filters yet.')); return; }
    const head = ['Student', 'Class', 'Activity', 'Prompt', 'Status', 'Started', 'Last saved', 'Submitted', 'AI estimate (initial)', 'AI overall', 'Revisions', 'Focus', 'Teacher review'];
    tableHost.replaceChildren(h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, head.map(x => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, rows.map(r => h('tr', { tabindex: r.studentId ? 0 : -1, onclick: () => r.studentId && openDetail(r.studentId, r.assignmentId), onkeydown: e => e.key === 'Enter' && r.studentId && openDetail(r.studentId, r.assignmentId) },
        h('td', {}, h('b', {}, r.studentName), r.rosterOnly ? h('div', { class: 'small muted' }, 'roster only') : null),
        h('td', {}, r.className), h('td', { class: 'small' }, r.assignment), h('td', {}, `${r.promptNo}. ${r.promptTitle}`),
        h('td', {}, h('span', { class: `status ${r.status}` }, STATUS_TEXT[r.status]), r.feedback === 'failed' ? h('div', { class: 'small muted' }, 'feedback pending') : null),
        h('td', { class: 'ts' }, fmtTime(r.startedAt)), h('td', { class: 'ts' }, fmtTime(r.lastSavedAt)), h('td', { class: 'ts' }, fmtTime(r.submittedAt)),
        h('td', { title: r.estimateLabel || '' }, r.estimateCode === 'INSUFFICIENT' ? 'Insufficient' : (r.estimateCode || '—')),
        h('td', { title: r.overallLabel || '' }, r.overallCode === 'INSUFFICIENT' ? 'Insufficient' : (r.overallCode || '—')),
        h('td', {}, r.revisionCount), h('td', { class: 'small' }, r.revisionFocus || '—'),
        h('td', { class: 'small' }, r.teacherReviewed ? `Reviewed${r.teacherRating ? ' · ' + r.teacherRating : ''}` : 'Not reviewed')))))));
  }
}

// ---------------- detail drawer ----------------
async function openDetail(studentId, assignmentId) {
  const d = await api('GET', `/api/teacher/detail/${studentId}/${assignmentId}`);
  const close = () => { drawer.remove(); workTab(); };
  const panel = h('div', { class: 'drawer-panel', role: 'dialog', 'aria-label': `Work by ${d.student.display_name}` });
  const drawer = h('div', { class: 'drawer', onclick: e => { if (e.target === drawer) close(); } }, panel);
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', esc); close(); } });
  panel.append(
    h('div', { class: 'row' }, h('h1', { style: 'margin:0' }, d.student.display_name), h('span', { style: 'flex:1' }), h('button', { class: 'btn small', type: 'button', onclick: close }, 'Close')),
    h('p', { class: 'muted' }, `${d.assignment.class_name} · ${roundName(d.assignment)}`),
    h('div', { class: 'row' },
      h('a', { class: 'btn small', href: `/api/teacher/download?studentId=${encodeURIComponent(d.student.id)}&assignmentId=${encodeURIComponent(d.assignment.id)}` }, 'Download writing & feedback'),
      h('button', { class: 'btn small', type: 'button', onclick: async () => {
        if (!confirm('Give this student a new return code? Their old code will stop working.')) return;
        const r = await api('POST', `/api/teacher/students/${d.student.id}/reset-code`); alert(`New return code for ${d.student.display_name}: ${r.returnCode}`);
      } }, 'New return code'),
      h('button', { class: 'btn small danger', type: 'button', onclick: async () => {
        if (prompt(`Type DELETE to permanently delete ${d.student.display_name} and all of their work in every activity.`) !== 'DELETE') return;
        await api('DELETE', `/api/teacher/students/${d.student.id}`, { confirm: 'DELETE' }); close();
      } }, 'Delete student')));

  // overall
  const ov = d.overall;
  panel.append(h('div', { class: 'card estimate', style: 'margin-top:1rem' },
    h('div', { class: 'label-official' }, status.label), h('h2', {}, 'Overall (initial responses only)'),
    ov?.status === 'ready' ? [h('div', { class: 'cat' }, ov.result.estimate.label), h('p', { class: 'small muted' }, `Evidence: ${ov.result.estimate.evidence}`),
      h('p', {}, h('b', {}, 'Consistency: '), ov.result.overall.consistency), h('p', {}, h('b', {}, 'Variation: '), ov.result.overall.variation), h('p', {}, h('b', {}, 'Next step: '), ov.result.overall.next_step),
      h('p', { class: 'small muted' }, `Rubric ${ov.rubricVersion} · evaluator ${ov.evaluatorVersion}`)]
      : h('p', { class: 'muted' }, ov ? 'Overall estimate pending.' : 'Available after all three initial responses have feedback.'),
    reviewBlock(d.overallReviews, { scope: 'overall', studentId: d.student.id, assignmentId: d.assignment.id }, () => openDetailRefresh())));

  for (const p of d.prompts) panel.append(promptDetail(p));
  document.body.append(drawer);
  async function openDetailRefresh() { drawer.remove(); openDetail(studentId, assignmentId); }

  function promptDetail(p) {
    const box = h('div', { class: 'card', style: 'margin-top:1rem' },
      h('div', { class: 'phase' }, `Prompt ${p.prompt.no}`), h('h2', {}, p.prompt.title),
      h('p', { class: 'small muted' }, `Status: ${STATUS_TEXT[p.status]} · started ${fmtTime(p.startedAt)} · last saved ${fmtTime(p.lastSavedAt)} · submitted ${fmtTime(p.submittedAt)}`));
    if (p.initialText == null) {
      box.append(h('h3', {}, 'Saved draft (not submitted)'), h('div', { class: 'initial-text', lang: 'es' }, p.draftText || '(empty)'));
      return box;
    }
    box.append(h('h3', {}, 'Initial response — independent'), h('div', { class: 'initial-text', lang: 'es' }, p.initialText), h('p', { class: 'small muted' }, `${(p.initialText.trim().match(/\S+/g) || []).length} words`));
    box.append(feedbackDetail(p.evaluation));
    for (const v of p.revisions) {
      box.append(h('h3', { style: 'margin-top:1rem' }, `Revision ${v.number} — after feedback (supported) · focus: ${v.focus}`));
      if (v.submittedText == null) { box.append(h('p', { class: 'muted small' }, 'In progress (not submitted).')); continue; }
      box.append(h('div', { class: 'initial-text', lang: 'es' }, v.submittedText),
        h('p', { class: 'small' }, h('b', {}, 'Reflection: '), `One change I made was ${v.reflectionChange}. It helped my reader because ${v.reflectionReader}.`),
        feedbackDetail(v.evaluation));
    }
    box.append(reviewBlock(p.reviews, { scope: 'response', responseId: p.responseId }, openDetailRefresh));
    return box;
  }
}

function feedbackDetail(e) {
  if (!e) return h('p', { class: 'muted' }, 'No feedback requested.');
  if (e.status !== 'ready') return h('p', { class: 'notice warn' }, e.status === 'failed' ? 'Feedback pending (AI request failed; it will retry, or use Retry now).' : 'Feedback pending.');
  const r = e.result, c = r.coaching, cmp = r.comparison;
  return h('div', { class: 'fb-item' },
    h('div', { class: 'label-official small' }, status.label),
    h('p', {}, h('b', {}, r.supported ? 'After feedback (supported): ' : 'AI estimate: '), r.estimate.label, ` · evidence: ${r.estimate.evidence}`),
    h('p', { class: 'small' }, r.rating.plain_explanation),
    h('details', {}, h('summary', { class: 'small' }, 'ARC detail'),
      ['novice', 'intermediate', 'advanced'].map(l => h('p', { class: 'small' }, h('b', {}, `${r.rating[l].rating}: `), r.rating[l].rationale)),
      h('p', { class: 'small' }, `Text type: ${r.rating.dimensions.text_type.replace(/_/g, ' ')} · past ${r.rating.dimensions.time_frames.past}, present ${r.rating.dimensions.time_frames.present}, future ${r.rating.dimensions.time_frames.future}`),
      h('p', { class: 'small' }, h('b', {}, 'Organization: '), r.rating.dimensions.organization),
      h('p', { class: 'small' }, h('b', {}, 'Elaboration: '), r.rating.dimensions.elaboration),
      h('p', { class: 'small' }, h('b', {}, 'Comprehensibility: '), r.rating.dimensions.comprehensibility)),
    c ? [h('p', { class: 'small' }, h('b', {}, 'Strengths: '), c.strengths.map(s => `${s.point} (“${s.quote}”)`).join(' ')),
      h('p', { class: 'small' }, h('b', {}, 'Priorities: '), c.priorities.map(x => `${x.point}${x.quote ? ` (“${x.quote}”)` : ''}`).join(' ')),
      h('p', { class: 'small' }, h('b', {}, 'Revision task: '), c.revision_task.instructions),
      c.examples.map(x => h('p', { class: 'small' }, `“${x.original}” → “${x.improved}”`))] : null,
    cmp ? [h('p', { class: 'small' }, h('b', {}, 'Comparison: '), cmp.summary),
      h('p', { class: 'small' }, h('b', {}, 'Improved: '), cmp.improved.map(x => x.point).join(' ')),
      h('p', { class: 'small' }, h('b', {}, 'Still needs: '), cmp.still_needs.join(' '))] : null,
    h('p', { class: 'small muted' }, `Rubric ${e.rubricVersion} · evaluator ${e.evaluatorVersion} · ${fmtTime(e.completedAt)}`));
}

function reviewBlock(reviews, target, refresh) {
  const rating = h('select', {}, h('option', { value: '' }, 'Teacher rating (optional)'), ARC_OPTIONS.map(o => h('option', { value: o }, o)));
  const note = h('textarea', { rows: 2, placeholder: 'Note (optional)' });
  const err = h('div', { class: 'error' });
  return h('div', { style: 'margin-top:1rem;border-top:1px solid var(--line);padding-top:.8rem' },
    h('h3', {}, 'Teacher review'),
    h('p', { class: 'small muted' }, 'Saved separately. The AI estimate above is never changed.'),
    reviews.map(r => h('p', { class: 'small fb-item' }, h('b', {}, r.teacher_rating || 'Note'), r.note ? ` — ${r.note}` : '', h('span', { class: 'muted' }, `  ${fmtTime(r.created_at)}`))),
    h('div', { class: 'row' }, rating), note, err,
    h('div', { class: 'row end', style: 'margin-top:.4rem' }, h('button', { class: 'btn small primary', type: 'button', onclick: async () => {
      try { await api('POST', '/api/teacher/reviews', { ...target, teacherRating: rating.value, note: note.value }); refresh(); } catch (e) { err.textContent = e.message; }
    } }, 'Save review')));
}
