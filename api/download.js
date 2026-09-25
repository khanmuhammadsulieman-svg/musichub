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
    // Normalize URL
    let cleanMetaUrl = cleanUrl.split("?")[0].replace(/\/+$/, "");

    // Primary: RapidAPI Meta Converter (try POST first, then GET)
    try {
      const igRes = await fetch(
        `https://instagram-downloader-download-instagram-stories-videos4.p.rapidapi.com/convert?url=${encodeURIComponent(cleanMetaUrl)}`,
        {
          method: "GET",
          headers: {
            "x-rapidapi-host": "instagram-downloader-download-instagram-stories-videos4.p.rapidapi.com",
            "x-rapidapi-key": process.env.RAPIDAPI_KEY
          },
          signal: AbortSignal.timeout(7000)
        }
      );

      if (igRes.ok) {
        const metaData = await igRes.json();
        const mediaUrl =
          metaData.url?.[0]?.url ||
          metaData.url ||
          metaData.media ||
          metaData.download_url ||
          metaData.result?.[0]?.url ||
          (Array.isArray(metaData) ? metaData[0]?.url || metaData[0] : null);

        if (mediaUrl && typeof mediaUrl === "string" && mediaUrl.startsWith("http")) {
          return res.status(200).json({ download_url: mediaUrl });
        }
      }
    } catch (e) {}

    // Secondary: Free Instagram Scraper Endpoint
    try {
      const igScraperRes = await fetch(`https://api.vreden.my.id/api/instagram?url=${encodeURIComponent(cleanMetaUrl)}`, {
        signal: AbortSignal.timeout(6000)
      });
      if (igScraperRes.ok) {
        const data = await igScraperRes.json();
        const fallbackUrl = data.result?.[0]?.url || data.result?.url || data.result?.video;
        if (fallbackUrl && typeof fallbackUrl === "string" && fallbackUrl.startsWith("http")) {
          return res.status(200).json({ download_url: fallbackUrl });
        }
      }
    } catch (e) {}
  }
  return res.status(500).json({
    error: "Could not extract media. Ensure the post/account is public and not age-restricted."
  });
}
