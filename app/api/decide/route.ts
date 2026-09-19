import { NextResponse } from "next/server";
import { routeJevDecision } from "@/lib/jev-routing";
import { decideWithJev } from "@/lib/openrouter";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      recentSpeech?: string;
      topicSummary?: string;
      inConversation?: boolean;
      addressed?: boolean;
    };

    const recentSpeech = (body.recentSpeech ?? "").trim();
    if (!recentSpeech) {
      return NextResponse.json({
        speak: false,
        mode: "silent",
        useWeb: false,
        reason: "empty-speech",
      });
    }

    if (body.addressed) {
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
    });

    return NextResponse.json(
      routeJevDecision({
        answers,
        addressed: false,
        inConversation: Boolean(body.inConversation),
      }),
    );
  } catch {
    return NextResponse.json({
      speak: false,
      mode: "silent",
      useWeb: false,
      reason: "jev-error",
    });
  }
}
