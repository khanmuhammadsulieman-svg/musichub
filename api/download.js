export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { query, type = "audio_video" } = req.query;
  if (!query) return res.status(400).json({ error: "Missing video link" });

  const cleanUrl = decodeURIComponent(query).trim();

  // 1. FREE ENGINE: TikTok (Instant, No Key, No Watermark)
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

  // 2. FREE ENGINE: Twitter / X (Instant via FxTwitter API, Zero Cost)
  const twitterMatch = cleanUrl.match(/(?:twitter\.com|x\.com)\/(?:[^\/]+)\/status\/(\d+)/);
  if (twitterMatch && twitterMatch[1]) {
    try {
      const tweetId = twitterMatch[1];
      const twRes = await fetch(`https://api.fxtwitter.com/status/${tweetId}`);
      if (twRes.ok) {
        const twData = await twRes.json();
        const media = twData.tweet?.media;

        if (media?.videos && media.videos.length > 0) {
          const videoUrl = media.videos[0].url;
          return res.status(200).json({ download_url: videoUrl });
        }
      }
    } catch (e) {}
  }

  // 3. FREE ENGINE: YouTube (Via High-Speed Piped Instances)
  const ytMatch = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/))([\w-]{11})/);
  if (ytMatch && ytMatch[1]) {
    const videoId = ytMatch[1];
    const pipedInstances = [
      "https://pipedapi.kavin.rocks",
      "https://api.piped.privacydev.net",
      "https://piped-api.lunar.icu"
    ];

    for (const host of pipedInstances) {
      try {
        const pRes = await fetch(`${host}/streams/${videoId}`, {
          signal: AbortSignal.timeout(4000)
        });

        if (pRes.ok) {
          const pData = await pRes.json();

          if (type === "audio_only") {
            const audioStream = pData.audioStreams?.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
            if (audioStream?.url) return res.status(200).json({ download_url: audioStream.url });
          } else {
            const videoStream = pData.videoStreams?.filter(v => v.videoOnly === false)?.[0] || pData.videoStreams?.[0];
            if (videoStream?.url) return res.status(200).json({ download_url: videoStream.url });
          }
        }
      } catch (e) {
        continue;
      }
    }
  }

  // 4. FREE ENGINE: Instagram & Universal Fallback
  try {
    const backupRes = await fetch(`https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink?url=${encodeURIComponent(cleanUrl)}`);
    if (backupRes.ok) {
      const bData = await backupRes.json();
      const direct = bData.medias?.[0]?.url || bData.url;
      if (direct) return res.status(200).json({ download_url: direct });
    }
  } catch (e) {}

  return res.status(500).json({
    error: "Could not fetch stream. Please make sure the video or account is public."
  });
}
