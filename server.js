import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.OPENAI_API_KEY;

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Terlalu banyak permintaan. Coba lagi sebentar." }
});
app.use("/api/", limiter);

const client = apiKey ? new OpenAI({ apiKey }) : null;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, configured: Boolean(client) });
});

app.post("/api/chat", async (req, res) => {
  if (!client) {
    return res.status(503).json({
      error: "Server belum dikonfigurasi. Pemilik server perlu mengisi OPENAI_API_KEY di file .env."
    });
  }

  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) {
    return res.status(400).json({ error: "Riwayat chat tidak valid." });
  }

  const cleanMessages = [];
  for (const item of messages) {
    if (!item || !["user", "assistant"].includes(item.role) ||
        typeof item.content !== "string" || !item.content.trim()) {
      return res.status(400).json({ error: "Format pesan tidak valid." });
    }
    cleanMessages.push({
      role: item.role,
      content: item.content.slice(0, 12000)
    });
  }

  if (cleanMessages[cleanMessages.length - 1].role !== "user") {
    return res.status(400).json({ error: "Pesan terakhir harus dari pengguna." });
  }

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      instructions: "Kamu adalah asisten AI yang ramah dan membantu. Jawab dalam bahasa yang digunakan pengguna, utamakan bahasa Indonesia jika sesuai. Bantu menjelaskan pelajaran dan coding. Untuk kode, gunakan blok kode Markdown dan jelaskan cara menjalankannya. Jika tidak yakin, katakan dengan jujur.",
      input: cleanMessages.map(m => ({
        role: m.role,
        content: m.content
      })),
      max_output_tokens: 1800
    });

    res.json({ reply: response.output_text || "Maaf, AI belum menghasilkan jawaban teks." });
  } catch (err) {
    console.error("AI request failed:", err?.status || "", err?.message || "unknown error");
    const status = err?.status === 401 ? 502 : 502;
    res.status(status).json({
      error: err?.status === 401
        ? "API key ditolak. Periksa konfigurasi API key di server."
        : "AI tidak dapat menjawab saat ini. Periksa koneksi, model, dan saldo/limit API."
    });
  }
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(port, "0.0.0.0", () => {
  console.log(`HTML Chat AI berjalan pada port ${port}`);
});