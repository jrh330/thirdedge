/* ═══ THREE-TIER CARD UNIVERSE ══════════════════════════════
   27-total: Standard  — reliable across all attributes  (c0–c20)
   24-total: Focused   — strong in one or two areas      (c21–c38)
   21-total: Specialist — dominant in one, weak in others (c39–c53)
══════════════════════════════════════════════════════════ */
const CARD_MAP   = {};
const CARDS_27   = [];
const CARDS_24   = [];
const CARDS_21   = [];

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

// 27-total (c0–c17: 18 unique shapes)
buildTier([[15,9,3],[15,6,6],[12,12,3],[12,9,6]], CARDS_27);

// 24-total (c21–c38: 18 unique shapes)
buildTier([[15,6,3],[12,9,3],[12,6,6],[9,9,6]], CARDS_24);

// 21-total (c39–c53: 15 unique shapes)
buildTier([[15,3,3],[12,6,3],[9,9,3],[9,6,6]], CARDS_21);

const ALL_CARDS = [...CARDS_27, ...CARDS_24, ...CARDS_21];

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

// Deal a tiered roster: 7 Standard + 4 Focused + 4 Specialist = 15 cards
function dealRoster() {
  return [
    ...shuffle(CARDS_27).slice(0, 7).map(c => c.id),
    ...shuffle(CARDS_24).slice(0, 4).map(c => c.id),
    ...shuffle(CARDS_21).slice(0, 4).map(c => c.id),
  ];
}

module.exports = { ALL_CARDS, CARDS_27, CARDS_24, CARDS_21, CARD_MAP, shuffle, genSeq, genRoomCode, dealRoster };
