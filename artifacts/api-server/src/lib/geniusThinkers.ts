type Thinker = "freud" | "kernberg";
type HistoryMessage = { role: "user" | "assistant"; content: string };

/** Only the user's verified Genius 101 host receives these credentials. */
export async function askGeniusThinker(input: {
  persona: Thinker;
  question: string;
  history: HistoryMessage[];
  courseContent: string;
}): Promise<string> {
  const key = input.persona === "freud" ? process.env.FREUD_API_KEY : process.env.KERNBERG_API_KEY;
  if (!key) throw new Error("The selected Genius 101 connection is not configured.");
  const previous = input.history.map(({ role, content }) =>
    `${role === "user" ? "Student" : "Your previous answer"}: ${content}`).join("\n\n");
  const response = await fetch(`https://genius101.xyz/api/figures/${input.persona}/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "x-api-key": key,
      accept: "text/event-stream, application/json",
    },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      mainChatMode: true,
      message: [
        "This conversation is ungraded help during the live oral course Basic Tenets of Psychoanalysis.",
        "Respond from your own psychoanalytic perspective to the student's question. Use the attached course context where relevant, welcome speculation and objections, and distinguish hypotheses from established facts. Do not diagnose the student.",
        "Your reply will be read aloud. Use natural conversational prose without markdown or lists, under about 150 words unless more detail is requested. You are an AI portrayal, not the actual person.",
        previous ? `Earlier turns in this course conversation:\n${previous}` : "",
        `Student's current question:\n${input.question}`,
      ].filter(Boolean).join("\n\n"),
      uploadedDocument: { name: "Basic Tenets of Psychoanalysis — course context", content: input.courseContent },
      settings: {
        responseLength: 150, quoteFrequency: 0, dialogueMode: true,
        selectedModel: "gemini", enhancedMode: true, intensityLevel: 30,
      },
    }),
  });
  if (!response.ok) throw new Error(`Genius 101 request failed (${response.status}).`);
  if (response.headers.get("content-type")?.includes("application/json")) {
    const reply = await response.json() as { answer?: string; content?: string; error?: unknown; accessRequired?: unknown };
    if (reply.error || reply.accessRequired) throw new Error("Genius 101 did not authorize this conversation.");
    const answer = reply.answer || reply.content;
    if (!answer?.trim()) throw new Error("Genius 101 returned no spoken answer.");
    return answer.trim();
  }
  if (!response.headers.get("content-type")?.includes("text/event-stream") || !response.body) {
    throw new Error("Genius 101 returned an unexpected response.");
  }
  return readGeniusStream(response.body);
}

/** SSE tokens are text, not something to speak until the completed reply is known. */
export async function readGeniusStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "", answer = "", finished = false;
  const acceptLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data) return;
    if (data === "[DONE]") { finished = true; return; }
    const event = JSON.parse(data) as { error?: unknown; content?: unknown; reset_content?: boolean };
    if (event.error) throw new Error("Genius 101 could not complete the answer.");
    if (typeof event.content === "string") {
      answer = event.reset_content ? event.content : answer + event.content;
      if (answer.length > 30000) throw new Error("Genius 101's answer was too long to play.");
    }
  };
  try {
    while (!finished) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) { acceptLine(line); if (finished) break; }
      if (done) { if (!finished && pending) acceptLine(pending); break; }
    }
    if (!finished) throw new Error("Genius 101's answer was interrupted. Please try again.");
    if (!answer.trim()) throw new Error("Genius 101 returned no spoken answer.");
    return answer.trim();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
