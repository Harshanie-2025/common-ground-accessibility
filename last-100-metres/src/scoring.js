import { CATEGORY_KEYS, PERSONAS, PLACES, ISSUE_TITLES } from './data.js';

export function priorityBand(score) {
  if (score >= 75) return ['Critical', 'var(--c1)'];
  if (score >= 55) return ['High', 'var(--c2)'];
  if (score >= 35) return ['Medium', 'var(--c3)'];
  return ['Low', 'var(--c4)'];
}

export function calculateScore(issue, personaId = 'wheel') {
  const impactWeight = PERSONAS[personaId].weights[CATEGORY_KEYS.indexOf(issue.type)];
  let nearest = null;
  PLACES.forEach((place) => {
    const distance = Math.hypot(place.x - issue.x, place.y - issue.y) * 2.5;
    const exposure = Math.max(0, 1 - distance / 150) * place.weight;
    if (!nearest || exposure > nearest.exposure || (exposure === nearest.exposure && distance < nearest.distance)) {
      nearest = { exposure, distance, name: place.name };
    }
  });

  const impact = 45 * impactWeight;
  const footfall = 25 * (.15 + .85 * nearest.exposure);
  const corroboration = 15 * Math.min(1, issue.reports / 5);
  const age = 15 * Math.min(1, issue.age / 30);
  return {
    weight: impactWeight,
    impact,
    footfall,
    corroboration,
    age,
    distance: Math.round(nearest.distance),
    place: nearest.name,
    total: Math.round(impact + footfall + corroboration + age),
  };
}

export function explainScore(issue, breakdown, personaId) {
  const plural = PERSONAS[personaId].plural;
  const impact = breakdown.weight >= .9 ? 'A complete roadblock for'
    : breakdown.weight >= .6 ? 'A serious barrier for'
      : breakdown.weight >= .3 ? 'An annoyance for' : 'Barely affects';
  return `${impact} ${plural}. ${breakdown.distance} m from the ${breakdown.place}, ${issue.reports} report${issue.reports > 1 ? 's' : ''}, open ${issue.age} day${issue.age === 1 ? '' : 's'}.`;
}

export function distanceToSegment(point, segment) {
  const [x1, y1, x2, y2] = segment;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const ratio = Math.max(0, Math.min(1, ((point.x - x1) * dx + (point.y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - x1 - ratio * dx, point.y - y1 - ratio * dy);
}

export { ISSUE_TITLES };
