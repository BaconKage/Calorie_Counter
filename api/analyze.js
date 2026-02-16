export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: "No image provided" });

    const prompt = `
You are a nutrition assistant analyzing a meal photo.
Return JSON only with this shape:
{
  "detected_dish":{
    "name":"string",
    "cuisine":"string",
    "confidence":number,
    "alternatives":["string"]
  },
  "items":[
    {
      "name":"string",
      "portion":"string",
      "grams":number,
      "kcal":number,
      "protein_g":number,
      "carbs_g":number,
      "fat_g":number,
      "confidence":number,
      "why":"short reason for this estimate"
    }
  ],
  "total":{"kcal":number,"protein_g":number,"carbs_g":number,"fat_g":number},
  "confidence":number,
  "balance":{
    "score":number,
    "verdict":"string",
    "summary":"string",
    "improve":["string"]
  },
  "suggestions":[
    {"goal":"More protein","add":"string","replace":"string","why":"string"}
  ]
}
Rules:
- confidence is 0.0 to 1.0
- score is 0 to 100
- keep text short and practical
- prefer specific dish names (example: "chicken biryani", "paneer butter masala", "caesar salad") instead of generic labels
- when uncertain, still provide best guess plus alternatives
- estimate portion realistically from photo; do not leave fields empty
- use visual cues such as texture, sauce, plating, garnish, and shape
- no extra text outside JSON
`.trim();

    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.2,
        max_tokens: 800,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: "high" } },
            ],
          },
        ],
      }),
    });

    const text = await openaiResp.text();

    if (!openaiResp.ok) {
      return res.status(openaiResp.status).json({
        error: "OpenAI API error",
        status: openaiResp.status,
        details: text.slice(0, 2000),
      });
    }

    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content ?? "";

    if (!content || !content.trim()) {
      return res.status(200).json({
        error: "Empty model response",
        raw_openai: text.slice(0, 2000),
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return res.status(200).json({
        error: "Model returned non-JSON content",
        raw_model_content: content.slice(0, 2000),
      });
    }

    const n = (v, min = 0, max = 99999) => {
      const x = Number(v);
      if (!Number.isFinite(x)) return 0;
      return Math.max(min, Math.min(max, x));
    };
    const s = (v, fallback = "") => String(v ?? fallback).trim() || fallback;

    const items = Array.isArray(parsed?.items)
      ? parsed.items.slice(0, 12).map((it) => ({
          name: String(it?.name || "Food item"),
          portion: String(it?.portion || "1 serving"),
          grams: n(it?.grams, 0, 3000),
          kcal: n(it?.kcal, 0, 6000),
          protein_g: n(it?.protein_g, 0, 400),
          carbs_g: n(it?.carbs_g, 0, 600),
          fat_g: n(it?.fat_g, 0, 300),
          confidence: n(it?.confidence, 0, 1),
          why: String(it?.why || "Estimated from visible portion and common preparation."),
        }))
      : [];

    const totalFromItems = items.reduce(
      (acc, it) => {
        acc.kcal += it.kcal;
        acc.protein_g += it.protein_g;
        acc.carbs_g += it.carbs_g;
        acc.fat_g += it.fat_g;
        return acc;
      },
      { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );

    const totalRaw = parsed?.total || {};
    const total = {
      kcal: n(totalRaw.kcal || totalFromItems.kcal, 0, 8000),
      protein_g: n(totalRaw.protein_g || totalFromItems.protein_g, 0, 500),
      carbs_g: n(totalRaw.carbs_g || totalFromItems.carbs_g, 0, 900),
      fat_g: n(totalRaw.fat_g || totalFromItems.fat_g, 0, 400),
    };

    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.slice(0, 6).map((s) => ({
          goal: String(s?.goal || "Balanced meal"),
          add: String(s?.add || "Add vegetables or lean protein."),
          replace: String(s?.replace || ""),
          why: String(s?.why || "Improves overall nutrition quality."),
        }))
      : [];

    const balance = {
      score: n(parsed?.balance?.score, 0, 100),
      verdict: s(parsed?.balance?.verdict, "Needs improvement"),
      summary: s(parsed?.balance?.summary, "Meal can be improved with better macro balance."),
      improve: Array.isArray(parsed?.balance?.improve)
        ? parsed.balance.improve.slice(0, 5).map((x) => String(x))
        : [],
    };

    const detected_dish = {
      name: s(parsed?.detected_dish?.name, items[0]?.name || "Meal"),
      cuisine: s(parsed?.detected_dish?.cuisine, "Unknown"),
      confidence: n(parsed?.detected_dish?.confidence ?? parsed?.confidence, 0, 1),
      alternatives: Array.isArray(parsed?.detected_dish?.alternatives)
        ? parsed.detected_dish.alternatives.slice(0, 4).map((x) => s(x)).filter(Boolean)
        : [],
    };

    return res.status(200).json({
      detected_dish,
      items,
      total,
      confidence: n(parsed?.confidence, 0, 1),
      balance,
      suggestions,
    });
  } catch (err) {
    console.error("analyze error:", err);
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}
