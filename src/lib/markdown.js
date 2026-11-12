/**
 * Markdown -> safe HTML for chat messages.
 * marked (GitHub-flavoured markdown) + highlight.js (syntax colours) + DOMPurify (XSS-safe).
 * Code blocks get a header with the language name and a Copy button.
 */
import { Marked } from "marked";
import hljs from "highlight.js/lib/common";
import DOMPurify from "dompurify";

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const LANG_NAMES = { js: "JavaScript", jsx: "JSX", ts: "TypeScript", tsx: "TSX", py: "Python", python: "Python", javascript: "JavaScript", sql: "SQL", bash: "Bash", sh: "Shell", json: "JSON", html: "HTML", css: "CSS", java: "Java", kotlin: "Kotlin", cpp: "C++", c: "C", go: "Go", rust: "Rust", php: "PHP" };

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    code(code, infostring) {
      const lang = (infostring || "").trim().split(/\s+/)[0].toLowerCase();
      let html;
      try {
        html = lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : hljs.highlightAuto(code).value;
      } catch {
        html = escapeHtml(code);
      }
      const label = LANG_NAMES[lang] || lang || "code";
      return `<div class="code-block"><div class="code-head"><span>${escapeHtml(label)}</span><button type="button" class="copy-code" aria-label="Copy code">Copy</button></div><pre><code class="hljs">${html}</code></pre></div>`;
    },
    link(href, title, text) {
      const t = title ? ` title="${escapeHtml(title)}"` : "";
      return `<a href="${escapeHtml(href || "")}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

export function renderMarkdown(text) {
  const raw = marked.parse(text || "");
  return DOMPurify.sanitize(raw, { ADD_ATTR: ["target", "rel", "aria-label"] });
}
