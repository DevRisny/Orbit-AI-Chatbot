import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Message from "./components/Message.jsx";
import Settings from "./components/Settings.jsx";
import { PERSONAS, personaById } from "./lib/personas.js";
import { PROVIDERS, streamChat } from "./lib/providers.js";
import { chatToMarkdown, loadChats, loadSettings, newChat, saveChats, saveSettings, titleFrom, uid } from "./lib/storage.js";

const SUGGESTIONS = [
  { icon: "🐍", text: "Explain recursion with a Python example" },
  { icon: "⚛️", text: "Write a React hook for debouncing" },
  { icon: "🗄️", text: "Compare SQL vs NoSQL in a table" },
  { icon: "📅", text: "Plan a 3-day study schedule for exams" },
];

export default function App() {
  const [chats, setChats] = useState(() => {
    const saved = loadChats();
    return saved.length ? saved : [newChat()];
  });
  const [activeId, setActiveId] = useState(() => chats[0].id);
  const [settings, setSettings] = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [input, setInput] = useState("");
  const [streamingId, setStreamingId] = useState(null);
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const abortRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const chat = chats.find((c) => c.id === activeId) || chats[0];
  const persona = personaById(chat.personaId);
  const streaming = streamingId === chat.id;

  useEffect(() => { saveChats(chats); }, [chats]);

  const updateChat = useCallback((id, fn) => {
    setChats((cs) => cs.map((c) => (c.id === id ? { ...fn(c), updatedAt: Date.now() } : c)));
  }, []);

  // ---------- auto-scroll while streaming
  useEffect(() => {
    const el = listRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [chat.messages, atBottom]);
  const onScroll = () => {
    const el = listRef.current;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  // ---------- autosize textarea
  useEffect(() => {
    const t = inputRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = Math.min(220, t.scrollHeight) + "px";
  }, [input]);

  // ---------- core: ask the model
  const ask = useCallback(async (chatId, history, personaId) => {
    const p = personaById(personaId);
    const replyId = uid();
    const model = settings.provider === "demo" ? "demo" : settings.model;
    updateChat(chatId, (c) => ({ ...c, messages: [...history, { id: replyId, role: "assistant", content: "", pending: true, model }] }));
    const controller = new AbortController();
    abortRef.current = controller;
    setStreamingId(chatId);
    setAtBottom(true);

    let buffer = "";
    let frame = 0;
    const flush = () => {
      frame = 0;
      const text = buffer;
      updateChat(chatId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === replyId ? { ...m, content: text } : m)) }));
    };
    const t0 = performance.now();
    try {
      const { text, usage } = await streamChat({
        provider: settings.provider,
        apiKey: settings.apiKey,
        model: settings.model,
        system: p.system,
        temperature: settings.temperature ?? p.temperature,
        maxTokens: settings.maxTokens,
        messages: history.map(({ role, content }) => ({ role, content })),
        signal: controller.signal,
        onToken: (tok) => {
          buffer += tok;
          if (!frame) frame = requestAnimationFrame(flush);
        },
      });
      cancelAnimationFrame(frame);
      const stats = { ms: Math.round(performance.now() - t0), tokens: usage?.outputTokens || Math.round(text.length / 4) };
      updateChat(chatId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === replyId ? { ...m, content: text, pending: false, stats } : m)) }));
    } catch (err) {
      cancelAnimationFrame(frame);
      const aborted = err?.name === "AbortError";
      updateChat(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === replyId ? { ...m, pending: false, content: buffer + (aborted && buffer ? "\n\n*⏹ Stopped.*" : ""), error: aborted ? (buffer ? null : "Stopped before any reply arrived.") : err.message || String(err) } : m
        ),
      }));
    } finally {
      setStreamingId(null);
      abortRef.current = null;
    }
  }, [settings, updateChat]);

  const send = (text) => {
    const content = (text ?? input).trim();
    if (!content || streamingId) return;
    const history = [...chat.messages.filter((m) => !m.error), { id: uid(), role: "user", content }];
    if (!chat.messages.length) updateChat(chat.id, (c) => ({ ...c, title: titleFrom(content) }));
    setInput("");
    ask(chat.id, history, chat.personaId);
  };

  const stop = () => abortRef.current?.abort();

  const regenerate = () => {
    const msgs = chat.messages;
    const lastUser = msgs.map((m) => m.role).lastIndexOf("user");
    if (lastUser < 0 || streamingId) return;
    ask(chat.id, msgs.slice(0, lastUser + 1), chat.personaId);
  };

  const editMessage = (id, content) => {
    const idx = chat.messages.findIndex((m) => m.id === id);
    if (idx < 0 || streamingId) return;
    const history = [...chat.messages.slice(0, idx), { ...chat.messages[idx], content }];
    if (idx === 0) updateChat(chat.id, (c) => ({ ...c, title: titleFrom(content) }));
    ask(chat.id, history, chat.personaId);
  };

  // ---------- chat management
  const createChat = (personaId = chat.personaId) => {
    const empty = chats.find((c) => !c.messages.length);
    if (empty) {
      updateChat(empty.id, (c) => ({ ...c, personaId }));
      setActiveId(empty.id);
    } else {
      const c = newChat(personaId);
      setChats((cs) => [c, ...cs]);
      setActiveId(c.id);
    }
    setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const deleteChat = (id) => {
    if (streamingId === id) stop();
    setChats((cs) => {
      const rest = cs.filter((c) => c.id !== id);
      const next = rest.length ? rest : [newChat()];
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  };
  const renameChat = (id) => {
    const c = chats.find((x) => x.id === id);
    const t = window.prompt("Rename chat", c.title);
    if (t && t.trim()) updateChat(id, (x) => ({ ...x, title: t.trim().slice(0, 60) }));
  };
  const setPersona = (id) => {
    if (chat.messages.length) createChat(id);
    else updateChat(chat.id, (c) => ({ ...c, personaId: id }));
  };
  const exportChat = () => {
    const blob = new Blob([chatToMarkdown(chat, persona.name)], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${chat.title.replace(/[^\w-]+/g, "_").slice(0, 40) || "chat"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ---------- copy buttons inside rendered code blocks (event delegation)
  const onListClick = async (e) => {
    const btn = e.target.closest(".copy-code");
    if (!btn) return;
    const code = btn.closest(".code-block")?.querySelector("code")?.innerText || "";
    try {
      await navigator.clipboard.writeText(code);
      btn.textContent = "Copied ✓";
      btn.classList.add("done");
      setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("done"); }, 1400);
    } catch {
      btn.textContent = "Press Ctrl+C";
    }
  };

  // ---------- keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && streamingId) stop();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); createChat(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
    return q ? sorted.filter((c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q))) : sorted;
  }, [chats, search]);

  const lastAssistant = [...chat.messages].reverse().find((m) => m.role === "assistant");
  const provider = PROVIDERS[settings.provider];

  return (
    <div className={"app" + (sidebarOpen ? " side-open" : "")}>
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">
            <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true"><circle cx="16" cy="16" r="6" fill="#fff" /><ellipse cx="16" cy="16" rx="13" ry="5.5" fill="none" stroke="#fff" strokeWidth="2.2" transform="rotate(-28 16 16)" /></svg>
          </div>
          <div><b>Orbit</b><small>AI chat assistant</small></div>
        </div>
        <button className="btn primary block" onClick={() => createChat()}>＋ New chat <kbd>Ctrl K</kbd></button>
        <input className="search" placeholder="Search chats…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <nav className="chat-list">
          {filtered.map((c) => {
            const p = personaById(c.personaId);
            return (
              <div key={c.id} className={"chat-item" + (c.id === chat.id ? " active" : "")} onClick={() => { setActiveId(c.id); setSidebarOpen(false); }}>
                <span className="dot" style={{ background: p.color }}>{p.emoji}</span>
                <span className="title">{c.title}</span>
                {streamingId === c.id && <span className="live" title="Streaming" />}
                <span className="item-actions">
                  <button title="Rename" onClick={(e) => { e.stopPropagation(); renameChat(c.id); }}>✎</button>
                  <button title="Delete" onClick={(e) => { e.stopPropagation(); deleteChat(c.id); }}>🗑</button>
                </span>
              </div>
            );
          })}
          {!filtered.length && <p className="muted small pad">No chats match "{search}".</p>}
        </nav>
        <div className="side-foot">
          <button className="provider-pill" onClick={() => setShowSettings(true)}>
            <span className={"status " + (settings.provider === "demo" ? "demo" : "live")} />
            {provider.label}{settings.provider !== "demo" && ` · ${settings.model}`}
          </button>
          <small className="muted">Built by Junaideen Risny Suha</small>
        </div>
      </aside>
      <div className="scrim" onClick={() => setSidebarOpen(false)} />

      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu" onClick={() => setSidebarOpen(true)} aria-label="Open chats">☰</button>
          <div className="personas" role="tablist" aria-label="Persona">
            {PERSONAS.map((p) => (
              <button key={p.id} role="tab" aria-selected={p.id === persona.id} className={"persona" + (p.id === persona.id ? " on" : "")} style={{ "--pc": p.color }} onClick={() => setPersona(p.id)} title={p.role}>
                <span>{p.emoji}</span> {p.name}
              </button>
            ))}
          </div>
          <div className="top-actions">
            <button className="icon-btn" onClick={exportChat} disabled={!chat.messages.length} title="Export as Markdown">⬇</button>
            <button className="icon-btn" onClick={() => setShowSettings(true)} title="Settings">⚙</button>
          </div>
        </header>

        {settings.provider === "demo" && (
          <div className="banner">🧪 <b>Demo mode:</b> sample answers, no key needed. <button className="link" onClick={() => setShowSettings(true)}>Add a free Gemini key</button> for real AI replies.</div>
        )}

        <section className="messages" ref={listRef} onScroll={onScroll} onClick={onListClick}>
          {!chat.messages.length ? (
            <div className="empty">
              <div className="hero-avatar" style={{ background: persona.color + "1A", color: persona.color }}>{persona.emoji}</div>
              <h1>Hi, I'm {persona.name}</h1>
              <p className="muted">{persona.role}. Ask me anything, or start with an idea below.</p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s.text} onClick={() => send(s.text)}><span>{s.icon}</span>{s.text}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="thread">
              {chat.messages.map((m) => (
                <Message key={m.id} msg={m} persona={persona} streaming={streaming} isLast={m === lastAssistant} onRegenerate={regenerate} onEdit={editMessage} />
              ))}
            </div>
          )}
        </section>

        {!atBottom && chat.messages.length > 0 && (
          <button className="jump" onClick={() => { setAtBottom(true); listRef.current.scrollTop = listRef.current.scrollHeight; }}>↓ Latest</button>
        )}

        <footer className="composer-wrap">
          <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              placeholder={`Message ${persona.name}…`}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
              aria-label="Message"
            />
            {streaming ? (
              <button type="button" className="send stop" onClick={stop} title="Stop (Esc)">■</button>
            ) : (
              <button type="submit" className="send" disabled={!input.trim() || !!streamingId} title="Send (Enter)">➤</button>
            )}
          </form>
          <p className="hint">Enter to send · Shift+Enter for a new line · Esc to stop · AI can make mistakes, so check important facts.</p>
        </footer>
      </main>

      {showSettings && (
        <Settings
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={(s) => { setSettings(s); saveSettings(s); setShowSettings(false); }}
        />
      )}
    </div>
  );
}
