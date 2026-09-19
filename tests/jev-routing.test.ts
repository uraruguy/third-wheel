import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { routeJevDecision } from "../lib/jev-routing";
import type { JevAnswers, SpeakMode } from "../lib/types";

function answers(partial: Partial<JevAnswers> & { mode: SpeakMode }): JevAnswers {
  return {
    shouldSpeak: 0,
    needsWeb: 0,
    isDebate: 0,
    ...partial,
  };
}

describe("Jev threshold routing", () => {
  it("always speaks when addressed by wake phrase", () => {
    const decision = routeJevDecision({
      answers: answers({ shouldSpeak: 0.1, mode: "silent" }),
      addressed: true,
      inConversation: false,
    });
    assert.equal(decision.speak, true);
    assert.equal(decision.mode, "addressed");
  });

  it("does not speak when Jev marks addressed without a name-call", () => {
    const decision = routeJevDecision({
      answers: answers({
        shouldSpeak: 0.7,
        mode: "addressed",
        needsWeb: 0.74,
        isDebate: 0.79,
      }),
      addressed: false,
      inConversation: true,
    });
    assert.equal(decision.speak, false);
    assert.equal(decision.reason, "meta-not-addressed");
  });

  it("speaks a correction at shouldSpeak 0.55 and stays quiet below 0.5", () => {
    const weak = routeJevDecision({
      answers: answers({ shouldSpeak: 0.4, mode: "correction", needsWeb: 0.9 }),
      addressed: false,
      inConversation: false,
    });
    const mid = routeJevDecision({
      answers: answers({ shouldSpeak: 0.55, mode: "correction", needsWeb: 0.9 }),
      addressed: false,
      inConversation: false,
    });
    assert.equal(weak.speak, false);
    assert.equal(mid.speak, true);
    assert.equal(mid.mode, "correction");
    assert.equal(mid.reason, "correction-high-bar");
  });

  it("corrects a joking false world fact even when Jev marks debate", () => {
    const decision = routeJevDecision({
      answers: answers({
        shouldSpeak: 0.11,
        mode: "correction",
        needsWeb: 0.15,
        isDebate: 0.86,
      }),
      addressed: false,
      inConversation: false,
      latestSpeech: "Elon Musk je najrevnejši.",
      recentSpeech: "Speaker 1: Elon Musk je najrevnejši.",
    });
    assert.equal(decision.speak, true);
    assert.equal(decision.mode, "correction");
    assert.equal(decision.reason, "correction-world-fact");
  });

  it("stays silent when both sides of the fact are already on the table", () => {
    const decision = routeJevDecision({
      answers: answers({
        shouldSpeak: 0.9,
        mode: "correction",
        needsWeb: 0.9,
        isDebate: 0.8,
      }),
      addressed: false,
      inConversation: false,
      latestSpeech: "Elon je najbogatejši.",
      recentSpeech:
        "Speaker 1: Elon je najrevnejši.\nSpeaker 2: Ne, Elon je najbogatejši.",
    });
    assert.equal(decision.speak, false);
    assert.equal(decision.reason, "debate");
  });

  it("stays silent when they self-correct in the same line", () => {
    const decision = routeJevDecision({
      answers: answers({
        shouldSpeak: 0.11,
        mode: "correction",
        needsWeb: 0.15,
        isDebate: 0.86,
      }),
      addressed: false,
      inConversation: false,
      latestSpeech:
        "Elon Musk je najrevnejša oseba, aha, popravek: v bistvu je zelo bogat.",
    });
    assert.equal(decision.speak, false);
    assert.equal(decision.reason, "self-corrected");
  });

  it("does not use Jev is_debate alone to silence a mid-confidence correction", () => {
    const decision = routeJevDecision({
      answers: answers({
        shouldSpeak: 0.61,
        mode: "correction",
        needsWeb: 0.7,
        isDebate: 0.8,
      }),
      addressed: false,
      inConversation: false,
      latestSpeech: "Ja, jaz mislim, da je bil 10. leta 2017 v Jugoslaviji.",
    });
    assert.equal(decision.speak, true);
    assert.equal(decision.mode, "correction");
    assert.equal(decision.reason, "correction-world-fact");
  });

  it("corrects a Tito claim even when the line is a question", () => {
    const decision = routeJevDecision({
      answers: answers({
        shouldSpeak: 0.67,
        mode: "correction",
        needsWeb: 0.6,
        isDebate: 0.4,
      }),
      addressed: false,
      inConversation: false,
      latestSpeech: "Je bil Tito?",
    });
    assert.equal(decision.speak, true);
    assert.equal(decision.reason, "correction-world-fact");
  });

  it("still corrects a genuine false claim treated as true", () => {
    const decision = routeJevDecision({
      answers: answers({
        shouldSpeak: 0.9,
        mode: "correction",
        needsWeb: 0.9,
        isDebate: 0.1,
      }),
      addressed: false,
      inConversation: false,
    });
    assert.equal(decision.speak, true);
    assert.equal(decision.mode, "correction");
  });

  it("uses a lower bar when they do not know a number", () => {
    const decision = routeJevDecision({
      answers: answers({ shouldSpeak: 0.29, mode: "lookup", needsWeb: 0.8 }),
      addressed: false,
      inConversation: false,
    });
    assert.equal(decision.speak, true);
    assert.equal(decision.mode, "lookup");
    assert.equal(decision.useWeb, true);
  });

  it("stays silent below lookup threshold and for silent mode", () => {
    const lowLookup = routeJevDecision({
      answers: answers({ shouldSpeak: 0.2, mode: "lookup", needsWeb: 1 }),
      addressed: false,
      inConversation: false,
    });
    const silent = routeJevDecision({
      answers: answers({ shouldSpeak: 0.99, mode: "silent", needsWeb: 1 }),
      addressed: false,
      inConversation: false,
    });
    assert.equal(lowLookup.speak, false);
    assert.equal(silent.speak, false);
  });

  it("allows follow-up during the in-conversation window", () => {
    const decision = routeJevDecision({
      answers: answers({ shouldSpeak: 0.45, mode: "followup", needsWeb: 0.7 }),
      addressed: false,
      inConversation: true,
    });
    assert.equal(decision.speak, true);
    assert.equal(decision.mode, "followup");
  });
});
