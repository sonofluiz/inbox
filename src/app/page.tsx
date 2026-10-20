"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { seededMessages, type InboxMessage } from "./data/messages";
import SettingsModal, { type Settings } from "./components/SettingsModal";

type AppStep = "onboard" | "inbox";

const DEFAULT_SETTINGS: Settings = {
  provider: "openrouter",
  apiKey: "",
  model: "meta-llama/llama-3.3-70b-instruct:free",
  githubToken: "",
};

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const saved = localStorage.getItem("inbox-settings");
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function Home() {
  const [step, setStep] = useState<AppStep>("onboard");
  const [repoInput, setRepoInput] = useState("torvalds/linux");
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>(seededMessages);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const selected = messages.find((m) => m.id === selectedId) ?? null;
  const unreadCount = messages.filter((m) => !m.read).length;

  useEffect(() => {
    if (isSpeaking) {
      const start = Date.now() - currentTime * 1000;
      timerRef.current = setInterval(() => {
        setCurrentTime((Date.now() - start) / 1000);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isSpeaking]);

  const markRead = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, read: true } : m))
    );
  }, []);

  const markUnread = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, read: false } : m))
    );
  }, []);

  const selectMessage = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setPlayingId(null);
    setCurrentTime(0);
    setTotalTime(0);
  }, []);

  const playMessage = useCallback(
    (msg: InboxMessage) => {
      if (playingId === msg.id) {
        stopSpeaking();
        return;
      }
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(msg.spoken);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const wordCount = msg.spoken.split(/\s+/).length;
      const estimatedDuration = (wordCount / 150) * 60;
      setTotalTime(estimatedDuration);
      setCurrentTime(0);

      utterance.onend = () => {
        setIsSpeaking(false);
        setPlayingId(null);
        setCurrentTime(0);
        setTotalTime(0);
        markRead(msg.id);
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
        setPlayingId(null);
        setCurrentTime(0);
        setTotalTime(0);
      };

      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
      setPlayingId(msg.id);
    },
    [playingId, stopSpeaking, markRead]
  );

  const clearAll = useCallback(() => {
    stopSpeaking();
    setMessages((prev) => prev.map((m) => ({ ...m, read: true })));
  }, [stopSpeaking]);

  const resetAll = useCallback(() => {
    stopSpeaking();
    setMessages((prev) => prev.map((m) => ({ ...m, read: false })));
    setSelectedId(null);
  }, [stopSpeaking]);

  const fetchAndSummarize = useCallback(
    async (repo: string) => {
      setLoading(true);
      setError(null);
      try {
        const githubRes = await fetch(
          `/api/github?repo=${encodeURIComponent(repo)}&token=${encodeURIComponent(settings.githubToken)}`
        );
        const githubData = await githubRes.json();
        if (!githubRes.ok) {
          throw new Error(githubData.error || "Failed to fetch from GitHub");
        }
        const rawMessages = githubData.messages;
        if (rawMessages.length === 0) {
          setMessages([]);
          setLoading(false);
          return;
        }

        if (settings.apiKey) {
          try {
            const summarizeRes = await fetch("/api/summarize", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messages: rawMessages.map((m: Record<string, unknown>) => ({
                  id: m.id,
                  type: m.type,
                  title: m.title,
                  detail: m.detail,
                  author: m.author,
                  repo: m.repo,
                })),
                provider: settings.provider,
                apiKey: settings.apiKey,
                model: settings.model,
              }),
            });
            const summarizeData = await summarizeRes.json();
            if (summarizeRes.ok && summarizeData.summaries) {
              const summaryMap = new Map(
                summarizeData.summaries.map(
                  (s: { id: string; spoken: string }) => [s.id, s.spoken]
                )
              );
              setMessages(
                rawMessages.map((m: Record<string, unknown>) => ({
                  id: m.id as string,
                  type: m.type as InboxMessage["type"],
                  priority:
                    m.type === "review_request"
                      ? ("urgent" as const)
                      : m.type === "issue"
                        ? ("normal" as const)
                        : ("low" as const),
                  repo: m.repo as string,
                  author: m.author as string,
                  title: m.title as string,
                  spoken: summaryMap.get(m.id) || m.title,
                  detail: m.detail as string,
                  timestamp: m.timestamp as string,
                  read: false,
                }))
              );
            } else {
              setMessages(
                rawMessages.map((m: Record<string, unknown>) => ({
                  id: m.id as string,
                  type: m.type as InboxMessage["type"],
                  priority:
                    m.type === "review_request"
                      ? ("urgent" as const)
                      : m.type === "issue"
                        ? ("normal" as const)
                        : ("low" as const),
                  repo: m.repo as string,
                  author: m.author as string,
                  title: m.title as string,
                  spoken: `[${m.type}] ${m.title} by ${m.author}`,
                  detail: m.detail as string,
                  timestamp: m.timestamp as string,
                  read: false,
                }))
              );
            }
          } catch {
            setMessages(
              rawMessages.map((m: Record<string, unknown>) => ({
                id: m.id as string,
                type: m.type as InboxMessage["type"],
                priority:
                  m.type === "review_request"
                    ? ("urgent" as const)
                    : m.type === "issue"
                      ? ("normal" as const)
                      : ("low" as const),
                repo: m.repo as string,
                author: m.author as string,
                title: m.title as string,
                spoken: `[${m.type}] ${m.title} by ${m.author}`,
                detail: m.detail as string,
                timestamp: m.timestamp as string,
                read: false,
              }))
            );
          }
        } else {
          setMessages(
            rawMessages.map((m: Record<string, unknown>) => ({
              id: m.id as string,
              type: m.type as InboxMessage["type"],
              priority:
                m.type === "review_request"
                  ? ("urgent" as const)
                  : m.type === "issue"
                    ? ("normal" as const)
                    : ("low" as const),
              repo: m.repo as string,
              author: m.author as string,
              title: m.title as string,
              spoken: `[${m.type}] ${m.title} by ${m.author}`,
              detail: m.detail as string,
              timestamp: m.timestamp as string,
              read: false,
            }))
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch");
        setMessages(seededMessages);
      } finally {
        setLoading(false);
      }
    },
    [settings]
  );

  const handleStartTracking = useCallback(() => {
    if (repoInput.trim()) {
      setActiveRepo(repoInput.trim());
      setStep("inbox");
      fetchAndSummarize(repoInput.trim());
    }
  }, [repoInput, fetchAndSummarize]);

  const handleChangeRepo = useCallback(() => {
    stopSpeaking();
    setActiveRepo(null);
    setStep("onboard");
    setMessages(seededMessages);
  }, [stopSpeaking]);

  const handleSaveSettings = useCallback(
    (newSettings: Settings) => {
      setSettings(newSettings);
      localStorage.setItem("inbox-settings", JSON.stringify(newSettings));
      if (activeRepo) fetchAndSummarize(activeRepo);
    },
    [activeRepo, fetchAndSummarize]
  );

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const typeLabel = (t: string) => {
    switch (t) {
      case "commit": return "COMMIT";
      case "pull_request": return "PULL REQ";
      case "review_request": return "REVIEW";
      case "issue": return "ISSUE";
      default: return t.toUpperCase();
    }
  };

  // ── Onboarding ──
  if (step === "onboard") {
    return (
      <div className="min-h-screen bg-[#2a2a3a] flex items-center justify-center p-4">
        <div className="machine-body w-full max-w-lg p-6">
          {/* Brand row */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-[#2a2a2a] tracking-tight" style={{ fontFamily: "'VT323', monospace" }}>
                INBOX
              </h1>
              <p className="text-[#cc7700] text-sm" style={{ fontFamily: "'VT323', monospace" }}>
                VOICE TIME/DAY STAMP
              </p>
            </div>
            <div className="text-right">
              <p className="text-[#2a2a2a] text-xs" style={{ fontFamily: "'VT323', monospace" }}>
                AUTO-LOGIC
              </p>
              <p className="text-[#6a6050] text-xs" style={{ fontFamily: "'VT323', monospace" }}>
                DUAL STANDARD CASSETTE
              </p>
            </div>
          </div>

          {/* LCD display */}
          <div className="lcd-display mb-6">
            <p className="text-[#cc7700] text-xs mb-2" style={{ fontFamily: "'VT323', monospace" }}>
              &gt; ENTER REPO TO TRACK_
            </p>
            <input
              type="text"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="owner/repo"
              className="w-full bg-transparent text-[#e0e0e0] text-lg outline-none placeholder:text-[#555] border-b border-[#333] focus:border-[#cc7700] pb-1"
              style={{ fontFamily: "'VT323', monospace" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && repoInput.trim()) handleStartTracking();
              }}
            />
          </div>

          {/* LLM Provider */}
          <div className="lcd-display mb-4">
            <p className="text-[#cc7700] text-xs mb-2" style={{ fontFamily: "'VT323', monospace" }}>
              LLM PROVIDER
            </p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {(["openrouter", "anthropic", "openai"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    const defaults: Record<string, string> = {
                      openrouter: "meta-llama/llama-3.3-70b-instruct:free",
                      anthropic: "claude-3-haiku-20240307",
                      openai: "gpt-4o-mini",
                    };
                    setSettings((prev) => ({ ...prev, provider: p, model: defaults[p] }));
                  }}
                  className={`py-2 px-2 rounded text-xs border-2 transition-all ${
                    settings.provider === p
                      ? "bg-[#2a2a2a] text-[#e0e0e0] border-[#2a2a2a]"
                      : "bg-[#2a2a2a] text-[#888] border-[#333] hover:border-[#555]"
                  }`}
                  style={{ fontFamily: "'VT323', monospace" }}
                >
                  {p === "openrouter" ? "OpenRouter" : p === "anthropic" ? "Anthropic" : "OpenAI"}
                  {p === "openrouter" && <span className="block text-[10px] text-[#cc7700]">FREE</span>}
                </button>
              ))}
            </div>
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => setSettings((prev) => ({ ...prev, apiKey: e.target.value }))}
              placeholder="API key (free models available)"
              className="w-full bg-transparent text-[#e0e0e0] text-sm outline-none placeholder:text-[#555] border-b border-[#333] focus:border-[#cc7700] pb-1 mb-2"
              style={{ fontFamily: "'VT323', monospace" }}
            />
            <input
              type="text"
              value={settings.model}
              onChange={(e) => setSettings((prev) => ({ ...prev, model: e.target.value }))}
              placeholder="Model name"
              className="w-full bg-transparent text-[#e0e0e0] text-sm outline-none placeholder:text-[#555] border-b border-[#333] focus:border-[#cc7700] pb-1"
              style={{ fontFamily: "'VT323', monospace" }}
            />
          </div>

          {/* GitHub Token */}
          <div className="lcd-display mb-6">
            <p className="text-[#cc7700] text-xs mb-2" style={{ fontFamily: "'VT323', monospace" }}>
              GITHUB TOKEN (OPTIONAL)
            </p>
            <input
              type="password"
              value={settings.githubToken}
              onChange={(e) => setSettings((prev) => ({ ...prev, githubToken: e.target.value }))}
              placeholder="ghp_..."
              className="w-full bg-transparent text-[#e0e0e0] text-sm outline-none placeholder:text-[#555] border-b border-[#333] focus:border-[#cc7700] pb-1"
              style={{ fontFamily: "'VT323', monospace" }}
            />
          </div>

          {/* Physical buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleStartTracking}
              disabled={!repoInput.trim() || !settings.apiKey.trim()}
              className="btn-physical flex-1 disabled:opacity-50"
            >
              ▶ START TRACKING
            </button>
            <button
              onClick={() => { setRepoInput(""); setSettings((prev) => ({ ...prev, apiKey: "" })); }}
              className="btn-physical"
            >
              ■ RESET
            </button>
          </div>

          {/* Bottom label */}
          <div className="mt-4 text-center">
            <p className="text-[#6a6050] text-xs" style={{ fontFamily: "'VT323', monospace" }}>
              EASA-PHONE · TONE REMOTE CONTROL
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Main inbox — mimics the KXT1451 physical layout ──
  return (
    <div className="min-h-screen bg-[#2a2a3a] flex flex-col">
      {/* Machine body */}
      <div className="flex-1 max-w-5xl mx-auto w-full p-4 py-6">
        <div className="machine-body overflow-hidden">
          {/* Top panel — brand + labels */}
          <div className="flex items-center justify-between px-6 pt-4 pb-2">
            <div>
              <h1 className="text-xl font-bold text-[#2a2a2a]" style={{ fontFamily: "'VT323', monospace" }}>
                INBOX
              </h1>
              <p className="text-[#cc7700] text-sm" style={{ fontFamily: "'VT323', monospace" }}>
                VOICE TIME/DAY STAMP
              </p>
            </div>
            <div className="text-right">
              <p className="text-[#2a2a2a] text-xs" style={{ fontFamily: "'VT323', monospace" }}>
                {activeRepo || repoInput}
              </p>
              <p className="text-[#6a6050] text-xs" style={{ fontFamily: "'VT323', monospace" }}>
                AUTO-LOGIC
              </p>
            </div>
          </div>

          {/* Main panel — speaker grille + content */}
          <div className="flex">
            {/* Left side — speaker grille + physical buttons */}
            <div className="w-16 border-r-2 border-[#b0a890] flex flex-col">
              {/* Speaker grille */}
              <div className="speaker-grille flex-1 min-h-[200px]" />
              {/* Physical buttons */}
              <div className="p-2 space-y-2">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="btn-physical w-full text-xs py-2"
                  title="Settings"
                >
                  ⚙
                </button>
                <button
                  onClick={resetAll}
                  className="btn-physical w-full text-xs py-2"
                  title="Reset all"
                >
                  ↺
                </button>
                <button
                  onClick={handleChangeRepo}
                  className="btn-physical w-full text-xs py-2"
                  title="Change repo"
                >
                  ◄
                </button>
              </div>
            </div>

            {/* Right side — LCD display + message list */}
            <div className="flex-1 flex flex-col">
              {/* LCD status bar */}
              <div className="lcd-display mx-4 mt-4 mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-[#cc7700] text-xs" style={{ fontFamily: "'VT323', monospace" }}>
                      TIME
                    </span>
                    <span className="text-[#e0e0e0] text-xs" style={{ fontFamily: "'VT323', monospace" }}>
                      {new Date().toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[#cc7700] text-xs" style={{ fontFamily: "'VT323', monospace" }}>
                      POWER
                    </span>
                    <span className="text-[#16A34A] text-xs" style={{ fontFamily: "'VT323', monospace" }}>
                      ● IN USE
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[#cc7700] text-xs" style={{ fontFamily: "'VT323', monospace" }}>
                      ANSWER
                    </span>
                    <span className="text-[#e0e0e0] text-xs" style={{ fontFamily: "'VT323', monospace" }}>
                      {unreadCount} NEW
                    </span>
                  </div>
                </div>
              </div>

              {/* Loading / Error */}
              {loading && (
                <div className="lcd-display mx-4 mb-3">
                  <p className="text-[#16A34A] text-sm" style={{ fontFamily: "'VT323', monospace" }}>
                    &gt; FETCHING FROM GITHUB...
                  </p>
                </div>
              )}
              {error && !loading && (
                <div className="lcd-display mx-4 mb-3">
                  <p className="text-[#DC2626] text-sm" style={{ fontFamily: "'VT323', monospace" }}>
                    ⚠ {error}
                  </p>
                </div>
              )}

              {/* Message list — LCD style */}
              <div className="flex-1 px-4 pb-4 overflow-y-auto max-h-[400px]">
                <div className="lcd-display h-full">
                  <p className="text-[#cc7700] text-xs mb-2" style={{ fontFamily: "'VT323', monospace" }}>
                    MSG LIST — {String(messages.length).padStart(2, "0")}/{String(messages.length).padStart(2, "0")}
                  </p>
                  <div className="space-y-1">
                    {messages.length === 0 ? (
                      <p className="text-[#555] text-sm" style={{ fontFamily: "'VT323', monospace" }}>
                        NO MESSAGES
                      </p>
                    ) : (
                      messages.map((msg, idx) => (
                        <button
                          key={msg.id}
                          onClick={() => selectMessage(msg.id)}
                          className={`w-full text-left px-2 py-1.5 rounded transition-colors ${
                            selectedId === msg.id ? "bg-[#333]" : "hover:bg-[#252525]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {!msg.read && (
                              <span className="text-[#DC2626] text-xs font-bold" style={{ fontFamily: "'VT323', monospace" }}>
                                ●NEW
                              </span>
                            )}
                            {msg.read && (
                              <span className="text-[#444] text-xs" style={{ fontFamily: "'VT323', monospace" }}>
                                ───
                              </span>
                            )}
                            <span className="text-[#888] text-xs" style={{ fontFamily: "'VT323', monospace" }}>
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <span className="text-[#aaa] text-xs" style={{ fontFamily: "'VT323', monospace" }}>
                              [{typeLabel(msg.type)}]
                            </span>
                          </div>
                          <p className={`text-sm truncate ${msg.read ? "text-[#888]" : "text-[#e0e0e0]"}`} style={{ fontFamily: "'VT323', monospace" }}>
                            &gt; {msg.title}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom — selected message transcript + playback */}
              {selected && (
                <div className="border-t-2 border-[#b0a890] p-4">
                  {/* LCD transcript */}
                  <div className="lcd-display mb-3">
                    <p className="text-[#cc7700] text-xs mb-1" style={{ fontFamily: "'VT323', monospace" }}>
                      ▶ TRANSCRIPT — {selected.title}
                    </p>
                    <p className="text-[#e0e0e0] text-sm leading-relaxed" style={{ fontFamily: "'VT323', monospace" }}>
                      &ldquo;{selected.spoken}&rdquo;
                    </p>
                  </div>

                  {/* Playback controls — physical buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => playMessage(selected)}
                      className="btn-physical flex-1"
                    >
                      {playingId === selected.id ? "■ STOP" : "▶ PLAY MESSAGE"}
                    </button>
                    {selected.read && (
                      <button
                        onClick={() => markUnread(selected.id)}
                        className="btn-physical"
                      >
                        ↩ UNREAD
                      </button>
                    )}
                  </div>

                  {/* VU meter */}
                  {playingId === selected.id && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[#6a6050] text-xs mb-1" style={{ fontFamily: "'VT323', monospace" }}>
                        <span>PLAYING...</span>
                        <span>{formatTime(currentTime)} / {formatTime(totalTime)}</span>
                      </div>
                      <div className="h-2 bg-[#1a1a1a] rounded border border-[#333] overflow-hidden">
                        <div
                          className="h-full bg-[#16A34A] transition-all duration-100"
                          style={{ width: `${totalTime > 0 ? Math.min((currentTime / totalTime) * 100, 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Bottom label */}
          <div className="px-6 py-2 border-t-2 border-[#b0a890] text-center">
            <p className="text-[#6a6050] text-xs" style={{ fontFamily: "'VT323', monospace" }}>
              EASA-PHONE · DUAL STANDARD CASSETTE · TONE REMOTE CONTROL
            </p>
          </div>
        </div>
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
        initialSettings={settings}
      />
    </div>
  );
}
