/* ═══ THE 21-CARD UNIVERSE ════════════════════════════════
   Values restricted to {3,6,9,12,15}, always summing to 27.
   18 unique permutations + 3 copies of the balanced 9-9-9.
══════════════════════════════════════════════════════════ */
const CAP = 27;
const ALL_CARDS = [];
const seen = new Set();
const BASE = [
  [15,9,3],  // 6 permutations → specialist cards
  [15,6,6],  // 3 permutations → strong cards
  [12,12,3], // 3 permutations → dual cards
  [12,9,6],  // 6 permutations → mild cards
];
BASE.forEach(shape => {
  const perms = [
    [shape[0],shape[1],shape[2]],[shape[1],shape[2],shape[0]],[shape[2],shape[0],shape[1]],
    [shape[0],shape[2],shape[1]],[shape[1],shape[0],shape[2]],[shape[2],shape[1],shape[0]],
  ];
  perms.forEach(p => {
    const key = p.join("-");
    if (!seen.has(key)) {
      seen.add(key);
      ALL_CARDS.push({ id: `c${ALL_CARDS.length}`, attrs: [...p] });
    }
  });
});
// 3 copies of the balanced 9-9-9 card
for (let i = 0; i < 3; i++) {
  ALL_CARDS.push({ id: `c${ALL_CARDS.length}`, attrs: [9, 9, 9] });
}

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

function dealCards(n) {
  return shuffle(ALL_CARDS).slice(0, n).map(c => c.id);
}

module.exports = { ALL_CARDS, VALID_IDS, validateCardIds, shuffle, genSeq, genRoomCode, dealCards, CAP };
