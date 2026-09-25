export default async function handler(req, res) {
  const { url, filename = "video.mp4" } = req.query;

  if (!url) {
    return res.status(400).send("Missing target URL");
  }

  try {
    const mediaStream = await fetch(decodeURIComponent(url), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!mediaStream.ok) {
      return res.status(mediaStream.status).send("Failed to stream upstream media.");
    }

    // Force browser to save file directly to disk
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", mediaStream.headers.get("content-type") || "video/mp4");

    const arrayBuffer = await mediaStream.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    return res.status(500).send("Error streaming media file.");
  }
}
