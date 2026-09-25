export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { query, quality = "1080", type = "audio_video" } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Missing video link" });
  }

  const cleanUrl = decodeURIComponent(query).trim();

  // 1. Try Rapid Fast Stream Resolvers (Cobalt-compatible multi-instances)
  const instances = [
    "https://cobalt-api.kwiatekm.tokyo",
    "https://api.wuk.sh",
    "https://cobalt.api.scip.fun"
  ];

  for (const instance of instances) {
    try {
      const response = await fetch(`${instance}/`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        },
        body: JSON.stringify({
          url: cleanUrl,
          videoQuality: quality === "best" ? "max" : quality,
          downloadMode: type === "audio_only" ? "audio" : "auto",
          youtubeVideoCodec: "h264"
        }),
        signal: AbortSignal.timeout(4500)
      });

      if (response.ok) {
        const data = await response.json();
        const directUrl = data.url || (data.stream && data.stream.url);
        if (directUrl) {
          return res.status(200).json({ download_url: directUrl });
        }
      }
    } catch {
      // Continue to next mirror on timeout/block
      continue;
    }
  }

  // 2. Fast Fallback for YouTube via Invidious stream extraction
  try {
    const ytMatch = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/))([\w-]{11})/);
    if (ytMatch && ytMatch[1]) {
      const videoId = ytMatch[1];
      const invidiousMirrors = [
        "https://inv.tux.pizza",
        "https://invidious.nerdvpn.de",
        "https://vid.puffyan.us"
      ];

      for (const mirror of invidiousMirrors) {
        try {
          const invRes = await fetch(`${mirror}/api/v1/videos/${videoId}`, {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(4000)
          });
          if (invRes.ok) {
            const data = await invRes.json();

            if (type === "audio_only") {
              const audioStream = data.adaptiveFormats
                ?.filter(f => f.type && f.type.startsWith("audio/"))
                ?.sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0))[0];

              if (audioStream?.url) {
                return res.status(200).json({ download_url: audioStream.url });
              }
            } else {
              // Get combined video+audio format or highest adaptive
              const combined = data.formatStreams?.reverse()?.[0];
              if (combined?.url) {
                return res.status(200).json({ download_url: combined.url });
              }
            }
          }
        } catch {
          continue;
        }
      }
    }
  } catch (ytErr) {
    // fallback exhausted
  }

  return res.status(500).json({
    error: "Service busy or video is restricted. Please try again with another link."
  });
}
