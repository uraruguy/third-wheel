import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatSpeakerTranscript,
  pruneTranscript,
  recentSpeechWindow,
  topicSummary,
  topicWindow,
} from "../lib/transcript-window";
import type { TranscriptUtterance } from "../lib/types";

function utterance(
  speaker: string,
  text: string,
  endMs: number,
  startMs = endMs - 1000,
): TranscriptUtterance {
  return { speaker, text, language: "en", startMs, endMs };
}

describe("transcript windowing", () => {
  const now = 10 * 60 * 1000;
  const items = [
    utterance("1", "old small talk", 10_000),
    utterance("1", "four minutes ago weather chat", now - 240_000),
    utterance("1", "we mentioned Triglav", now - 60_000),
    utterance("2", "what is the height again", now - 12_000),
    utterance("1", "I think 2500 maybe", now - 3000),
  ];

  it("drops utterances older than five minutes", () => {
    const kept = pruneTranscript(items, now);
    assert.equal(kept.some((item) => item.text.includes("old small talk")), false);
    assert.equal(kept.some((item) => item.text.includes("Triglav")), true);
  });

  it("keeps about 20 seconds of new speech for Jev", () => {
    const recent = recentSpeechWindow(items, now);
    assert.match(recent, /height again/);
    assert.match(recent, /2500 maybe/);
    assert.doesNotMatch(recent, /Triglav/);
    assert.match(recent, /Speaker 2/);
  });

  it("builds a 90 second topic window for the speak model", () => {
    const window = topicWindow(items, now);
    assert.match(window, /Triglav/);
    assert.match(window, /2500 maybe/);
  });

  it("compresses 2–3 minutes into a short topic summary", () => {
    const summary = topicSummary(items, now);
    assert.match(summary, /Speakers:/);
    assert.match(summary, /Triglav/);
  });

  it("formats speaker labels", () => {
    assert.equal(
      formatSpeakerTranscript([utterance("3", "hello", 1)]),
      "Speaker 3: hello",
    );
  });
});
