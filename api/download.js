export default async function handler(req, res) {
  // Allow requests from your frontend
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { query, jobId } = req.query;

  // Poll existing job if jobId is provided
  if (jobId) {
    try {
      const response = await fetch(`https://api.huntapi.com/v1/jobs/${jobId}`, {
        headers: { "x-api-key": process.env.HUNT_API_KEY }
      });
      const data = await response.json();
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: "Failed to check job status" });
    }
  }

  // Otherwise initiate new download request
  if (!query) {
    return res.status(400).json({ error: "Missing video link" });
  }

  try {
    const endpoint = `https://api.huntapi.com/v1/video/download?query=${encodeURIComponent(query)}&video_quality=best&video_format=mp4&download_type=audio_video`;
    
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "x-api-key": process.env.HUNT_API_KEY,
        "Accept": "application/json"
      }
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Server connection failed" });
  }
}
