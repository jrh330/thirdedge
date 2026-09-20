require("dotenv").config();
const express      = require("express");
const cookieParser = require("cookie-parser");
const path         = require("path");

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser(process.env.SESSION_SECRET));

// ── Legacy /mint redirects — before ALL static middleware ────────────────────
// express.static sees public/mint/ as a directory and issues its own 301 to
// /mint/ if these handlers are registered any later. Must come first.
// 302 only — never 301 (would be cached in testers' browsers permanently).
app.get('/mint',  (req, res) => {
  const code = req.query.code;
  return code
    ? res.redirect(302, `/g/${code.trim().toUpperCase()}`)
    : res.redirect(302, '/play');
});
app.get('/mint/', (_req, res) => res.redirect(302, '/play'));

// ── Static assets ─────────────────────────────────────────────────────────────
// Keep /mint/assets/… alive — the Vite build references them at this path.
app.use(express.static(path.join(__dirname, "public")));
app.use('/mint', express.static(path.join(__dirname, 'public/mint')));

// ── API routes ────────────────────────────────────────────────────────────────
// All API, auth, and admin routes must come before SPA routes so they are
// never shadowed by the HTML catch-alls below.

app.post("/api/create", require("./api/create"));
app.post("/api/join",   require("./api/join"));
app.get( "/api/poll",   require("./api/poll"));
app.post("/api/action", require("./api/action"));

app.post("/api2/create",       require("./api2/create"));
app.post("/api2/join",         require("./api2/join"));
app.get( "/api2/poll",         require("./api2/poll"));
app.post("/api2/action",       require("./api2/action"));
app.post("/api2/mint",         require("./api2/mint"));
app.post("/api2/fetch-preview", require("./api2/fetch-preview"));
app.get( "/api2/collection",   require("./api2/collection"));

const { getDecks, saveDeck } = require("./api2/decks");
app.get( "/api2/decks",  getDecks);
app.post("/api2/decks",  saveDeck);

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
const { handler: checkHandler } = require("./api2/check");
app.post("/api2/check",         upload.single("image"), checkHandler);
app.post("/api2/convert-image", upload.single("image"), require("./api2/convert-image"));

const { getCollectionState, swapCards, saveDeck: saveNamedDeck, deleteCard: deleteOwnedCard, repairCollection, deleteNoImageCards } = require("./api2/collection-manage");
app.get(    "/api2/collection-state",      getCollectionState);
app.post(   "/api2/collection/swap",       swapCards);
app.post(   "/api2/collection/save-deck",  saveNamedDeck);
app.delete( "/api2/cards/:cardId",         deleteOwnedCard);
app.post(   "/api2/collection/repair",     repairCollection);
app.delete( "/api2/collection/no-image",   deleteNoImageCards);

const { fill: fillTest, remove: removeTest } = require("./api2/fill-test");
app.post(   "/api2/collection/fill-test",  fillTest);
app.delete( "/api2/collection/fill-test",  removeTest);

const { getCards, createCard, deleteCard } = require("./api/cards");
app.get(    "/api/cards",         getCards);
app.post(   "/api/cards",         createCard);
app.delete( "/api/cards/:cardId", deleteCard);

// Player profile — /api2/player kept as alias until client migrates to /api2/me
const { getPlayer, updateName } = require('./api2/player');
app.get('/api2/player',      getPlayer);
app.put('/api2/player/name', updateName);

// ── Identity / invite routes ──────────────────────────────────────────────────

const joinInvite = require("./api2/join-invite");
app.get("/j/:token",    joinInvite);   // canonical short form
app.get("/join/:token", joinInvite);   // legacy alias — permanent

app.post("/claim", require("./api2/claim"));

// ── Admin routes ──────────────────────────────────────────────────────────────

const { createInvite, revokeInvite, restorePlayer } = require("./api2/admin-invites");
app.post(   "/admin/invites",             createInvite);
app.delete( "/admin/invites/:token",      revokeInvite);
app.post(   "/admin/players/:id/restore", restorePlayer);

const { adminPage, adminLogin, adminLogout, listPlayers } = require("./api2/admin-page");
app.get(  "/admin",          adminPage);
app.post( "/admin/login",    adminLogin);
app.post( "/admin/logout",   adminLogout);
app.get(  "/admin/players",  listPlayers);

app.get("/lab", (req, res) => res.sendFile(path.join(__dirname, "public/lab.html")));

app.options("/api/*", (req, res) => res.sendStatus(200));

if (process.env.NODE_ENV !== "production") {
  app.get("/_env", (req, res) => {
    res.json({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? `set (${process.env.ANTHROPIC_API_KEY.length} chars)` : "NOT SET",
      MONGODB_URI: process.env.MONGODB_URI ? "set" : "NOT SET",
      NODE_ENV: process.env.NODE_ENV || "not set",
      PORT: process.env.PORT || "not set",
    });
  });
}

// ── SPA entry points ──────────────────────────────────────────────────────────
// Served after all API/auth routes so nothing is shadowed.
// The Vite build writes assets to /mint/assets/… — the static middleware above
// serves those; these routes serve the HTML shell for the four URL namespaces.

const SPA = path.join(__dirname, 'public/mint/index.html');
const { verifyCookie, COOKIE_NAME } = require('./auth/player');
const identityPage = require('./api2/identity-page');

app.get('/play', (_req, res) => res.sendFile(SPA));
app.get('/make', (_req, res) => res.sendFile(SPA));

// /g/:code — serve SPA if session cookie is valid, otherwise render the
// identity page so the tester can claim their session without losing their destination.
app.get('/g/:code', (req, res) => {
  const code    = req.params.code.toUpperCase();
  const cookie  = req.cookies?.[COOKIE_NAME];
  const session = verifyCookie(cookie);

  if (session) {
    return res.sendFile(SPA);
  }

  // No valid session — render the identity page carrying next=/g/CODE
  // so the claim form brings them straight back here after signing in.
  return res.status(200).send(identityPage({
    heading: 'This device isn\'t signed in.',
    message: 'Paste your invite link or code to join this match.',
    next: `/g/${code}`,
    hint: `Match code: <strong>${code}</strong>`,
  }));
});

// /mint/* — any remaining /mint/… paths (SPA sub-routes from old links)
app.get('/mint/*', (_req, res) => res.redirect(302, '/play'));

// ── 404 ───────────────────────────────────────────────────────────────────────
// Unknown paths return 404, not the SPA.
app.use((_req, res) => res.status(404).send('Not found'));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Allagaroo running at http://localhost:${PORT}`);
  console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "SET" : "NOT SET"}`);
});
