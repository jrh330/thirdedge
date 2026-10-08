const { TIERS, ROSTER_DEAL, HAND_PICKS } = require("./_constants");

/* ═══ THREE-TIER CARD UNIVERSE ══════════════════════════════
   27-total: Standard  — reliable across all attributes
   24-total: Focused   — strong in one or two areas
   21-total: Specialist — dominant in one, weak in others
══════════════════════════════════════════════════════════ */
const CARD_MAP  = {};
const CARDS_BY_TIER = { 27: [], 24: [], 21: [] };

function buildTier(shapes, pool) {
  const seen = new Set();
  shapes.forEach(shape => {
    [
      [shape[0],shape[1],shape[2]], [shape[1],shape[2],shape[0]], [shape[2],shape[0],shape[1]],
      [shape[0],shape[2],shape[1]], [shape[1],shape[0],shape[2]], [shape[2],shape[1],shape[0]],
    ].forEach(p => {
      const key = p.join("-");
      if (!seen.has(key)) {
        seen.add(key);
        const id = `c${Object.keys(CARD_MAP).length}`;
        const card = { id, attrs: [...p] };
        pool.push(card);
        CARD_MAP[id] = card;
      }
    });
  });
}

buildTier([[15,9,3],[15,6,6],[12,12,3],[12,9,6]], CARDS_BY_TIER[27]);
buildTier([[15,6,3],[12,9,3],[12,6,6],[9,9,6]],  CARDS_BY_TIER[24]);
buildTier([[15,3,3],[12,6,3],[9,9,3],[9,6,6]],   CARDS_BY_TIER[21]);

const ALL_CARDS = TIERS.flatMap(t => CARDS_BY_TIER[t]);

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
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Deal a tiered roster using ROSTER_DEAL counts
function dealRoster() {
  return TIERS.flatMap(t => shuffle(CARDS_BY_TIER[t]).slice(0, ROSTER_DEAL[t]).map(c => c.id));
}

// Select a valid hand for the bot using HAND_PICKS counts
function botSelectHand(roster) {
  const byTier = {};
  TIERS.forEach(t => { byTier[t] = []; });
  roster.forEach(id => {
    const card = CARD_MAP[id];
    if (card) byTier[card.attrs.reduce((a,b)=>a+b,0)]?.push(id);
  });
  return TIERS.flatMap(t => shuffle(byTier[t] || []).slice(0, HAND_PICKS[t]));
}

module.exports = { ALL_CARDS, CARDS_BY_TIER, CARD_MAP, shuffle, genSeq, genRoomCode, dealRoster, botSelectHand };
