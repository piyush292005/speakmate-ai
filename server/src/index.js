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
app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, provider: "Google Gemini" });
});

app.post("/api/realtime/client-secret", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured in server/.env. Create a key in Google AI Studio."
      });
    }

    const {
      tone = "casual",
      level = "intermediate",
      topic = "Everyday life"
    } = req.body || {};

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
            outputAudioTranscription: {},
            sessionResumption: {},
            contextWindowCompression: {
              slidingWindow: {}
            }
          }
        }
      }
    });

    if (!token?.name) {
      return res.status(502).json({
        error: "Google did not return a temporary Live API token."
      });
    }

    return res.json({
      clientSecret: token.name,
      expiresAt: token.expireTime,
      model: liveModel,
      systemInstruction
    });
  } catch (err) {
    console.error("Gemini Live token error:", err?.message || err);
    const status = Number(err?.status) || 500;
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error:
        err?.message ||
        "Could not create a Gemini Live session. Check API key, model access, and free-tier limits."
    });
  }
});

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function cleanString(value, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanStringArray(value, maxItems = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string" && item.trim())
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, 400));
}

function cleanObjectArray(value, fields, maxItems = 10) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item) => {
    const clean = {};
    for (const field of fields) {
      clean[field] = cleanString(item?.[field], 600);
    }
    return clean;
  }).filter((item) => Object.values(item).some(Boolean));
}

app.post("/api/report", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured in server/.env."
      });
    }

    const {
      transcript,
      durationSeconds,
      level = "intermediate",
      tone = "casual",
      topic = "Everyday life"
    } = req.body || {};

    if (!Array.isArray(transcript) || transcript.length === 0) {
      return res.status(400).json({
        error: "A non-empty transcript is required to create a report."
      });
    }

    if (
      transcript.length > 300 ||
      transcript.some(
        (turn) =>
          !turn ||
          !["user", "assistant"].includes(turn.role) ||
          typeof turn.text !== "string" ||
          turn.text.length > 4000
      )
    ) {
      return res.status(400).json({
        error: "Transcript format is invalid or too large."
      });
    }

    const learnerTurns = transcript.filter((turn) => turn.role === "user");
    const learnerWordCount = learnerTurns
      .map((turn) => turn.text.trim())
      .filter(Boolean)
      .join(" ")
      .split(/\s+/)
      .filter(Boolean).length;

    if (learnerWordCount < 5) {
      return res.status(400).json({
        error: "Please speak a little more before generating your report."
      });
    }

    const conversation = transcript
      .map((turn) => `${turn.role === "user" ? "LEARNER" : "AI FRIEND"}: ${turn.text}`)
      .join("\n")
      .slice(0, 45_000);

    const seconds = Math.max(
      0,
      Math.min(180 * 60, Number(durationSeconds) || 0)
    );

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `
You are a supportive, practical English-speaking coach.
Analyse the learner's actual English from the conversation transcript below.
The transcript may contain speech-recognition imperfections, incomplete spoken phrases,
and casual conversational language. Do not treat every fragment as a grammar error.

IMPORTANT RULES:
- Use only evidence in the transcript. Never invent learner sentences, errors, vocabulary usage, or events.
- Focus on the LEARNER's messages, not the AI FRIEND's messages.
- Keep feedback kind, specific, and useful for the learner's stated level.
- Include only genuine, clearly supported grammar errors. If there are none, return [].
- For every grammar item, quote the learner's exact original wording and provide a corrected version,
  a short grammar rule, and a simple explanation.
- Sentence alternatives must quote an actual learner sentence or phrase from the transcript.
  Give a more natural alternative that preserves the learner's intended meaning and fits the conversation.
  Do not create generic practice sentences.
- Provide up to 10 useful vocabulary words or expressions that are new or valuable for this learner
  and relevant to the conversation topic. Give a simple English meaning and a natural example sentence
  related to the same topic. Do not falsely claim the learner used these words.
- Scores must be integers from 0 to 100 and should be conservative, level-aware estimates.
  Fluency is estimated from transcript flow and expression only; do not assess pronunciation,
  accent, or actual speaking speed from text.
- Estimate learner speaking time from learner words at approximately 130 words per minute,
  and never exceed the session's wall-clock duration.
- If the transcript is short, say that the assessment is limited.
- Return JSON only. No Markdown fences or text outside JSON.

Return exactly this structure:
{
  "summary": "Short personalised overview",
  "grammarScore": 0,
  "fluencyScore": 0,
  "vocabularyScore": 0,
  "estimatedSpeakingSeconds": 0,
  "grammar": [
    {
      "original": "Exact learner wording",
      "corrected": "Corrected sentence",
      "rule": "Short grammar rule",
      "explanation": "Simple explanation"
    }
  ],
  "sentenceAlternatives": [
    {
      "original": "Actual learner wording",
      "alternative": "More natural sentence",
      "reason": "Why this sounds more natural"
    }
  ],
  "newWords": [
    {
      "word": "Word or expression",
      "meaning": "Simple English meaning",
      "example": "A relevant example sentence"
    }
  ],
  "strengths": ["Specific strength supported by the transcript"],
  "practiceGoals": ["Personalised action for the next conversation"],
  "encouragement": "Short supportive message"
}

Learner level: ${cleanString(level, 40) || "intermediate"}
Conversation tone: ${cleanString(tone, 40) || "casual"}
Conversation topic: ${cleanString(topic, 100) || "Everyday life"}
Session wall-clock duration: ${seconds} seconds
Learner word count: ${learnerWordCount}

TRANSCRIPT:
${conversation}
`;

    const result = await ai.models.generateContent({
      model: reportModel,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    });

    const content = result.text;
    if (!content) {
      return res.status(502).json({
        error: "The Gemini report model returned an empty response."
      });
    }

    let generated;
    try {
      generated = JSON.parse(content);
    } catch {
      console.error("Invalid Gemini report JSON:", content.slice(0, 1000));
      return res.status(502).json({
        error: "Could not parse the generated report. Please try again."
      });
    }

    const grammar = cleanObjectArray(
      generated.grammar,
      ["original", "corrected", "rule", "explanation"],
      10
    );

    const sentenceAlternatives = cleanObjectArray(
      generated.sentenceAlternatives,
      ["original", "alternative", "reason"],
      10
    );

    const newWords = cleanObjectArray(
      generated.newWords,
      ["word", "meaning", "example"],
      10
    );

    const estimatedSpeakingSeconds = Math.min(
      seconds,
      Math.max(
        0,
        Math.round(Number(generated.estimatedSpeakingSeconds) || 0)
      )
    );

    // Keep the older vocabulary shape too, so the currently deployed UI
    // can still display sentence-improvement suggestions during the update.
    const legacyVocabulary = sentenceAlternatives.map((item) => ({
      used: item.original,
      suggestion: item.alternative,
      why: item.reason
    }));

    const report = {
      summary: cleanString(generated.summary, 1200),
      grammarScore: clampScore(generated.grammarScore),
      fluencyScore: clampScore(generated.fluencyScore),
      vocabularyScore: clampScore(generated.vocabularyScore),
      estimatedSpeakingSeconds,
      grammar,
      sentenceAlternatives,
      newWords,
      // Compatibility with the existing frontend version:
      vocabulary: legacyVocabulary,
      strengths: cleanStringArray(generated.strengths, 8),
      practiceGoals: cleanStringArray(generated.practiceGoals, 8),
      encouragement: cleanString(generated.encouragement, 600)
    };

    return res.json({ report });
  } catch (err) {
    console.error("Gemini report error:", err?.message || err);
    const status = Number(err?.status) || 500;
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error:
        err?.message ||
        "Report generation failed. Check Gemini API access and free-tier limits."
    });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(port, () => {
  console.log(`SpeakMate Gemini API listening on port ${port}`);
});
