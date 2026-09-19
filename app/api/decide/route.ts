import { NextResponse } from "next/server";
import { debugLog } from "@/lib/debug-log";
import { routeJevDecision } from "@/lib/jev-routing";
import { decideWithJev } from "@/lib/openrouter";

export async function POST(request: Request) {
  let sessionId: string | undefined;
  try {
    const body = (await request.json()) as {
      recentSpeech?: string;
      topicSummary?: string;
      inConversation?: boolean;
      addressed?: boolean;
      lastSpokenTurn?: string;
      latestSpeech?: string;
      topicWindow?: string;
      sessionId?: string;
    };
    sessionId = body.sessionId;

    const recentSpeech = (body.recentSpeech ?? "").trim();
    if (!recentSpeech) {
      debugLog("jev_output", {
        sessionId,
        speak: false,
        reason: "empty-speech",
      });
      return NextResponse.json({
        speak: false,
        mode: "silent",
        useWeb: false,
        reason: "empty-speech",
      });
    }

    if (body.addressed) {
      debugLog("wake", {
        sessionId,
        reason: "wake-or-addressed",
        recentSpeech,
      });
      return NextResponse.json({
        speak: true,
        mode: "addressed",
        useWeb: true,
        reason: "wake-or-addressed",
      });
    }

    const answers = await decideWithJev({
      recentSpeech,
      topicSummary: body.topicSummary ?? "",
      inConversation: Boolean(body.inConversation),
      lastSpokenTurn: body.lastSpokenTurn,
      latestSpeech: body.latestSpeech ?? recentSpeech,
      topicWindow: body.topicWindow,
      sessionId,
    });

    const decision = routeJevDecision({
      answers,
      addressed: false,
      inConversation: Boolean(body.inConversation),
      latestSpeech: body.latestSpeech ?? recentSpeech,
      recentSpeech,
    });
    debugLog("jev_output", { sessionId, ...decision, answers });
    return NextResponse.json(decision);
  } catch {
    debugLog("error", { sessionId, source: "decide" });
    return NextResponse.json({
      speak: false,
      mode: "silent",
      useWeb: false,
      reason: "jev-error",
    });
  }
}
