/**
 * Safe localStorage helpers. Storage can be missing (private mode, sandboxed
 * iframes) or full, so every call is wrapped and falls back gracefully.
 */
const KEY_CHATS = "orbit.chats.v1";
const KEY_SETTINGS = "orbit.settings.v1";

export const DEFAULT_SETTINGS = {
  provider: "demo",
  model: "orbit-demo",
  apiKey: "",
  rememberKey: false,
  temperature: null, // null = use the persona's own temperature
  maxTokens: 2048,
};

function read(key, fallback) {
  try {
    const v = globalThis.localStorage?.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadChats = () => {
  const chats = read(KEY_CHATS, []);
  return Array.isArray(chats) ? chats.filter((c) => c && c.id && Array.isArray(c.messages)) : [];
};
export const saveChats = (chats) => write(KEY_CHATS, chats.slice(0, 100));

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEY_SETTINGS, {}) };
}

/** The API key is only persisted when the user ticks "Remember key". */
export function saveSettings(s) {
  const copy = { ...s };
  if (!copy.rememberKey) copy.apiKey = "";
  return write(KEY_SETTINGS, copy);
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function newChat(personaId = "nova") {
  return { id: uid(), title: "New chat", personaId, createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
}

/** Short title from the first user message. */
export function titleFrom(text) {
  const t = text.replace(/[#*_`>\[\]]/g, "").replace(/\s+/g, " ").trim();
  return t.length > 42 ? t.slice(0, 40).trimEnd() + "…" : t || "New chat";
}

export function chatToMarkdown(chat, personaName) {
  const lines = [`# ${chat.title}`, "", `*Exported from Orbit · persona: ${personaName} · ${new Date(chat.updatedAt).toLocaleString()}*`, ""];
  for (const m of chat.messages) {
    lines.push(`### ${m.role === "user" ? "🧑 You" : `🤖 ${personaName}`}`, "", m.content, "");
  }
  return lines.join("\n");
}
