/**
 * Incremental Server-Sent Events parser.
 * Network chunks can split an event anywhere (even mid-line), so we buffer text
 * and only emit complete events. Both Gemini and OpenAI stream tokens this way.
 */
export function createSSEParser(onEvent) {
  let buffer = "";
  let dataLines = [];

  function flushEvent() {
    if (dataLines.length) {
      onEvent(dataLines.join("\n"));
      dataLines = [];
    }
  }

  return {
    push(chunk) {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line === "") flushEvent();
        else if (line.startsWith(":")) continue; // comment / keep-alive
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
      }
    },
    end() {
      if (buffer.startsWith("data:")) dataLines.push(buffer.slice(5).replace(/^ /, ""));
      buffer = "";
      flushEvent();
    },
  };
}

/** Read a fetch Response body as SSE and call onData(dataString) per event. */
export async function readSSE(response, onData) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSSEParser(onData);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.end();
}
