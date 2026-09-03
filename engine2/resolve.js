"use strict";
/**
 * Turn resolution — matches the behaviour of resolve() in clash-playtest-familywheel.html
 * and implements game-spec-v2.md §5.4 exactly.
 *
 * All functions are pure: no mutation of the arguments.
 */

const { RULE_SET, BOND_VALUE, BLOCKS, FAMILY_OF, STAKE_CAP } = require("./constants");

// ── Family helpers ───────────────────────────────────────────────────────────

function familyOf(card) {
  return FAMILY_OF[card.trait];
}

/**
 * Returns true if cardA's family blocks cardB's family.
 * i.e. BLOCKS[family(A)] === family(B)
 */
function blocks(cardA, cardB) {
  return BLOCKS[familyOf(cardA)] === familyOf(cardB);
}

// ── Bond / block computation ─────────────────────────────────────────────────

/**
 * @param {object} anchor   card object
 * @param {object} played   card object
 * @param {object} oppPlayed  the opponent's played card (needed for blocking check)
 * @param {string} ruleSet
 * @returns {{ wouldBond: boolean, blocked: boolean, bonded: boolean }}
 */
function computeBond(anchor, played, oppPlayed, ruleSet) {
  let wouldBond;
  if (ruleSet === RULE_SET.CREW) {
    wouldBond = anchor.trait === played.trait;
  } else {
    // FAMILY_WHEEL
    wouldBond = familyOf(anchor) === familyOf(played);
  }

  // Blocking only applies in FAMILY_WHEEL.
  // "Their played card cancels YOUR bond."
  // aBlocked = BLOCKS[family(oppPlayed)] === family(myPlayed)
  // i.e. the opponent's played card's family beats our played card's family
  let blocked = false;
  if (ruleSet === RULE_SET.FAMILY_WHEEL && oppPlayed) {
    blocked = blocks(oppPlayed, played);
  }

  return { wouldBond, blocked, bonded: wouldBond && !blocked };
}

/**
 * Assert that a and b can't both be blocked simultaneously (wheel invariant).
 * The wheel is a 3-cycle: if A beats B, B can't beat A.
 */
function assertNeverMutualBlock(aBlocked, bBlocked) {
  if (aBlocked && bBlocked) {
    throw new Error("Invariant violated: both sides blocked simultaneously — wheel is a 3-cycle");
  }
}

// ── Pair totals ──────────────────────────────────────────────────────────────

/**
 * Compute the pair totals for one side.
 * @param {object} anchor
 * @param {object} played
 * @param {boolean} bonded
 * @param {string} ruleSet
 * @returns {{ power: number, speed: number, wits: number }}
 */
function pairTotals(anchor, played, bonded, ruleSet) {
  const bond = bonded ? BOND_VALUE[ruleSet] : 0;
  return {
    power: anchor.power + played.power + bond,
    speed: anchor.speed + played.speed + bond,
    wits:  anchor.wits  + played.wits  + bond,
  };
}

// ── Full turn resolution ─────────────────────────────────────────────────────

/**
 * Resolve a single turn.
 *
 * @param {object} opts
 * @param {object} opts.aAnchor    Player A's anchor card
 * @param {object} opts.aPlayed   Player A's played card
 * @param {string} opts.aCat      Player A's chosen category ("power"|"speed"|"wits")
 * @param {object} opts.bAnchor    Player B's anchor card
 * @param {object} opts.bPlayed   Player B's played card
 * @param {string} opts.bCat      Player B's chosen category
 * @param {number} opts.stake     Current stake value
 * @param {string} [opts.ruleSet] Defaults to FAMILY_WHEEL
 *
 * @returns {object} TurnResult:
 *   {
 *     a: SideResult, b: SideResult,
 *     winner: "a"|"b"|null,
 *     stakeAwarded: number,
 *     newStake: number,
 *     decidedBy: "hit"|"attackSize"|"tie"
 *   }
 *
 * SideResult: { cardId, category, totals, wouldBond, blocked, bonded, hit }
 */
function resolveTurn({
  aAnchor, aPlayed, aCat,
  bAnchor, bPlayed, bCat,
  stake,
  ruleSet = RULE_SET.FAMILY_WHEEL,
}) {
  // 1. Bond / block
  const aBond = computeBond(aAnchor, aPlayed, bPlayed, ruleSet);
  const bBond = computeBond(bAnchor, bPlayed, aPlayed, ruleSet);

  assertNeverMutualBlock(aBond.blocked, bBond.blocked);

  // 2. Totals
  const aTot = pairTotals(aAnchor, aPlayed, aBond.bonded, ruleSet);
  const bTot = pairTotals(bAnchor, bPlayed, bBond.bonded, ruleSet);

  // 3. Hits — each player's category against the opponent's total in that SAME category
  const aHit = aTot[aCat] - bTot[aCat];
  const bHit = bTot[bCat] - aTot[bCat];

  // 4. Outcome
  let winner, decidedBy;
  if (aHit > bHit) {
    winner = "a"; decidedBy = "hit";
  } else if (bHit > aHit) {
    winner = "b"; decidedBy = "hit";
  } else {
    // Level hits → bigger attacking total
    const aAtk = aTot[aCat];
    const bAtk = bTot[bCat];
    if (aAtk > bAtk) {
      winner = "a"; decidedBy = "attackSize";
    } else if (bAtk > aAtk) {
      winner = "b"; decidedBy = "attackSize";
    } else {
      winner = null; decidedBy = "tie";
    }
  }

  // 5. Stake
  let stakeAwarded = 0;
  let newStake = stake;
  if (winner !== null) {
    stakeAwarded = stake;
    newStake = 1;
  } else {
    newStake = Math.min(stake + 1, STAKE_CAP);
  }

  return {
    a: {
      cardId:    aPlayed.id,
      category:  aCat,
      totals:    aTot,
      wouldBond: aBond.wouldBond,
      blocked:   aBond.blocked,
      bonded:    aBond.bonded,
      hit:       aHit,
    },
    b: {
      cardId:    bPlayed.id,
      category:  bCat,
      totals:    bTot,
      wouldBond: bBond.wouldBond,
      blocked:   bBond.blocked,
      bonded:    bBond.bonded,
      hit:       bHit,
    },
    winner,
    stakeAwarded,
    newStake,
    decidedBy,
  };
}

module.exports = { familyOf, blocks, computeBond, assertNeverMutualBlock, pairTotals, resolveTurn };
