export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: "No image provided" });

    const prompt = `
Analyze this meal photo and return JSON ONLY with:
{
  "items":[{"name":"string","portion":"string","kcal":number,"protein_g":number,"carbs_g":number,"fat_g":number}],
  "total":{"kcal":number,"protein_g":number,"carbs_g":number,"fat_g":number},
  "confidence":number,
  "rating":{"score":number,"label":"string"},
  "suggestions":[
    {"goal":"More protein","add":"string"},
    {"goal":"More carbohydrates","add":"string"}
  ]
}
Rules:
- Provide best estimates even if unsure.
- confidence is 0.0 to 1.0
- No extra text outside JSON.
`.trim();

    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 550,
        response_format: { type: "json_object" }, // IMPORTANT: forces JSON
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            ],
          },
        ],
      }),
    });

    const text = await openaiResp.text();

    // If OpenAI returned an error JSON, surface it clearly
    if (!openaiResp.ok) {
      return res.status(openaiResp.status).json({
        error: "OpenAI API error",
        status: openaiResp.status,
        details: text.slice(0, 2000),
      });
    }

    // Parse OpenAI JSON
    const data = JSON.parse(text);

    const content = data?.choices?.[0]?.message?.content ?? "";
    if (!content || !content.trim()) {
      return res.status(200).json({
        error: "Empty model response",
        raw_openai: text.slice(0, 2000),
      });
    }

    // content should already be JSON (because response_format json_object)
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return res.status(200).json({
        error: "Model returned non-JSON content",
        raw_model_content: content.slice(0, 2000),
      });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("analyze error:", err);
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}
