import type { Source, SpeakMode } from "./types";

export type IncomingKind = "jev" | "followup" | "name-call";

export type SpokenTurn = {
  text: string;
  sources: Source[];
  mode: SpeakMode;
};

export function actionForIncoming(
  inFlight: boolean,
  kind: IncomingKind,
): "start" | "drop" | "barge" {
  if (!inFlight) return "start";
  if (kind === "name-call") return "barge";
  return "drop";
}

export function commitSpoken(
  previous: SpokenTurn | null,
  next: { text: string; sources?: Source[]; mode: SpeakMode },
): SpokenTurn | null {
  const text = next.text.trim();
  if (!text) return previous;
  return {
    text,
    sources: next.sources ?? previous?.sources ?? [],
    mode: next.mode,
  };
}

export function spokenAfterInterrupt(
  committed: SpokenTurn | null,
): SpokenTurn | null {
  return committed;
}
