export type MessagePriority = "urgent" | "normal" | "low";

export interface InboxMessage {
  id: string;
  type: "commit" | "pull_request" | "review_request" | "issue";
  priority: MessagePriority;
  repo: string;
  author: string;
  title: string;
  spoken: string;
  detail: string;
  timestamp: string;
  read: boolean;
}

export const seededMessages: InboxMessage[] = [
  {
    id: "msg-1",
    type: "review_request",
    priority: "urgent",
    repo: "tonejs/Tone.js",
    author: "user123",
    title: "Review request: Add Chorus effect",
    spoken:
      "Review request from a first-time contributor, open nine days, no response yet. They are adding a Chorus effect to the library.",
    detail:
      "A first-time contributor has opened a pull request adding a Chorus effect. It has been waiting for review for nine days. This is an obligation — someone is blocked on you.",
    timestamp: "9 days ago",
    read: false,
  },
  {
    id: "msg-2",
    type: "commit",
    priority: "normal",
    repo: "tonejs/Tone.js",
    author: "drewm",
    title: "Drew ported the reverb node",
    spoken:
      "Drew ported the reverb node to the new worklet API. That is the one you were waiting on.",
    detail:
      "Drew completed the port of the reverb node to the new audio worklet API. This is the change you were waiting on. Informational — no action needed.",
    timestamp: "2 hours ago",
    read: false,
  },
  {
    id: "msg-3",
    type: "pull_request",
    priority: "normal",
    repo: "tonejs/Tone.js",
    author: "sarah-dev",
    title: "PR #847: Fix tempo sync edge case",
    spoken:
      "Sarah opened a pull request fixing a tempo sync edge case. Three files changed, all tests passing.",
    detail:
      "A pull request fixing an edge case in tempo synchronization. Three files changed, all tests passing. Informational unless you are the assigned reviewer.",
    timestamp: "5 hours ago",
    read: false,
  },
  {
    id: "msg-4",
    type: "issue",
    priority: "low",
    repo: "tonejs/Tone.js",
    author: "newuser42",
    title: "Issue: Oscillator drift at low frequencies",
    spoken:
      "A new user filed an issue about oscillator drift at low frequencies. Low priority, but it might be related to your work.",
    detail:
      "A new user has reported oscillator frequency drift at low frequencies. This may be related to your recent changes. Low priority — worth a look when you have time.",
    timestamp: "1 day ago",
    read: false,
  },
];
