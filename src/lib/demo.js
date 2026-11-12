/**
 * Offline demo engine.
 * It lets anyone try every feature (streaming, markdown, code blocks, personas)
 * without an API key. It matches the prompt against a small library of
 * hand-written answers. It is not a language model, and the UI says so.
 */

const FENCE = "```";

const LIBRARY = [
  {
    keys: ["recursion", "recursive", "factorial"],
    answer: `## Recursion in one sentence
A **recursive function** solves a problem by calling *itself* on a smaller version of the same problem, until it reaches a case simple enough to answer directly (the **base case**).

### Python example: factorial
${FENCE}python
def factorial(n: int) -> int:
    """Return n! = n × (n-1) × … × 1."""
    if n < 0:
        raise ValueError("n must be non-negative")
    if n <= 1:          # base case: stops the recursion
        return 1
    return n * factorial(n - 1)   # recursive case: smaller problem


print(factorial(5))   # 120
${FENCE}

### How the calls unfold
| Call | Waits for | Returns |
|---|---|---|
| \`factorial(5)\` | \`5 × factorial(4)\` | 120 |
| \`factorial(4)\` | \`4 × factorial(3)\` | 24 |
| \`factorial(3)\` | \`3 × factorial(2)\` | 6 |
| \`factorial(2)\` | \`2 × factorial(1)\` | 2 |
| \`factorial(1)\` | (base case) | 1 |

### Tips
- Every recursive function **must** have a base case, or it never stops (\`RecursionError\` in Python).
- Each call uses stack memory. For very deep problems, a loop or \`functools.lru_cache\` (memoisation) is often better.`,
  },
  {
    keys: ["debounce", "hook", "react"],
    answer: `Here is a reusable **\`useDebounce\`** hook. It delays updating a value until the user stops typing, which is perfect for search boxes.

${FENCE}jsx
import { useEffect, useState } from "react";

/** Returns \`value\`, but only after it has stopped changing for \`delay\` ms. */
export function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer); // cancel if value changes again
  }, [value, delay]);

  return debounced;
}
${FENCE}

### Using it
${FENCE}jsx
function SearchBox() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 500);

  useEffect(() => {
    if (debouncedQuery) fetch(\`/api/search?q=\${encodeURIComponent(debouncedQuery)}\`);
  }, [debouncedQuery]);

  return <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" />;
}
${FENCE}

**Why it works:** each keystroke resets the timer in the effect's cleanup, so the API is called **once** after typing pauses, not on every key.`,
  },
  {
    keys: ["sql", "nosql", "database", "mongodb", "mysql"],
    answer: `## SQL vs NoSQL at a glance

| | **SQL** (MySQL, PostgreSQL) | **NoSQL** (MongoDB, Firebase) |
|---|---|---|
| Data model | Tables with fixed columns | Documents, key-value, graph… |
| Schema | Strict, defined up front | Flexible, can change per record |
| Relationships | Strong, with JOINs and foreign keys | Usually embedded or referenced by hand |
| Transactions | Full ACID by default | Varies (MongoDB has multi-document ACID) |
| Scaling | Mostly vertical (bigger server) | Built for horizontal (more servers) |
| Best for | Banking, orders, inventory | Catalogues, chat, IoT, fast-changing data |

### Quick rule of thumb
- Choose **SQL** when correctness and relationships matter most, such as payments.
- Choose **NoSQL** when data shape varies a lot or you need massive scale.

${FENCE}sql
-- SQL: orders with their customer, in one query
SELECT o.id, c.name, o.total
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.total > 100;
${FENCE}`,
  },
  {
    keys: ["interview", "questions", "junior"],
    answer: `## 5 interview questions for a junior developer

1. **Explain the difference between \`let\`, \`const\` and \`var\` in JavaScript.**
   *Looks for:* block vs function scope, re-assignment, hoisting.
2. **What happens when you type a URL into the browser and press Enter?**
   *Looks for:* DNS, TCP/TLS, HTTP request/response, rendering.
3. **How would you find and fix a bug you cannot reproduce?**
   *Looks for:* logs, monitoring, adding tests, narrowing inputs.
4. **What is the difference between a process and a thread?**
   *Looks for:* memory isolation, shared memory, concurrency risks.
5. **Tell me about a project you are proud of. What would you do differently?**
   *Looks for:* ownership, reflection, clear communication.

🎯 *Want to practise? Switch to the **Interview Coach** persona and answer one question at a time. You will get a score and feedback.*`,
  },
  {
    keys: ["study", "schedule", "exam", "plan"],
    answer: `## A 3-day exam study plan 📚

**Day 1: Understand**
- 🕘 2 × 50 min: read notes for the hardest topic, then summarise each page in 3 lines
- 🕑 1 × 50 min: make flashcards for key terms
- 🌙 10 min: quick recall, writing down everything you remember

**Day 2: Practise**
- 🕘 2 × 50 min: past-paper questions under time pressure
- 🕑 1 × 50 min: fix every mistake and add it to a "mistake list"
- 🌙 10 min: flashcards

**Day 3: Review**
- 🕘 1 × 50 min: one full mock exam
- 🕑 1 × 50 min: go through the mistake list only
- 🌙 Early sleep 😴. Memory is consolidated while you sleep.

> **Tip:** take a 10-minute break after every 50 minutes (the Pomodoro idea). Short breaks keep focus high.`,
  },
  {
    keys: ["poem", "story", "ocean", "write me", "creative"],
    answer: `## The Tide Keeps Time 🌊

*The ocean folds its silver page,*
*and writes the moon in curling script;*
*each wave a word, each foam a stage,*
*where ancient songs of salt are kept.*

*It does not hurry, does not wait,*
*it simply comes and lets things go —*
*a lesson in the turning gate*
*of all the things we cannot know.*

---
Want a different direction? I can make it ✍️ **funny**, 🌙 **mysterious**, or turn it into a 📖 **100-word story**.`,
  },
];

const GREETING = /^(hi|hello|hey|good (morning|afternoon|evening)|yo)\b/i;

export function demoReply(messages, system = "") {
  const last = [...messages].reverse().find((m) => m.role === "user");
  const q = (last?.content || "").toLowerCase();
  const persona = (system.match(/You are ([A-Z][\w ]+?)[,.]/) || [])[1] || "Nova";

  if (GREETING.test(q.trim())) {
    return `Hi! 👋 I'm **${persona}**, running in **demo mode**.

Try one of these to see streaming, markdown, tables and code blocks:
- *Explain recursion with a Python example*
- *Write a React hook for debouncing*
- *Compare SQL vs NoSQL in a table*

For real AI answers on any topic, open **⚙ Settings** and add a free Gemini API key.`;
  }

  let best = null;
  let bestScore = 0;
  for (const item of LIBRARY) {
    const score = item.keys.reduce((s, k) => s + (q.includes(k) ? 1 : 0), 0);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  if (best) return best.answer;

  const topic = (last?.content || "that").trim().replace(/\s+/g, " ").slice(0, 80);
  return `I'm **${persona}** in **demo mode**, so I can only answer a few sample prompts offline.

You asked about: *"${topic}"*

To get a real answer:
1. Open **⚙ Settings** (top right)
2. Choose **Google Gemini** and paste a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
3. Send your message again. Your key stays in your browser.

Meanwhile, try *"Explain recursion with a Python example"* to see code highlighting in action.`;
}

/** Stream text in small word-sized chunks with a natural rhythm. */
export async function streamText(text, emit, signal, { minDelay = 8, maxDelay = 28 } = {}) {
  const chunks = text.match(/\s*\S+\s*/g) || [text];
  for (const c of chunks) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    emit(c);
    if (maxDelay > 0) await new Promise((r) => setTimeout(r, minDelay + Math.random() * (maxDelay - minDelay)));
  }
}
