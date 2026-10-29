import { useEffect, useRef, useState } from "react";
import { AudioLines, Check, Clock3, Headphones, Mic, MicOff, Send, Sparkles, Square, Volume2, X } from "lucide-react";
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

  async function startSession() {
    setError("");
    setReport(null);
    setShowReport(false);
    setMessages([]);
    transcriptRef.current = [];
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
      const tokenBody = await tokenRes.text();
      let tokenData = {};
      try { tokenData = tokenBody ? JSON.parse(tokenBody) : {}; } catch {}
      if (!tokenRes.ok) {
        throw new Error(tokenData.error || `Could not create a Gemini session (server ${tokenRes.status}).`);
      }
      if (!tokenData.clientSecret) {
        throw new Error("Backend did not return a Gemini temporary token. Check GEMINI_API_KEY in server/.env.");
      }

      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;
      await audioContext.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;

      const prompt = tokenData.systemInstruction || "You are SpeakMate, a friendly English speaking partner. Speak in clear, concise English and ask one question at a time.";
      const ai = new GoogleGenAI({
        apiKey: tokenData.clientSecret,
        httpOptions: { apiVersion: "v1alpha" }
      });

      const session = await ai.live.connect({
        model: tokenData.model || "gemini-3.8-live",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: prompt,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {},
          onmessage: (message) => {
            const serverContent = message.serverContent;
            if (!serverContent) return;

            const inputText = serverContent.inputTranscription?.text;
            if (inputText) pendingUserTextRef.current += inputText;

            const outputText = serverContent.outputTranscription?.text;
            if (outputText) pendingAssistantTextRef.current += outputText;

            const parts = serverContent.modelTurn?.parts || [];
            for (const part of parts) {
              if (part.inlineData?.data && String(part.inlineData.mimeType || "").startsWith("audio/pcm")) {
                try { playPcmBase64(part.inlineData.data, audioContextRef.current); }
                catch (err) { console.warn("Could not play an audio chunk:", err); }
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
            const message = event?.message || "Gemini Live connection error.";
            setError(message);
          },
          onclose: (event) => {
            if (!endedRef.current) {
              setError(event?.reason ? `Gemini connection closed: ${event.reason}` : "Gemini voice connection closed. Start a new session to reconnect.");
            }
          }
        }
      });
      liveSessionRef.current = session;
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
        if (mutedRef.current || !liveSessionRef.current) return;
        try {
          const pcm = downsampleTo16k(event.inputBuffer.getChannelData(0), audioContext.sampleRate);
          liveSessionRef.current.sendRealtimeInput({
            audio: { data: pcmToBase64(pcm), mimeType: "audio/pcm;rate=16000" }
          });
        } catch (err) {
          console.error("Could not stream microphone audio:", err);
          setError("Microphone audio could not be sent. Please restart the session.");
        }
      };
      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (e) {
      cleanupConnection();
      setStatus("idle");
      setError(e?.message || "Could not start. Check microphone permission and the backend server.");
    }
  }

  function sendText(e) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || status !== "active" || !liveSessionRef.current) return;
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
    cleanupConnection();
    setReportLoading(true);
    setShowReport(true);
    try {
      const response = await fetch(`${API}/api/report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcriptRef.current, durationSeconds: total, level })
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

function Report({ report, duration, onClose }) {
  const score = Math.max(0, Math.min(100, Number(report.fluencyScore) || 0));
  const speakTime = Number(report.estimatedSpeakingSeconds) || 0;
  return <div className="report-content">
    <div className="report-topline"><span className="report-badge"><Sparkles size={14}/> SESSION COMPLETE</span><span className="report-date">YOUR DAILY REPORT</span></div>
    <h2 id="report-title">Look at you, showing up! 🎉</h2><p className="report-intro">{report.summary || "Nice work finishing your practice session."}</p>
    <div className="score-grid">
      <div className="score-card"><span>FLUENCY SCORE</span><strong>{score}<small>/100</small></strong><div className="score-track"><span style={{width:`${score}%`}}/></div></div>
      <div className="score-card"><span>EST. SPEAKING TIME</span><strong>{Math.floor(speakTime/60)}<small>m</small> {speakTime%60}<small>s</small></strong><p>Estimated from your transcript</p></div>
      <div className="score-card"><span>SESSION LENGTH</span><strong>{Math.floor(duration/60)}<small>m</small> {duration%60}<small>s</small></strong><p>Time spent practicing</p></div>
    </div>
    <ReportSection title="Grammar tune-up" subtitle="Small changes that make your English clearer" empty="No clear grammar errors found in the available transcript." items={report.grammar} render={g => <div className="feedback-item"><div className="before"><span>YOU SAID</span><p>{g.original}</p></div><div className="after"><span>TRY THIS</span><p>{g.corrected}</p></div>{g.explanation && <p className="explanation">{g.explanation}</p>}</div>}/>
    <ReportSection title="Level up your vocabulary" subtitle="Alternative phrases to try next time" empty="Keep exploring new words and expressions!" items={report.vocabulary} render={v => <div className="vocab-item"><div><span className="word-chip">{v.used}</span><span className="word-arrow">→</span><span className="word-chip better">{v.suggestion}</span></div><p>{v.why}</p></div>}/>
    <ReportSection title="What went well" items={report.strengths} empty="You completed a practice session — that is a win." render={s => <div className="simple-item"><Check size={16}/><span>{s}</span></div>}/>
    <ReportSection title="Your next mini-goals" items={report.practiceGoals} empty="Try to speak a little longer next time." render={g => <div className="goal-item"><span className="goal-dot"/><span>{g}</span></div>}/>
    <div className="encouragement"><Sparkles size={19}/><p>{report.encouragement || "Keep going — confidence grows one conversation at a time."}</p></div>
    <p className="report-disclaimer">This is an AI-generated learning aid based on the available transcript, not a certified language assessment. Speaking time is an estimate.</p>
    <button className="start-button report-done" onClick={onClose}><Check size={18}/> Done for today</button>
  </div>;
}

function ReportSection({ title, subtitle, items = [], empty, render }) {
  return <section className="report-section"><h3>{title}</h3>{subtitle && <p className="section-subtitle">{subtitle}</p>}
    {Array.isArray(items) && items.length ? <div className="feedback-list">{items.slice(0, 8).map((item, i) => <div key={i}>{render(item)}</div>)}</div> : <p className="empty-feedback">{empty}</p>}
  </section>;
}
