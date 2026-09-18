// cardFamily(card) — returns the family string for display
// Works for both minted cards (card.family) and preset cards (card.trait)

const FAMILIES = { Beast: 'Vita', Titan: 'Vita', Machine: 'Arte', Icon: 'Arte', Element: 'Terra', Spirit: 'Terra' };

export function cardFamily(card) {
  if (!card) return '';
  if (card.family === 'Vita' || card.family === 'Terra' || card.family === 'Arte') return card.family;
  if (card.family) return card.family;
  return FAMILIES[card.trait] || '';
}

// famClass(card) — returns CSS class suffix: 'vita' | 'arte' | 'terra'
export function famClass(card) {
  return (cardFamily(card) || '').toLowerCase();
}
