// TEST-ONLY stand-in for the Anthropic Messages API. It exercises the app's
// plumbing (structured output, validation, failures, retries). It does NOT
// judge writing quality; evaluator quality is checked with `npm run calibrate`
// against the real API.
import http from 'node:http';

export function startFakeAI() {
  const state = { mode: 'ok', calls: [], byTool: {} };
  const between = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i + a.length); return i < 0 || j < 0 ? '' : s.slice(i + a.length, j).trim(); };
  const firstWords = (t, from, n) => t.split(/\s+/).filter(Boolean).slice(from, from + n).join(' ');
  const server = http.createServer((req, res) => {
    let raw = ''; req.on('data', c => raw += c); req.on('end', () => {
      const body = JSON.parse(raw); const tool = body.tools[0].name; const user = body.messages[0].content;
      state.calls.push({ tool, user, system: body.system }); state.byTool[tool] = (state.byTool[tool] || 0) + 1;
      if (state.mode === 'fail') { res.writeHead(529, { 'content-type': 'application/json' }); return res.end('{"error":{"type":"overloaded_error"}}'); }
      const text = between(user, '<student_writing>', '</student_writing>');
      const bad = state.mode === 'badquote';
      const q = (from, n) => bad ? 'esta cita no existe en el texto' : firstWords(text, from, n);
      let input;
      if (tool === 'record_arc_rating') input = {
        evidence_amount: 'moderate', insufficient_reason: null,
        novice: { rating: 'N-MF', rationale: 'x' }, intermediate: { rating: 'I-MF', rationale: 'x' }, advanced: { rating: 'A-NE', rationale: 'x' },
        dimensions: { task_completion: 'x', description: 'x', narration: 'x', text_type: 'connected_sentences', organization: 'x', elaboration: 'x', comprehensibility: 'x', time_frames: { past: 'attempted', present: 'used', future: 'not_used' }, language_control: 'x' },
        narration_present: false, detailed_description_present: false, paragraph_evidence: 'none',
        advanced_evidence: { narration_quote: null, description_quote: null, paragraph_quote: null }, plain_explanation: 'Stand-in explanation.'
      };
      else if (tool === 'record_feedback') input = {
        strengths: [{ point: 's1', quote: q(0, 3) }, { point: 's2', quote: q(3, 3) }],
        priorities: [{ focus_label: 'Add a future connection', point: 'p1', quote: null, evidence_note: 'No future.' }, { focus_label: 'Connect sentences', point: 'p2', quote: q(0, 2), evidence_note: '' }],
        revision_task: { focus_label: 'Add a future connection', instructions: 'Add two sentences.' },
        examples: [{ original: q(0, 4), improved: firstWords(text, 0, 4) + ' y más', why: 'w' }], target_note: 't', encouragement: 'e'
      };
      else if (tool === 'record_revision_comparison') {
        const rev = between(user, '<revised_version>', '</revised_version>');
        input = { focus_addressed: 'partly', improved: [{ point: 'i', quote: bad ? 'nope nope' : firstWords(rev, 0, 3) }], still_needs: ['n'], summary: 's' };
      } else input = { evidence_amount: 'moderate', novice: { rating: 'N-MF', rationale: 'x' }, intermediate: { rating: 'I-MF', rationale: 'x' }, advanced: { rating: 'A-NE', rationale: 'x' }, consistency: 'c', variation: 'v', next_step: 'n' };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'tool_use', id: 't1', name: tool, input }] }));
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ state, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}
