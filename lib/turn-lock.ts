import type { Source, SpeakMode } from "./types";
import { detectWakePhrase, normalizeSpeech } from "./wake-phrase";

export type IncomingKind = "jev" | "followup" | "name-call";

export type SpokenTurn = {
  text: string;
  sources: Source[];
  mode: SpeakMode;
};

export type IncomingLock = {
  inFlightMode?: SpeakMode | null;
  text?: string;
  anchorText?: string;
  pendingNameOnly?: boolean;
  protectLookups?: boolean;
};

export function actionForIncoming(
  inFlight: boolean,
  kind: IncomingKind,
  extras?: IncomingLock,
): "start" | "drop" | "barge" {
  if (kind === "name-call") return inFlight ? "barge" : "start";
  if (inFlight) return "drop";
  if (
    kind === "jev" &&
    extras?.text &&
    (extras.protectLookups || extras.pendingNameOnly) &&
    looksLikeLanguageSwitchJunk(extras.text, extras.anchorText ?? "")
  ) {
    return "drop";
  }
  return "start";
}

export function looksLikeLanguageSwitchJunk(text: string, anchor: string): boolean {
  if (!text.trim() || !anchor.trim()) return false;
  if (detectWakePhrase(text).matched) return false;
  const incoming = langScore(text);
  const held = langScore(anchor);
  const anchorSl = held.sl >= 2 && held.sl > held.en;
  const incomingEn = incoming.en >= 3 && incoming.en > incoming.sl && !/[čšžćđ]/i.test(text);
  return anchorSl && incomingEn;
}

function langScore(text: string): { sl: number; en: number } {
  const n = normalizeSpeech(text);
  const slHits =
    (n.match(
      /\b(in|je|da|ne|se|za|na|pa|so|bi|ali|kaj|kdo|jaz|ti|mi|smo|ste|sem|si|povej|koliko|leta|premozenje|bil|bila)\b/g,
    ) ?? []).length + (/[čšžćđ]/i.test(text) ? 2 : 0);
  const enHits = (
    n.match(
      /\b(the|and|you|to|is|that|this|want|make|really|model|hey|of|for|every|possible|extremely|fragile|expense|questions)\b/g,
    ) ?? []
  ).length;
  return { sl: slHits, en: enHits };
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
