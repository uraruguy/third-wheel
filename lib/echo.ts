import { uniqueSources } from "./no-speak";
import type { Source } from "./types";
import { normalizeSpeech } from "./wake-phrase";

export function looksLikeEcho(heard: string, spoken: string): boolean {
  const a = normalizeSpeech(heard);
  const b = normalizeSpeech(spoken);
  if (!a || !b || a.length < 8) return false;
  if (b.includes(a) || a.includes(b)) return true;

  const aw = a.split(" ").filter((word) => word.length > 2);
  const bw = new Set(b.split(" ").filter((word) => word.length > 2));
  if (aw.length === 0) return false;
  const overlap = aw.filter((word) => bw.has(word)).length;
  return overlap / aw.length >= 0.7;
}

export function spokenTextForTts(text: string): string {
  const cut = text.search(/\n\s*SOURCES\s*:/i);
  const body = cut === -1 ? text : text.slice(0, cut);
  return body.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
}

export function mergeSources(primary: Source[], extra: Source[]): Source[] {
  return uniqueSources([...primary, ...extra]);
}
