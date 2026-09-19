const WAKE_PHRASES = [
  "hey third wheel",
  "hej third wheel",
  "third wheel",
] as const;

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
  phrase?: (typeof WAKE_PHRASES)[number];
} {
  const normalized = normalizeSpeech(text);
  if (!normalized) {
    return { matched: false, remainder: "" };
  }

  for (const phrase of WAKE_PHRASES) {
    const index = normalized.indexOf(phrase);
    if (index === -1) continue;
    const remainder = `${normalized.slice(0, index)} ${normalized.slice(index + phrase.length)}`
      .replace(/\s+/g, " ")
      .trim();
    return { matched: true, remainder, phrase };
  }

  return { matched: false, remainder: normalized };
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
