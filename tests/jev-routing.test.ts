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

  it("always speaks when Jev marks addressed", () => {
    const decision = routeJevDecision({
      answers: answers({ shouldSpeak: 0.2, mode: "addressed", needsWeb: 0.3 }),
      addressed: false,
      inConversation: false,
    });
    assert.equal(decision.speak, true);
    assert.equal(decision.mode, "addressed");
  });

  it("uses a high bar for unsolicited correction", () => {
    const weak = routeJevDecision({
      answers: answers({ shouldSpeak: 0.6, mode: "correction", needsWeb: 0.9 }),
      addressed: false,
      inConversation: false,
    });
    const strong = routeJevDecision({
      answers: answers({ shouldSpeak: 0.9, mode: "correction", needsWeb: 0.9 }),
      addressed: false,
      inConversation: false,
    });
    assert.equal(weak.speak, false);
    assert.equal(strong.speak, true);
    assert.equal(strong.mode, "correction");
  });

  it("stays silent when they are debating or stating a wrong fact on purpose", () => {
    const decision = routeJevDecision({
      answers: answers({
        shouldSpeak: 0.9,
        mode: "correction",
        needsWeb: 0.9,
        isDebate: 0.8,
      }),
      addressed: false,
      inConversation: false,
    });
    assert.equal(decision.speak, false);
    assert.equal(decision.reason, "debate");
  });

  it("raises the correction bar during debate and only speaks at 0.93+", () => {
    const almost = routeJevDecision({
      answers: answers({
        shouldSpeak: 0.92,
        mode: "correction",
        needsWeb: 0.9,
        isDebate: 0.6,
      }),
      addressed: false,
      inConversation: false,
    });
    const over = routeJevDecision({
      answers: answers({
        shouldSpeak: 0.94,
        mode: "correction",
        needsWeb: 0.9,
        isDebate: 0.6,
      }),
      addressed: false,
      inConversation: false,
    });
    assert.equal(almost.speak, false);
    assert.equal(almost.reason, "debate");
    assert.equal(over.speak, true);
    assert.equal(over.reason, "correction-despite-debate");
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
