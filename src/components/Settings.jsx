import { useState } from "react";
import { PROVIDERS } from "../lib/providers.js";

export default function Settings({ settings, onSave, onClose }) {
  const [s, setS] = useState(settings);
  const p = PROVIDERS[s.provider];
  const set = (patch) => setS((x) => ({ ...x, ...patch }));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-head">
          <h2 id="settings-title">⚙ Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <label className="field">
          <span>AI provider</span>
          <div className="seg">
            {Object.entries(PROVIDERS).map(([id, v]) => (
              <button key={id} className={s.provider === id ? "on" : ""} onClick={() => set({ provider: id, model: v.models[0] })}>{v.label}</button>
            ))}
          </div>
        </label>

        {p.needsKey ? (
          <>
            <label className="field">
              <span>API key <a href={p.keyUrl} target="_blank" rel="noopener noreferrer">Get a key ↗</a></span>
              <input type="password" value={s.apiKey} onChange={(e) => set({ apiKey: e.target.value.trim() })} placeholder={s.provider === "gemini" ? "AIza…" : "sk-…"} autoComplete="off" />
              <small>Sent only to {p.label}, straight from your browser. Never to any other server.</small>
            </label>
            <label className="check">
              <input type="checkbox" checked={s.rememberKey} onChange={(e) => set({ rememberKey: e.target.checked })} /> Remember key on this device
            </label>
            <label className="field">
              <span>Model</span>
              <input list="models" value={s.model} onChange={(e) => set({ model: e.target.value })} />
              <datalist id="models">{p.models.map((m) => <option key={m} value={m} />)}</datalist>
            </label>
          </>
        ) : (
          <div className="info-card">
            🧪 <b>Demo mode</b> works offline with sample answers, so you can explore streaming, code blocks and personas. Add a <b>free Gemini key</b> for real AI answers on any topic.
          </div>
        )}

        <div className="grid2">
          <label className="field">
            <span>Creativity (temperature): {s.temperature == null ? "persona default" : s.temperature.toFixed(1)}</span>
            <input type="range" min="0" max="1.5" step="0.1" value={s.temperature ?? 0.7} onChange={(e) => set({ temperature: +e.target.value })} />
            <button className="link" onClick={() => set({ temperature: null })}>Use persona default</button>
          </label>
          <label className="field">
            <span>Max reply length (tokens)</span>
            <input type="number" min="128" max="8192" step="128" value={s.maxTokens} onChange={(e) => set({ maxTokens: Math.max(128, Math.min(8192, +e.target.value || 2048)) })} />
          </label>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={p.needsKey && !s.apiKey} onClick={() => onSave(s)}>Save settings</button>
        </div>
      </div>
    </div>
  );
}
