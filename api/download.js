export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { query, type = "audio_video" } = req.query;
  if (!query) return res.status(400).json({ error: "Missing video link" });

  const cleanUrl = decodeURIComponent(query).trim();

  // 1. FAST ENGINE: TikTok (Instant < 1s, Free, No Watermark)
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

  // 2. FAST ENGINE: Twitter / X (Instant < 1s, Free)
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

  // 3. FAST ENGINE: YouTube via RapidAPI YTStream (Direct Google CDN, No Queuing)
  const ytMatch = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/))([\w-]{11})/);
  if (ytMatch && ytMatch[1]) {
    try {
      const videoId = ytMatch[1];
      const ytRes = await fetch(`https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`, {
        headers: {
          "x-rapidapi-host": "ytstream-download-youtube-videos.p.rapidapi.com",
          "x-rapidapi-key": process.env.RAPIDAPI_KEY
        }
      });

      if (ytRes.ok) {
        const data = await ytRes.json();
        
        if (type === "audio_only") {
          const audioFormats = data.adaptiveFormats?.filter(f => f.mimeType?.includes("audio")) || [];
          audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          if (audioFormats[0]?.url) {
            return res.status(200).json({ download_url: audioFormats[0].url });
          }
        }

        // Direct playable/downloadable video stream
        const directVideo = data.formats?.[0]?.url || data.adaptiveFormats?.[0]?.url;
        if (directVideo) {
          return res.status(200).json({ download_url: directVideo });
        }
      }
    } catch (e) {}
  }

  // 4. INSTANT FALLBACK: Invidious Stream Resolver
  if (ytMatch && ytMatch[1]) {
    try {
      const invRes = await fetch(`https://inv.tux.pizza/api/v1/videos/${ytMatch[1]}`);
      if (invRes.ok) {
        const invData = await invRes.json();
        const format = invData.formatStreams?.reverse()?.[0]?.url || invData.adaptiveFormats?.find(f => f.type?.startsWith("audio/"))?.url;
        if (format) return res.status(200).json({ download_url: format });
      }
    } catch (e) {}
  }

  return res.status(500).json({ error: "Unable to process video. Verify the URL is public." });
}
