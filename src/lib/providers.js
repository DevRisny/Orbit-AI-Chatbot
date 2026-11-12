/**
 * Chat providers with token streaming.
 *  - gemini: Google Gemini API (free tier key from aistudio.google.com)
 *  - openai: OpenAI Chat Completions API
 *  - demo:   offline demo engine, so the app works with no key at all
 *
 * The key is sent only to the provider's own API from the user's browser.
 */
import { readSSE } from "./sse.js";
import { demoReply, streamText } from "./demo.js";

export const PROVIDERS = {
  demo: { label: "Demo mode (no key)", models: ["orbit-demo"], needsKey: false },
  gemini: { label: "Google Gemini", models: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"], needsKey: true, keyUrl: "https://aistudio.google.com/app/apikey" },
  openai: { label: "OpenAI", models: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4o"], needsKey: true, keyUrl: "https://platform.openai.com/api-keys" },
};

export class ProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Convert our message list to Gemini's "contents" format. */
export function toGeminiBody(messages, system, temperature, maxTokens) {
  return {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };
}

export function toOpenAIBody(messages, system, temperature, maxTokens, model) {
  return {
    model,
    stream: true,
    temperature,
    max_tokens: maxTokens,
    messages: [...(system ? [{ role: "system", content: system }] : []), ...messages.map((m) => ({ role: m.role, content: m.content }))],
  };
}

async function failure(res) {
  let detail = "";
  try {
    const j = await res.json();
    detail = j.error?.message || JSON.stringify(j).slice(0, 200);
  } catch {
    detail = res.statusText;
  }
  const hint = res.status === 400 || res.status === 401 || res.status === 403 ? " Check your API key in Settings." : res.status === 429 ? " Rate limit reached. Wait a moment and try again." : "";
  return new ProviderError(`${res.status}: ${detail}.${hint}`, res.status);
}

/**
 * Stream a reply. Calls onToken(textChunk) as tokens arrive.
 * Resolves to { text, usage } when finished; rejects on error or abort.
 */
export async function streamChat({ provider, apiKey, model, messages, system, temperature = 0.7, maxTokens = 2048, signal, onToken, fetchImpl = fetch }) {
  let text = "";
  const emit = (t) => {
    if (!t) return;
    text += t;
    onToken(t);
  };

  if (provider === "demo") {
    const reply = demoReply(messages, system);
    await streamText(reply, emit, signal);
    return { text, usage: { outputTokens: Math.round(text.length / 4) } };
  }

  if (!apiKey) throw new ProviderError("Add an API key in Settings, or switch to Demo mode.", 401);

  if (provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(toGeminiBody(messages, system, temperature, maxTokens)),
      signal,
    });
    if (!res.ok) throw await failure(res);
    let usage = {};
    await readSSE(res, (data) => {
      const j = JSON.parse(data);
      const parts = j.candidates?.[0]?.content?.parts || [];
      parts.forEach((p) => emit(p.text));
      if (j.usageMetadata) usage = { inputTokens: j.usageMetadata.promptTokenCount, outputTokens: j.usageMetadata.candidatesTokenCount };
      if (j.promptFeedback?.blockReason) throw new ProviderError(`Blocked by Gemini safety filters (${j.promptFeedback.blockReason}).`, 400);
    });
    return { text, usage };
  }

  if (provider === "openai") {
    const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(toOpenAIBody(messages, system, temperature, maxTokens, model)),
      signal,
    });
    if (!res.ok) throw await failure(res);
    await readSSE(res, (data) => {
      if (data === "[DONE]") return;
      const j = JSON.parse(data);
      emit(j.choices?.[0]?.delta?.content);
    });
    return { text, usage: { outputTokens: Math.round(text.length / 4) } };
  }

  throw new ProviderError(`Unknown provider: ${provider}`);
}
