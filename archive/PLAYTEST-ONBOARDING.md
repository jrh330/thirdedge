# Playtest onboarding, routing and admin — build brief

*2026-09-20. For Claude Code, from a design review in Cowork of the current playtest flow diagram.
Goal: a new tester can open one link on a cold phone and be playing a match in under a minute, and
Jonathan can run a test session from the admin page without touching the database.*

Written against the repo as it stands: `/join/:token` → `api2/join-invite.js`, the SPA at `/mint`
(`client/src/App.jsx`, screen held in reducer state), `api2/admin-page.js`, `api2/admin-invites.js`,
`api2/fill-test.js`, `api2/collection*.js`, `api2/create|join|poll|action.js`.

## The five problems

1. **One URL does three jobs.** `/mint?code=XXXX` is the card-maker, the game invite, and an identity
   checkpoint. Identity ("who are you") and destination ("where were you going") are tangled.
2. **Dead ends.** `NoSession` and the invite-error HTML end the journey. In a playtest each one is a text
   message to Jonathan.
3. **Every screen decides for itself what to show.** `collection-state` is fetched and branched on in
   several places; they can disagree, and the admin page has its own idea again.
4. **Nothing resumes.** Close the tab mid-match (phones do this constantly) and there is no way back in.
5. **The 0-card wall.** A new tester lands on Make with no context and can't play until 12 cards exist.

**And the catch in the proposed welcome fork:** "Make my own card first" leads back to the same wall —
one card is not 12. The fix below removes the wall instead of forking around it.

## What to build

### 1. Routes: identity separate from destination

| Route | Does |
|---|---|
| `/j/:token` (keep `/join/:token` as an alias) | Claim the invite → set the session cookie → redirect to `?next=` if present and same-origin, else `/play` |
| `/play` | **Home.** Your cards, a big Play button, Make a card, and the resume banner |
| `/make` | The creation funnel (Make → Crop → Check → Reveal), as today |
| `/g/:code` | A match: join it, or resume it. **No session → bounce to `/j` flow with `?next=/g/:code`** |
| `/admin` | As today, plus §5 |
| `/mint` | Redirect to `/play` (keep the path alive for old links) |

The SPA keeps its internal step state; it just needs the browser URL to match these four entry points so
a link can be sent to a person and land them in the right place. `?code=` on `/mint` goes away.

#### Route details (added 2026-09-20, answering the server phase)

- **Redirects are 302, never 301** — a 301 to `/play` will be cached in testers' browsers forever.
  Add `Cache-Control: no-store` to the claim response; keep the existing `Referrer-Policy: no-referrer`
  so tokens don't leak, and never log a full token.
- **`?next=` is validated, not trusted.** Accept only a relative path beginning with a single `/` and
  matching `^/(play|make|g/[A-Za-z0-9]{4,8})$`. Anything else (absolute URL, `//host`, unknown path)
  falls back to `/play`.
- **Legacy links keep working:** `/mint?code=XXXX` → 302 `/g/XXXX`; `/mint` and `/mint/*` → 302 `/play`.
  Old invite links are `/join/:token`, so that path stays as an alias of `/j/:token` permanently.
- **`/g/:code` with no session** renders the identity page (§4) with the code field, carrying
  `next=/g/CODE` through, so a cold device lands in the match after claiming.
- **`POST /claim`** — body `{ code, next }` — is the escape hatch behind every dead end: it accepts a
  typed invite code (or a pasted token), claims it exactly as `/j/:token` does, and redirects to `next`.
  Rate-limit it (say 10 attempts per IP per minute) since it's a guessable-code endpoint.
- **Match codes** are normalized to uppercase and compared case-insensitively; invite tokens stay
  case-sensitive base64url.
- **Serving:** `/play`, `/make`, `/g/:code` all serve the built client's `index.html` (the SPA reads the
  path on boot). Register them before the static catch-all, and keep `/api`, `/api2`, `/admin`, `/j`,
  `/join` and `/claim` ahead of it so nothing is shadowed. Unknown paths → 404, not the SPA.
- **Name the state endpoint `/api2/me`**, keeping `/api2/player` as an alias until the client stops
  calling it.

### 2. One endpoint that says what comes next

`GET /api2/me` → the only thing the client branches on:

```json
{
  "player":    { "id": "p_123", "name": "Maya" },
  "needsName": false,
  "cards":     { "total": 12, "active": 12, "inactive": 0, "samples": 12 },
  "pending":   0,
  "liveMatch": { "code": "K7QP", "role": "creator", "startedAt": 1758… },
  "nextStep":  "play"
}
```

`nextStep` ∈ `welcome | name | make | play | resume | collection_full`. `401` keeps its
`{ error: "no_session" }` shape. The admin page reads the same object per player (`GET
/admin/players/:id/state`), so the two can never disagree.

### 3. Starter cards at invite time, not as a fork

- `POST /admin/invites` gains `withSampleDeck` (default **true**): after creating the player, run the
  same code path as `api2/fill-test.js` so the player exists **already holding 12 legal cards**
  (≤ 6 per family, ≤ 3 sevens — the checks in `engine2/constants` already apply).
- Mark them: `source: "sample"` on each card in `cardsv2`. Samples must be excluded from minting
  statistics and from the duplicate fingerprint (a tester must still be able to mint their own Chess).
- A new tester therefore lands on `/play` with a playable deck. **Play works from the first second**, and
  making a card becomes an invitation rather than a prerequisite.
- Keep `POST /api2/collection/fill-test`, but restrict it to admin callers or to a player with 0 cards.
- Add `POST /api2/collection/clear-samples` (deletes only `source: "sample"` cards, exempt from the
  5-minute delete cooldown) for a tester who wants a clean collection of their own cards.

#### Sample-deck implementation notes (added 2026-09-20)

- **`giveSampleDeck(playerId, db)` must be idempotent and self-contained:** it writes the 12 cards **and**
  sets the collection's `active` list to them. Called twice, it tops up rather than duplicating. Return
  `{ given: n }`.
- **A failed sample deck must not fail the invite.** Create the player, log the error, leave the admin's
  "give 12 sample cards" button to retry. A tester with no cards is recoverable; a missing invite is not.
- **Canonical flag:** keep `isTestCard: true` for back-compat but filter on `source: 'sample'` in new
  code, and backfill `source` onto existing test cards in a one-off script so old testers match.
- **Samples count toward the 20-card cap** (one rule, no special case). So the Make screen's "collection
  full" state must offer **Clear sample cards** when the player still holds some — that's the release
  valve.
- **`clearSamples` has to repair the collection:** remove the cleared ids from `active`, `inactive` and
  any saved deck (a saved deck missing cards shows "Needs N cards", as designed), and refuse while the
  player is in a live match.
- **Log a `samples_given` event** with the count, so the funnel data shows who started with a deck.

**One choice for Jonathan:** does every tester get the *same* 12 sample cards, or a different legal 12
each? Same makes matches comparable; different makes early playtests more informative. Recommended:
different per player (derive from the player id so it is reproducible), with an admin option to give a
pair the identical deck when that's what the test needs.

### 4. Never a dead end

Every failure state gets a heading, one sentence, and at least one button:

| State | Say | Offer |
|---|---|---|
| No session | "This device isn't signed in." | A field to paste an invite code, plus "Ask Jonathan for a link" |
| Unknown or revoked token | "This invite isn't valid any more." | The same code field |
| Token already claimed, no cookie on this device | "Continue as **Maya**?" | **Continue** / "I'm someone else" (prevents a group-chat link making two people share one account) |
| Match not found / already full | "That match has gone." | Back to `/play` |
| Collection full (20) | as designed | Your cards |
| Card declined | as designed — **keep the picture and text in the form** | Edit |
| Card in review | "Someone will take a look." | Make another / Your cards |

Replace the plain HTML in `api2/join-invite.js` with a page carrying the code field.

### 5. Admin page as the control room

Per tester: name, card count (own vs sample), current match, last seen. Actions: **create invite**
(name → link + short 6-character code), **resend/copy link**, **give 12 sample cards**, **clear sample
cards**, **reset tester** (new session version, wipe cards), **revoke**.

Plus, the one that removes most of the friction:

- **Pair two testers** → creates the match server-side and returns **two links**, one per tester, each
  dropping that person straight into it (`/g/:code`, with `/j/:token?next=/g/:code` for a cold device).
  No create-share-wait dance when Jonathan is running the session himself.
- **Live matches** list: code, players, round, age, and a spectate or force-end button.

### 6. Resume and the teaching moment

- Any entry point with a `liveMatch` shows a banner: **"Match with Sam in progress — rejoin."**
- After a match ends, the end screen offers **"Make your own card and swap it in"** → `/make`. That is
  the natural moment to teach minting, and it exercises the active/inactive swap rules.

### 7. Instrument the funnel

Write one `events` document per step: `invite_opened`, `session_created`, `name_set`,
`samples_given`, `make_started`, `check_passed`, `check_declined`, `card_minted`, `match_created`,
`match_joined`, `match_finished`, `rejoined`. Fields: `playerId`, `event`, `at`, optional `matchCode`.
Then a stall shows up in the data instead of in a text message.

## Acceptance checks

1. **Cold phone, one link.** Open `/j/:token` in a private window → name prompt (once) → `/play` with 12
   cards → Play → match. Under a minute, no other help.
2. **Paired start.** Admin pairs two testers, sends each their link; both land in the same match.
3. **Second device.** Same tester opens their link on a laptop → "Continue as Maya" → same cards.
4. **Refresh mid-match** on both devices → both rejoin the same match, same state.
5. **Cookie cleared mid-match** → `/g/:code` asks for identity, then returns to the match.
6. **Declined card** → picture and text still in the form.
7. **Collection full** → Make is blocked before anything is scored.
8. **Sample cards** are excluded from minting stats and don't block minting the same subject.
9. No screen in the app has zero buttons.

## Decisions Jonathan should confirm

1. Sample cards on by default for every new invite (recommended), or an admin checkbox each time.
2. Whether a tester can clear their sample cards themselves, or only the admin can.
3. Whether the admin page can act as a tester (impersonate) for debugging — powerful, and worth gating
   behind `ADMIN_SECRET` and a non-production check if it exists at all.
4. The short code format for typing on a second device (6 characters, no ambiguous letters).
