import type { Source } from "./types";

export type SpeakParse =
  | { speak: false }
  | { speak: true; text: string; sources: Source[] };

const URL_PATTERN = /https?:\/\/[^\s)\]>'"]+/gi;

export function isNoSpeakPrefix(buffered: string): boolean | null {
  const trimmed = buffered.trimStart();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) return null;

  const needle = "NO_SPEAK";
  const head = trimmed.slice(0, needle.length).toUpperCase();
  if (needle.startsWith(head) && head.length < needle.length) return null;
  return head.startsWith(needle);
}

export function parseSpeakResponse(raw: string): SpeakParse {
  const trimmed = raw.trim();
  if (!trimmed) return { speak: false };

  if (trimmed.startsWith("{")) {
    try {
      return parseJsonSpeak(JSON.parse(trimmed));
    } catch {
      // Fall through to plain-text parsing.
    }
  }

  if (trimmed.toUpperCase().startsWith("NO_SPEAK")) {
    return { speak: false };
  }

  const split = splitSources(stripSpeakLabel(trimmed));
  const text = split.text.trim();
  if (!text || text.toUpperCase() === "NO_SPEAK") return { speak: false };
  return { speak: true, text, sources: split.sources };
}

function parseJsonSpeak(value: unknown): SpeakParse {
  if (!value || typeof value !== "object") return { speak: false };
  const record = value as Record<string, unknown>;

  if (record.speak === false || record.no_speak === true) {
    return { speak: false };
  }

  const textValue =
    (typeof record.text === "string" && record.text) ||
    (typeof record.spoken === "string" && record.spoken) ||
    (typeof record.speech === "string" && record.speech) ||
    "";

  if (!textValue || textValue.trim().toUpperCase() === "NO_SPEAK") {
    return { speak: false };
  }

  const sources = Array.isArray(record.sources)
    ? record.sources.flatMap(sourceFromUnknown)
    : [];

  return { speak: true, text: textValue.trim(), sources };
}

function stripSpeakLabel(text: string): string {
  return text.replace(/^(SPEAK|REPLY)\s*:\s*/i, "");
}

function splitSources(text: string): { text: string; sources: Source[] } {
  const marker = text.search(/\n\s*SOURCES\s*:/i);
  const body = marker === -1 ? text : text.slice(0, marker);
  const rest = marker === -1 ? text : text.slice(marker);

  const urls = [...rest.matchAll(URL_PATTERN)].map((match) =>
    sanitizeUrl(match[0]),
  );
  const unique = uniqueSources(
    urls.filter(Boolean).map((url) => ({ title: hostname(url), url })),
  );

  const spoken = body
    .replace(URL_PATTERN, "")
    .replace(/\n{2,}/g, "\n")
    .trim();

  return { text: spoken, sources: unique };
}

export function sourcesFromAnnotations(annotations: unknown): Source[] {
  if (!Array.isArray(annotations)) return [];
  const sources: Source[] = [];
  for (const item of annotations) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const citation =
      record.url_citation && typeof record.url_citation === "object"
        ? (record.url_citation as Record<string, unknown>)
        : record;
    const url = typeof citation.url === "string" ? sanitizeUrl(citation.url) : "";
    if (!url) continue;
    const title =
      (typeof citation.title === "string" && citation.title) || hostname(url);
    sources.push({ title, url });
  }
  return uniqueSources(sources);
}

export function uniqueSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const source of sources) {
    const url = sanitizeUrl(source.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ title: source.title || hostname(url), url });
  }
  return out;
}

function sourceFromUnknown(value: unknown): Source[] {
  if (typeof value === "string") {
    const url = sanitizeUrl(value);
    return url ? [{ title: hostname(url), url }] : [];
  }
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const url =
    (typeof record.url === "string" && record.url) ||
    (typeof record.href === "string" && record.href) ||
    "";
  const cleaned = sanitizeUrl(url);
  if (!cleaned) return [];
  const title =
    (typeof record.title === "string" && record.title) || hostname(cleaned);
  return [{ title, url: cleaned }];
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url.replace(/[.,;]+$/, ""));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
