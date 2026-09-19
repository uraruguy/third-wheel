import {
  BUFFER_MAX_MS,
  RECENT_SPEECH_MS,
  TOPIC_SUMMARY_MS,
  TOPIC_WINDOW_MS,
} from "./constants";
import type { TranscriptUtterance } from "./types";

export function pruneTranscript(
  utterances: TranscriptUtterance[],
  nowMs: number,
  maxAgeMs = BUFFER_MAX_MS,
): TranscriptUtterance[] {
  const cutoff = nowMs - maxAgeMs;
  return utterances.filter((item) => item.endMs >= cutoff);
}

export function sliceByDuration(
  utterances: TranscriptUtterance[],
  nowMs: number,
  durationMs: number,
): TranscriptUtterance[] {
  const cutoff = nowMs - durationMs;
  return utterances.filter((item) => item.endMs >= cutoff);
}

export function formatSpeakerTranscript(
  utterances: TranscriptUtterance[],
): string {
  return utterances
    .map((item) => {
      const label = item.speaker ? `Speaker ${item.speaker}` : "Speaker";
      return `${label}: ${item.text}`;
    })
    .join("\n")
    .trim();
}

export function recentSpeechWindow(
  utterances: TranscriptUtterance[],
  nowMs: number,
  durationMs = RECENT_SPEECH_MS,
): string {
  return formatSpeakerTranscript(sliceByDuration(utterances, nowMs, durationMs));
}

export function topicWindow(
  utterances: TranscriptUtterance[],
  nowMs: number,
  durationMs = TOPIC_WINDOW_MS,
): string {
  return formatSpeakerTranscript(sliceByDuration(utterances, nowMs, durationMs));
}

export function topicSummary(
  utterances: TranscriptUtterance[],
  nowMs: number,
  durationMs = TOPIC_SUMMARY_MS,
): string {
  const window = sliceByDuration(utterances, nowMs, durationMs);
  if (window.length === 0) return "";

  const speakers = new Set(window.map((item) => item.speaker || "?"));
  const last = window.slice(-6);
  const lines = last.map((item) => {
    const label = item.speaker ? `S${item.speaker}` : "S";
    return `${label}: ${item.text}`;
  });

  return [
    `Speakers: ${[...speakers].join(", ")}. Turns: ${window.length}.`,
    ...lines,
  ].join("\n");
}
