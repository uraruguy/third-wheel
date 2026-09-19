"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ThirdWheelSession,
  type SessionSnapshot,
} from "@/lib/client/session";

const initial: SessionSnapshot = {
  phase: "idle",
  partial: "",
  spoken: null,
  error: null,
  inConversation: false,
};

export function ListenApp() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(initial);
  const sessionRef = useRef<ThirdWheelSession | null>(null);

  useEffect(() => {
    const session = new ThirdWheelSession(setSnapshot);
    sessionRef.current = session;
    return () => session.stop();
  }, []);

  const listening = snapshot.phase === "listening";
  const speaking = snapshot.phase === "speaking";
  const thinking = snapshot.phase === "thinking";
  const active = snapshot.phase !== "idle";

  const status = useMemo(() => {
    if (snapshot.phase === "speaking") return "Joining";
    if (snapshot.phase === "thinking") return "Thinking";
    if (snapshot.inConversation) return "Still here";
    if (snapshot.phase === "listening") return "Listening";
    return "Ready";
  }, [snapshot.inConversation, snapshot.phase]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--muted)]">
          Third Wheel
        </p>

        <div className="relative mt-14 mb-10 grid h-40 w-40 place-items-center">
          {(listening || thinking || speaking) && (
            <>
              <span
                className={`pulse-ring absolute inset-0 rounded-full ${speaking ? "speaking" : ""}`}
              />
              <span
                className={`pulse-ring delay absolute inset-0 rounded-full ${speaking ? "speaking" : ""}`}
              />
            </>
          )}
          <div className="relative grid h-24 w-24 place-items-center rounded-full border border-[var(--line)] bg-[var(--card)]">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
          </div>
        </div>

        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight text-[var(--foreground)]">
          {status}
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
          {snapshot.phase === "idle"
            ? "Put this phone on the table. It listens, joins only when useful, then goes quiet."
            : snapshot.partial
              ? snapshot.partial
              : speaking
                ? "Saying it out loud."
                : thinking
                  ? "Deciding whether to join."
                  : snapshot.inConversation
                    ? "Say “search for X instead” or “poišči raje X”."
                    : "In the room, on the table."}
        </p>

        {snapshot.error && (
          <p className="mt-4 text-sm text-red-300/90">{snapshot.error}</p>
        )}

        {snapshot.spoken && (
          <section className="mt-10 w-full text-left">
            <p className="font-[family-name:var(--font-display)] text-xl leading-snug text-[var(--foreground)]">
              {snapshot.spoken.text}
            </p>
            {snapshot.spoken.sources.length > 0 && (
              <ul className="mt-6 space-y-3">
                {snapshot.spoken.sources.map((source) => (
                  <li
                    key={source.url}
                    className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-3"
                  >
                    <p className="text-sm text-[var(--foreground)]">
                      {source.title}
                    </p>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex text-sm text-[var(--accent)] underline-offset-4 hover:underline"
                    >
                      Read more
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <button
          type="button"
          className="mt-12 h-12 rounded-full px-8 text-sm font-medium tracking-wide transition-colors"
          style={{
            background: active ? "transparent" : "var(--accent)",
            color: active ? "var(--muted)" : "#1a1814",
            border: active ? "1px solid var(--line)" : "1px solid transparent",
          }}
          onClick={() => {
            if (active) sessionRef.current?.stop();
            else void sessionRef.current?.start();
          }}
        >
          {active ? "Stop" : "Start listening"}
        </button>
      </div>
    </main>
  );
}
