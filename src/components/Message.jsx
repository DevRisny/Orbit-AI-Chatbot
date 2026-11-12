import { memo, useMemo, useState } from "react";
import { renderMarkdown } from "../lib/markdown.js";

function Icon({ d, size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
export const ICONS = {
  copy: "M8 8h11v11H8zM5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1",
  check: "M20 6 9 17l-5-5",
  redo: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",
};

function Message({ msg, persona, isLast, streaming, onRegenerate, onEdit }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const html = useMemo(() => (msg.role === "assistant" ? renderMarkdown(msg.content) : null), [msg.content, msg.role]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard can be blocked; ignore */
    }
  };

  if (msg.role === "user") {
    return (
      <div className="msg user">
        <div className="bubble">
          {editing ? (
            <div className="edit-box">
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={Math.min(8, draft.split("\n").length + 1)} autoFocus />
              <div className="edit-actions">
                <button className="btn small ghost" onClick={() => { setEditing(false); setDraft(msg.content); }}>Cancel</button>
                <button className="btn small primary" disabled={!draft.trim()} onClick={() => { setEditing(false); onEdit(msg.id, draft.trim()); }}>Save &amp; resend</button>
              </div>
            </div>
          ) : (
            <p className="user-text">{msg.content}</p>
          )}
        </div>
        {!editing && !streaming && (
          <div className="msg-actions right">
            <button title="Edit and resend" onClick={() => setEditing(true)}><Icon d={ICONS.edit} /></button>
            <button title="Copy" onClick={copy}><Icon d={copied ? ICONS.check : ICONS.copy} /></button>
          </div>
        )}
      </div>
    );
  }

  const live = msg.pending && streaming;
  return (
    <div className="msg assistant">
      <div className="avatar" style={{ background: persona.color + "1A", color: persona.color }}>{persona.emoji}</div>
      <div className="body">
        <div className="who">{persona.name}{msg.model && <span className="model-tag">{msg.model}</span>}</div>
        {msg.error ? (
          <div className="error-card">⚠️ {msg.error}</div>
        ) : msg.content ? (
          <div className={"md" + (live ? " streaming" : "")} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="typing" aria-label="Thinking"><i /><i /><i /></div>
        )}
        {!live && (msg.content || msg.error) && (
          <div className="msg-actions">
            {msg.content && <button title="Copy" onClick={copy}><Icon d={copied ? ICONS.check : ICONS.copy} /> {copied ? "Copied" : "Copy"}</button>}
            {isLast && <button title="Regenerate" onClick={onRegenerate}><Icon d={ICONS.redo} /> Regenerate</button>}
            {msg.stats && <span className="stats">{(msg.stats.ms / 1000).toFixed(1)} s · ~{msg.stats.tokens} tokens · {Math.round(msg.stats.tokens / Math.max(0.1, msg.stats.ms / 1000))} tok/s</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(Message);
