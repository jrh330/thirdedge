export const FAMILY_COLORS = {
  Vita:  { bg: '#FF5A1F', text: '#1B1026' },
  Terra: { bg: '#FFD23F', text: '#1B1026' },
  Arte:  { bg: '#7B4DFF', text: '#ffffff' },
};

export const FAMILY_ICONS = {
  Vita: (
    `<path d="M3 13 C3 6 7 3 13 3 C13 10 9 13 3 13 Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.8"/>` +
    `<path d="M3 13 L9 7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>`
  ),
  Terra: `<path d="M1.6 13 L5.6 5.2 L8.4 9.6 L10.4 6.4 L14.4 13 Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.7"/>`,
  Arte: (
    `<polygon fill="none" points="8,1.8 13.6,5 13.6,11 8,14.2 2.4,11 2.4,5" stroke="currentColor" stroke-linejoin="round" stroke-width="1.8"/>` +
    `<circle cx="8" cy="8" fill="none" r="2.3" stroke="currentColor" stroke-width="1.8"/>`
  ),
};

export function FamilyIcon({ family, size = 16, style }) {
  if (!FAMILY_ICONS[family]) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={style}
         dangerouslySetInnerHTML={{ __html: FAMILY_ICONS[family] }} />
  );
}
