/* ═══ GAME CONSTANTS ═══════════════════════════════════════════
   Single source of truth for tier structure and card constraints.
   Update here to add/remove tiers or change hand composition.
   Keep in sync with the matching block in public/index.html.
══════════════════════════════════════════════════════════════ */

// Tier totals in descending order
const TIERS = [27, 24, 21];

// Human-readable tier names
const TIER_LABEL = { 27: "Standard", 24: "Focused", 21: "Specialist" };

// Cards dealt per tier into each player's roster (total: 15)
const ROSTER_DEAL = { 27: 7, 24: 4, 21: 4 };

// Cards each player picks per tier for their hand (total: 9)
const HAND_PICKS = { 27: 5, 24: 2, 21: 2 };

// Per-attribute constraints for custom cards
const ATTR_MIN = 3;
const ATTR_MAX = 21;
const ATTR_STEP = 3;

// Maximum custom cards a player can own
const CUSTOM_CARD_LIMIT = 7;

module.exports = { TIERS, TIER_LABEL, ROSTER_DEAL, HAND_PICKS, ATTR_MIN, ATTR_MAX, ATTR_STEP, CUSTOM_CARD_LIMIT };
