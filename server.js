require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/create", require("./api/create"));
app.post("/api/join",   require("./api/join"));
app.get( "/api/poll",   require("./api/poll"));
app.post("/api/action", require("./api/action"));

app.post("/api2/create",     require("./api2/create"));
app.post("/api2/join",       require("./api2/join"));
app.get( "/api2/poll",       require("./api2/poll"));
app.post("/api2/action",     require("./api2/action"));
app.get( "/lab",             (req, res) => res.sendFile(path.join(__dirname, "public/lab.html")));
app.post("/api2/mint",       require("./api2/mint"));
app.get( "/api2/collection", require("./api2/collection"));
const { getDecks, saveDeck } = require("./api2/decks");
app.get( "/api2/decks",      getDecks);
app.post("/api2/decks",      saveDeck);

const { getCards, createCard, deleteCard } = require("./api/cards");
app.get(   "/api/cards",        getCards);
app.post(  "/api/cards",        createCard);
app.delete("/api/cards/:cardId", deleteCard);

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
  console.log(`Third Edge running at http://localhost:${PORT}`);
  console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "SET" : "NOT SET"}`);
});
