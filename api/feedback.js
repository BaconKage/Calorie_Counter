import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "my_gym";
const collectionName = "foodvisionresponse";

let cachedClient;

async function getClient() {
  if (!uri) {
    throw new Error("Missing MONGODB_URI");
  }

  if (!cachedClient) {
    cachedClient = new MongoClient(uri);
    await cachedClient.connect();
  }

  return cachedClient;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const result = body.result || {};
    const detectedDish = result.detected_dish || {};
    const wasAccurate = body.wasAccurate;

    if (typeof wasAccurate !== "boolean") {
      return res.status(400).json({ error: "wasAccurate must be true or false" });
    }

    const client = await getClient();
    const collection = client.db(dbName).collection(collectionName);

    const doc = {
      wasAccurate,
      feedbackSource: "ui_binary_prompt",
      detectedDish: {
        name: String(detectedDish.name || "").trim(),
        cuisine: String(detectedDish.cuisine || "").trim(),
        confidence: Number(detectedDish.confidence) || 0,
        alternatives: Array.isArray(detectedDish.alternatives) ? detectedDish.alternatives.slice(0, 4) : [],
      },
      confidence: Number(result.confidence) || 0,
      items: Array.isArray(result.items) ? result.items : [],
      total: result.total || {},
      balance: result.balance || {},
      suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
      createdAt: new Date(),
      userAgent: req.headers["user-agent"] || "",
    };

    const insertResult = await collection.insertOne(doc);

    return res.status(200).json({
      ok: true,
      insertedId: String(insertResult.insertedId),
    });
  } catch (err) {
    console.error("feedback error:", err);
    return res.status(500).json({ error: "Failed to save feedback", details: String(err?.message || err) });
  }
}
