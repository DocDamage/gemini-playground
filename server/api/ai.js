import express from "express";
import fetch from "node-fetch";

const router = express.Router();

router.post("/", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not set");

    const geminiUrl =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent?key=" +
      apiKey;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    });

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      res.write(`data: ${JSON.stringify({ error: errorText })}\n\n`);
      return res.end();
    }

    const reader = geminiRes.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let partial = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      partial += decoder.decode(value, { stream: true });

      // Each chunk might contain multiple JSON lines
      const lines = partial.split("\n");
      partial = lines.pop() || "";

      for (const line of lines) {
        if (line.trim().startsWith("data:")) {
          const jsonPart = line.replace(/^data:\s*/, "");
          if (jsonPart === "[DONE]") {
            res.write(`event: end\ndata: {}\n\n`);
            return res.end();
          }
          try {
            const parsed = JSON.parse(jsonPart);
            const text =
              parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          } catch {
            // ignore incomplete JSON
          }
        }
      }
    }

    res.write(`event: end\ndata: {}\n\n`);
    res.end();
  } catch (err) {
    console.error(err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

export default router;
