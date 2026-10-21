// Student-facing content: directions, prompts and course targets.
// Prompts and directions are displayed in English; students write in Spanish.

export const DIRECTIONS = [
  'Write in Spanish using your own words. Describe people, places, and feelings with details, and organize events so your reader can follow your story. Include what happened and how the experience ended. When asked, connect your experience to the present or future.',
  'You may describe a real or imagined experience. If you cannot remember a word, try explaining the idea another way. Do not use translators or AI tools.'
];

export const PROMPTS = [
  {
    no: 1,
    title: 'A Celebration You Remember',
    intro: 'A youth magazine is collecting stories about memorable celebrations. Write about a celebration you remember well.',
    bullets: [
      'Describe where it took place, who was there, and what the atmosphere was like.',
      'Tell what happened from beginning to end, including a special or unexpected moment.',
      'Explain how you felt and why this celebration stands out in your memory.',
      'Describe how you celebrate this occasion now and how you would like to celebrate it next time.'
    ]
  },
  {
    no: 2,
    title: 'A Team Challenge',
    intro: 'Your school newspaper is collecting stories about students working together. Write about a time you worked with a group on a project, played on a team, or helped organize an activity.',
    bullets: [
      "Describe the people involved, your group's goal, and what the situation was like at the beginning.",
      'Tell the story of a problem or disagreement: what happened, what people did, and how it ended.',
      "Include details that help your reader understand your feelings and the group's decisions.",
      'Describe how you work with others now and what you will do the next time a problem comes up.'
    ]
  },
  {
    no: 3,
    title: 'The First Time',
    intro: 'A student website is publishing stories about trying something new. Write about the first time you did something that made you feel nervous, excited, or curious.',
    bullets: [
      'Describe the setting, the people involved, and how you felt before you started.',
      'Tell what happened and how you reacted during the experience.',
      'Explain how the experience ended and describe one moment you remember clearly.',
      'Describe how you feel about similar situations now and what you will do the next time you try something new.'
    ]
  }
];

export const CLASSES = ['Spanish 4CP', 'Spanish 4H', 'Spanish 5'];

// Course targets shape coaching only. They are never sent to the rating step.
export const COURSE_TARGETS = {
  'Spanish 4CP': {
    target: 'Intermediate Mid',
    note: 'Past narration is still developing. Coach toward consistent, connected sentences with personal detail, and toward clearer past-time storytelling.'
  },
  'Spanish 4H': {
    target: 'Intermediate High',
    note: 'Developing sustained narration and paragraph organization. Coach toward connected sentences that build into organized paragraphs and a story that holds together.'
  },
  'Spanish 5': {
    target: 'Advanced Low',
    note: 'Coach toward organized paragraphs that combine narration and detailed description, with control of past, present and future as the prompt requires.'
  }
};

export const LABEL = 'AI practice estimate—not an official AAPPL score';

export function promptAsText(p) {
  return `${p.title}\n${p.intro}\n${p.bullets.map(b => '- ' + b).join('\n')}`;
}
