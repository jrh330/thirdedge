const { MongoClient } = require("mongodb");

let cached = global.__mongo;
if (!cached) cached = global.__mongo = { client: null, db: null };

// ── Index bootstrap ───────────────────────────────────────────────────────────
// Called once after the first connection. All createIndex calls are idempotent
// (MongoDB no-ops if the index already exists) so this is safe to run every
// cold start. background: true means they build without blocking the server.
async function ensureIndexes(db) {
  try {
    await Promise.all([
      // cardsv2: nearly every query filters by ownerId + deleted
      db.collection("cardsv2").createIndex(
        { ownerId: 1, deleted: 1 },
        { background: true, name: "ownerId_deleted" }
      ),
      // collectionsv2: every collection-state and swap request looks up by ownerId
      db.collection("collectionsv2").createIndex(
        { ownerId: 1 },
        { background: true, unique: true, name: "ownerId" }
      ),
      // gamesv2: poll + pairing + admin listing filter by status and player IDs
      db.collection("gamesv2").createIndex(
        { status: 1, "p1.id": 1, "p2.id": 1 },
        { background: true, name: "status_players" }
      ),
      db.collection("gamesv2").createIndex(
        { code: 1 },
        { background: true, name: "code" }
      ),
      // eventsv1: funnel aggregation groups by playerId + event
      db.collection("eventsv1").createIndex(
        { playerId: 1, event: 1 },
        { background: true, name: "playerId_event" }
      ),
    ]);
  } catch (err) {
    // Non-fatal — server still runs without indexes, just slower
    console.error("ensureIndexes warning:", err.message);
  }
}

async function getDb() {
  if (cached.db) return cached.db;
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL;
  if (!uri) throw new Error("MONGODB_URI or MONGO_URL env var not set");
  const client = new MongoClient(uri);
  await client.connect();
  cached.client = client;
  cached.db = client.db("thirdedge");
  // Fire-and-forget — don't block the first request on index creation
  ensureIndexes(cached.db);
  return cached.db;
}

module.exports = { getDb };
