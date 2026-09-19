import type { SpeechLanguage } from "./types";

const SLOVENE_WORDS =
  /\b(in|je|kaj|ne|da|za|kako|ali|sem|smo|lahko|prosim|preveri|poisci|poišči|koliko|kdaj|kje|zakaj|tudi|ampak|če|se|na|ob|pri)\b/i;

export function inferLanguage(
  text: string,
  tokenLanguage?: string,
): SpeechLanguage {
  const hinted = tokenLanguage?.toLowerCase().slice(0, 2);
  if (hinted === "sl" || hinted === "en") return hinted;

  if (/[čšžćđ]/i.test(text) || SLOVENE_WORDS.test(text)) return "sl";
  return "en";
}

export function languageName(language: SpeechLanguage): string {
  return language === "sl" ? "Slovenian" : "English";
}
