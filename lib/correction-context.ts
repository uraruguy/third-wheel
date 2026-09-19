import { normalizeSpeech } from "./wake-phrase";

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
  if (!trimmed || /\?/.test(trimmed)) return false;
  const n = normalizeSpeech(trimmed);
  const hasEntity =
    hasProperName(trimmed) ||
    /\b(elon|musk|triglav|slovenij|predsednik|francij|zuckerberg|holland|jan[sš]a|drnov[sš]ek|bratu[sš]ek)\b/.test(
      n,
    );
  const hasClaim = /\b(je|is|was|bil|bila|naj|most|least)\b/.test(n);
  return hasEntity && hasClaim;
}

function hasProperName(text: string): boolean {
  return /[A-ZČŠŽ][a-zčšž]+(?:\s+[A-ZČŠŽ][a-zčšž]+)+/.test(text);
}
