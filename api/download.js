export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { query, type = "audio_video" } = req.query;
  if (!query) return res.status(400).json({ error: "Missing media link" });

  const cleanUrl = decodeURIComponent(query).trim();

  // ==========================================
  // 1. TIKTOK (TikWM + Cobalt Fallback)
  // ==========================================
  if (cleanUrl.includes("tiktok.com")) {
    try {
      const tikRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}`, {
        signal: AbortSignal.timeout(5000)
      });
      const data = await tikRes.json();
      if (data.data?.play) {
        const streamUrl = type === "audio_only" ? data.data.music : data.data.play;
        return res.status(200).json({ download_url: streamUrl });
      }
    } catch (e) {}

    try {
      const cobRes = await fetch("https://api.cobalt.tools", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ url: cleanUrl }),
        signal: AbortSignal.timeout(5000)
      });
      if (cobRes.ok) {
        const cobData = await cobRes.json();
        if (cobData.url) return res.status(200).json({ download_url: cobData.url });
        if (cobData.picker?.[0]?.url) return res.status(200).json({ download_url: cobData.picker[0].url });
      }
    } catch (e) {}
  }

  // ==========================================
  // 2. TWITTER / X
  // ==========================================
  const twitterMatch = cleanUrl.match(/(?:twitter\.com|x\.com)\/(?:[^\/]+)\/status\/(\d+)/);
  if (twitterMatch && twitterMatch[1]) {
    try {
      const tweetId = twitterMatch[1];
      const twRes = await fetch(`https://api.fxtwitter.com/status/${tweetId}`, {
        signal: AbortSignal.timeout(5000)
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
  // 3. YOUTUBE
  // ==========================================
  const ytMatch = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/))([\w-]{11})/);
  if (ytMatch && ytMatch[1]) {
    const videoId = ytMatch[1];
    try {
      const ytRes = await fetch(`https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`, {
        headers: {
          "x-rapidapi-host": "ytstream-download-youtube-videos.p.rapidapi.com",
          "x-rapidapi-key": process.env.RAPIDAPI_KEY || ""
        },
        signal: AbortSignal.timeout(5000)
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

    try {
      const invRes = await fetch(`https://vid.puffyan.us/api/v1/videos/${videoId}`, {
        signal: AbortSignal.timeout(5000)
      });
      if (invRes.ok) {
        const invData = await invRes.json();
        const videoStream = invData.formatStreams?.[invData.formatStreams.length - 1]?.url;
        if (videoStream) return res.status(200).json({ download_url: videoStream });
      }
    } catch (e) {}
  }

  // ==========================================
  // 4. INSTAGRAM & FACEBOOK (RapidAPI + Cobalt Fallback)
  // ==========================================
  const isMeta = cleanUrl.includes("instagram.com") || cleanUrl.includes("facebook.com") || cleanUrl.includes("fb.watch");
  if (isMeta) {
    const cleanMetaUrl = cleanUrl.split("?")[0].replace(/\/+$/, "");

    // Engine A: RapidAPI Instagram Video Downloader
    if (cleanUrl.includes("instagram.com")) {
      try {
        const formData = new URLSearchParams();
        formData.append("url", cleanMetaUrl);

        const igRes = await fetch("https://instagram-video-downloader13.p.rapidapi.com/video-downloader", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "x-rapidapi-host": "instagram-video-downloader13.p.rapidapi.com",
            "x-rapidapi-key": process.env.RAPIDAPI_KEY || ""
          },
          body: formData,
          signal: AbortSignal.timeout(6000)
        });

        if (igRes.ok) {
          const igData = await igRes.json();
          const directUrl = igData.data?.url || igData.url || igData.download_url || igData[0]?.url;
          if (directUrl && typeof directUrl === "string" && directUrl.startsWith("http")) {
            return res.status(200).json({ download_url: directUrl });
          }
        }
      } catch (e) {}
    }

    // Engine B: Cobalt Fallback for Meta / Facebook / Reels
    try {
      const cobaltRes = await fetch("https://api.cobalt.tools", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          url: cleanMetaUrl,
          videoQuality: "720",
          filenameStyle: "pretty"
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (cobaltRes.ok) {
        const cobaltData = await cobaltRes.json();
        if (cobaltData.status === "redirect" || cobaltData.status === "tunnel") {
          return res.status(200).json({ download_url: cobaltData.url });
        } else if (cobaltData.status === "picker" && cobaltData.picker?.length > 0) {
          return res.status(200).json({ download_url: cobaltData.picker[0].url });
        }
      }
    } catch (e) {}
  }

  // ==========================================
  // 5. UNIVERSAL GENERAL FALLBACK
  // ==========================================
  try {
    const generalRes = await fetch("https://api.cobalt.tools", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ url: cleanUrl }),
      signal: AbortSignal.timeout(6000)
    });
    if (generalRes.ok) {
      const genData = await generalRes.json();
      if (genData.url) return res.status(200).json({ download_url: genData.url });
      if (genData.picker?.[0]?.url) return res.status(200).json({ download_url: genData.picker[0].url });
    }
  } catch (e) {}

  return res.status(500).json({
    error: "Could not extract media. Ensure the post/account is public and not age-restricted."
  });
}
