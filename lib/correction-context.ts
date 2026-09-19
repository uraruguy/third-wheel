import { normalizeSpeech } from "./wake-phrase";

const YEAR = /\b(1[89]\d{2}|20\d{2})\b/;
const CLAIM =
  /\b(je|is|was|were|bil|bila|bili|bilo|naj|most|least|leta|ima|imel|imela)\b/;
const FUNCTION_NAME =
  /^(je|a|ali|kaj|kdo|kdaj|kje|the|and|this|that|hey|hej|i|we|they|he|she|it|in|on|at|to|of|za|v|na|po|leta|bil|bila|bilo|koliko|kateri|okay)$/i;
const YEAR_STOP = new Set([
  "leta",
  "leto",
  "year",
  "circa",
  "okoli",
  "priblizno",
  "jaz",
  "mislim",
  "da",
  "bil",
  "bila",
  "bilo",
  "je",
  "ni",
  "res",
  "pa",
  "ne",
  "ja",
  "okay",
  "the",
  "and",
]);

export function selfCorrectedInLine(text: string): boolean {
  const n = normalizeSpeech(text);
  if (!n) return false;
  const marksCorrection =
    /\b(popravek|popravljam|actually|i mean|v bistvu|no wait|wait no|to ni res|narobe)\b/.test(
      n,
    );
  const statesTrueSide =
    /\b(bogat|richest|najbogat|ni res|not true|ni najrevnej|not the poorest)\b/.test(
      n,
    );
  return marksCorrection && statesTrueSide;
}

export function bothSidesAlreadyStated(recentSpeech: string): boolean {
  const n = normalizeSpeech(recentSpeech);
  if (!n) return false;
  const poor = /\b(najrevnej|poorest)/.test(n);
  const rich = /\b(najbogat|richest)/.test(n);
  return poor && rich;
}

export function assertsCheckableWorldFact(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const n = normalizeSpeech(trimmed);
  if (!n) return false;

  const year = YEAR.test(n);
  const names = properNameTokens(trimmed);
  const claim = CLAIM.test(n) || year;

  if (year) {
    const extras = n
      .split(" ")
      .filter((word) => word.length > 2 && !YEAR.test(word) && !YEAR_STOP.has(word));
    if (names.length > 0 || extras.length > 0) return true;
  }

  return names.length > 0 && claim;
}

export function properNameTokens(text: string): string[] {
  return (text.match(/[A-ZČŠŽ][A-Za-zČčŠšŽž]{2,}/g) ?? []).filter(
    (word) => !FUNCTION_NAME.test(normalizeSpeech(word)),
  );
}
