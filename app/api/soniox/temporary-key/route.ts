import { NextResponse } from "next/server";
import {
  createTemporarySonioxKey,
  type SonioxUsageType,
} from "@/lib/soniox-server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { usageType?: string };
    const usageType = body.usageType;
    if (usageType !== "transcribe_websocket" && usageType !== "tts_rt") {
      return NextResponse.json({ error: "Invalid usage type" }, { status: 400 });
    }

    const key = await createTemporarySonioxKey(usageType as SonioxUsageType);
    return NextResponse.json({
      apiKey: key.apiKey,
      expiresAt: key.expiresAt,
    });
  } catch {
    return NextResponse.json(
      { error: "Temporary key unavailable" },
      { status: 500 },
    );
  }
}
