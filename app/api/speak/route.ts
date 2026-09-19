import { isNoSpeakPrefix } from "@/lib/no-speak";
import { streamSpokenReply } from "@/lib/openrouter";
import { parseSpeakMode } from "@/lib/jev-routing";
import type { SpeakMode, SpeechLanguage } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    topicWindow?: string;
    latestSpeech?: string;
    mode?: string;
    useWeb?: boolean;
    language?: SpeechLanguage;
    followUpQuery?: string;
  };

  const latestSpeech = (body.latestSpeech ?? "").trim();
  const mode = parseSpeakMode(body.mode) as SpeakMode;
  if (!latestSpeech && !body.followUpQuery) {
    return sseNoSpeak();
  }

  const encoder = new TextEncoder();
  let buffer = "";
  let decided: boolean | null = null;
  let flushed = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };

      try {
        for await (const event of streamSpokenReply({
          topicWindow: body.topicWindow ?? "",
          latestSpeech,
          mode: mode === "silent" ? "lookup" : mode,
          useWeb: body.useWeb !== false,
          language: body.language === "sl" ? "sl" : "en",
          followUpQuery: body.followUpQuery,
        })) {
          if (event.type === "no_speak") {
            send({ type: "no_speak" });
            break;
          }
          if (event.type === "delta") {
            buffer += event.text;
            if (decided === null) {
              const prefix = isNoSpeakPrefix(buffer);
              if (prefix === true) {
                send({ type: "no_speak" });
                decided = false;
                break;
              }
              if (prefix === false && !buffer.trimStart().startsWith("{")) {
                decided = true;
              }
            }
            if (decided) {
              const pending = buffer.slice(flushed);
              flushed = buffer.length;
              if (pending) send({ type: "delta", text: pending });
            }
            continue;
          }
          if (event.type === "done") {
            send({
              type: "done",
              text: event.text,
              sources: event.sources,
            });
          }
        }
      } catch {
        send({ type: "error", message: "Speak failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function sseNoSpeak() {
  return new Response(`data: ${JSON.stringify({ type: "no_speak" })}\n\n`, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
