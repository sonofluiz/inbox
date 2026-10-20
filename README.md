# inbox

**A voicemail box for your repo.**

Every GitHub notification is a 400-line diff. Nobody reads them — not because they don't care, but because the unit is wrong. An email notification is a paragraph. This resizes the notification to something you can actually absorb, speaks it, and lets you clear the backlog in three minutes.

Built at [All Things Open 2026](https://2026.allthingsopen.org) in the "AI Agents & Vibe Coding" workshop.

## How it works

1. **Triage (rule-based, no keys):** fetches commits, PRs, review requests and issues from any GitHub repo. Classifies each as *informational* (a merge happened) or an *obligation* (someone is waiting on you). Flags staleness, size, and first-time contributors.
2. **Summarize (LLM):** compresses each to a ≤25-word spoken line.
3. **Speak (client-side):** `speechSynthesis` — no TTS service, no stored audio.

Audio is the triage interface. A clickable transcript is the drill-down — audio is deliberately not where you take action.

## The interface

The UI mimics a **Panasonic KX-T1451** Automatic Telephone Answering System — beige plastic body, speaker grille, physical buttons, LCD display, and that orange "VOICE TIME/DAY STAMP" text. Because the best interface for voicemail is the one you already know.

## Features

- **Onboarding flow** — enter any `owner/repo`, pick an LLM provider, start tracking
- **Live GitHub data** — fetches commits, PRs, review requests, and issues
- **AI summarization** — converts each notification to a short spoken message
- **Voice playback** — press play, hear the message, mark as read
- **Multiple LLM providers** — OpenRouter (free models available), Anthropic, OpenAI
- **Physical machine aesthetic** — beige body, chunky buttons, LCD screen, orange accents

## Getting started

### Prerequisites

- Node.js 18+
- An API key from [OpenRouter](https://openrouter.ai/keys) (free models available), [Anthropic](https://console.anthropic.com/), or [OpenAI](https://platform.openai.com/api-keys)
- A GitHub Personal Access Token (optional, for higher rate limits) — [create one](https://github.com/settings/tokens)

### Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Deploy

The easiest way to deploy is with [Vercel](https://vercel.com/new). Connect your GitHub repo, add your environment variables, and deploy.

## Tech stack

- [Next.js](https://nextjs.org) — React framework
- [Tailwind CSS](https://tailwindcss.com) — styling
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) — client-side text-to-speech
- GitHub REST API — notification data
- OpenRouter / Anthropic / OpenAI — LLM summarization

## Project structure

```
src/
  app/
    page.tsx              # Main inbox UI (onboarding + machine interface)
    layout.tsx            # Root layout
    globals.css           # Global styles (machine body, LCD, buttons)
    components/
      SettingsModal.tsx   # LLM provider + GitHub token settings
    data/
      messages.ts         # Seeded fallback messages
    api/
      github/route.ts     # GitHub API proxy (commits, PRs, issues)
      summarize/route.ts  # LLM summarization endpoint
```

## Prior work

This sits on real foundations:

- Hussein et al., Virginia Tech — *"By engaging the programmer's auditory senses, sonification can improve the utility of program comprehension tools."*
- Data sonification research (Stanford CCRMA, NASA, sonification.design)
- TTS changelog pipelines, AI PR summarizers (camelAI, CodeRabbit, Copilot)

Those pieces exist. Nobody had put them in this shape.

## Status

v0.1.0 — proof of concept, built in one day. Rule-based triage is solid; the summarization prompt needs work. Seeded inbox fallback, no live webhooks yet.

MIT licensed. Built in public.
