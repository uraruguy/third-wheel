import { isDebugAuthorized, debugLog, getDebugEvents } from "@/lib/debug-log";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isDebugAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { events: await getDebugEvents() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const eventName = body.event;
    const fields = { ...body };
    delete fields.event;
    debugLog(typeof eventName === "string" ? eventName : "client", fields);
    return NextResponse.json({ ok: true });
  } catch {
    debugLog("error", { source: "debug-ingest", message: "invalid body" });
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}
