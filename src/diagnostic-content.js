import crypto from 'node:crypto';
// "Antes de empezar: Puerto Rico y nuestras historias" — diagnostic for Spanish 4H / 4CP, Unidad 2.
// Answer keys live only on the server. The page receives questions without the correct answers and
// gets feedback back only after the first attempt has been saved.

export const DIAG_ID = 'unidad2-antes-v1';
export const DIAG_TITLE = 'Antes de empezar: Puerto Rico y nuestras historias';
export const DIAG_COURSES = ['Spanish 4CP', 'Spanish 4H'];
export const NOT_SURE = 'ns'; // option id for "I'm not sure yet" on every question

export const DIRECTIONS = [
  'This activity helps us discover what you already know before our new unit. You will explore vocabulary, share your knowledge of Puerto Rico, and practice understanding and telling stories about the past.',
  'This is graded for completion and thoughtful effort, not correct answers. Some language will be new! Work independently without translators, AI, or internet searches. Use “I’m not sure yet” when you need it.'
];

export const SECTIONS = [
  { key: 'background', no: 1, title: '¿Qué sabes de Puerto Rico?', minutes: '5 minutes' },
  { key: 'confidence', no: 2, title: 'Vocabulary confidence', minutes: '5 minutes' },
  { key: 'context', no: 3, title: 'Vocabulary in context', minutes: '8 minutes' },
  { key: 'past', no: 4, title: 'Understand the past', minutes: '7 minutes' },
  { key: 'sequence', no: 5, title: 'Build a story', minutes: '5 minutes' },
  { key: 'story', no: 6, title: 'Tell your own story', minutes: '8–10 minutes' },
  { key: 'reflection', no: 7, title: 'Final reflection', minutes: '2 minutes' }
];

// ---------- Part 1 ----------
export const BACKGROUND = [
  { id: 'know', q: 'What do you already know about Puerto Rico? Write any facts or associations you have. English or Spanish is fine.' },
  { id: 'history', q: 'What, if anything, do you know about its history or relationship with the United States?' },
  { id: 'today', q: 'What have you heard about life in Puerto Rico today?' },
  { id: 'badbunny', q: 'Have you heard Bad Bunny’s music or seen the short film Debí tirar más fotos? What do you remember? “Not yet” is a valid response.' },
  { id: 'wonder', q: 'What would you like to find out?' }
];

// ---------- Part 2 ----------
export const CONFIDENCE_LEVELS = [
  { id: 'use', label: 'I can use this.' },
  { id: 'recognize', label: 'I recognize it but need help using it.' },
  { id: 'new', label: 'This is new to me.' }
];
export const EXPRESSIONS = [
  { id: 'boricua', es: 'boricua', en: 'Puerto Rican', h: false },
  { id: 'herencia', es: 'la herencia', en: 'heritage', h: false },
  { id: 'mezcla', es: 'una mezcla de', en: 'a mix of', h: false },
  { id: 'ciudadania', es: 'la ciudadanía', en: 'citizenship', h: false },
  { id: 'diaspora', es: 'la diáspora', en: 'the diaspora (people living outside their place of origin)', h: false },
  { id: 'turismo', es: 'el turismo masivo', en: 'mass tourism', h: false },
  { id: 'colonizacion', es: 'la colonización', en: 'colonization', h: false },
  { id: 'hoyendia', es: 'hoy en día', en: 'nowadays', h: false },
  { id: 'reflejar', es: 'reflejar', en: 'to reflect', h: false },
  { id: 'darvoz', es: 'dar voz a', en: 'to give voice to', h: false },
  { id: 'desplazar', es: 'desplazar', en: 'to displace', h: true },
  { id: 'gentrificacion', es: 'la gentrificación', en: 'gentrification', h: true },
  { id: 'aquelentonces', es: 'en aquel entonces', en: 'back then', h: true },
  { id: 'desafio', es: 'un desafío', en: 'a challenge', h: true },
  { id: 'decisivo', es: 'un momento decisivo', en: 'a decisive moment, a turning point', h: true },
  { id: 'seguir', es: 'seguir adelante', en: 'to keep going', h: true },
  { id: 'huella', es: 'dejar huella', en: 'to leave a mark, to have a lasting effect', h: true },
  { id: 'medicuenta', es: 'Me di cuenta de que…', en: 'I realized that…', h: true }
];

// ---------- Part 3 ----------
// sentence uses **…** around the bold expression. options[0] is always the correct one (the page shuffles).
export const CONTEXT = [
  { id: 'c1', h: false, sentence: 'Marisol es **boricua**: nació en Puerto Rico.',
    options: ['Puerto Rican', 'a musician', 'a tourist'],
    explain: '“Boricua” is a proud, everyday word for a Puerto Rican person. The clue: nació en Puerto Rico (she was born in Puerto Rico).' },
  { id: 'c2', h: false, sentence: 'Las recetas de su abuela forman parte de su **herencia** cultural.',
    options: ['culture passed down through generations', 'future travel plans', 'school responsibilities'],
    explain: '“La herencia” is heritage: what is passed down from earlier generations, like grandma’s recipes.' },
  { id: 'c3', h: false, sentence: 'La música combina varios estilos; es **una mezcla de** sonidos.',
    options: ['a combination of', 'a separation from', 'a replacement for'],
    explain: '“Una mezcla de” means a mix or combination of. The clue: combina varios estilos (it combines several styles).' },
  { id: 'c4', h: false, sentence: 'La **diáspora** mantiene conexiones con su lugar de origen aunque vive fuera de él.',
    options: ['people living outside their place of origin who maintain connections to it', 'visitors on a short vacation', 'people who all live in the same neighborhood'],
    explain: '“La diáspora” is a community living away from its place of origin that stays connected to it — for example, Puerto Ricans living in New York or Massachusetts.' },
  { id: 'c5', h: false, sentence: 'El **turismo masivo** lleva grandes cantidades de visitantes a un lugar.',
    options: ['tourism involving very large numbers of visitors', 'moving permanently to another country', 'studying local history'],
    explain: '“El turismo masivo” is mass tourism: grandes cantidades de visitantes (huge numbers of visitors).' },
  { id: 'c6', h: false, sentence: '**Hoy en día**, muchas personas comparten sus recuerdos por internet.',
    options: ['nowadays', 'long ago', 'next year'],
    explain: '“Hoy en día” means nowadays. Notice the present-tense verb comparten (they share).' },
  { id: 'c7', h: false, sentence: 'La canción **refleja** el orgullo que siente por su comunidad.',
    options: ['expresses or shows', 'forgets', 'travels through'],
    explain: '“Reflejar” means to reflect — to show or express something, like pride in a community.' },
  { id: 'c8', h: false, sentence: 'El artista quiere **dar voz a** personas cuyas experiencias reciben poca atención.',
    options: ['help their experiences and perspectives be heard', 'teach everyone to sing', 'speak more loudly than others'],
    explain: '“Dar voz a” means to give voice to: helping people’s experiences be heard when they usually get little attention.' },
  { id: 'c9', h: true, sentence: 'El aumento del alquiler puede **desplazar** a familias que ya no pueden pagar sus viviendas.',
    options: ['force people to leave where they live', 'help people remember', 'invite people to visit'],
    explain: '“Desplazar” means to displace: when rent goes up (el alquiler), families who can’t pay have to leave.' },
  { id: 'c10', h: true, sentence: '**En aquel entonces**, mi abuelo vivía en otra ciudad.',
    options: ['back then', 'right now', 'in the future'],
    explain: '“En aquel entonces” means back then. The verb vivía (he used to live) also points to the past.' },
  { id: 'c11', h: true, sentence: 'Tenía miedo de equivocarme, pero decidí **seguir adelante**.',
    options: ['keep going', 'return home', 'forget what happened'],
    explain: '“Seguir adelante” means to keep going, even when something is hard.' },
  { id: 'c12', h: true, sentence: 'Aquella experiencia **dejó huella**: todavía influye en mis decisiones.',
    options: ['had a lasting effect', 'ended quickly', 'never happened'],
    explain: '“Dejar huella” means to leave a mark. The clue: todavía influye (it still influences).' }
];

// Optional starters for the two sentences after Part 3.
export const CONTEXT_STARTERS = {
  'Spanish 4CP': ['Mi familia es una mezcla de…', 'Hoy en día, muchos jóvenes…', 'La música de Bad Bunny refleja…', 'Mi herencia cultural incluye…', 'Una persona boricua puede…', 'Quiero dar voz a…'],
  'Spanish 4H': ['Hoy en día, muchos jóvenes…', 'Mi herencia cultural refleja…', 'En aquel entonces, mi familia…', 'Una experiencia que dejó huella en mí fue…', 'Me di cuenta de que…', 'A pesar de…, decidí seguir adelante.']
};

// ---------- Part 4 ----------
export const PAST = [
  { id: 'p1', sentence: '**Antes** **vivía** cerca de mis abuelos.',
    q: 'Does this describe life now, life previously, or a future plan?',
    options: ['life previously', 'life now', 'a future plan'],
    explain: 'Antes (before) and vivía (I used to live) describe how life was previously.' },
  { id: 'p2', sentence: 'El sábado **fuimos** a una celebración.',
    q: 'Who went: I, we, or they?',
    options: ['we', 'I', 'they'],
    explain: 'The -mos ending in fuimos tells you it was “we.”' },
  { id: 'p3', sentence: 'Cuando **era** pequeño, **iba** a la playa **todos los veranos**.',
    q: 'Is this a repeated past experience or one specific visit?',
    options: ['a repeated past experience', 'one specific visit'],
    explain: 'Todos los veranos (every summer) and iba (I used to go) show something that happened again and again.' },
  { id: 'p4', sentence: '**Ayer** **conocí** a una persona nueva.',
    q: 'Is the speaker describing a specific past encounter or a current routine?',
    options: ['a specific past encounter', 'a current routine'],
    explain: 'Ayer (yesterday) and conocí (I met) point to one specific moment.' },
  { id: 'p5', sentence: '**Estábamos** nerviosos antes de entrar.',
    q: 'Does this mean “we were nervous,” “they were nervous,” or “we are nervous”?',
    options: ['we were nervous', 'they were nervous', 'we are nervous'],
    explain: 'Estábamos describes how “we” were feeling at that time in the past. “We are” would be estamos.' },
  { id: 'p6', sentence: 'Mi abuelo **me** **contó** una historia.',
    q: 'Who told the story to whom?',
    options: ['my grandfather told me', 'I told my grandfather', 'my grandfather will tell me'],
    explain: 'Contó means he told; me means to me. So my grandfather told me a story.' },
  { id: 'p7', sentence: '**Mientras caminábamos**, **vimos** una tienda nueva.',
    q: 'What was already happening when the speakers noticed the store?',
    options: ['they were walking', 'they were shopping in the store', 'they were waiting at home'],
    explain: 'Mientras caminábamos (while we were walking) sets the scene; vimos (we saw) is what happened in that moment.' },
  { id: 'p8', sentence: '**Me di cuenta de que** el barrio **era** diferente.',
    q: 'Did the speaker realize something, forget something, or make a future plan?',
    options: ['realized something', 'forgot something', 'made a future plan'],
    explain: 'Me di cuenta de que means I realized that. Era describes what the neighborhood was like.' }
];

// ---------- Part 5 ----------
export const STORY_SENTENCES = [
  { id: 's1', text: 'El verano pasado fui a visitar a mis abuelos.' },
  { id: 's2', text: 'Cuando llegué, estaban preparando la comida.' },
  { id: 's3', text: 'Después de comer, mi abuelo sacó unas fotos y me contó una historia.' },
  { id: 's4', text: 'Al final del día, me sentí más cerca de él.' }
];
export const STORY_ORDER = ['s1', 's2', 's3', 's4'];
export const SEQ_QUESTIONS = [
  { id: 'when', q: 'Which sentence establishes when the experience happened?', answer: 's1',
    explain: 'El verano pasado (last summer) tells us when.' },
  { id: 'happening', q: 'Which sentence describes what was happening when the speaker arrived?', answer: 's2',
    explain: 'Estaban preparando (they were preparing) describes the scene already in progress when the speaker arrived (llegué).' },
  { id: 'felt', q: 'Which sentence tells how the speaker felt afterward?', answer: 's4',
    explain: 'Me sentí (I felt) tells the feeling at the end — al final del día.' }
];
export const SEQ_EXTENSION = {
  'Spanish 4CP': { task: 'Add one sentence to the story describing a person, the place, or a feeling.', starters: ['Mi abuelo era…', 'La casa era…', 'Estaba…'] },
  'Spanish 4H': { task: 'Add two connected sentences that develop an event, a reaction, or why the experience mattered.', starters: [] }
};

// ---------- Part 6 ----------
export const STORY_PROMPT = {
  'Spanish 4CP': {
    prompt: 'Think of a visit, celebration, or activity you remember. Describe where you were and who was there. Tell what you did and how you felt. Try to explain what happened first and next.',
    note: 'Use the Spanish you know. If you cannot tell the whole story in the past yet, write what you can.',
    supports: ['Fui a…', 'Estaba con…', 'El lugar era…', 'Primero…', 'Después…', 'Al final…', 'Me sentí…'],
    checklist: ['Did you say where you were and who was there?', 'Did you tell what happened first and next?', 'Did you say how you felt?', 'Can you add one more detail about a person or the place?'],
    model: 'El verano pasado fui a la playa con mi familia. Hacía sol y el agua estaba fría. Primero, nadamos y jugamos al vóleibol. Después, comimos pescado en un restaurante pequeño. Al final, me sentí cansado pero muy feliz.'
  },
  'Spanish 4H': {
    prompt: 'Tell about an experience you remember clearly. Describe the setting and people, explain what happened in a connected sequence, and include reactions and the outcome. Explain why you remember the experience or how it influenced you.',
    note: '',
    supports: ['Una experiencia que me marcó fue…', 'En aquel entonces…', 'Mientras…', 'Al principio…', 'Tuve que…', 'Me di cuenta de que…', 'A pesar de…', 'Al final…', 'Aprendí que…'],
    checklist: ['Did you describe the setting and the people?', 'Do your events connect in order (al principio, mientras, después, al final)?', 'Did you include reactions and how it turned out?', 'Did you explain why you remember it or how it influenced you?'],
    model: 'Una experiencia que me marcó fue la boda de mi prima. En aquel entonces, yo tenía doce años y no conocía a muchos de mis parientes. Mientras todos bailaban salsa, yo estaba sentado solo y tenía vergüenza. Al principio, no quería bailar, pero mi abuela me tomó de la mano. Tuve que intentarlo y me equivoqué muchas veces, pero todos se reían conmigo. Al final, me di cuenta de que mi familia era más grande de lo que pensaba. Aprendí que es importante conectar con mis raíces.'
  }
};

// ---------- Final reflection ----------
export const STRENGTH_OPTIONS = ['Vocabulary', 'Understanding past forms', 'Organizing a story', 'Adding details'];

// ---------- helpers ----------
export const isH = course => course === 'Spanish 4H';
export const expressionsFor = course => EXPRESSIONS.filter(x => !x.h || isH(course));
export const contextFor = course => CONTEXT.filter(x => !x.h || isH(course));
// Option ids are opaque hashes, and options are sent sorted by id, so the page source never reveals the answer.
export const optId = (q, text) => 'o' + crypto.createHash('sha256').update(`${DIAG_ID}|${q.id}|${text}`).digest('hex').slice(0, 8);
const publicOptions = q => q.options.map(text => ({ id: optId(q, text), text })).sort((a, b) => a.id.localeCompare(b.id));
export const validOption = (q, v) => v === NOT_SURE || q.options.some(t => optId(q, t) === v);

// What the page is allowed to see before submitting (no answers, no glosses).
export function publicContent(course) {
  return {
    id: DIAG_ID, title: DIAG_TITLE, directions: DIRECTIONS, sections: SECTIONS, course,
    background: BACKGROUND,
    confidence: { levels: CONFIDENCE_LEVELS, expressions: expressionsFor(course).map(({ id, es }) => ({ id, es })) },
    context: contextFor(course).map(q => ({ id: q.id, sentence: q.sentence, options: publicOptions(q) })),
    contextStarters: CONTEXT_STARTERS[course],
    past: PAST.map(q => ({ id: q.id, sentence: q.sentence, q: q.q, options: publicOptions(q) })),
    sequence: { sentences: STORY_SENTENCES, questions: SEQ_QUESTIONS.map(({ id, q }) => ({ id, q })), extension: SEQ_EXTENSION[course] },
    story: { prompt: STORY_PROMPT[course].prompt, note: STORY_PROMPT[course].note, supports: STORY_PROMPT[course].supports },
    strengths: STRENGTH_OPTIONS,
    allExpressions: expressionsFor(course).map(x => x.es)
  };
}

// ---------- scoring (feedback only; never combined into one grade) ----------
function scoreChoices(items, answers) {
  const res = items.map(q => {
    const a = answers?.[q.id];
    const chosen = typeof a === 'string' ? a : null;
    return { id: q.id, chosen, correct: chosen === optId(q, q.options[0]), notSure: chosen === NOT_SURE, blank: !chosen,
      answer: q.options[0], chosenText: chosen === NOT_SURE ? 'I’m not sure yet' : (chosen && q.options.find(t => optId(q, t) === chosen)) || null,
      explain: q.explain, sentence: q.sentence };
  });
  return { items: res, correct: res.filter(r => r.correct).length, notSure: res.filter(r => r.notSure).length, total: res.length };
}
export const scoreContext = (course, answers) => scoreChoices(contextFor(course), answers);
export const scorePast = answers => scoreChoices(PAST, answers);

export function scoreSequence(data) {
  const order = Array.isArray(data?.order) ? data.order.filter(x => STORY_ORDER.includes(x)) : [];
  const orderCorrect = order.length === 4 && order.every((x, i) => x === STORY_ORDER[i]);
  const positionsCorrect = STORY_ORDER.filter((x, i) => order[i] === x).length;
  const qs = SEQ_QUESTIONS.map(q => {
    const chosen = data?.questions?.[q.id] || null;
    return { id: q.id, q: q.q, chosen, correct: chosen === q.answer, notSure: chosen === NOT_SURE, answer: q.answer,
      answerText: STORY_SENTENCES.find(s => s.id === q.answer).text, explain: q.explain };
  });
  return { order, orderCorrect, positionsCorrect, correctOrder: STORY_ORDER, questions: qs, questionsCorrect: qs.filter(q => q.correct).length };
}

export const confidenceFeedback = course => expressionsFor(course).map(({ id, es, en }) => ({ id, es, en }));
