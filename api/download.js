export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { query, type = "audio_video" } = req.query;
  if (!query) return res.status(400).json({ error: "Missing media link" });

  const cleanUrl = decodeURIComponent(query).trim();

  // ==========================================
  // 1. TIKTOK (Instant, Free, No Watermark)
  // ==========================================
  if (cleanUrl.includes("tiktok.com")) {
    try {
      const tikRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}`, {
        signal: AbortSignal.timeout(6000)
      });
      const data = await tikRes.json();
      if (data.data?.play) {
        const streamUrl = type === "audio_only" ? data.data.music : data.data.play;
        return res.status(200).json({ download_url: streamUrl });
      }
    } catch (e) {}
  }

  // ==========================================
  // 2. TWITTER / X (Instant via FxTwitter)
  // ==========================================
  const twitterMatch = cleanUrl.match(/(?:twitter\.com|x\.com)\/(?:[^\/]+)\/status\/(\d+)/);
  if (twitterMatch && twitterMatch[1]) {
    try {
      const tweetId = twitterMatch[1];
      const twRes = await fetch(`https://api.fxtwitter.com/status/${tweetId}`, {
        signal: AbortSignal.timeout(6000)
      });
      if (twRes.ok) {
        const twData = await twRes.json();
        const media = twData.tweet?.media;
        if (media?.videos && media.videos.length > 0) {
          return res.status(200).json({ download_url: media.videos[0].url });
        }
      }
    } catch (e) {}
  }

  // ==========================================
  // 3. YOUTUBE (Via RapidAPI YTStream)
  // ==========================================
  const ytMatch = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/))([\w-]{11})/);
  if (ytMatch && ytMatch[1]) {
    try {
      const videoId = ytMatch[1];
      const ytRes = await fetch(`https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`, {
        headers: {
          "x-rapidapi-host": "ytstream-download-youtube-videos.p.rapidapi.com",
          "x-rapidapi-key": process.env.RAPIDAPI_KEY
        },
        signal: AbortSignal.timeout(7000)
      });

      if (ytRes.ok) {
        const data = await ytRes.json();
        if (type === "audio_only") {
          const audioFormats = data.adaptiveFormats?.filter(f => f.mimeType?.includes("audio")) || [];
          audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          if (audioFormats[0]?.url) return res.status(200).json({ download_url: audioFormats[0].url });
        }
        const directVideo = data.formats?.[0]?.url || data.adaptiveFormats?.[0]?.url;
        if (directVideo) return res.status(200).json({ download_url: directVideo });
      }
    } catch (e) {}
  }

  // ==========================================
  // 4. INSTAGRAM & FACEBOOK
  // ==========================================
  const isMeta = cleanUrl.includes("instagram.com") || cleanUrl.includes("facebook.com") || cleanUrl.includes("fb.watch");
  if (isMeta) {
    const cleanMetaUrl = cleanUrl.split("?")[0].replace(/\/+$/, "");

    // Engine A: Fast Direct Media Scraper
    try {
      const igRes = await fetch(`https://api.siputzx.my.id/api/d/ig?url=${encodeURIComponent(cleanMetaUrl)}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(6000)
      });
      if (igRes.ok) {
        const fbData = await igRes.json();
        const directUrl = fbData.data?.[0]?.url || fbData.data?.url;
        if (directUrl && typeof directUrl === "string" && directUrl.startsWith("http")) {
          return res.status(200).json({ download_url: directUrl });
        }
      }
    } catch (e) {}

    // Engine B: SnapInsta Engine
    try {
      const snapRes = await fetch("https://snapinsta.app/action.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "https://snapinsta.app/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        },
        body: new URLSearchParams({ url: cleanMetaUrl, action: "post" }),
        signal: AbortSignal.timeout(6000)
      });

      if (snapRes.ok) {
        const html = await snapRes.text();
        const match = html.match(/href="([^"]+token=[^"]+)"/i) || html.match(/href="(https:\/\/[^"]+download[^"]*)"/i);
        if (match && match[1]) {
          return res.status(200).json({ download_url: match[1].replace(/&amp;/g, "&") });
        }
      }
    } catch (e) {}
  }

  return res.status(500).json({
    error: "Could not extract media. Ensure the post/account is public and not age-restricted."
  });
}
