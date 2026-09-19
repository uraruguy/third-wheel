import { NextResponse } from "next/server";
import { debugLog } from "@/lib/debug-log";
import {
  createTemporarySonioxKey,
  type SonioxUsageType,
} from "@/lib/soniox-server";

export async function POST(request: Request) {
  let sessionId: string | undefined;
  try {
    const body = (await request.json()) as {
      usageType?: string;
      sessionId?: string;
    };
    sessionId = body.sessionId;
    const usageType = body.usageType;
    if (usageType !== "transcribe_websocket" && usageType !== "tts_rt") {
      debugLog("temp_key_fail", { sessionId, reason: "invalid-usage-type" });
      return NextResponse.json({ error: "Invalid usage type" }, { status: 400 });
    }

    const key = await createTemporarySonioxKey(usageType as SonioxUsageType);
    debugLog("temp_key", { sessionId, usageType, ok: true });
    return NextResponse.json({
      apiKey: key.apiKey,
      expiresAt: key.expiresAt,
    });
  } catch {
    debugLog("temp_key_fail", { sessionId, source: "soniox" });
    return NextResponse.json(
      { error: "Temporary key unavailable" },
      { status: 500 },
    );
  }
}
