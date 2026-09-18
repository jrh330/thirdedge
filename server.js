require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(express.static(path.join(__dirname, "public")));
app.use('/mint', express.static(path.join(__dirname, 'public/mint')));
app.get('/mint/*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public/mint/index.html'))
);

app.post("/api/create", require("./api/create"));
app.post("/api/join",   require("./api/join"));
app.get( "/api/poll",   require("./api/poll"));
app.post("/api/action", require("./api/action"));

app.post("/api2/create",     require("./api2/create"));
app.post("/api2/join",       require("./api2/join"));
app.get( "/api2/poll",       require("./api2/poll"));
app.post("/api2/action",     require("./api2/action"));
app.get( "/lab",             (req, res) => res.sendFile(path.join(__dirname, "public/lab.html")));
app.post("/api2/mint",         require("./api2/mint"));
app.post("/api2/fetch-preview", require("./api2/fetch-preview"));
app.get( "/api2/collection", require("./api2/collection"));
const { getDecks, saveDeck } = require("./api2/decks");
app.get( "/api2/decks",      getDecks);
app.post("/api2/decks",      saveDeck);

const multer = require("multer");
// Memory storage — image bytes land in req.file.buffer.
// The real pipeline (GPS strip, HEIC→JPEG, resize, private hold) is the next step;
// until then the handler ignores the file and proceeds with imageUrl: null.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

const { handler: checkHandler } = require("./api2/check");
app.post("/api2/check",         upload.single("image"), checkHandler);
app.post("/api2/convert-image", upload.single("image"), require("./api2/convert-image"));
// /api2/mint is already registered; it now uses the new sealed-result flow

const { getCollectionState, swapCards, saveDeck: saveNamedDeck, deleteCard: deleteOwnedCard, repairCollection, deleteNoImageCards } = require("./api2/collection-manage");
app.get( "/api2/collection-state",    getCollectionState);
app.post("/api2/collection/swap",     swapCards);
app.post("/api2/collection/save-deck", saveNamedDeck);
app.delete("/api2/cards/:cardId",     deleteOwnedCard);
app.post("/api2/collection/repair",   repairCollection);
app.delete("/api2/collection/no-image", deleteNoImageCards);

const { fill: fillTest, remove: removeTest } = require("./api2/fill-test");
app.post("/api2/collection/fill-test",   fillTest);
app.delete("/api2/collection/fill-test", removeTest);

const { getCards, createCard, deleteCard } = require("./api/cards");
app.get(   "/api/cards",        getCards);
app.post(  "/api/cards",        createCard);
app.delete("/api/cards/:cardId", deleteCard);

// Invite / auth routes
app.get("/join/:token", require("./api2/join-invite"));
const { createInvite, revokeInvite } = require("./api2/admin-invites");
app.post("/admin/invites",        createInvite);
app.delete("/admin/invites/:token", revokeInvite);

// OPTIONS preflight for all API routes
app.options("/api/*", (req, res) => res.sendStatus(200));

// Temporary debug endpoint — remove after confirming env vars
app.get("/_env", (req, res) => {
  res.json({
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? `set (${process.env.ANTHROPIC_API_KEY.length} chars)` : "NOT SET",
    MONGODB_URI: process.env.MONGODB_URI ? "set" : "NOT SET",
    NODE_ENV: process.env.NODE_ENV || "not set",
    PORT: process.env.PORT || "not set",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Allagaroo running at http://localhost:${PORT}`);
  console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "SET" : "NOT SET"}`);
});
