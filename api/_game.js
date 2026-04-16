/* ═══ THE 28-CARD UNIVERSE ════════════════════════════════ */
const CAP = 27;
const ALL_CARDS = [];
const seen = new Set();
const BASE = [
  [21,3,3],[18,6,3],[18,3,6],[15,9,3],[15,3,9],[15,6,6],
  [12,12,3],[12,3,12],[12,9,6],[12,6,9],[9,9,9]
];
BASE.forEach(shape => {
  const perms = [
    [shape[0],shape[1],shape[2]],[shape[1],shape[2],shape[0]],[shape[2],shape[0],shape[1]],
    [shape[0],shape[2],shape[1]],[shape[1],shape[0],shape[2]],[shape[2],shape[1],shape[0]],
  ];
  perms.forEach(p => {
    const key = p.join("-");
    if (!seen.has(key) && p[0]+p[1]+p[2] === CAP && p.every(v => v >= 3)) {
      seen.add(key);
      ALL_CARDS.push({ id: `c${ALL_CARDS.length}`, attrs: [...p] });
    }
  });
});

// Card ID set for validation
const VALID_IDS = new Set(ALL_CARDS.map(c => c.id));

function validateCardIds(ids, count) {
  if (!Array.isArray(ids) || ids.length !== count) return false;
  return ids.every(id => VALID_IDS.has(id));
}

function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function genSeq() {
  return shuffle([0,0,0,1,1,1,2,2,2]);
}

function genRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

module.exports = { ALL_CARDS, VALID_IDS, validateCardIds, shuffle, genSeq, genRoomCode, CAP };
