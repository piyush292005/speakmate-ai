import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import { makeFriendPrompt } from "./prompts.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const liveModel = process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live";
const reportModel = process.env.GEMINI_REPORT_MODEL || "gemini-3.8-flash";

app.use(helmet());
app.use(cors({ origin: clientOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));

app.get("/api/health", (_req, res) => res.json({ ok: true, provider: "Google Gemini" }));

app.post("/api/realtime/client-secret", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured in server/.env. Create a key in Google AI Studio." });
    }

    const { tone = "casual", level = "intermediate", topic = "Everyday life" } = req.body || {};
    const systemInstruction = makeFriendPrompt({ tone, level, topic });
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { apiVersion: "v1alpha" }
    });
    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: liveModel,
          config: {
            responseModalities: ["AUDIO"],
            systemInstruction,
            inputAudioTranscription: {},
            outputAudioTranscription: {}
          }
        }
      }
    });

    if (!token?.name) return res.status(502).json({ error: "Google did not return a temporary Live API token." });
    res.json({ clientSecret: token.name, expiresAt: token.expireTime, model: liveModel, systemInstruction });
  } catch (err) {
    console.error("Gemini Live token error:", err?.message || err);
    const status = Number(err?.status) || 500;
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: err?.message || "Could not create a Gemini Live session. Check API key, model access, and free-tier limits."
    });
  }
});

app.post("/api/report", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured in server/.env." });
    }
    const { transcript, durationSeconds, level = "intermediate" } = req.body || {};
    if (!Array.isArray(transcript) || transcript.length === 0) {
      return res.status(400).json({ error: "A non-empty transcript is required to create a report." });
    }
    if (transcript.length > 300 || transcript.some(t => !["user", "assistant"].includes(t.role) || typeof t.text !== "string" || t.text.length > 4000)) {
      return res.status(400).json({ error: "Transcript format is invalid or too large." });
    }

    const conversation = transcript.map(t => `${t.role === "user" ? "LEARNER" : "AI FRIEND"}: ${t.text}`).join("\n");
    const seconds = Math.max(0, Math.min(180 * 60, Number(durationSeconds) || 0));
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const result = await ai.models.generateContent({
      model: reportModel,
      contents: `You are a supportive English speaking coach. Evaluate only evidence in the transcript. Do not invent errors, quotes, pronunciation observations, or statistics. If the transcript is short, state that the assessment is limited. Return valid JSON with keys: fluencyScore (number 0-100), summary (string), estimatedSpeakingSeconds (number), grammar (array of {original, corrected, explanation}), vocabulary (array of {used, suggestion, why}), strengths (array of strings), practiceGoals (array of strings), encouragement (string). Keep corrections constructive. Only include clearly supported grammar errors; if none, return an empty grammar array. Vocabulary suggestions must preserve meaning.\nLearner level: ${String(level).slice(0, 40)}. Wall-clock duration: ${seconds} seconds. Estimate speaking seconds conservatively from learner words only (about 130 words/minute) and cap at wall-clock duration.\nTranscript:\n${conversation}`,
      config: { responseMimeType: "application/json", temperature: 0.2 }
    });

    const content = result.text;
    if (!content) return res.status(502).json({ error: "The Gemini report model returned an empty response." });
    let report;
    try { report = JSON.parse(content); } catch {
      return res.status(502).json({ error: "Could not parse the generated report. Please try again." });
    }
    report.estimatedSpeakingSeconds = Math.min(
      Math.max(0, Number(report.estimatedSpeakingSeconds) || 0), seconds
    );
    res.json({ report });
  } catch (err) {
    console.error("Gemini report error:", err?.message || err);
    const status = Number(err?.status) || 500;
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: err?.message || "Report generation failed. Check Gemini API access and free-tier limits."
    });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(port, () => console.log(`SpeakMate Gemini API listening on port ${port}`));
