const WAKE_PHRASES = [
  "hey third wheel",
  "hej third wheel",
  "third wheel",
] as const;

export type WakePhrase = (typeof WAKE_PHRASES)[number];

export function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectWakePhrase(text: string): {
  matched: boolean;
  remainder: string;
  nameOnly: boolean;
  phrase?: WakePhrase;
} {
  const hit = matchName(text);
  if (!hit) {
    return { matched: false, remainder: normalizeSpeech(text), nameOnly: false };
  }
  return {
    matched: true,
    remainder: hit.remainder,
    nameOnly: hit.remainder.length === 0,
    phrase: hit.phrase,
  };
}

function matchName(text: string): { phrase: WakePhrase; remainder: string } | null {
  const normalized = normalizeSpeech(text);
  if (!normalized) return null;

  for (const phrase of WAKE_PHRASES) {
    let from = 0;
    while (from <= normalized.length) {
      const index = normalized.indexOf(phrase, from);
      if (index === -1) break;
      const beforeOk = index === 0 || normalized[index - 1] === " ";
      const after = index + phrase.length;
      const afterOk = after === normalized.length || normalized[after] === " ";
      if (beforeOk && afterOk) {
        const remainder = `${normalized.slice(0, index)} ${normalized.slice(after)}`
          .replace(/\s+/g, " ")
          .trim();
        return { phrase, remainder };
      }
      from = index + 1;
    }
  }
  return null;
}

export type UtterancePlan =
  | { action: "ignore-echo" }
  | { action: "wait-for-question" }
  | { action: "speak-addressed"; question: string }
  | { action: "jev" };

export function planUtterance(input: {
  text: string;
  lastSpokenText: string;
  pendingNameOnly: boolean;
  isEcho: boolean;
}): UtterancePlan {
  const wake = detectWakePhrase(input.text);

  if (input.pendingNameOnly) {
    if (input.isEcho && !wake.matched) return { action: "ignore-echo" };
    if (wake.matched && wake.nameOnly) return { action: "wait-for-question" };
    if (wake.matched && !wake.nameOnly) {
      return { action: "speak-addressed", question: wake.remainder };
    }
    if (looksLikeAddressedQuestion(input.text)) {
      return { action: "speak-addressed", question: input.text.trim() };
    }
    return { action: "jev" };
  }

  if (input.isEcho && !wake.matched) return { action: "ignore-echo" };
  if (input.isEcho && wake.matched && wake.nameOnly) {
    const spoken = normalizeSpeech(input.lastSpokenText);
    if (spoken.includes("third wheel")) return { action: "ignore-echo" };
  }

  if (!wake.matched) return { action: "jev" };
  if (wake.nameOnly) return { action: "wait-for-question" };
  return { action: "speak-addressed", question: wake.remainder };
}

const FOLLOW_UP_PATTERNS: RegExp[] = [
  /(?:search|look(?:\s*up)?)\s+for\s+(.+?)\s+instead\b/i,
  /(?:search|look(?:\s*up)?)\s+instead\s+(?:for\s+)?(.+)/i,
  /poi(?:š|s)[cč]i\s+raje\s+(.+)/i,
  /raje\s+poi(?:š|s)[cč]i\s+(.+)/i,
  /preveri\s+raje\s+(.+)/i,
];

export function detectFollowUp(text: string): {
  matched: boolean;
  query: string;
} {
  const trimmed = text.trim();
  if (!trimmed) return { matched: false, query: "" };

  for (const pattern of FOLLOW_UP_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return { matched: true, query: match[1].trim().replace(/[.?!]+$/, "") };
    }
  }

  return { matched: false, query: "" };
}

const QUESTION_SHAPE =
  /\?|\b(povej|preveri|poi(?:s|š)[cč]i|who|kdo|what|kaj|koliko|kateri|which|how|why|kdaj|when|where|a je)\b/i;
const BANTER =
  /\b(punca|punco|punce|girlfriend|boyfriend|moj fant|moja zena|my wife|sala)\b/;
const CHECKABLE_ASK =
  /\b(povej|preveri|poi(?:s|š)[cč]i|who|kdo|koliko|kateri|which|how many|predsednik|leta|kaj)\b/;

export function looksLikeAddressedQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const n = normalizeSpeech(trimmed);
  if (!QUESTION_SHAPE.test(n) && !/\?/.test(trimmed)) return false;
  if (BANTER.test(n) && !CHECKABLE_ASK.test(n) && !hasProperName(trimmed)) {
    return false;
  }
  return true;
}

function hasProperName(text: string): boolean {
  return /[A-ZČŠŽ][a-zčšž]+(?:\s+[A-ZČŠŽ][a-zčšž]+)+/.test(text);
}
