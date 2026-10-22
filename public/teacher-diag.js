/* global h, api, fmtTime */
// Teacher dashboard tab for "Antes de empezar" (/antes). Categories stay separate — no overall grade.
(function () {
  const f = { course: '', block: '', status: '', student: '' };
  const qs = () => new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const rich = s => String(s).split('**').map((p, i) => (i % 2 ? h('b', {}, p) : p));

  window.diagTab = async function diagTab(body) {
    const st = await api('GET', '/api/teacher/diag/status');
    const link = `${location.origin}/antes`;
    const sel = (key, label, options) => {
      const s = h('select', { id: 'd_' + key, onchange: () => { f[key] = s.value; diagTab(body); } }, h('option', { value: '' }, 'All'), options.map(([v, t]) => h('option', { value: v, selected: f[key] === v }, t)));
      return h('div', {}, h('label', { for: 'd_' + key }, label), s);
    };
    const search = h('input', { type: 'text', id: 'd_student', value: f.student, placeholder: 'Name…' });
    let tmr; search.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => { f.student = search.value; load(); }, 300); };
    const stats = h('div', { class: 'row', style: 'margin-top:1rem' });
    const table = h('div', {});
    body.replaceChildren(
      h('div', { class: 'card' },
        h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, st.title), h('span', { style: 'flex:1' }),
          h('span', { class: `status ${st.open ? 'feedback_ready' : ''}` }, st.open ? 'Open' : 'Closed'),
          h('button', { class: 'btn small', type: 'button', onclick: async () => { await api('POST', '/api/teacher/diag/open', { open: !st.open }); diagTab(body); } }, st.open ? 'Close activity' : 'Reopen activity')),
        h('p', { style: 'margin:.6rem 0 0' }, 'Student link: ', h('a', { href: link, target: '_blank', rel: 'noopener' }, link),
          h('button', { class: 'btn small', type: 'button', style: 'margin-left:.5rem', onclick: e => { navigator.clipboard?.writeText(link); e.target.textContent = 'Copied'; } }, 'Copy')),
        h('p', { class: 'small muted', style: 'margin:.3rem 0 0' }, 'No class code needed: students enter their name, course and block. No AI is used. Graded for completion — the columns below are separate diagnostic categories, not one score.')),
      h('div', { class: 'card' },
        h('div', { class: 'filters' },
          sel('course', 'Course', st.courses.map(c => [c, c])),
          sel('block', 'Block', st.blocks.map(b => [b, 'Block ' + b])),
          sel('status', 'Completion', [['complete', 'Complete'], ['incomplete', 'Not finished']]),
          h('div', {}, h('label', { for: 'd_student' }, 'Student'), search)),
        h('div', { class: 'row', style: 'margin-top:.8rem' }, h('span', { style: 'flex:1' }),
          h('a', { class: 'btn small', href: `/api/teacher/diag/export.csv?${qs()}` }, 'Export CSV'),
          h('a', { class: 'btn small', href: `/api/teacher/diag/download?${qs()}` }, 'Download all responses'))),
      stats, table);
    load();

    async function load() {
      const rows = await api('GET', `/api/teacher/diag/rows?${qs()}`);
      const done = rows.filter(r => r.status === 'complete').length;
      const conf = rows.reduce((m, r) => { if (r.confidence) { m.use += r.confidence.use; m.recognize += r.confidence.recognize; m.new += r.confidence.new; } return m; }, { use: 0, recognize: 0, new: 0 });
      stats.replaceChildren(
        h('span', { class: 'stat' }, h('b', {}, rows.length), 'students'),
        h('span', { class: 'stat' }, h('b', {}, done), 'complete'),
        h('span', { class: 'stat' }, h('b', {}, rows.length - done), 'not finished'),
        h('span', { class: 'stat' }, h('b', {}, rows.filter(r => r.story).length), 'stories written'),
        conf.use + conf.recognize + conf.new ? h('span', { class: 'small muted' }, `Vocab confidence ratings: ${conf.use} can use · ${conf.recognize} recognize · ${conf.new} new`) : null);
      if (!rows.length) { table.replaceChildren(h('p', { class: 'muted', style: 'margin-top:1rem' }, 'No students yet.')); return; }
      const head = ['Student', 'Course', 'Block', 'Status', 'PR background', 'Vocab confidence (use / recognize / new)', 'Vocab in context — 1st try', 'Past meaning — 1st try', 'Story order · questions', 'Own story', 'Supports opened', 'Strongest (self)', 'Last activity'];
      const frac = o => o ? `${o.correct}/${o.total}${o.notSure ? ` · ${o.notSure} not sure` : ''}${o.retries ? ` · ${o.retries} practice` : ''}` : '—';
      table.replaceChildren(h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, head.map(x => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, rows.map(r => h('tr', { tabindex: 0, onclick: () => detail(r.id), onkeydown: e => e.key === 'Enter' && detail(r.id) },
          h('td', {}, h('b', {}, r.name)), h('td', {}, r.course.replace('Spanish ', '')), h('td', {}, r.block),
          h('td', {}, h('span', { class: `status ${r.status === 'complete' ? 'revised' : r.sectionsDone ? 'draft_saved' : ''}` }, r.status === 'complete' ? 'Complete' : `${r.sectionsDone}/${r.sectionsTotal} parts`)),
          h('td', {}, r.backgroundDone ? '✓' : '—'),
          h('td', {}, r.confidence ? `${r.confidence.use} / ${r.confidence.recognize} / ${r.confidence.new}` : '—'),
          h('td', {}, frac(r.context), r.contextSentences ? h('div', { class: 'small muted' }, '+ 2 sentences') : null),
          h('td', {}, frac(r.past)),
          h('td', {}, r.sequence ? `${r.sequence.orderCorrect ? 'order ✓' : `order ${r.sequence.positionsCorrect}/4`} · ${r.sequence.questionsCorrect}/3` : '—', r.sequenceExtension ? h('div', { class: 'small muted' }, '+ extension') : null),
          h('td', {}, r.story ? `${r.story.words} words${r.story.revised ? ' · revised' : ''}` : '—'),
          h('td', { class: 'small' }, [r.supports.contextStarters && 'P3 starters', r.supports.sequenceStarters && 'P5 starters', r.supports.story && 'P6 support'].filter(Boolean).join(', ') || '—'),
          h('td', { class: 'small' }, r.reflection?.strength || '—'),
          h('td', { class: 'ts' }, fmtTime(r.lastActivityAt))))))));
    }

    async function detail(id) {
      const d = await api('GET', `/api/teacher/diag/detail/${id}`);
      const s = d.summary, sec = d.sections, c = d.content;
      const panel = h('div', { class: 'drawer-panel', role: 'dialog', 'aria-label': `Antes de empezar — ${s.name}` });
      const drawer = h('div', { class: 'drawer', onclick: e => { if (e.target === drawer) close(); } }, panel);
      function close() { drawer.remove(); document.removeEventListener('keydown', onEsc); }
      function onEsc(e) { if (e.key === 'Escape') close(); }
      document.addEventListener('keydown', onEsc);
      const card = (title, ...kids) => h('div', { class: 'card', style: 'margin-top:1rem' }, h('h2', {}, title), ...kids);
      const nd = h('p', { class: 'muted' }, 'Not done yet.');
      const choiceList = (items, x, showQ) => x ? h('div', {}, x.feedback.items.map((it, i) => {
        const q = items.find(y => y.id === it.id);
        return h('div', { class: 'fb-item small' }, h('div', {}, `${i + 1}. `, rich(q.sentence)), showQ ? h('div', { class: 'muted' }, q.q) : null,
          h('div', {}, 'Chose: ', h('b', {}, it.chosenText || '—'), ' ', it.correct ? '✓' : it.notSure ? '(not sure yet)' : `✗ — meaning: ${it.answer}`));
      }), x.retries.length ? h('p', { class: 'small muted' }, `Practice retries (saved separately): ${x.retries.map(r => `${r.result.correct}/${r.result.total}`).join(', ')}`) : null) : nd;
      const byId = Object.fromEntries(c.sentences.map(x => [x.id, x.text]));
      panel.append(
        h('div', { class: 'row' }, h('h1', { style: 'margin:0' }, s.name), h('span', { style: 'flex:1' }), h('button', { class: 'btn small', type: 'button', onclick: close }, 'Close')),
        h('p', { class: 'muted' }, `${s.course} · Block ${s.block} · ${s.status === 'complete' ? 'Complete ' + fmtTime(s.completedAt) : `${s.sectionsDone} of ${s.sectionsTotal} parts`} · started ${fmtTime(s.startedAt)}`),
        h('div', { class: 'row' },
          h('a', { class: 'btn small', href: `/api/teacher/diag/download?id=${encodeURIComponent(id)}` }, 'Download'),
          h('button', { class: 'btn small danger', type: 'button', onclick: async () => {
            if (prompt(`Type DELETE to permanently delete this attempt by ${s.name}.`) !== 'DELETE') return;
            await api('DELETE', `/api/teacher/diag/attempts/${id}`, { confirm: 'DELETE' }); close(); diagTab(body);
          } }, 'Delete attempt')),
        card('1. ¿Qué sabes de Puerto Rico?', sec.background ? c.background.map(q => h('p', { class: 'small' }, h('b', {}, q.q), h('br'), sec.background.data.answers[q.id] || '—')) : nd),
        card('2. Vocabulary confidence', sec.confidence ? h('div', { class: 'small' }, c.levels.map(l => h('p', {}, h('b', {}, l.label + ' '),
          c.expressions.filter(x => sec.confidence.data.ratings[x.id] === l.id).map(x => x.es).join(', ') || '—'))) : nd),
        card(`3. Vocabulary in context${s.context ? ` — first try ${s.context.correct}/${s.context.total}` : ''}`, choiceList(c.context, sec.context),
          sec.context?.followup ? h('div', {}, h('h3', {}, `Two sentences${sec.context.followup.data.startersOpened ? ' (opened starters)' : ''}`),
            h('ul', { lang: 'es' }, sec.context.followup.data.sentences.map(x => h('li', {}, h('b', {}, x.expression), ' — ', x.text)))) : null),
        card(`4. Understand the past${s.past ? ` — first try ${s.past.correct}/${s.past.total}` : ''}`, choiceList(c.past, sec.past, true)),
        card('5. Build a story', sec.sequence ? h('div', { class: 'small' },
          h('p', {}, h('b', {}, 'First-try order: '), sec.sequence.data.order.map(x => byId[x]).join(' → '), s.sequence.orderCorrect ? ' ✓' : ` (${s.sequence.positionsCorrect}/4 in place)`),
          sec.sequence.feedback.questions.map(q => h('p', {}, q.q, ' — ', q.correct ? '✓' : q.notSure ? 'not sure yet' : '✗')),
          sec.sequence.retries.length ? h('p', { class: 'muted' }, `Practice retries: ${sec.sequence.retries.length}`) : null,
          sec.sequence.followup ? h('p', {}, h('b', {}, `Extension${sec.sequence.followup.data.startersOpened ? ' (opened starters)' : ''}: `), h('span', { lang: 'es' }, sec.sequence.followup.data.text)) : h('p', { class: 'muted' }, 'Extension not written.')) : nd),
        card('6. Tell your own story', h('p', { class: 'small muted' }, c.storyPrompt), sec.story ? h('div', {},
          h('h3', {}, `Original — independent${s.supports.story ? ' (opened optional support)' : ' (no supports opened)'} · ${s.story.words} words`),
          h('div', { class: 'initial-text', lang: 'es' }, sec.story.data.text),
          sec.story.followup ? [h('h3', { style: 'margin-top:1rem' }, 'Revision — after checklist and model'), h('div', { class: 'initial-text', lang: 'es' }, sec.story.followup.data.text)] : null) : nd),
        card('Final reflection', sec.reflection ? h('div', { class: 'small' }, h('p', {}, h('b', {}, 'Strongest: '), sec.reflection.data.strength),
          h('p', {}, h('b', {}, 'Wants help with: '), sec.reflection.data.help), h('p', {}, h('b', {}, 'Expressions to learn: '), sec.reflection.data.expressions.join(', '))) : nd));
      document.body.append(drawer);
    }
  };
})();
