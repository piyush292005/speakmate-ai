import { useEffect, useRef, useState } from "react";
import { AudioLines, Check, Clock3, FileDown, Headphones, Mic, MicOff, Phone, Radio, ShieldCheck, Signal, Sparkles, Square, Volume2, Waves, X } from "lucide-react";
import { GoogleGenAI, Modality } from "@google/genai";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";
const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

const CALL_UI_STYLES = `
.sm-app{min-height:100vh;background:radial-gradient(circle at 78% 10%,#e9e8ff 0,transparent 28%),linear-gradient(135deg,#f7f8ff,#f8fbff 55%,#f3f6ff);color:#18213b;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:0 24px 48px}
.sm-app *{box-sizing:border-box}.sm-topbar{height:82px;max-width:1220px;margin:auto;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e7e9f3}.sm-brand{display:flex;gap:12px;align-items:center;color:inherit;text-decoration:none}.sm-brand-icon{width:43px;height:43px;border-radius:14px;background:#5c55dc;color:white;display:grid;place-items:center;box-shadow:0 8px 22px #5c55dc35}.sm-brand b{display:block;font-size:20px;letter-spacing:-.5px}.sm-brand i{font-style:normal;color:#625be2}.sm-brand small{display:block;margin-top:2px;font-size:9px;letter-spacing:1.5px;color:#8a91a8;font-weight:800}.sm-top-status{display:flex;align-items:center;gap:9px;padding:10px 14px;border:1px solid #e3e6f1;border-radius:30px;background:#fff;color:#747d95;font-size:10px;font-weight:800;letter-spacing:1px}.sm-status-dot{width:8px;height:8px;border-radius:50%;background:#aab1c4}.sm-top-status.is-live{color:#d94b69;border-color:#ffd6df;background:#fff8fa}.sm-top-status.is-live .sm-status-dot{background:#ef5573;box-shadow:0 0 0 5px #ffe2e8}.sm-main{max-width:1160px;margin:0 auto}.sm-heading{text-align:center;padding:48px 0 32px}.sm-eyebrow{display:inline-flex;align-items:center;gap:7px;color:#665fe0;font-size:10px;font-weight:900;letter-spacing:1.7px}.sm-heading h1{font-size:clamp(34px,5vw,54px);line-height:1.07;letter-spacing:-2.4px;margin:14px 0 13px;color:#202744}.sm-heading h1 span{color:#655ee0}.sm-heading>p{max-width:620px;margin:0 auto;color:#7b849b;font-size:15px;line-height:1.7}.sm-trust-row{display:flex;justify-content:center;gap:22px;flex-wrap:wrap;margin-top:19px;color:#7d879c;font-size:12px}.sm-trust-row span{display:flex;align-items:center;gap:6px}.sm-trust-row svg{color:#5cbb9a}.sm-workspace{display:grid;grid-template-columns:280px minmax(0,1fr);gap:20px;align-items:stretch}.sm-settings,.sm-call-card{border:1px solid #e7e9f3;border-radius:24px;background:#fff;box-shadow:0 18px 55px #313d6810}.sm-settings{padding:24px;display:flex;flex-direction:column;gap:18px}.sm-settings-head{display:flex;flex-direction:column;gap:6px;margin-bottom:2px}.sm-settings-head>span,.sm-call-topline,.sm-captions-head span{font-size:9px;font-weight:900;letter-spacing:1.5px;color:#777f99}.sm-settings-head b{font-size:20px;letter-spacing:-.5px}.sm-settings-head small{font-size:12px;line-height:1.5;color:#9098aa}.sm-settings label{display:flex;flex-direction:column;gap:8px;font-size:11px;font-weight:800;color:#606b84}.sm-settings select{height:43px;border:1px solid #e7e9f1;border-radius:11px;background:#fafbff;color:#303a56;padding:0 12px;font-family:inherit;font-size:13px;font-weight:500;outline:none}.sm-settings select:focus{border-color:#827bed;box-shadow:0 0 0 3px #827bed20}.sm-settings select:disabled{opacity:.6}.sm-memory-note{margin-top:auto;border:1px solid #e8e7ff;background:#f8f7ff;border-radius:14px;padding:13px;display:flex;gap:10px;color:#655ee0}.sm-memory-note span{display:flex;flex-direction:column;gap:4px}.sm-memory-note b{font-size:11px;color:#454b71}.sm-memory-note small{font-size:10px;line-height:1.45;color:#858ba4}.sm-call-card{padding:22px 26px 17px;min-height:600px;display:flex;flex-direction:column}.sm-call-topline{display:flex;justify-content:space-between;align-items:center}.sm-call-topline>span{display:flex;align-items:center;gap:7px}.sm-call-topline>span:last-child{color:#9aa1b3}.sm-call-topline .sm-live-label{color:#e45b77}.sm-call-stage{position:relative;overflow:hidden;flex:1;min-height:440px;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:28px 10px 15px}.sm-avatar-wrap{position:relative;margin:15px 0 20px;z-index:1}.sm-avatar{width:118px;height:118px;border-radius:50%;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,#7b74f1,#5149ca);box-shadow:0 16px 38px #655de64a, inset 0 2px 4px #ffffff55;position:relative;z-index:2}.sm-avatar:before{content:"";position:absolute;inset:10px;border:1px solid #ffffff55;border-radius:50%}.sm-avatar-presence{position:absolute;right:6px;bottom:8px;width:17px;height:17px;border-radius:50%;background:#53c99b;border:3px solid white;z-index:3}.sm-orbit{position:absolute;border:1px solid #e9e8ff;border-radius:50%;width:240px;height:240px;top:78px;left:50%;transform:translateX(-50%)}.sm-orbit-two{width:300px;height:300px;top:48px;border-color:#f0efff}.sm-call-active .sm-orbit-one{animation:sm-orbit 3s ease-out infinite}.sm-call-active .sm-orbit-two{animation:sm-orbit 3s ease-out 1s infinite}.sm-partner-name{font-size:23px;font-weight:850;letter-spacing:-.7px}.sm-partner-subtitle{font-size:12px;color:#9299aa;margin-top:5px}.sm-call-state{margin-top:18px;display:flex;align-items:center;gap:8px;color:#747d95;font-size:12px;font-weight:700}.sm-pulse-dot{width:7px;height:7px;border-radius:50%;background:#ee6480;box-shadow:0 0 0 5px #ffe5eb}.sm-waveform{height:54px;display:flex;align-items:center;justify-content:center;gap:4px;margin-top:19px}.sm-waveform span{height:var(--bar);width:3px;border-radius:5px;background:#c8c6f6;opacity:.75}.sm-waveform.playing span{background:#6a63e4;animation:sm-wave .8s ease-in-out infinite alternate;animation-delay:var(--delay)}.sm-call-timer{font-size:25px;font-weight:800;letter-spacing:1px;font-variant-numeric:tabular-nums;margin-top:13px}.sm-call-timer span{font-size:12px;color:#a0a6b5;font-weight:600;margin-left:7px;letter-spacing:0}.sm-call-caption{margin-top:7px;color:#9aa1b2;font-size:11px;text-align:center}.sm-call-controls{display:flex;align-items:center;justify-content:center;gap:13px;padding:10px 0 20px}.sm-call-start,.sm-call-end{height:54px;border:0;border-radius:16px;padding:0 28px;display:inline-flex;align-items:center;justify-content:center;gap:10px;font-size:14px;font-weight:800;cursor:pointer;transition:.2s}.sm-call-start{min-width:230px;background:#5e57dc;color:#fff;box-shadow:0 10px 24px #5e57dc40}.sm-call-start:hover{transform:translateY(-2px);background:#5049ca}.sm-call-start.is-connecting{background:#8d88e8;cursor:wait}.sm-call-end{background:#f05d78;color:white;box-shadow:0 9px 22px #f05d7830}.sm-call-end:hover{background:#df4967}.sm-control-button{width:68px;height:60px;border:1px solid #e8eaf2;border-radius:16px;background:#f8f9fd;color:#58627b;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer}.sm-control-button span{font-size:9px;font-weight:800}.sm-control-button.is-muted{color:#e34e6d;background:#fff2f5;border-color:#ffd9e1}.sm-call-footer{display:flex;justify-content:center;gap:24px;border-top:1px solid #f0f1f6;padding-top:15px;color:#9aa1b2;font-size:10px}.sm-call-footer span{display:flex;align-items:center;gap:6px}.sm-error{display:flex;justify-content:space-between;gap:10px;padding:11px 13px;border:1px solid #ffd8df;border-radius:11px;background:#fff6f8;color:#bb3c58;font-size:12px;margin:0 0 12px}.sm-error button{border:0;background:transparent;color:inherit;cursor:pointer}.sm-spinner{width:16px;height:16px;border:2px solid #ffffff70;border-top-color:white;border-radius:50%;animation:sm-spin .8s linear infinite}.sm-captions{border:1px solid #ececf5;background:#fafaff;border-radius:14px;padding:13px;margin:0 0 15px}.sm-captions-head{display:flex;justify-content:space-between;gap:10px}.sm-captions-head small{font-size:10px;color:#9aa1b2}.sm-caption-list{max-height:180px;overflow:auto;margin-top:10px;display:flex;flex-direction:column;gap:10px}.sm-caption-list>p{font-size:12px;color:#9aa1b2}.sm-caption-line{display:flex;gap:10px;font-size:12px;line-height:1.5}.sm-caption-line b{font-size:9px;letter-spacing:.7px;color:#7770df;min-width:65px}.sm-caption-line.learner b{color:#36a47e}.sm-progress-strip{display:flex;align-items:center;gap:14px;margin-top:20px;padding:17px 20px;border:1px solid #e7e9f3;border-radius:18px;background:#fff}.sm-progress-icon{width:38px;height:38px;border-radius:12px;background:#f0efff;color:#655ee0;display:grid;place-items:center}.sm-progress-copy{display:flex;flex-direction:column;gap:4px;flex:1}.sm-progress-copy b{font-size:12px}.sm-progress-copy span{font-size:11px;color:#969daf}.sm-progress-meter{width:150px}.sm-progress-meter>div{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}.sm-progress-meter b{font-size:12px}.sm-progress-meter small{font-size:8px;letter-spacing:1px;color:#9aa1b2}.sm-progress-meter>span{display:block;height:5px;border-radius:9px;background:#eeeff6;overflow:hidden}.sm-progress-meter i{display:block;height:100%;border-radius:9px;background:#655ee0}.sm-report-retry-actions{display:flex;justify-content:center;gap:10px;margin-top:20px}.sm-app .report-modal{max-height:90vh;overflow:auto}.sm-app .report-loading{padding:60px 28px;text-align:center}.sm-app .report-loading h2{font-size:24px;margin:15px 0 8px}.sm-app .report-loading p{max-width:480px;margin:0 auto;color:#7f879b;line-height:1.6;font-size:13px}.sm-app .report-loading .start-button{margin-top:18px}.sm-app .report-loading .start-button:disabled{opacity:.5;cursor:not-allowed}
@keyframes sm-wave{from{transform:scaleY(.35);opacity:.5}to{transform:scaleY(1.25);opacity:1}}@keyframes sm-orbit{0%{transform:translateX(-50%) scale(.82);opacity:.75}100%{transform:translateX(-50%) scale(1.22);opacity:0}}@keyframes sm-spin{to{transform:rotate(360deg)}}
@media(max-width:800px){.sm-app{padding:0 14px 30px}.sm-topbar{height:70px}.sm-heading{padding:36px 0 25px}.sm-workspace{grid-template-columns:1fr}.sm-settings{display:grid;grid-template-columns:1fr 1fr;gap:13px;padding:18px}.sm-settings-head{grid-column:1/-1}.sm-memory-note{grid-column:1/-1}.sm-call-card{min-height:570px;padding:18px 14px}.sm-call-stage{min-height:420px}.sm-progress-meter{width:105px}}
@media(max-width:480px){.sm-brand b{font-size:17px}.sm-brand small{font-size:7px}.sm-top-status{font-size:8px;padding:8px}.sm-heading h1{letter-spacing:-1.5px}.sm-trust-row{gap:11px;font-size:10px}.sm-settings{padding:15px;gap:12px}.sm-settings label{font-size:10px}.sm-settings select{font-size:12px;padding:0 8px}.sm-call-card{min-height:550px}.sm-call-controls{gap:8px}.sm-call-start{min-width:0;width:100%;height:52px}.sm-call-end{padding:0 17px;height:54px}.sm-control-button{width:62px;height:56px}.sm-call-footer{gap:12px;font-size:9px}.sm-progress-strip{padding:13px;gap:9px}.sm-progress-copy span{font-size:10px}.sm-progress-meter{width:75px}}
`;

const MEMORY_KEY = "speakmate_memory_v1";
const MAX_MEMORY_TURNS = 24; // Last 12 learner/AI exchanges

function readConversationMemory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MEMORY_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item => item && ["user", "assistant"].includes(item.role) && typeof item.text === "string")
      .slice(-MAX_MEMORY_TURNS);
  } catch {
    return [];
  }
}

function saveConversationMemory(previous, current) {
  if (!Array.isArray(current) || current.length === 0) return;
  try {
    const merged = [...previous, ...current]
      .filter(item => item && ["user", "assistant"].includes(item.role) && typeof item.text === "string" && item.text.trim())
      .slice(-MAX_MEMORY_TURNS)
      .map(item => ({ role: item.role, text: item.text.trim().slice(0, 500) }));
    localStorage.setItem(MEMORY_KEY, JSON.stringify(merged));
  } catch (err) {
    console.warn("Could not save SpeakMate conversation memory:", err);
  }
}

export default function App() {
  const [duration, setDuration] = useState(20);
  const [tone, setTone] = useState("casual");
  const [level, setLevel] = useState("intermediate");
  const [topic, setTopic] = useState("Everyday life");
  const [status, setStatus] = useState("idle");
  const [elapsed, setElapsed] = useState(0);
  const [reportDuration, setReportDuration] = useState(0);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [captionsOpen, setCaptionsOpen] = useState(false);
  const liveSessionRef = useRef(null);
  const sessionHandleRef = useRef(null);
  const reconnectingRef = useRef(false);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const sourceRef = useRef(null);
  const processorRef = useRef(null);
  const nextPlayTimeRef = useRef(0);
  const mutedRef = useRef(false);
  const pendingUserTextRef = useRef("");
  const pendingAssistantTextRef = useRef("");
  const transcriptRef = useRef([]);
  const reportTranscriptRef = useRef([]);
  const previousMemoryRef = useRef([]);
  const startedAtRef = useRef(null);
  const endedRef = useRef(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (status !== "active") return;
    const timer = window.setInterval(() => {
      const secs = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(secs);
      if (secs >= duration * 60) endSession();
    }, 500);
    return () => window.clearInterval(timer);
  }, [status, duration]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  useEffect(() => () => cleanupConnection(), []);

  function cleanupConnection() {
    try { processorRef.current?.disconnect(); } catch {}
    try { sourceRef.current?.disconnect(); } catch {}
    try { streamRef.current?.getTracks().forEach((track) => track.stop()); } catch {}
    try { liveSessionRef.current?.close(); } catch {}
    try { audioContextRef.current?.close(); } catch {}

    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    liveSessionRef.current = null;
    audioContextRef.current = null;
    nextPlayTimeRef.current = 0;
    pendingUserTextRef.current = "";
    pendingAssistantTextRef.current = "";
    sessionHandleRef.current = null;
    reconnectingRef.current = false;
  }

  function downsampleTo16k(floatSamples, inputRate) {
    if (inputRate === 16000) {
      const pcm = new Int16Array(floatSamples.length);
      for (let i = 0; i < floatSamples.length; i++) {
        const sample = Math.max(-1, Math.min(1, floatSamples[i]));
        pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
      return pcm;
    }
    const ratio = inputRate / 16000;
    const outputLength = Math.floor(floatSamples.length / ratio);
    const pcm = new Int16Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(Math.floor((i + 1) * ratio), floatSamples.length);
      let sum = 0;
      for (let j = start; j < end; j++) sum += floatSamples[j];
      const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return pcm;
  }

  function pcmToBase64(pcm) {
    const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function playPcmBase64(base64, context) {
    if (!base64 || !context) return;
    const binary = atob(base64);
    const sampleCount = Math.floor(binary.length / 2);
    if (!sampleCount) return;
    const audioBuffer = context.createBuffer(1, sampleCount, 24000);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      const sample = (binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8));
      const signed = sample >= 0x8000 ? sample - 0x10000 : sample;
      channel[i] = signed / 0x8000;
    }
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.02, nextPlayTimeRef.current);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + audioBuffer.duration;
  }


  function addMessage(role, text) {
    if (!text?.trim()) return;
    const item = { role, text: text.trim(), at: Date.now() };
    transcriptRef.current = [...transcriptRef.current, { role, text: item.text }].slice(-300);
    setMessages(prev => [...prev, item]);
  }
  
  async function connectLiveSession(tokenData, prompt, handle = null) {
    const ai = new GoogleGenAI({
      apiKey: tokenData.clientSecret,
      httpOptions: { apiVersion: "v1alpha" }
    });

    let session;
    session = await ai.live.connect({
      model: tokenData.model || "gemini-3.8-live",
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: prompt,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        sessionResumption: handle ? { handle } : {},
        contextWindowCompression: { slidingWindow: {} }
      },
      callbacks: {
        onopen: () => console.log("Gemini Live connected"),
        onmessage: (message) => {
          const update = message.sessionResumptionUpdate;
          if (update?.resumable && update?.newHandle) {
            sessionHandleRef.current = update.newHandle;
          }

          if (message.goAway) {
            console.log("Gemini GoAway received:", message.goAway.timeLeft);
            void reconnectSession(session);
          }

          const serverContent = message.serverContent;
          if (!serverContent) return;

          const inputText = serverContent.inputTranscription?.text;
          if (inputText) pendingUserTextRef.current += inputText;

          const outputText = serverContent.outputTranscription?.text;
          if (outputText) pendingAssistantTextRef.current += outputText;

          for (const part of serverContent.modelTurn?.parts || []) {
            if (part.inlineData?.data && String(part.inlineData.mimeType || "").startsWith("audio/pcm")) {
              try { playPcmBase64(part.inlineData.data, audioContextRef.current); }
              catch (err) { console.warn("Could not play audio:", err); }
            }
          }

          if (serverContent.interrupted) {
            nextPlayTimeRef.current = audioContextRef.current?.currentTime || 0;
          }

          if (serverContent.turnComplete) {
            const userText = pendingUserTextRef.current.trim();
            const assistantText = pendingAssistantTextRef.current.trim();
            if (userText) addMessage("user", userText);
            if (assistantText) addMessage("assistant", assistantText);
            pendingUserTextRef.current = "";
            pendingAssistantTextRef.current = "";
          }
        },
        onerror: (event) => {
          if (!reconnectingRef.current && !endedRef.current) {
            setError(event?.message || "Gemini Live connection error.");
          }
        },
        onclose: (event) => {
          // Ignore old sockets after a replacement connection has been installed.
          if (liveSessionRef.current !== session || endedRef.current || reconnectingRef.current) return;
          console.warn("Gemini connection closed:", event?.reason);
          void reconnectSession(session);
        }
      }
    });

    liveSessionRef.current = session;
    return session;
  }

  async function reconnectSession(oldSession) {
    if (endedRef.current || reconnectingRef.current) return;

    const handle = sessionHandleRef.current;
    if (!handle) {
      setError("The voice connection closed before Gemini provided a resumable session handle. Please end this session and start again.");
      return;
    }

    reconnectingRef.current = true;
    setError("Reconnecting your conversation…");
    try {
      try { oldSession?.close(); } catch {}

      const tokenRes = await fetch(`${API}/api/realtime/client-secret`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone, level, topic })
      });
      const tokenText = await tokenRes.text();
      let tokenData = {};
      try { tokenData = tokenText ? JSON.parse(tokenText) : {}; } catch {}
      if (!tokenRes.ok || !tokenData.clientSecret) {
        throw new Error(tokenData.error || `Could not create a reconnect token (server ${tokenRes.status}).`);
      }

      const prompt = tokenData.systemInstruction || "You are SpeakMate, a friendly English speaking partner. Speak in clear, concise English and ask one question at a time.";
      await connectLiveSession(tokenData, prompt, handle);
      reconnectingRef.current = false;
      setError("");
      console.log("SpeakMate conversation resumed.");
    } catch (err) {
      reconnectingRef.current = false;
      console.error("Session resume failed:", err);
      setError(`${err?.message || "Could not resume the voice session."} You can end this session and start a new one.`);
    }
  }


  async function startSession() {
    setError("");
    const previousConversation = readConversationMemory();
    previousMemoryRef.current = previousConversation;
    setReport(null);
    setShowReport(false);
    setMessages([]);
    transcriptRef.current = [];
    pendingUserTextRef.current = "";
    pendingAssistantTextRef.current = "";
    sessionHandleRef.current = null;
    reconnectingRef.current = false;
    endedRef.current = false;
    setElapsed(0);
    setReportDuration(0);
    setMuted(false);
    mutedRef.current = false;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone access is unavailable. Use a modern browser on localhost or HTTPS.");
      }

      setStatus("connecting");
      const tokenRes = await fetch(`${API}/api/realtime/client-secret`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone, level, topic })
      });
      const tokenText = await tokenRes.text();
      let tokenData = {};
      try { tokenData = tokenText ? JSON.parse(tokenText) : {}; } catch {}
      if (!tokenRes.ok || !tokenData.clientSecret) {
        throw new Error(tokenData.error || `Could not create a Gemini session (server ${tokenRes.status}).`);
      }

      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;
      await audioContext.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;

      const prompt = tokenData.systemInstruction || "You are SpeakMate, a friendly English speaking partner. Speak in clear, concise English and ask one question at a time.";
      const session = await connectLiveSession(tokenData, prompt);
      startedAtRef.current = Date.now();
      setStatus("active");

      const previousContext = previousConversation
        .map(item => `${item.role === "user" ? "LEARNER" : "SPEAKMATE"}: ${item.text}`)
        .join("\n")
        .slice(-4500);

      const openingPrompt = previousContext
        ? `Continue our English speaking practice naturally. This is a phone-call style conversation, not a text chat. Speak aloud in short, friendly sentences and ask only one question at a time.\n\nHere is context from our previous practice sessions:\n${previousContext}\n\nUse the learner's last topic or goal to ask a relevant follow-up question. Do not repeat the same opening question. If the previous context is unclear, ask what they would like to practise today. Learner level: ${level}. Conversation style: ${tone}. Today's topic preference: ${topic}.`
        : `Start our English speaking practice about ${topic}. This is a phone-call style conversation, not a text chat. Greet me warmly and ask one easy opening question. Speak aloud in short, natural sentences and ask one question at a time. Remember my English level is ${level} and conversation style is ${tone}.`;

      session.sendClientContent({
        turns: [{ role: "user", parts: [{ text: openingPrompt }] }],
        turnComplete: true
      });

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (event) => {
        const output = event.outputBuffer.getChannelData(0);
        output.fill(0);
        if (mutedRef.current || reconnectingRef.current || !liveSessionRef.current || endedRef.current) return;
        try {
          const pcm = downsampleTo16k(event.inputBuffer.getChannelData(0), audioContext.sampleRate);
          liveSessionRef.current.sendRealtimeInput({
            audio: { data: pcmToBase64(pcm), mimeType: "audio/pcm;rate=16000" }
          });
        } catch (err) {
          console.error("Could not stream microphone audio:", err);
          setError("Microphone audio could not be sent. Please check your connection.");
        }
      };
      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (err) {
      endedRef.current = true;
      cleanupConnection();
      setStatus("idle");
      setError(err?.message || "Could not start. Check microphone permission and the backend server.");
    }
  }

  function sendText(e) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || status !== "active" || reconnectingRef.current || !liveSessionRef.current) return;
    addMessage("user", text);
    try {
      liveSessionRef.current.sendClientContent({
        turns: [{ role: "user", parts: [{ text }] }],
        turnComplete: true
      });
      setDraft("");
    } catch (err) {
      setError(err?.message || "Could not send your message to Gemini.");
    }
  }

  function toggleMute() {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
  }

  async function generateReport(transcript = reportTranscriptRef.current, durationValue = reportDuration) {
    if (!transcript?.length) {
      setError("There is no saved conversation transcript to analyse.");
      return;
    }

    setReportLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          durationSeconds: durationValue,
          level,
          tone,
          topic
        })
      });

      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch {}

      if (!response.ok) {
        throw new Error(data.error || `Report service error (${response.status}).`);
      }
      if (!data.report) {
        throw new Error("The server did not return a report. Please retry.");
      }

      setReport(data.report);
    } catch (err) {
      setError(err?.message || "Could not generate your report. Please retry.");
    } finally {
      setReportLoading(false);
    }
  }

  async function endSession() {
    if (endedRef.current || !["active", "connecting"].includes(status)) return;
    endedRef.current = true;

    const total = startedAtRef.current
      ? Math.max(elapsed, Math.floor((Date.now() - startedAtRef.current) / 1000))
      : elapsed;

    setElapsed(total);
    setReportDuration(total);
    setStatus("finished");

    // Preserve any final partial transcription before closing the connection.
    const finalUserText = pendingUserTextRef.current.trim();
    const finalAssistantText = pendingAssistantTextRef.current.trim();
    if (finalUserText) addMessage("user", finalUserText);
    if (finalAssistantText) addMessage("assistant", finalAssistantText);
    pendingUserTextRef.current = "";
    pendingAssistantTextRef.current = "";

    const finishedTranscript = [...transcriptRef.current];
    reportTranscriptRef.current = finishedTranscript;

    // Save the recent conversation locally so the next call can continue from it.
    saveConversationMemory(previousMemoryRef.current, finishedTranscript);

    cleanupConnection();
    setShowReport(true);
    await generateReport(finishedTranscript, total);
  }

  const active = status === "active";
  const progress = Math.min(100, elapsed / (duration * 60) * 100);
  const minsLeft = Math.max(0, duration * 60 - elapsed);

  return <div className="sm-app">
    <style>{CALL_UI_STYLES}</style>
    <header className="sm-topbar">
      <a className="sm-brand" href="#" onClick={e => e.preventDefault()}>
        <span className="sm-brand-icon"><AudioLines size={22}/></span>
        <span><b>SpeakMate <i>AI</i></b><small>YOUR PERSONAL ENGLISH CALL PARTNER</small></span>
      </a>
      <div className={`sm-top-status ${active ? "is-live" : ""}`}>
        <span className="sm-status-dot"/>{active ? "LIVE CALL" : status === "connecting" ? "CONNECTING" : "READY WHEN YOU ARE"}
      </div>
    </header>

    <main className="sm-main">
      <section className="sm-heading">
        <div className="sm-eyebrow"><Sparkles size={14}/> SPEAK MORE. WORRY LESS.</div>
        <h1>Real conversations.<br/><span>Real confidence.</span></h1>
        <p>It feels like a phone call with a friendly English-speaking partner. No typing needed — just talk naturally.</p>
        <div className="sm-trust-row"><span><ShieldCheck size={15}/> Private practice</span><span><Check size={15}/> No judgement</span><span><AudioLines size={15}/> Voice-first</span></div>
      </section>

      <section className="sm-workspace">
        <aside className="sm-settings">
          <div className="sm-settings-head"><span>CALL SETTINGS</span><b>Make it yours</b><small>Choose your practice preferences before calling.</small></div>
          <label>Call duration<select value={duration} disabled={active || status === "connecting"} onChange={e => setDuration(Number(e.target.value))}><option value={20}>20 minutes</option><option value={25}>25 minutes</option><option value={30}>30 minutes</option></select></label>
          <label>English level<select value={level} disabled={active || status === "connecting"} onChange={e => setLevel(e.target.value)}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
          <label>Partner's style<select value={tone} disabled={active || status === "connecting"} onChange={e => setTone(e.target.value)}><option value="casual">Friendly & casual</option><option value="formal">Polite & formal</option><option value="humorous">Fun & humorous</option><option value="motivational">Motivating</option></select></label>
          <label>Today's topic<select value={topic} disabled={active || status === "connecting"} onChange={e => setTopic(e.target.value)}><option>Everyday life</option><option>College & career</option><option>Movies & music</option><option>Travel & culture</option><option>Technology</option><option>Surprise me</option></select></label>
          <div className="sm-memory-note"><Sparkles size={16}/><span><b>Conversation memory</b><small>{readConversationMemory().length ? "Your next call can continue from your recent practice." : "Your recent conversation will be remembered on this device."}</small></span></div>
        </aside>

        <section className="sm-call-card">
          <div className="sm-call-topline"><span><Signal size={15}/> SPEAKMATE VOICE LINE</span><span className={active ? "sm-live-label" : ""}>{active ? "CONNECTED" : status === "connecting" ? "CALLING…" : status === "finished" ? "CALL ENDED" : "STANDBY"}</span></div>

          <div className={`sm-call-stage ${active ? "sm-call-active" : ""} ${status === "connecting" ? "sm-call-connecting" : ""}`}>
            <div className="sm-orbit sm-orbit-one"/><div className="sm-orbit sm-orbit-two"/>
            <div className="sm-avatar-wrap"><div className="sm-avatar"><AudioLines size={42}/></div><span className="sm-avatar-presence"/></div>
            <div className="sm-partner-name">SpeakMate</div>
            <div className="sm-partner-subtitle">Your friendly English partner</div>
            <div className="sm-call-state">{active ? <><span className="sm-pulse-dot"/> You're on a call</> : status === "connecting" ? "Connecting your call…" : status === "finished" ? "Your call has ended" : "Ready for a voice conversation"}</div>

            <div className={`sm-waveform ${active ? "playing" : ""}`} aria-label={active ? "Voice call active" : "Voice call standby"}>
              {Array.from({ length: 30 }, (_, i) => <span key={i} style={{ "--bar": `${12 + ((i * 17) % 35)}px`, "--delay": `${(i % 9) * 0.08}s` }}/>) }
            </div>
            <div className="sm-call-timer">{formatTime(Math.min(elapsed, duration * 60))}<span>/ {duration}:00</span></div>
            <div className="sm-call-caption">{active ? (muted ? "Your microphone is muted" : "Speak naturally — SpeakMate is listening") : "Use your microphone and speak freely. No chat typing required."}</div>
          </div>

          {error && <div className="sm-error"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={15}/></button></div>}

          <div className="sm-call-controls">
            {status === "idle" || status === "finished" ?
              <button className="sm-call-start" onClick={startSession}><Phone size={19} fill="currentColor"/> Start voice call</button> :
             status === "connecting" ?
              <button className="sm-call-start is-connecting" disabled><span className="sm-spinner"/> Connecting…</button> :
              <>
                <button className={`sm-control-button ${muted ? "is-muted" : ""}`} onClick={toggleMute}>{muted ? <MicOff size={20}/> : <Mic size={20}/>}<span>{muted ? "Unmute" : "Mute"}</span></button>
                <button className="sm-call-end" onClick={endSession}><Phone size={19} fill="currentColor"/> End call</button>
                <button className="sm-control-button" onClick={() => setCaptionsOpen(value => !value)}><AudioLines size={20}/><span>{captionsOpen ? "Hide captions" : "Captions"}</span></button>
              </>}
          </div>

          {captionsOpen && <div className="sm-captions">
            <div className="sm-captions-head"><span>LIVE CAPTIONS</span><small>Optional transcript of your call</small></div>
            <div className="sm-caption-list" ref={scrollRef}>
              {messages.length === 0 ? <p>Your spoken conversation will appear here.</p> : messages.map((m, i) => <div key={`${m.at}-${i}`} className={`sm-caption-line ${m.role === "user" ? "learner" : "partner"}`}><b>{m.role === "user" ? "YOU" : "SPEAKMATE"}</b><span>{m.text}</span></div>)}
            </div>
          </div>}

          <div className="sm-call-footer"><span><Headphones size={14}/> Headphones recommended</span><span><ShieldCheck size={14}/> Practice in a safe space</span></div>
        </section>
      </section>

      <section className="sm-progress-strip">
        <div className="sm-progress-icon"><Sparkles size={19}/></div>
        <div className="sm-progress-copy"><b>Progress, not perfection.</b><span>Each call helps you speak with more clarity and confidence.</span></div>
        <div className="sm-progress-meter"><div><b>{Math.round(progress)}%</b><small>SESSION</small></div><span><i style={{ width: `${progress}%` }}/></span></div>
      </section>
    </main>

    {showReport && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowReport(false); }}>
      <section className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <button className="modal-close" onClick={() => setShowReport(false)} aria-label="Close report"><X size={20}/></button>
        {reportLoading ? <div className="report-loading"><div className="report-orb"><Sparkles size={28}/></div><h2>Preparing your speaking report…</h2><p>Your coach is reviewing the call and finding practical ways to improve your English.</p><div className="loading-bar"><span/></div></div> :
         report ? <Report report={report} duration={reportDuration} onClose={() => setShowReport(false)}/> :
         <div className="report-loading"><div className="report-orb"><Radio size={26}/></div><h2>Your report isn't ready yet</h2><p>{error || "The report service could not complete the analysis. Your call transcript is saved, so you can try again."}</p><div className="sm-report-retry-actions"><button className="start-button" onClick={() => generateReport()} disabled={reportLoading}>Retry report</button><button className="start-button report-done" onClick={() => setShowReport(false)}>Close</button></div></div>}
      </section>
    </div>}
  </div>;
}

function safeScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : null;
}

function downloadReportPdf(report, duration) {
  // Uses the browser's native Print > Save as PDF flow; no extra package required.
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;"
  }[char]));
  const list = (items, render) => Array.isArray(items) && items.length
    ? items.map((item) => `<article>${render(item)}</article>`).join("")
    : "<p>No specific feedback was available in this section.</p>";

  const grammar = report.grammar || report.grammarMistakes || [];
  const alternatives = report.sentenceAlternatives || report.betterSentences || report.alternativeSentences || [];
  const words = report.newWords || report.vocabularyWords || report.wordsToLearn || [];
  const strengths = report.strengths || [];
  const goals = report.practiceGoals || report.nextSessionSuggestions || report.suggestions || [];
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>SpeakMate Speaking Report</title>
  <style>body{font:15px Arial,sans-serif;color:#172033;max-width:850px;margin:35px auto;padding:0 24px;line-height:1.55}h1,h2{color:#172033}h2{margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:7px}.scores{display:flex;gap:14px;flex-wrap:wrap}.score{border:1px solid #ddd;border-radius:10px;padding:14px;min-width:130px}.score b{display:block;font-size:26px}.item{border:1px solid #e2e5eb;border-radius:9px;padding:12px;margin:10px 0;break-inside:avoid}.muted{color:#596579;font-size:13px}.label{font-size:11px;font-weight:bold;color:#657187}.good{color:#087c55}.word{font-weight:bold;font-size:17px}@media print{body{margin:12mm auto;padding:0}.item{break-inside:avoid}button{display:none}}</style></head><body>
  <h1>SpeakMate — Personal Speaking Report</h1><p class="muted">Session duration: ${Math.floor(duration/60)} min ${duration%60} sec · Level: ${escapeHtml(report.level || "Not specified")}</p>
  <p>${escapeHtml(report.summary || "Your personalised English speaking feedback.")}</p>
  <div class="scores">${[["Grammar",report.grammarScore], ["Fluency",report.fluencyScore], ["Vocabulary",report.vocabularyScore]].map(([label,val])=>`<div class="score"><span>${label}</span><b>${safeScore(val) ?? "—"}/100</b></div>`).join("")}</div>
  <h2>Grammar corrections</h2>${list(grammar,g=>`<div class="label">YOU SAID</div><p>${escapeHtml(g.original || g.incorrect || "")}</p><div class="label good">CORRECTED</div><p>${escapeHtml(g.corrected || g.correction || "")}</p><p class="muted">${escapeHtml(g.explanation || "")}</p>`)}
  <h2>Better sentences you could have used</h2>${list(alternatives,a=>`<div class="label">YOUR SENTENCE</div><p>${escapeHtml(a.original || a.userSentence || "")}</p><div class="label good">A MORE NATURAL ALTERNATIVE</div><p>${escapeHtml(a.alternative || a.better || a.suggestedSentence || "")}</p><p class="muted">${escapeHtml(a.reason || a.context || "")}</p>`)}
  <h2>10 useful words from your conversation</h2>${list(words,w=>`<p class="word">${escapeHtml(w.word || w.term || "")}</p><p>${escapeHtml(w.meaning || w.definition || "")}</p><p class="muted">Example: ${escapeHtml(w.example || w.exampleSentence || "")}</p>`)}
  <h2>What went well</h2>${list(strengths,s=>`<p>${escapeHtml(typeof s === "string" ? s : s.feedback || s.text || "")}</p>`)}
  <h2>Suggestions for your next conversation</h2>${list(goals,g=>`<p>${escapeHtml(typeof g === "string" ? g : g.suggestion || g.text || g.feedback || "")}</p>`)}
  <p class="muted">AI-generated learning feedback based on the available transcript. Scores are estimates, not a certified language assessment.</p>
  <script>window.onload=()=>window.print();</script></body></html>`;

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    alert("Please allow pop-ups for SpeakMate to save your report as PDF.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function ScoreCard({ label, value, note }) {
  const score = safeScore(value);
  return <div className="score-card">
    <span>{label}</span>
    <strong>{score === null ? "—" : score}<small>/100</small></strong>
    {score !== null && <div className="score-track"><span style={{ width: `${score}%` }} /></div>}
    {note && <p>{note}</p>}
  </div>;
}

function Report({ report, duration, onClose }) {
  const grammar = report.grammar || report.grammarMistakes || [];
  const alternatives = report.sentenceAlternatives || report.betterSentences || report.alternativeSentences || [];
  const words = report.newWords || report.vocabularyWords || report.wordsToLearn || [];
  const strengths = report.strengths || [];
  const goals = report.practiceGoals || report.nextSessionSuggestions || report.suggestions || [];
  const speakTime = Number(report.estimatedSpeakingSeconds) || 0;

  return <div className="report-content">
    <div className="report-topline"><span className="report-badge"><Sparkles size={14}/> SESSION COMPLETE</span><span className="report-date">YOUR DAILY REPORT</span></div>
    <h2 id="report-title">Your personal speaking feedback</h2>
    <p className="report-intro">{report.summary || "Your conversation has been reviewed. Here are practical ways to express yourself more naturally next time."}</p>

    <div className="score-grid">
      <ScoreCard label="GRAMMAR SCORE" value={report.grammarScore} />
      <ScoreCard label="FLUENCY SCORE" value={report.fluencyScore} note="Estimated from transcript flow and sentence formation" />
      <ScoreCard label="VOCABULARY SCORE" value={report.vocabularyScore} note="Estimated from word variety and usage" />
    </div>
    <div className="score-grid">
      <div className="score-card"><span>EST. SPEAKING TIME</span><strong>{Math.floor(speakTime/60)}<small>m</small> {speakTime%60}<small>s</small></strong><p>Estimated from your transcript</p></div>
      <div className="score-card"><span>SESSION LENGTH</span><strong>{Math.floor(duration/60)}<small>m</small> {duration%60}<small>s</small></strong><p>Time spent practicing</p></div>
    </div>

    <ReportSection title="Grammar corrections" subtitle="Your actual mistakes, corrected with a short explanation" empty="No clear grammar errors were identified in the available transcript." items={grammar} render={g => <div className="feedback-item">
      <div className="before"><span>YOU SAID</span><p>{g.original || g.incorrect || ""}</p></div>
      <div className="after"><span>CORRECTED SENTENCE</span><p>{g.corrected || g.correction || ""}</p></div>
      {g.explanation && <p className="explanation">{g.explanation}</p>}
      {g.rule && <p className="explanation"><b>Grammar point:</b> {g.rule}</p>}
    </div>} />

    <ReportSection title="A better way to say it" subtitle="Alternatives you could have used instead of your original sentence in this conversation" empty="No clear sentence alternatives were available for this conversation." items={alternatives} render={a => <div className="feedback-item">
      <div className="before"><span>YOUR SENTENCE</span><p>{a.original || a.userSentence || ""}</p></div>
      <div className="after"><span>YOU COULD HAVE SAID</span><p>{a.alternative || a.better || a.suggestedSentence || ""}</p></div>
      {(a.reason || a.context) && <p className="explanation">{a.reason || a.context}</p>}
    </div>} />

    <ReportSection title="10 useful words for your next conversation" subtitle="Words selected from the topics and ideas you discussed, with meanings in English" empty="No additional vocabulary suggestions were returned." items={words} render={w => <div className="vocab-item">
      <div><span className="word-chip better">{w.word || w.term || "Word"}</span></div>
      <p><b>Meaning:</b> {w.meaning || w.definition || "Meaning not provided."}</p>
      {(w.example || w.exampleSentence) && <p><b>Example:</b> {w.example || w.exampleSentence}</p>}
    </div>} />

    <ReportSection title="What went well" items={strengths} empty="You completed a speaking session. Keep building on that consistency." render={item => <div className="simple-item"><Check size={16}/><span>{typeof item === "string" ? item : item.feedback || item.text || ""}</span></div>} />
    <ReportSection title="Suggestions for your next conversation" subtitle="Specific things to focus on based on this session" items={goals} empty="Keep speaking regularly and focus on expressing complete thoughts." render={item => <div className="goal-item"><span className="goal-dot"/><span>{typeof item === "string" ? item : item.suggestion || item.text || item.feedback || ""}</span></div>} />

    <div className="encouragement"><Sparkles size={19}/><p>{report.encouragement || "Keep going — confidence grows one conversation at a time."}</p></div>
    <p className="report-disclaimer">This AI-generated learning aid is based on the available transcript. Fluency and vocabulary scores are estimates, not certified language assessments. Pronunciation is not scored from text alone.</p>
    <div className="report-actions">
      <button className="start-button" onClick={() => downloadReportPdf(report, duration)}><FileDown size={18}/> Download PDF</button>
      <button className="start-button report-done" onClick={onClose}><Check size={18}/> Done for today</button>
    </div>
  </div>;
}

function ReportSection({ title, subtitle, items = [], empty, render }) {
  return <section className="report-section">
    <h3>{title}</h3>
    {subtitle && <p className="section-subtitle">{subtitle}</p>}
    {Array.isArray(items) && items.length
      ? <div className="feedback-list">{items.map((item, index) => <div key={index}>{render(item)}</div>)}</div>
      : <p className="empty-feedback">{empty}</p>}
  </section>;
}
