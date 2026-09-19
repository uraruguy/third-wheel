import { JEV_MODEL, SPEAK_MODEL } from "./constants";
import { debugLog } from "./debug-log";
import { requireEnv } from "./env";
import { languageName } from "./language";
import { parseSpeakMode } from "./jev-routing";
import { followUpContext } from "./follow-up-context";
import {
  parseSpeakResponse,
  replyDriftsFromContext,
  sourcesFromAnnotations,
  uniqueSources,
} from "./no-speak";
import type { JevAnswers, Source, SpeakMode, SpeechLanguage } from "./types";

const OPENROUTER_HEADERS = () => ({
  Authorization: `Bearer ${requireEnv("OPENROUTER_API_KEY")}`,
  "Content-Type": "application/json",
  "HTTP-Referer": "https://github.com/uraruguy/third-wheel",
  "X-OpenRouter-Title": "Third Wheel",
});

export async function decideWithJev(input: {
  recentSpeech: string;
  topicSummary: string;
  inConversation: boolean;
  lastSpokenTurn?: string;
  latestSpeech?: string;
  topicWindow?: string;
  sessionId?: string;
}): Promise<JevAnswers> {
  const context = followUpContext({
    lastSpokenTurn: input.lastSpokenTurn,
    latestSpeech: input.latestSpeech ?? input.recentSpeech,
    topicWindow: input.topicWindow,
  });
  debugLog("jev_input", {
    sessionId: input.sessionId,
    recentSpeech: input.recentSpeech,
    topicSummary: input.topicSummary,
    inConversation: input.inConversation,
    ...context,
  });

  const response = await fetch("https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: OPENROUTER_HEADERS(),
    body: JSON.stringify({
      model: JEV_MODEL,
      state: {
        recent_speech: input.recentSpeech,
        topic_summary: input.topicSummary,
        in_conversation: input.inConversation,
        last_spoken_turn: context.lastSpokenTurn,
        latest_utterance: context.latestSpeech,
        topic_window: context.topicWindow,
      },
      questions: {
        should_speak: {
          type: "noul",
          instructions:
            "Should Third Wheel speak one or two sentences out loud to the people in the room right now?",
          criteria: {
            true: "A short spoken fact would clearly help: a likely wrong checkable claim, a number/name they are trying to recall, or they asked Third Wheel.",
            false:
              "Casual chat, opinions, jokes, already-known facts, or speaking would interrupt without adding value.",
          },
        },
        mode: {
          type: "choice",
          instructions: "Which join mode fits this moment?",
          criteria: {
            silent: "Stay quiet. Nothing useful or appropriate to add.",
            correction:
              "Someone stated a checkable fact that is likely wrong and worth a polite correction.",
            lookup:
              "They do not know a number, name, date, or similar fact and would benefit from a lookup.",
            addressed: "They spoke to Third Wheel by name or asked it directly.",
            followup:
              "They are revising the previous Third Wheel answer (for example search for X instead).",
          },
        },
        needs_web: {
          type: "noul",
          instructions:
            "Does answering well require looking something up on the web?",
          criteria: {
            true: "Current events, a specific number, a sourceable fact, or anything that should be checked.",
            false: "No answer should be given, or it is a trivial fact that needs no search.",
          },
        },
        is_debate: {
          type: "noul",
          instructions:
            "Are the speakers debating, joking, or knowingly stating a wrong fact on purpose?",
          criteria: {
            true: "They are arguing both sides, playing devil's advocate, teasing, or clearly know the statement is false.",
            false:
              "Someone stated a false fact as if it were true, with no debate, irony, or pushback.",
          },
        },
      },
    }),
  });

  if (!response.ok) {
    debugLog("error", {
      sessionId: input.sessionId,
      source: "jev",
      status: response.status,
    });
    throw new Error("Jev decision failed");
  }

  const data = (await response.json()) as {
    answers?: Record<string, { noul?: number; choice?: string }>;
  };
  const answers = data.answers ?? {};

  const parsed = {
    shouldSpeak: clamp01(answers.should_speak?.noul),
    mode: parseSpeakMode(answers.mode?.choice),
    needsWeb: clamp01(answers.needs_web?.noul),
    isDebate: clamp01(answers.is_debate?.noul),
  };
  debugLog("jev_output", { sessionId: input.sessionId, ...parsed });
  return parsed;
}

export async function* streamSpokenReply(input: {
  topicWindow: string;
  latestSpeech: string;
  mode: SpeakMode;
  useWeb: boolean;
  language: SpeechLanguage;
  followUpQuery?: string;
  lastSpokenTurn?: string;
  sessionId?: string;
}): AsyncGenerator<
  | { type: "delta"; text: string }
  | { type: "done"; text: string; sources: Source[] }
  | { type: "no_speak" }
> {
  const prompt = buildSpeakUserPrompt(input);
  debugLog("speak_prompt", {
    sessionId: input.sessionId,
    mode: input.mode,
    language: input.language,
    useWeb: input.useWeb,
    latestSpeech: input.latestSpeech,
    followUpQuery: input.followUpQuery ?? "",
    lastSpokenTurn: input.lastSpokenTurn ?? "",
    topicWindow: input.topicWindow,
    prompt,
  });
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: OPENROUTER_HEADERS(),
    body: JSON.stringify({
      model: SPEAK_MODEL,
      stream: true,
      temperature: 0.2,
      max_tokens: 280,
      reasoning: { effort: "minimal" },
      tools: [
        {
          type: "openrouter:web_search",
          parameters: { max_uses: 2 },
        },
      ],
      messages: [
        {
          role: "system",
          content: speakSystemPrompt(input.language, input.useWeb),
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok || !response.body) {
    debugLog("error", {
      sessionId: input.sessionId,
      source: "speak",
      status: response.status,
    });
    throw new Error("Speak model request failed");
  }

  let raw = "";
  const annotationSources: Source[] = [];

  for await (const event of readSseJson(response.body)) {
    const choices = Array.isArray(event.choices) ? event.choices : [];
    const choice = (choices[0] ?? {}) as Record<string, unknown>;
    const delta = (choice.delta ?? {}) as Record<string, unknown>;
    const message = (choice.message ?? {}) as Record<string, unknown>;
    const content = extractDeltaText(delta.content);
    if (content) {
      raw += content;
      yield { type: "delta", text: content };
    }
    annotationSources.push(
      ...sourcesFromAnnotations(delta.annotations),
      ...sourcesFromAnnotations(message.annotations),
    );
  }

  const parsed = parseSpeakResponse(raw);
  if (
    parsed.speak &&
    replyDriftsFromContext({
      reply: parsed.text,
      latestSpeech: input.latestSpeech,
      lastSpokenTurn: input.lastSpokenTurn ?? "",
      followUpQuery: input.followUpQuery,
    })
  ) {
    debugLog("no_speak", {
      sessionId: input.sessionId,
      reason: "drift",
      text: parsed.text,
    });
    yield { type: "no_speak" };
    return;
  }
  if (!parsed.speak) {
    debugLog("no_speak", {
      sessionId: input.sessionId,
      raw: raw.slice(0, 500),
    });
    yield { type: "no_speak" };
    return;
  }

  debugLog("speak_response", {
    sessionId: input.sessionId,
    text: parsed.text,
  });
  debugLog("speak_sources", {
    sessionId: input.sessionId,
    sources: uniqueSources([...annotationSources, ...parsed.sources]),
  });

  yield {
    type: "done",
    text: parsed.text,
    sources: uniqueSources([...annotationSources, ...parsed.sources]),
  };
}

function speakSystemPrompt(language: SpeechLanguage, useWeb: boolean): string {
  const searchLine = useWeb
    ? "Search the web only if the asked fact needs a source."
    : "Do not search unless a checkable fact is missing.";

  return [
    "You are Third Wheel, a quiet person at the table.",
    "Speak at most two short sentences in the language of the latest speech.",
    `Write the spoken lines in ${languageName(language)}.`,
    "Answer only the latest user question, or the last factual claim you made if they ask what you meant (kaj je to / what are you talking about).",
    "If you would change the topic — for example they asked about your last America claim and you would talk about a color — output exactly NO_SPEAK.",
    searchLine,
    "Never invent numbers, names, or URLs.",
    "If the ask is unclear, or you would have to guess a new topic, output exactly NO_SPEAK.",
    "Otherwise output the spoken sentences, then a blank line, then:",
    "SOURCES:",
    "- https://example.com",
    "No preface, markdown, or bullets in the spoken lines.",
  ].join("\n");
}

export function buildSpeakUserPrompt(input: {
  topicWindow: string;
  latestSpeech: string;
  mode: SpeakMode;
  followUpQuery?: string;
  lastSpokenTurn?: string;
}): string {
  const context = followUpContext({
    lastSpokenTurn: input.lastSpokenTurn,
    latestSpeech: input.latestSpeech,
    topicWindow: input.topicWindow,
  });
  const parts = [
    `Mode: ${input.mode}`,
    input.followUpQuery ? `Asked / follow-up: ${input.followUpQuery}` : "",
    "They just said (latest utterance):",
    context.latestSpeech || "(none)",
    "Your last spoken sentence (stay on this if they ask kaj je to / what are you talking about):",
    context.lastSpokenTurn || "(none)",
    "Topic window (~90 seconds, background only — do not switch to it unless they asked about it):",
    context.topicWindow || "(none)",
  ];
  return parts.filter(Boolean).join("\n\n");
}

function extractDeltaText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        return String((part as { text?: string }).text ?? "");
      }
      return "";
    })
    .join("");
}

async function* readSseJson(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");
      if (!data || data === "[DONE]") continue;
      try {
        yield JSON.parse(data) as Record<string, unknown>;
      } catch {
        // Ignore malformed SSE leftovers.
      }
    }
  }
}

function clamp01(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
