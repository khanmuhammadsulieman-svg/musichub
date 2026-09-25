export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { query, quality = "1080", type = "audio_video" } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Missing video link" });
  }

  try {
    // Cobalt processes synchronously: NO queues, NO polling, returns direct URL immediately
    const cobaltRes = await fetch("https://api.cobalt.tools/", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: query,
        videoQuality: quality === "best" ? "max" : quality,
        downloadMode: type === "audio_only" ? "audio" : "auto",
        youtubeVideoCodec: "h264"
      })
    });

    const data = await cobaltRes.json();

    if (data.url) {
      return res.status(200).json({ download_url: data.url });
    }

    if (data.text) {
      return res.status(400).json({ error: data.text });
    }

    return res.status(500).json({ error: "Failed to extract direct media link." });
  } catch (err) {
    return res.status(500).json({ error: "Upstream service error. Please try again." });
  }
}
