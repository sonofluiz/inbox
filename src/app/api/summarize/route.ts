import { NextRequest, NextResponse } from "next/server";

interface SummarizeRequest {
  messages: Array<{
    id: string;
    type: string;
    title: string;
    detail: string;
    author: string;
    repo: string;
  }>;
  provider: "openrouter" | "anthropic" | "openai";
  apiKey: string;
  model?: string;
}

async function summarizeWithOpenRouter(
  messages: SummarizeRequest["messages"],
  apiKey: string,
  model: string
) {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are a GitHub notification summarizer. Convert each notification into a short, spoken-style message (max 25 words). 
            Tag each as [OBLIGATION] (requires action: review requests, issues) or [INFO] (just FYI: commits, merged PRs).
            Use natural, conversational language as if leaving a voicemail.
            Return ONLY a JSON array of objects with id and spoken fields.`,
          },
          {
            role: "user",
            content: JSON.stringify(
              messages.map((m) => ({
                id: m.id,
                type: m.type,
                title: m.title,
                detail: m.detail,
                author: m.author,
                repo: m.repo,
              }))
            ),
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || "[]";
  return JSON.parse(content);
}

async function summarizeWithAnthropic(
  messages: SummarizeRequest["messages"],
  apiKey: string,
  model: string
) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Convert each GitHub notification into a short spoken message (max 25 words). Tag each as [OBLIGATION] or [INFO]. Return ONLY a JSON array of {id, spoken} objects.\n\n${JSON.stringify(messages)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text || "[]";
  // Extract JSON from the response
  const match = content.match(/\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : "[]");
}

async function summarizeWithOpenAI(
  messages: SummarizeRequest["messages"],
  apiKey: string,
  model: string
) {
  const response = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are a GitHub notification summarizer. Convert each notification into a short, spoken-style message (max 25 words). 
            Tag each as [OBLIGATION] (requires action) or [INFO] (just FYI).
            Return ONLY a JSON array of objects with id and spoken fields.`,
          },
          {
            role: "user",
            content: JSON.stringify(messages),
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || "[]";
  return JSON.parse(content);
}

export async function POST(request: NextRequest) {
  try {
    const body: SummarizeRequest = await request.json();
    const { messages, provider, apiKey, model } = body;

    if (!messages || !provider || !apiKey) {
      return NextResponse.json(
        { error: "messages, provider, and apiKey are required" },
        { status: 400 }
      );
    }

    let results;

    switch (provider) {
      case "openrouter":
        results = await summarizeWithOpenRouter(
          messages,
          apiKey,
          model || "anthropic/claude-3-haiku"
        );
        break;
      case "anthropic":
        results = await summarizeWithAnthropic(
          messages,
          apiKey,
          model || "claude-3-haiku-20240307"
        );
        break;
      case "openai":
        results = await summarizeWithOpenAI(
          messages,
          apiKey,
          model || "gpt-4o-mini"
        );
        break;
      default:
        return NextResponse.json(
          { error: "Invalid provider. Use openrouter, anthropic, or openai" },
          { status: 400 }
        );
    }

    return NextResponse.json({ summaries: results });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to summarize";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
