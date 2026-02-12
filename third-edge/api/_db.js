const { MongoClient } = require("mongodb");

let cached = global.__mongo;
if (!cached) cached = global.__mongo = { client: null, db: null };

async function getDb() {
  if (cached.db) return cached.db;
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI env var not set");
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  cached.client = client;
  cached.db = client.db("thirdedge");
  return cached.db;
}

module.exports = { getDb };
