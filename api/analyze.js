export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: "No image provided" });

    const prompt = `
You are a nutrition estimator. Analyze the image and identify the most likely food item(s).

Return ONLY valid JSON in this exact schema:
{
  "food_name": "string",
  "items": [
    { "name": "string", "estimated_portion": "string", "calories": number }
  ],
  "total_calories": number,
  "calorie_range": { "min": number, "max": number },
  "macros_g": { "protein": number, "carbs": number, "fat": number },
  "rating": { "label": "Balanced|Needs Protein|High Calories|High Carbs|High Fat|Light Meal", "score": number },
  "suggestions": [
    { "goal": "More protein|More fiber|Lower calories|More carbs", "add": "string" }
  ]
}

Rules:
- If multiple items, include them in "items" and sum to "total_calories".
- Give realistic estimates for typical serving sizes.
- calorie_range should be wider if portion is uncertain.
- Keep suggestions practical and short.
- NO extra text outside JSON.
`.trim();

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
            ]
          }
        ],
        temperature: 0.2,
        max_tokens: 350
      }),
    });

    const data = await response.json();

    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) return res.status(500).json({ error: "Empty model response", raw: data });

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return res.status(500).json({ error: "Model did not return valid JSON", raw });
    }

    // Basic sanitization
    const safeNum = (x, d=0) => (typeof x === "number" && isFinite(x)) ? x : d;

    parsed.total_calories = safeNum(parsed.total_calories, 0);
    parsed.calorie_range = parsed.calorie_range || { min: Math.max(0, parsed.total_calories - 120), max: parsed.total_calories + 120 };
    parsed.calorie_range.min = safeNum(parsed.calorie_range.min, Math.max(0, parsed.total_calories - 120));
    parsed.calorie_range.max = safeNum(parsed.calorie_range.max, parsed.total_calories + 120);

    parsed.macros_g = parsed.macros_g || { protein: 0, carbs: 0, fat: 0 };
    parsed.macros_g.protein = safeNum(parsed.macros_g.protein, 0);
    parsed.macros_g.carbs = safeNum(parsed.macros_g.carbs, 0);
    parsed.macros_g.fat = safeNum(parsed.macros_g.fat, 0);

    parsed.rating = parsed.rating || { label: "Balanced", score: 70 };
    parsed.rating.score = Math.max(0, Math.min(100, safeNum(parsed.rating.score, 70)));

    parsed.items = Array.isArray(parsed.items) ? parsed.items : [];

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("analyze error:", err);
    return res.status(500).json({ error: "Vision analysis failed" });
  }
}
