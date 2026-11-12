import { describe, expect, it, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import App from "../src/App.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const waitFor = async (check, timeout = 15000) => {
  const t0 = Date.now();
  for (;;) {
    const v = check();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error("timed out");
    await act(() => new Promise((r) => setTimeout(r, 50)));
  }
};

function mount() {
  const el = document.createElement("div");
  document.body.innerHTML = "";
  document.body.appendChild(el);
  let root;
  act(() => {
    root = createRoot(el);
    root.render(<App />);
  });
  return el;
}

describe("Orbit app (integration, demo mode)", () => {
  beforeEach(() => localStorage.clear());

  it("shows the empty state with persona and suggestions", () => {
    const el = mount();
    expect(el.querySelector(".empty h1").textContent).toBe("Hi, I'm Nova");
    expect(el.querySelectorAll(".suggestions button").length).toBe(4);
    expect(el.querySelector(".banner").textContent).toContain("Demo mode");
  });

  it("streams a full reply with a highlighted code block, then saves the chat", async () => {
    const el = mount();
    act(() => el.querySelector(".suggestions button").click());
    expect(el.querySelector(".msg.user").textContent).toContain("Explain recursion");
    await waitFor(() => [...el.querySelectorAll(".msg-actions button")].some((b) => b.textContent.includes("Regenerate")));
    expect(el.querySelector(".code-block .code-head").textContent).toContain("Python");
    expect(el.querySelector(".stats").textContent).toMatch(/tok\/s/);
    expect(el.querySelector(".chat-item.active .title").textContent).toContain("Explain recursion");
    const saved = JSON.parse(localStorage.getItem("orbit.chats.v1"));
    expect(saved[0].messages).toHaveLength(2);
  }, 20000);

  it("switching persona on a used chat starts a new chat", async () => {
    const el = mount();
    act(() => el.querySelectorAll(".suggestions button")[2].click());
    await waitFor(() => !el.querySelector(".send.stop"));
    const coach = [...el.querySelectorAll(".persona")].find((b) => b.textContent.includes("Interview Coach"));
    act(() => coach.click());
    expect(el.querySelector(".empty h1").textContent).toBe("Hi, I'm Interview Coach");
    expect(el.querySelectorAll(".chat-item").length).toBe(2);
  }, 20000);
});
