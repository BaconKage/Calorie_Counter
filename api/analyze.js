export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64 } = req.body;

    const response = await fetch("https://YOUR_VISION_API_ENDPOINT", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.VISION_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image: imageBase64,
        prompt: "Identify the food item in the image. Respond with a single food name."
      })
    });

    const data = await response.json();

    // Normalize output (adjust this to your API response)
    const food =
      data.food ||
      data.label ||
      data.result ||
      "Unknown";

    res.status(200).json({
      label: food,
      confidence: 0.75
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Vision analysis failed" });
  }
}
