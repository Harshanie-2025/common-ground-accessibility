export const CATEGORY_KEYS = ['slab', 'ramp', 'pot', 'enc', 'drain', 'tact', 'narrow', 'dark'];

export const ISSUE_TITLES = {
  slab: 'Broken slab',
  ramp: 'Missing curb ramp',
  pot: 'Pothole',
  enc: 'Encroachment',
  drain: 'Open drain',
  tact: 'No tactile paving',
  narrow: 'Blocked path',
  dark: 'No street light',
};

export const PERSONAS = {
  wheel: { name: 'Wheelchair user', plural: 'wheelchair users', icon: '♿', weights: [.8, 1, .7, .9, .6, .1, 1, .3] },
  eld: { name: 'Elderly', plural: 'older walkers', icon: '🧓', weights: [.9, .6, .8, .5, .7, .1, .4, .6] },
  vis: { name: 'Visually impaired', plural: 'visually impaired people', icon: '🦯', weights: [.5, .2, .6, .9, .9, 1, .5, .2] },
  par: { name: 'Parent + stroller', plural: 'parents with strollers', icon: '👶', weights: [.7, 1, .6, .8, .5, 0, .9, .3] },
};

PERSONAS.all = {
  name: 'Everyone',
  plural: 'everyone',
  icon: '👥',
  weights: CATEGORY_KEYS.map((_, index) =>
    Object.values(PERSONAS).reduce((sum, persona) => sum + persona.weights[index], 0) / 4,
  ),
};

export const PLACES = [
  { name: 'Govt. Hospital', x: 400, y: 262, weight: 1, icon: '+' },
  { name: 'Community Centre', x: 170, y: 112, weight: .8, icon: 'C' },
  { name: 'Bus Stop', x: 630, y: 262, weight: .7, icon: 'B' },
  { name: 'Vegetable Market', x: 520, y: 112, weight: .9, icon: 'M' },
  { name: 'Metro Station', x: 170, y: 410, weight: .8, icon: 'T' },
];

const seed = [
  ['slab', 150, 110, 3, 21], ['ramp', 405, 235, 5, 34], ['pot', 300, 262, 2, 9],
  ['enc', 545, 108, 4, 27], ['drain', 172, 330, 2, 15], ['tact', 630, 300, 1, 12],
  ['narrow', 500, 112, 3, 18], ['dark', 400, 380, 2, 40], ['ramp', 172, 140, 2, 8],
  ['enc', 640, 410, 1, 5], ['slab', 402, 150, 2, 16], ['pot', 280, 410, 3, 22],
  ['drain', 560, 262, 1, 3], ['ramp', 628, 235, 4, 30], ['slab', 90, 260, 1, 6],
];

export const REPAIR_COSTS = { slab: 8000, ramp: 25000, pot: 6000, enc: 3000, drain: 15000, tact: 12000, narrow: 4000, dark: 10000 };

export function createSeedIssues() {
  return seed.map(([type, x, y, reports, age], index) => ({ id: index + 1, type, x, y, reports, age, merged: 0 }));
}
