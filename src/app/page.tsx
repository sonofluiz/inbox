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

  // Load settings on mount
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const selected = messages.find((m) => m.id === selectedId) ?? null;
  const unreadCount = messages.filter((m) => !m.read).length;

  // Playback timer
  useEffect(() => {
    if (isSpeaking) {
      const start = Date.now() - currentTime * 1000;
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - start) / 1000;
        setCurrentTime(elapsed);
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

      if (typeof window === "undefined" || !window.speechSynthesis) {
        return;
      }

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

  // Fetch real data from GitHub + AI summarization
  const fetchAndSummarize = useCallback(
    async (repo: string) => {
      setLoading(true);
      setError(null);

      try {
        // Step 1: Fetch from GitHub
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

        // Step 2: Summarize with AI
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
              // Merge AI summaries with raw data
              const summaryMap = new Map(
                summarizeData.summaries.map(
                  (s: { id: string; spoken: string }) => [s.id, s.spoken]
                )
              );

              const mergedMessages: InboxMessage[] = rawMessages.map(
                (m: Record<string, unknown>) => ({
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
                })
              );

              setMessages(mergedMessages);
            } else {
              // AI failed, use raw data with basic spoken text
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
            // AI summarization failed, use raw data
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
          // No API key, use raw data with basic spoken text
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
        // Fall back to seeded messages
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
      // Re-fetch if we have an active repo
      if (activeRepo) {
        fetchAndSummarize(activeRepo);
      }
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

  const priorityColor = (p: string) => {
    switch (p) {
      case "urgent":
        return "text-red-400";
      case "normal":
        return "text-amber-400";
      case "low":
        return "text-green-400";
      default:
        return "text-gray-400";
    }
  };

  const typeIcon = (t: string) => {
    switch (t) {
      case "commit":
        return "C";
      case "pull_request":
        return "P";
      case "review_request":
        return "R";
      case "issue":
        return "I";
      default:
        return "?";
    }
  };

  const typeLabel = (t: string) => {
    switch (t) {
      case "commit":
        return "COMMIT";
      case "pull_request":
        return "PULL REQ";
      case "review_request":
        return "REVIEW";
      case "issue":
        return "ISSUE";
      default:
        return t.toUpperCase();
    }
  };

  // ── Onboarding screen ──
  if (step === "onboard") {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-gradient-to-b from-[#3a3a3a] to-[#2a2a2a] rounded-2xl p-1 shadow-2xl">
            <div className="bg-gradient-to-b from-[#d4c5a9] to-[#c4b896] rounded-xl p-6">
              <div className="text-center mb-6">
                <div className="text-[#5a4a3a] text-xs font-mono tracking-[0.3em] mb-1">
                  ★ ★ ★
                </div>
                <h1 className="text-3xl font-bold text-[#3a2a1a] tracking-tight font-mono">
                  VOICEMAIL
                </h1>
                <p className="text-[#6a5a4a] text-sm font-mono mt-1">
                  for your repository
                </p>
              </div>

              {/* Step 1: Repository */}
              <div className="bg-[#1a2a1a] rounded-lg p-4 mb-4 border-4 border-[#4a3a2a] shadow-inner">
                <div className="font-mono text-[#33ff33] text-xs leading-relaxed mb-2">
                  <p>STEP 1: REPOSITORY</p>
                </div>
                <input
                  type="text"
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  placeholder="owner/repo"
                  className="w-full bg-[#0a1a0a] text-[#33ff33] font-mono text-sm px-3 py-2 rounded border-2 border-[#3a4a3a] focus:border-[#5a6a5a] outline-none placeholder:text-[#2a5a2a]"
                />
              </div>

              {/* Step 2: LLM Provider */}
              <div className="bg-[#1a2a1a] rounded-lg p-4 mb-4 border-4 border-[#4a3a2a] shadow-inner">
                <div className="font-mono text-[#33ff33] text-xs leading-relaxed mb-2">
                  <p>STEP 2: LLM PROVIDER</p>
                </div>
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
                        setSettings((prev) => ({
                          ...prev,
                          provider: p,
                          model: defaults[p],
                        }));
                      }}
                      className={`py-2 px-2 rounded font-mono text-xs font-bold border-b-4 active:border-b-0 transition-all ${
                        settings.provider === p
                          ? "bg-[#3a6a3a] text-white border-[#2a4a2a]"
                          : "bg-[#2a3a2a] text-[#2a8a2a] border-[#1a2a1a] hover:bg-[#3a4a3a]"
                      }`}
                    >
                      {p === "openrouter"
                        ? "OpenRouter"
                        : p === "anthropic"
                          ? "Anthropic"
                          : "OpenAI"}
                      {p === "openrouter" && (
                        <span className="block text-[10px] text-[#5a8a5a]">
                          FREE
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <input
                  type="password"
                  value={settings.apiKey}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, apiKey: e.target.value }))
                  }
                  placeholder="API key (free models available)"
                  className="w-full bg-[#0a1a0a] text-[#33ff33] font-mono text-sm px-3 py-2 rounded border-2 border-[#3a4a3a] focus:border-[#5a6a5a] outline-none placeholder:text-[#2a5a2a] mb-2"
                />
                <input
                  type="text"
                  value={settings.model}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, model: e.target.value }))
                  }
                  placeholder="Model name"
                  className="w-full bg-[#0a1a0a] text-[#33ff33] font-mono text-sm px-3 py-2 rounded border-2 border-[#3a4a3a] focus:border-[#5a6a5a] outline-none placeholder:text-[#2a5a2a]"
                />
              </div>

              {/* Step 3: GitHub Token (optional) */}
              <div className="bg-[#1a2a1a] rounded-lg p-4 mb-6 border-4 border-[#4a3a2a] shadow-inner">
                <div className="font-mono text-[#33ff33] text-xs leading-relaxed mb-2">
                  <p>STEP 3: GITHUB TOKEN (OPTIONAL)</p>
                </div>
                <input
                  type="password"
                  value={settings.githubToken}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      githubToken: e.target.value,
                    }))
                  }
                  placeholder="ghp_..."
                  className="w-full bg-[#0a1a0a] text-[#33ff33] font-mono text-sm px-3 py-2 rounded border-2 border-[#3a4a3a] focus:border-[#5a6a5a] outline-none placeholder:text-[#2a5a2a]"
                />
                <p className="text-[#2a8a2a] text-xs font-mono mt-1">
                  Increases rate limit from 60 to 5,000/hr
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleStartTracking}
                  disabled={!repoInput.trim() || !settings.apiKey.trim()}
                  className="flex-1 bg-gradient-to-b from-[#5a8a5a] to-[#3a6a3a] text-white font-mono font-bold py-3 px-4 rounded-lg border-b-4 border-[#2a4a2a] active:border-b-0 active:mt-1 transition-all disabled:opacity-50"
                >
                  START TRACKING
                </button>
                <button
                  onClick={() => {
                    setRepoInput("");
                    setSettings((prev) => ({ ...prev, apiKey: "" }));
                  }}
                  className="bg-gradient-to-b from-[#8a5a5a] to-[#6a3a3a] text-white font-mono font-bold py-3 px-4 rounded-lg border-b-4 border-[#4a2a2a] active:border-b-0 active:mt-1 transition-all"
                >
                  RESET
                </button>
              </div>

              <div className="mt-6 flex items-center justify-center gap-2 text-[#8a7a6a]">
                <div className="w-2 h-2 rounded-full bg-[#5a8a5a] animate-pulse" />
                <span className="text-xs font-mono">READY</span>
                <div className="w-2 h-2 rounded-full bg-[#5a8a5a] animate-pulse" />
              </div>
            </div>
          </div>

          <p className="text-center text-[#5a5a5a] text-xs font-mono mt-4">
            v0.1.0 · built in public · MIT license
          </p>
        </div>
      </div>
    );
  }

  // ── Main inbox ──
  return (
    <div className="min-h-screen bg-[#1a1a1a] flex flex-col">
      {/* Header */}
      <header className="bg-gradient-to-b from-[#3a3a3a] to-[#2a2a2a] border-b-4 border-[#1a1a1a]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#5a8a5a] animate-pulse" />
            <h1 className="text-xl font-bold text-[#d4c5a9] font-mono tracking-tight">
              VOICEMAIL
            </h1>
            <span className="text-[#8a7a6a] text-xs font-mono hidden sm:inline">
              {activeRepo || repoInput}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <span className="bg-[#8a3a3a] text-white text-xs font-mono font-bold px-3 py-1 rounded animate-pulse">
                {unreadCount} NEW
              </span>
            )}
            <button
              onClick={() => setSettingsOpen(true)}
              className="text-[#8a7a6a] hover:text-[#d4c5a9] text-xs font-mono transition-colors"
            >
              ⚙ SETTINGS
            </button>
            <button
              onClick={resetAll}
              className="text-[#8a7a6a] hover:text-[#d4c5a9] text-xs font-mono transition-colors"
            >
              RESET ALL
            </button>
            <button
              onClick={handleChangeRepo}
              className="bg-gradient-to-b from-[#5a6a8a] to-[#3a4a6a] text-white text-xs font-mono font-bold px-3 py-1.5 rounded border-b-2 border-[#2a3a4a] active:border-b-0 transition-all"
            >
              CHANGE REPO
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {/* Loading state */}
        {loading && (
          <div className="bg-[#1a2a1a] rounded-lg border-4 border-[#4a3a2a] p-8 text-center mb-6">
            <div className="text-[#33ff33] font-mono text-sm animate-pulse">
              &gt; FETCHING FROM GITHUB...
            </div>
            <div className="text-[#2a8a2a] font-mono text-xs mt-2">
              Summarizing with AI...
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="bg-[#2a1a1a] rounded-lg border-4 border-[#8a3a3a] p-4 mb-6">
            <div className="text-[#ff4444] font-mono text-sm">
              ⚠ {error}
            </div>
            <p className="text-[#8a6a6a] font-mono text-xs mt-1">
              Showing seeded messages instead.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Message list */}
          <div className="lg:col-span-2">
            <div className="bg-gradient-to-b from-[#3a3a3a] to-[#2a2a2a] rounded-xl p-1">
              <div className="bg-[#1a2a1a] rounded-lg border-4 border-[#4a3a2a] overflow-hidden">
                <div className="bg-[#2a3a2a] px-3 py-2 border-b border-[#3a4a3a] flex items-center justify-between">
                  <span className="text-[#33ff33] text-xs font-mono">
                    MSG LIST
                  </span>
                  <span className="text-[#2a8a2a] text-xs font-mono">
                    {String(messages.length).padStart(2, "0")}/{String(messages.length).padStart(2, "0")}
                  </span>
                </div>

                <div className="divide-y divide-[#2a3a2a]">
                  {messages.length === 0 ? (
                    <div className="p-4 text-center">
                      <span className="text-[#2a8a2a] text-xs font-mono">
                        NO MESSAGES
                      </span>
                    </div>
                  ) : (
                    messages.map((msg, idx) => (
                      <button
                        key={msg.id}
                        onClick={() => selectMessage(msg.id)}
                        className={`w-full text-left px-3 py-3 transition-colors ${
                          selectedId === msg.id
                            ? "bg-[#2a4a2a]"
                            : "hover:bg-[#1a3a1a]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {!msg.read && (
                            <span className="text-[#ff4444] text-xs font-mono font-bold animate-pulse">
                              ●NEW
                            </span>
                          )}
                          {msg.read && (
                            <span className="text-[#2a5a2a] text-xs font-mono">
                              ───
                            </span>
                          )}
                          <span className="text-[#2a8a2a] text-xs font-mono">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <span className="text-[#3a9a3a] text-xs font-mono">
                            [{typeIcon(msg.type)}]
                          </span>
                          <span className={`text-xs font-mono ${priorityColor(msg.priority)}`}>
                            {msg.priority === "urgent" ? "!" : msg.priority === "normal" ? "·" : "▽"}
                          </span>
                        </div>
                        <p className={`text-sm font-mono mt-1 truncate ${msg.read ? "text-[#2a8a2a]" : "text-[#33ff33]"}`}>
                          &gt; {msg.title}
                        </p>
                        <p className="text-[#2a6a2a] text-xs font-mono mt-0.5">
                          {msg.author} · {msg.timestamp}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Message detail */}
          <div className="lg:col-span-3">
            {selected ? (
              <div className="bg-gradient-to-b from-[#3a3a3a] to-[#2a2a2a] rounded-xl p-1">
                <div className="bg-gradient-to-b from-[#d4c5a9] to-[#c4b896] rounded-lg overflow-hidden">
                  <div className="p-4 border-b-2 border-[#b8a888]">
                    <div className="flex items-center gap-2 mb-2">
                      {!selected.read && (
                        <span className="text-[#8a3a3a] text-xs font-mono font-bold animate-pulse">
                          ● NEW
                        </span>
                      )}
                      <span className="text-[#5a4a3a] text-xs font-mono font-semibold">
                        {typeLabel(selected.type)}
                      </span>
                      <span className={`text-xs font-mono ${priorityColor(selected.priority)}`}>
                        {selected.priority.toUpperCase()}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-[#3a2a1a] font-mono">
                      {selected.title}
                    </h3>
                    <p className="text-[#6a5a4a] text-xs font-mono mt-1">
                      {selected.repo} · {selected.author} · {selected.timestamp}
                    </p>
                  </div>

                  <div className="p-4">
                    <div className="bg-[#1a2a1a] rounded-lg border-4 border-[#4a3a2a] p-4 mb-4">
                      <div className="text-[#2a8a2a] text-xs font-mono mb-2">
                        ▶ TRANSCRIPT:
                      </div>
                      <p className="text-[#33ff33] font-mono text-sm leading-relaxed">
                        &ldquo;{selected.spoken}&rdquo;
                      </p>
                    </div>

                    {playingId === selected.id && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between text-[#5a4a3a] text-xs font-mono mb-1">
                          <span>PLAYING...</span>
                          <span>
                            {formatTime(currentTime)} / {formatTime(totalTime)}
                          </span>
                        </div>
                        <div className="h-3 bg-[#1a2a1a] rounded-full border-2 border-[#4a3a2a] overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#33ff33] to-[#2a8a2a] transition-all duration-100"
                            style={{
                              width: `${totalTime > 0 ? Math.min((currentTime / totalTime) * 100, 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3 mb-4">
                      <button
                        onClick={() => playMessage(selected)}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-mono font-bold text-sm border-b-4 active:border-b-0 active:mt-1 transition-all ${
                          playingId === selected.id
                            ? "bg-gradient-to-b from-[#8a5a5a] to-[#6a3a3a] text-white border-[#4a2a2a]"
                            : "bg-gradient-to-b from-[#5a8a5a] to-[#3a6a3a] text-white border-[#2a4a2a]"
                        }`}
                      >
                        {playingId === selected.id ? (
                          <>■ STOP</>
                        ) : (
                          <>▶ PLAY MESSAGE</>
                        )}
                      </button>
                    </div>

                    {selected.read && (
                      <button
                        onClick={() => markUnread(selected.id)}
                        className="w-full py-2 px-4 rounded-lg font-mono text-xs text-[#6a5a4a] border-2 border-[#b8a888] hover:bg-[#b8a888] transition-colors"
                      >
                        ↩ MARK AS UNREAD
                      </button>
                    )}

                    <div className="mt-4 p-3 bg-[#b8a888] rounded-lg">
                      <div className="text-[#5a4a3a] text-xs font-mono mb-1">
                        DETAILS:
                      </div>
                      <p className="text-[#3a2a1a] text-sm font-mono leading-relaxed">
                        {selected.detail}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-b from-[#3a3a3a] to-[#2a2a2a] rounded-xl p-1 h-full">
                <div className="bg-[#1a2a1a] rounded-lg border-4 border-[#4a3a2a] p-8 text-center h-full flex flex-col items-center justify-center">
                  <div className="text-[#2a8a2a] font-mono text-sm animate-pulse">
                    &gt; SELECT A MESSAGE TO PLAY_
                  </div>
                  <div className="text-[#2a5a2a] font-mono text-xs mt-4">
                    {unreadCount > 0
                      ? `You have ${unreadCount} new message${unreadCount > 1 ? "s" : ""}`
                      : "Inbox zero. Nice."}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="bg-gradient-to-b from-[#2a2a2a] to-[#1a1a1a] border-t-4 border-[#0a0a0a]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between text-xs font-mono text-[#5a5a5a]">
          <span>VOICEMAIL v0.1.0</span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#5a8a5a] animate-pulse" />
            <span>READY</span>
          </span>
        </div>
      </footer>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
        initialSettings={settings}
      />
    </div>
  );
}
