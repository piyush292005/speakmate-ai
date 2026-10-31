
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import { makeFriendPrompt } from "./prompts.js";

const app = express();

const port = Number(process.env.PORT || 3000);
const clientOrigin =
  process.env.CLIENT_ORIGIN || "http://localhost:5173";

const liveModel =
  process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live";

const reportModel =
  process.env.GEMINI_REPORT_MODEL || "gemini-3.8-flash";

// Render proxy configuration
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Middleware
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

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    provider: "Google Gemini",
    liveModel,
    reportModel
  });
});

// ------------------------------------------
// COMMON ERROR HANDLING
// ------------------------------------------

function getErrorStatus(err) {
  const candidates = [
    err?.status,
    err?.statusCode,
    err?.code,
    err?.error?.code
  ];

  for (const candidate of candidates) {
    const value = Number(candidate);

    if (
      Number.isInteger(value) &&
      value >= 400 &&
      value <= 599
    ) {
      return value;
    }
  }

  const message = String(err?.message || err || "");
  const match = message.match(/\b(429|500|502|503|504)\b/);

  return match ? Number(match[1]) : 500;
}

function safeErrorMessage(err, fallback) {
  const message = String(err?.message || "").trim();

  return message
    ? message.slice(0, 700)
    : fallback;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableGeminiError(err) {
  const status = getErrorStatus(err);
  const message = String(err?.message || err || "");

  return (
    [408, 429, 500, 502, 503, 504].includes(status) ||
    /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|UNAVAILABLE|high demand|temporarily unavailable/i.test(message)
  );
}

// ------------------------------------------
// GEMINI REPORT RETRY SYSTEM
// ------------------------------------------

async function generateReportWithRetry(ai, prompt) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(
        `Gemini report attempt ${attempt}/${maxAttempts}`
      );

      const result = await ai.models.generateContent({
        model: reportModel,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2
        }
      });

      return result;

    } catch (err) {
      const status = getErrorStatus(err);

      console.error(
        `Gemini attempt ${attempt} failed:`,
        {
          status,
          message: err?.message || err,
          cause: err?.cause?.message
        }
      );

      if (
        !isRetryableGeminiError(err) ||
        attempt === maxAttempts
      ) {
        throw err;
      }

      const delay = 1500 * Math.pow(2, attempt - 1);

      console.log(`Retrying after ${delay}ms`);

      await wait(delay);
    }
  }

  throw new Error("Report generation failed after retries.");
}

// ------------------------------------------
// GEMINI LIVE SESSION TOKEN
// ------------------------------------------

app.post("/api/realtime/client-secret", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured on the backend."
      });
    }

    const {
      tone = "casual",
      level = "intermediate",
      topic = "Everyday life"
    } = req.body || {};

    const systemInstruction = makeFriendPrompt({
      tone,
      level,
      topic
    });

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        apiVersion: "v1alpha"
      }
    });

    const now = Date.now();

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(
          now + 30 * 60 * 1000
        ).toISOString(),

        newSessionExpireTime: new Date(
          now + 60 * 1000
        ).toISOString(),

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
    const status = getErrorStatus(err);

    console.error("Gemini Live token error:", {
      status,
      message: err?.message || err,
      cause: err?.cause?.message
    });

    return res.status(status).json({
      error: safeErrorMessage(
        err,
        "Could not create a Gemini Live session. Check API key, model access, and quota."
      )
    });
  }
});

// ------------------------------------------
// REPORT CLEANING FUNCTIONS
// ------------------------------------------

function clampScore(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return 0;

  return Math.max(
    0,
    Math.min(100, Math.round(number))
  );
}

function cleanString(value, maxLength = 500) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function cleanStringArray(value, maxItems = 8) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      item =>
        typeof item === "string" && item.trim()
    )
    .slice(0, maxItems)
    .map(item => item.trim().slice(0, 400));
}

function cleanObjectArray(value, fields, maxItems = 10) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, maxItems)
    .map(item => {
      const clean = {};

      for (const field of fields) {
        clean[field] = cleanString(
          item?.[field],
          600
        );
      }

      return clean;
    })
    .filter(item =>
      Object.values(item).some(Boolean)
    );
}

// Parse JSON returned by Gemini
function parseModelJson(content) {
  if (
    typeof content !== "string" ||
    !content.trim()
  ) {
    throw new Error(
      "Gemini returned an empty report."
    );
  }

  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    console.error(
      "Invalid Gemini report JSON:",
      cleaned.slice(0, 1000)
    );

    throw new Error(
      "Gemini returned an invalid report format. Please retry."
    );
  }
}

// ------------------------------------------
// REPORT GENERATION API
// ------------------------------------------

app.post("/api/report", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured on the backend."
      });
    }

    const {
      transcript,
      durationSeconds,
      level = "intermediate",
      tone = "casual",
      topic = "Everyday life"
    } = req.body || {};

    // Transcript validation
    if (
      !Array.isArray(transcript) ||
      transcript.length === 0
    ) {
      return res.status(400).json({
        error: "A non-empty transcript is required."
      });
    }

    if (
      transcript.length > 300 ||
      transcript.some(
        turn =>
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

    // Count learner words
    const learnerTurns = transcript.filter(
      turn => turn.role === "user"
    );

    const learnerWordCount = learnerTurns
      .map(turn => turn.text.trim())
      .filter(Boolean)
      .join(" ")
      .split(/\s+/)
      .filter(Boolean).length;

    if (learnerWordCount < 5) {
      return res.status(400).json({
        error: "Please speak a little more before generating your report."
      });
    }

    // Prepare conversation
    const conversation = transcript
      .map(
        turn =>
          `${turn.role === "user" ? "LEARNER" : "AI FRIEND"}: ${turn.text}`
      )
      .join("\n")
      .slice(0, 45000);

    const seconds = Math.max(
      0,
      Math.min(
        180 * 60,
        Number(durationSeconds) || 0
      )
    );

    // Report prompt
    const prompt = `
You are a supportive, practical English-speaking coach.

Analyse the learner's actual English from the conversation transcript below.

The transcript may contain speech-recognition imperfections,
incomplete spoken phrases, and casual conversational language.

IMPORTANT RULES:

- Use only evidence in the transcript.
- Never invent learner sentences, errors, vocabulary usage, or events.
- Focus on LEARNER messages, not AI FRIEND messages.
- Keep feedback kind, specific, and useful.
- Include only genuine grammar errors.
- If there are no genuine grammar errors, return [].
- Quote the learner's exact original wording.
- Give corrected sentences and simple grammar explanations.
- Sentence alternatives must quote actual learner wording.
- Do not create generic practice sentences.
- Provide up to 10 useful vocabulary words or expressions.
- Scores must be integers from 0 to 100.
- Do not assess pronunciation or accent from text.
- Estimate speaking time using approximately 130 words per minute.
- Never exceed the session wall-clock duration.
- If the transcript is short, say that assessment is limited.
- Return JSON only.

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
      "example": "Relevant example sentence"
    }
  ],
  "strengths": [
    "Specific strength supported by transcript"
  ],
  "practiceGoals": [
    "Personalised action for next conversation"
  ],
  "encouragement": "Short supportive message"
}

Learner level: ${cleanString(level, 40) || "intermediate"}

Conversation tone: ${cleanString(tone, 40) || "casual"}

Conversation topic: ${cleanString(topic, 100) || "Everyday life"}

Session duration: ${seconds} seconds

Learner word count: ${learnerWordCount}

TRANSCRIPT:

${conversation}
`;

    // Generate report with automatic retry
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });

    const result = await generateReportWithRetry(
      ai,
      prompt
    );

    const generated = parseModelJson(result?.text);

    // Clean report fields
    const grammar = cleanObjectArray(
      generated.grammar,
      [
        "original",
        "corrected",
        "rule",
        "explanation"
      ],
      10
    );

    const sentenceAlternatives = cleanObjectArray(
      generated.sentenceAlternatives,
      [
        "original",
        "alternative",
        "reason"
      ],
      10
    );

    const newWords = cleanObjectArray(
      generated.newWords,
      [
        "word",
        "meaning",
        "example"
      ],
      10
    );

    const estimatedSpeakingSeconds = Math.min(
      seconds,
      Math.max(
        0,
        Math.round(
          Number(generated.estimatedSpeakingSeconds) || 0
        )
      )
    );

    // Compatibility with existing frontend
    const legacyVocabulary = sentenceAlternatives.map(
      item => ({
        used: item.original,
        suggestion: item.alternative,
        why: item.reason
      })
    );

    const report = {
      summary: cleanString(
        generated.summary,
        1200
      ),

      grammarScore: clampScore(
        generated.grammarScore
      ),

      fluencyScore: clampScore(
        generated.fluencyScore
      ),

      vocabularyScore: clampScore(
        generated.vocabularyScore
      ),

      estimatedSpeakingSeconds,

      grammar,
      sentenceAlternatives,
      newWords,

      vocabulary: legacyVocabulary,

      strengths: cleanStringArray(
        generated.strengths,
        8
      ),

      practiceGoals: cleanStringArray(
        generated.practiceGoals,
        8
      ),

      encouragement: cleanString(
        generated.encouragement,
        600
      )
    };

    console.log(
      "SpeakMate report generated successfully."
    );

    return res.json({ report });

  } catch (err) {
    const status = getErrorStatus(err);

    console.error("Gemini report error:", {
      status,
      message: err?.message || err,
      cause: err?.cause?.message
    });

    let userMessage =
      "Report generation failed. Please try again.";

    if (status === 429) {
      userMessage =
        "Gemini API rate limit reached. Please wait and try again.";
    } else if (
      [502, 503, 504].includes(status)
    ) {
      userMessage =
        "Gemini report service is temporarily unavailable. Please try again shortly.";
    } else if (
      /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(
        String(err?.message || "")
      )
    ) {
      userMessage =
        "Could not connect to Gemini. Please try again later.";
    } else if (err?.message) {
      userMessage = safeErrorMessage(
        err,
        userMessage
      );
    }

    return res.status(status).json({
      error: userMessage
    });
  }
});

// ------------------------------------------
// GLOBAL ERROR HANDLER
// ------------------------------------------

app.use((err, _req, res, _next) => {
  console.error(
    "Express server error:",
    err?.message || err
  );

  if (
    err instanceof SyntaxError &&
    "body" in err
  ) {
    return res.status(400).json({
      error: "Invalid JSON request body."
    });
  }

  return res.status(500).json({
    error: "Unexpected server error."
  });
});

// ------------------------------------------
// START SERVER
// ------------------------------------------

app.listen(port, () => {
  console.log(
    `SpeakMate Gemini API listening on port ${port}`
  );

  console.log(`Live model: ${liveModel}`);
  console.log(`Report model: ${reportModel}`);
});
