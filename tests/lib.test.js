import { describe, expect, it, vi, beforeEach } from "vitest";
import { createSSEParser } from "../src/lib/sse.js";
import { streamChat, toGeminiBody, toOpenAIBody, ProviderError } from "../src/lib/providers.js";
import { demoReply, streamText } from "../src/lib/demo.js";
import { renderMarkdown } from "../src/lib/markdown.js";
import { chatToMarkdown, loadSettings, saveSettings, titleFrom, loadChats, saveChats, newChat } from "../src/lib/storage.js";
import { PERSONAS, personaById } from "../src/lib/personas.js";

/** Build a fake streaming fetch Response from string chunks. */
function sseResponse(chunks, { ok = true, status = 200, json } = {}) {
  const enc = new TextEncoder();
  return {
    ok,
    status,
    statusText: "x",
    json: async () => json,
    body: new ReadableStream({
      start(c) {
        chunks.forEach((s) => c.enqueue(enc.encode(s)));
        c.close();
      },
    }),
  };
}

describe("SSE parser", () => {
  it("handles events split across chunks and CRLF line endings", () => {
    const events = [];
    const p = createSSEParser((d) => events.push(d));
    p.push('data: {"a"');
    p.push(":1}\r\n\r\ndata: second\r\n");
    p.push("\r\n: keep-alive comment\n\ndata: thi");
    p.push("rd");
    p.end();
    expect(events).toEqual(['{"a":1}', "second", "third"]);
  });

  it("joins multi-line data fields", () => {
    const events = [];
    const p = createSSEParser((d) => events.push(d));
    p.push("data: line1\ndata: line2\n\n");
    expect(events).toEqual(["line1\nline2"]);
  });
});

describe("providers", () => {
  const messages = [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello" }, { role: "user", content: "Bye" }];

  it("maps roles for Gemini and includes the system prompt", () => {
    const body = toGeminiBody(messages, "Be nice", 0.5, 100);
    expect(body.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(body.systemInstruction.parts[0].text).toBe("Be nice");
    expect(body.generationConfig).toEqual({ temperature: 0.5, maxOutputTokens: 100 });
  });

  it("puts the system prompt first for OpenAI", () => {
    const body = toOpenAIBody(messages, "Be nice", 0.5, 100, "gpt-4o-mini");
    expect(body.messages[0]).toEqual({ role: "system", content: "Be nice" });
    expect(body.stream).toBe(true);
  });

  it("streams Gemini tokens and reads usage", async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"lo!"}]}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2}}\n\n',
      ])
    );
    const tokens = [];
    const res = await streamChat({ provider: "gemini", apiKey: "k", model: "gemini-2.5-flash", messages, system: "s", onToken: (t) => tokens.push(t), fetchImpl });
    expect(tokens.join("")).toBe("Hello!");
    expect(res).toEqual({ text: "Hello!", usage: { inputTokens: 5, outputTokens: 2 } });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("gemini-2.5-flash:streamGenerateContent?alt=sse");
    expect(init.headers["x-goog-api-key"]).toBe("k");
    expect(url).not.toContain("key=");
  });

  it("streams OpenAI deltas and stops at [DONE]", async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse(['data: {"choices":[{"delta":{"content":"Hi "}}]}\n\ndata: {"choices":[{"delta":{"content":"there"}}]}\n\n', "data: [DONE]\n\n"])
    );
    const res = await streamChat({ provider: "openai", apiKey: "sk", model: "gpt-4o-mini", messages, onToken: () => {}, fetchImpl });
    expect(res.text).toBe("Hi there");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer sk");
  });

  it("gives a helpful error for a bad key", async () => {
    const fetchImpl = async () => sseResponse([], { ok: false, status: 400, json: { error: { message: "API key not valid" } } });
    await expect(streamChat({ provider: "gemini", apiKey: "bad", model: "m", messages, onToken: () => {}, fetchImpl })).rejects.toThrow(/API key not valid.*Check your API key/);
  });

  it("refuses to call a paid provider without a key", async () => {
    await expect(streamChat({ provider: "openai", apiKey: "", model: "m", messages, onToken: () => {} })).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("demo engine", () => {
  it("answers known prompts with code", () => {
    const r = demoReply([{ role: "user", content: "Explain recursion with a Python example" }]);
    expect(r).toContain("```python");
    expect(r).toContain("def factorial");
  });

  it("uses the persona name from the system prompt", () => {
    expect(demoReply([{ role: "user", content: "hello" }], "You are Study Buddy. Explain…")).toContain("Study Buddy");
  });

  it("explains how to get real answers for unknown topics", () => {
    expect(demoReply([{ role: "user", content: "What is the capital of Peru?" }])).toMatch(/Settings[\s\S]*Gemini/);
  });

  it("streams text without losing characters, and can be aborted", async () => {
    const text = "Line one\n\n- item **bold**\n```js\nx = 1\n```";
    let out = "";
    await streamText(text, (t) => (out += t), undefined, { minDelay: 0, maxDelay: 0 });
    expect(out).toBe(text);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(streamText(text, () => {}, ctrl.signal, { maxDelay: 0 })).rejects.toThrow(/Abort/);
  });
});

describe("markdown rendering", () => {
  it("adds a language header and copy button to code blocks", () => {
    const html = renderMarkdown("```python\nprint('hi')\n```");
    expect(html).toContain('class="code-block"');
    expect(html).toContain(">Python<");
    expect(html).toContain("copy-code");
    expect(html).toContain("hljs-");
  });

  it("removes scripts and event handlers (XSS-safe)", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)"> <script>alert(2)</script> **ok**');
    expect(html).not.toMatch(/onerror|<script/);
    expect(html).toContain("<strong>ok</strong>");
  });

  it("opens links in a new tab safely", () => {
    const html = renderMarkdown("[site](https://example.com)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("renders GitHub-style tables", () => {
    expect(renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |")).toContain("<table>");
  });
});

describe("storage", () => {
  beforeEach(() => localStorage.clear());

  it("does not persist the API key unless asked", () => {
    saveSettings({ ...loadSettings(), provider: "gemini", apiKey: "secret", rememberKey: false });
    expect(loadSettings().apiKey).toBe("");
    saveSettings({ ...loadSettings(), apiKey: "secret", rememberKey: true });
    expect(loadSettings().apiKey).toBe("secret");
  });

  it("survives a broken localStorage", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(loadChats()).toEqual([]);
    expect(loadSettings().provider).toBe("demo");
    spy.mockRestore();
  });

  it("round-trips chats and ignores corrupt entries", () => {
    const c = newChat("code");
    saveChats([c, { bad: true }]);
    expect(loadChats()).toEqual([c]);
  });

  it("makes short titles", () => {
    expect(titleFrom("## **Explain** the difference between processes and threads in detail please")).toMatch(/^Explain the difference.*…$/);
    expect(titleFrom("   ")).toBe("New chat");
  });

  it("exports a chat to Markdown", () => {
    const c = { ...newChat(), title: "Test", messages: [{ role: "user", content: "Q" }, { role: "assistant", content: "A" }] };
    const md = chatToMarkdown(c, "Nova");
    expect(md).toMatch(/^# Test/);
    expect(md).toContain("### 🧑 You\n\nQ");
    expect(md).toContain("### 🤖 Nova\n\nA");
  });
});

describe("personas", () => {
  it("has unique ids and system prompts", () => {
    expect(new Set(PERSONAS.map((p) => p.id)).size).toBe(PERSONAS.length);
    PERSONAS.forEach((p) => expect(p.system.length).toBeGreaterThan(40));
  });
  it("falls back to the default persona", () => {
    expect(personaById("nope").id).toBe("nova");
  });
});
