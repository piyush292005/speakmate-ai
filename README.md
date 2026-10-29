# SpeakMate AI — Gemini Live voice practice

SpeakMate is a React + Vite frontend with an Express backend. Voice conversations use the Google Gemini Live API over WebSockets through the official `@google/genai` SDK. The backend issues short-lived tokens; the permanent Gemini API key stays in `server/.env`. Session feedback is generated with Gemini too, so this project no longer calls OpenAI.

## Requirements
- Node.js 20+
- A Google AI Studio API key: https://aistudio.google.com/apikey
- A modern browser with microphone access (localhost or HTTPS)

## Setup
1. In `server`, copy `.env.example` to `.env` and set `GEMINI_API_KEY` to your own key.
2. In a terminal:
   ```bash
   cd server
   npm install
   npm run dev
   ```
3. In another terminal:
   ```bash
   cd client
   cp .env.example .env
   npm install
   npm run dev
   ```
4. Open the Vite URL shown in the terminal (usually http://localhost:5173).

On Windows, copy the example files manually if `cp` is unavailable.

## Environment
Backend `server/.env`:
- `GEMINI_API_KEY` — Google AI Studio key; server only, never put this in `client/.env`.
- `GEMINI_LIVE_MODEL` — default `gemini-3.8-live`.
- `GEMINI_REPORT_MODEL` — default `gemini-3.8-flash`.
- `CLIENT_ORIGIN` — default `http://localhost:5173`.
- `PORT` — default `3000`.

Frontend `client/.env`:
- `VITE_API_URL=http://localhost:3000`

## API routes
- `GET /api/health`
- `POST /api/realtime/client-secret` — creates a short-lived Gemini Live token.
- `POST /api/report` — generates structured practice feedback with Gemini.

## Free-tier notes
Google lists a free tier for selected Gemini models, including its Live audio models, but quotas, access, and rate limits apply and can change. Free-tier use may be subject to Google's data-use terms. Check the current pricing and model availability at https://ai.google.dev/gemini-api/docs/pricing. This app is not guaranteed to run without limits.

## Production checklist
Add authentication, per-user quotas, abuse prevention, monitoring, and a privacy policy before public launch. Restrict CORS to the deployed frontend origin and use HTTPS. The short-lived token reduces exposure of the permanent key but does not replace backend authentication or abuse controls.
