export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "No image provided" });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Identify the food item in this image. Respond with ONLY the food name. No explanations."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 20
      })
    });

    const data = await response.json();

    const text =
      data?.choices?.[0]?.message?.content?.trim() || "Unknown food";

    // Normalize output (important)
    const label = text
      .split("\n")[0]
      .replace(/[^a-zA-Z\s]/g, "")
      .trim();

    res.status(200).json({
      label,
      confidence: 0.75
    });

  } catch (error) {
    console.error("Vision API error:", error);
    res.status(500).json({ error: "Vision analysis failed" });
  }
}
