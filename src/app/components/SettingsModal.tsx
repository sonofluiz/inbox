"use client";

import { useState } from "react";

export interface Settings {
  provider: "openrouter" | "anthropic" | "openai";
  apiKey: string;
  model: string;
  githubToken: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: Settings) => void;
  initialSettings: Settings;
}

const PROVIDERS = [
  {
    id: "openrouter" as const,
    name: "OpenRouter",
    description: "One key, many models",
    defaultModel: "anthropic/claude-3-haiku",
    keyUrl: "https://openrouter.ai/keys",
  },
  {
    id: "anthropic" as const,
    name: "Anthropic",
    description: "Claude models",
    defaultModel: "claude-3-haiku-20240307",
    keyUrl: "https://console.anthropic.com/",
  },
  {
    id: "openai" as const,
    name: "OpenAI",
    description: "GPT models",
    defaultModel: "gpt-4o-mini",
    keyUrl: "https://platform.openai.com/api-keys",
  },
];

export default function SettingsModal({
  isOpen,
  onClose,
  onSave,
  initialSettings,
}: SettingsModalProps) {
  const [provider, setProvider] = useState(initialSettings.provider);
  const [apiKey, setApiKey] = useState(initialSettings.apiKey);
  const [model, setModel] = useState(initialSettings.model);
  const [githubToken, setGithubToken] = useState(initialSettings.githubToken);

  if (!isOpen) return null;

  const selectedProvider = PROVIDERS.find((p) => p.id === provider)!;

  const handleSave = () => {
    onSave({ provider, apiKey, model, githubToken });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-gradient-to-b from-[#3a3a3a] to-[#2a2a2a] rounded-xl p-1 w-full max-w-md">
        <div className="bg-gradient-to-b from-[#d4c5a9] to-[#c4b896] rounded-lg p-6">
          <h2 className="text-xl font-bold text-[#3a2a1a] font-mono mb-4">
            ⚙ SETTINGS
          </h2>

          {/* LLM Provider */}
          <div className="mb-4">
            <label className="block text-[#5a4a3a] text-xs font-mono mb-2">
              LLM PROVIDER:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setProvider(p.id);
                    setModel(p.defaultModel);
                  }}
                  className={`py-2 px-3 rounded-lg font-mono text-xs font-bold border-b-4 active:border-b-0 transition-all ${
                    provider === p.id
                      ? "bg-gradient-to-b from-[#5a8a5a] to-[#3a6a3a] text-white border-[#2a4a2a]"
                      : "bg-gradient-to-b from-[#b8a888] to-[#a89878] text-[#5a4a3a] border-[#8a7a6a]"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <p className="text-[#6a5a4a] text-xs font-mono mt-1">
              {selectedProvider.description}
            </p>
          </div>

          {/* API Key */}
          <div className="mb-4">
            <label className="block text-[#5a4a3a] text-xs font-mono mb-2">
              API KEY:
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`Enter ${selectedProvider.name} API key`}
              className="w-full bg-[#1a2a1a] text-[#33ff33] font-mono text-sm px-3 py-2 rounded-lg border-2 border-[#4a3a2a] focus:border-[#6a5a4a] outline-none placeholder:text-[#2a5a2a]"
            />
            <a
              href={selectedProvider.keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#3a6a8a] text-xs font-mono hover:underline"
            >
              Get a key →
            </a>
          </div>

          {/* Model */}
          <div className="mb-4">
            <label className="block text-[#5a4a3a] text-xs font-mono mb-2">
              MODEL:
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-[#1a2a1a] text-[#33ff33] font-mono text-sm px-3 py-2 rounded-lg border-2 border-[#4a3a2a] focus:border-[#6a5a4a] outline-none"
            />
          </div>

          {/* GitHub Token */}
          <div className="mb-6">
            <label className="block text-[#5a4a3a] text-xs font-mono mb-2">
              GITHUB TOKEN (OPTIONAL):
            </label>
            <input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="ghp_..."
              className="w-full bg-[#1a2a1a] text-[#33ff33] font-mono text-sm px-3 py-2 rounded-lg border-2 border-[#4a3a2a] focus:border-[#6a5a4a] outline-none placeholder:text-[#2a5a2a]"
            />
            <p className="text-[#6a5a4a] text-xs font-mono mt-1">
              Increases API rate limit from 60 to 5,000 requests/hour.{" "}
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#3a6a8a] hover:underline"
              >
                Create one →
              </a>
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              className="flex-1 bg-gradient-to-b from-[#5a8a5a] to-[#3a6a3a] text-white font-mono font-bold py-3 px-4 rounded-lg border-b-4 border-[#2a4a2a] active:border-b-0 active:mt-1 transition-all"
            >
              SAVE
            </button>
            <button
              onClick={onClose}
              className="bg-gradient-to-b from-[#8a5a5a] to-[#6a3a3a] text-white font-mono font-bold py-3 px-4 rounded-lg border-b-4 border-[#4a2a2a] active:border-b-0 active:mt-1 transition-all"
            >
              CANCEL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
