export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { query, jobId, quality = "best", type = "audio_video" } = req.query;

  // 1. Check asynchronous job status for YouTube / heavy video processing
  if (jobId) {
    try {
      const response = await fetch(`https://api.huntapi.com/v1/jobs/${jobId}`, {
        headers: { "x-api-key": process.env.HUNT_API_KEY }
      });
      const data = await response.json();
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: "Failed to check status" });
    }
  }

  if (!query) return res.status(400).json({ error: "Missing video link" });
  const cleanUrl = decodeURIComponent(query).trim();

  // 2. FAST ENGINE: TikTok (Instant < 1s, 100% Free, No Watermark)
  if (cleanUrl.includes("tiktok.com")) {
    try {
      const tikRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}`);
      const data = await tikRes.json();
      if (data.data?.play) {
        const streamUrl = type === "audio_only" ? data.data.music : data.data.play;
        return res.status(200).json({ download_url: streamUrl });
      }
    } catch (e) {}
  }

  // 3. FAST ENGINE: Twitter / X (Instant < 1s, 100% Free)
  const twitterMatch = cleanUrl.match(/(?:twitter\.com|x\.com)\/(?:[^\/]+)\/status\/(\d+)/);
  if (twitterMatch && twitterMatch[1]) {
    try {
      const tweetId = twitterMatch[1];
      const twRes = await fetch(`https://api.fxtwitter.com/status/${tweetId}`);
      if (twRes.ok) {
        const twData = await twRes.json();
        const media = twData.tweet?.media;
        if (media?.videos && media.videos.length > 0) {
          return res.status(200).json({ download_url: media.videos[0].url });
        }
      }
    } catch (e) {}
  }

  // 4. RELIABLE ENGINE: YouTube & Instagram (Via HuntAPI with your existing key)
  try {
    const endpoint = `https://api.huntapi.com/v1/video/download?query=${encodeURIComponent(cleanUrl)}&video_quality=${encodeURIComponent(quality)}&video_format=mp4&download_type=${encodeURIComponent(type)}`;

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
