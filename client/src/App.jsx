import { useEffect, useRef, useState } from "react";

import { AudioLines, Check, Clock3, FileDown, Headphones, Mic, MicOff, Send, Sparkles, Square, Volume2, X } from "lucide-react";


import { GoogleGenAI, Modality } from "@google/genai";



const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;



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



      session.sendClientContent({

        turns: [{ role: "user", parts: [{ text: `Start our English practice about ${topic}. Greet me warmly and ask one easy opening question. Remember my level is ${level} and style is ${tone}.` }] }],

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

    cleanupConnection();

    setReportLoading(true);

    setShowReport(true);

    try {

      const response = await fetch(`${API}/api/report`, {

        method: "POST", headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ transcript: transcriptRef.current, durationSeconds: total, level, tone, topic })

      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Could not generate report.");

      setReport(data.report);

    } catch (e) { setError(e.message); }

    finally { setReportLoading(false); }

  }



  const active = status === "active";

  const progress = Math.min(100, elapsed / (duration * 60) * 100);

  const minsLeft = Math.max(0, duration * 60 - elapsed);



  return <div className="app-shell">

    <header className="topbar">

      <a className="brand" href="#"><span className="brand-mark"><AudioLines size={21}/></span><span>SpeakMate<span className="brand-ai"> AI</span><small>YOUR DAILY ENGLISH FRIEND</small></span></a>

      <div className="top-pill"><span className={`status-dot ${active ? "live" : ""}`}/>{active ? "Session in progress" : status === "connecting" ? "Connecting…" : "Ready to practice"}</div>

    </header>



    <main className="layout">

      <section className="intro">

        <div className="eyebrow"><Sparkles size={14}/> SMALL TALKS. BIG PROGRESS.</div>

        <h1>Your English.<br/><span>Your confidence.</span></h1>

        <p>Show up for a few minutes every day. Speak naturally, make mistakes safely, and grow one conversation at a time.</p>

        <div className="benefits"><span><Check size={15}/> No judgement</span><span><Check size={15}/> Personal feedback</span><span><Check size={15}/> Daily progress</span></div>

      </section>



      <section className="practice-card">

        <div className="card-head">

          <div><span className="section-kicker">TODAY'S PRACTICE</span><h2>Let's have a chat</h2><p>Choose your vibe, then say hello.</p></div>

          <div className="avatar"><span>✦</span></div>

        </div>

        <div className="settings-grid">

          <label>Session length<select value={duration} disabled={active || status === "connecting"} onChange={e => setDuration(Number(e.target.value))}><option value={20}>20 minutes</option><option value={25}>25 minutes</option><option value={30}>30 minutes</option></select></label>

          <label>English level<select value={level} disabled={active || status === "connecting"} onChange={e => setLevel(e.target.value)}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>

          <label>Conversation style<select value={tone} disabled={active || status === "connecting"} onChange={e => setTone(e.target.value)}><option value="casual">Casual friend</option><option value="formal">Polite & formal</option><option value="humorous">Fun & humorous</option><option value="motivational">Motivating</option></select></label>

          <label>Today's topic<select value={topic} disabled={active || status === "connecting"} onChange={e => setTopic(e.target.value)}><option>Everyday life</option><option>College & career</option><option>Movies & music</option><option>Travel & culture</option><option>Technology</option><option>Surprise me</option></select></label>

        </div>



        <div className="timer-panel">

          <div className="timer-label"><span><Clock3 size={15}/> SESSION TIMER</span><span>{active ? "YOU'RE DOING GREAT" : "YOUR DAILY MOMENT"}</span></div>

          <div className="timer-line"><strong>{formatTime(Math.min(elapsed, duration * 60))}</strong><span>/ {duration}:00</span></div>

          <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }}/></div>

          <div className="timer-foot"><span>{active ? `${Math.ceil(minsLeft / 60)} min remaining` : "A little practice goes a long way"}</span><span>{Math.round(progress)}%</span></div>

        </div>



        <div className="chat-box">

          <div className="chat-heading"><div><span className="online-avatar">S</span><span><b>Your AI friend</b><small>{active ? "Listening and chatting with you" : "Here whenever you're ready"}</small></span></div><span className="voice-tag"><AudioLines size={14}/> VOICE CHAT</span></div>

          <div className="messages" ref={scrollRef}>

            {messages.length === 0 && <div className="welcome"><div className="welcome-icon"><Headphones size={24}/></div><b>Hey there! 👋</b><p>I'm ready when you are. We'll chat in English, just like friends. No pressure — let's have fun!</p><span>Try saying: “Hey! How was your day?”</span></div>}

            {messages.map((m, i) => <div key={`${m.at}-${i}`} className={`message-row ${m.role === "user" ? "mine" : ""}`}><div className="message"><small>{m.role === "user" ? "YOU" : "SPEAKMATE"}</small><p>{m.text}</p></div></div>)}

          </div>

          {error && <div className="error-note"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={14}/></button></div>}

          <form className="composer" onSubmit={sendText}>

            <input value={draft} onChange={e => setDraft(e.target.value)} disabled={!active} placeholder={active ? "Type a message in English…" : "Start your session to chat…"} aria-label="Type a message"/>

            <button className="send-button" disabled={!active || !draft.trim()} aria-label="Send message"><Send size={17}/></button>

          </form>

          <div className="controls">

            {status === "idle" || status === "finished" ? <button className="start-button" onClick={startSession}><Mic size={18}/> Start speaking <span>→</span></button> :

             status === "connecting" ? <button className="start-button connecting" disabled><span className="spinner"/> Connecting to your AI friend…</button> :

             <><button className={`mic-button ${muted ? "muted" : ""}`} onClick={toggleMute}>{muted ? <MicOff size={18}/> : <Mic size={18}/>} {muted ? "Mic off" : "Mic on"}</button><button className="end-button" onClick={endSession}><Square size={15} fill="currentColor"/> End session</button></>}

          </div>

          <p className="privacy-note"><Volume2 size={13}/> Use headphones for the best experience. Microphone access is required for voice chat.</p>

        </div>

      </section>



      <section className="bottom-note"><div className="note-icon"><Sparkles size={18}/></div><div><b>Progress, not perfection.</b><p>Your report focuses on practical improvements. Every conversation is a step forward.</p></div><div className="streak"><b>20–30</b><small>MIN / DAY</small></div></section>

    </main>



    {showReport && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowReport(false); }}>

      <section className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title">

        <button className="modal-close" onClick={() => setShowReport(false)} aria-label="Close report"><X size={20}/></button>

        {reportLoading ? <div className="report-loading"><div className="report-orb"><Sparkles size={28}/></div><h2>Putting your progress together…</h2><p>Your AI coach is reviewing the conversation for useful feedback.</p><div className="loading-bar"><span/></div></div> :

         report ? <Report report={report} duration={reportDuration} onClose={() => setShowReport(false)}/> :

         <div className="report-loading"><h2>Report unavailable</h2><p>{error || "There wasn't enough transcript data to generate a report. Try a longer conversation."}</p><button className="start-button" onClick={() => setShowReport(false)}>Back to chat</button></div>}

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

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>**"**]/g, (char) => ({

    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"

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



  const printWindow = window.open("", "\_blank", "width=900,height=700");

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
