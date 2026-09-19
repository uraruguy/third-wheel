import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { routeJevDecision } from "../lib/jev-routing";

describe("Jev threshold routing", () => {
  it("always speaks when addressed by wake phrase", () => {
    const decision = routeJevDecision({
      answers: { shouldSpeak: 0.1, mode: "silent", needsWeb: 0 },
      addressed: true,
      inConversation: false,
    });
    assert.equal(decision.speak, true);
    assert.equal(decision.mode, "addressed");
  });

  it("always speaks when Jev marks addressed", () => {
    const decision = routeJevDecision({
      answers: { shouldSpeak: 0.2, mode: "addressed", needsWeb: 0.3 },
      addressed: false,
      inConversation: false,
    });
    assert.equal(decision.speak, true);
    assert.equal(decision.mode, "addressed");
  });

  it("uses a high bar for unsolicited correction", () => {
    const weak = routeJevDecision({
      answers: { shouldSpeak: 0.6, mode: "correction", needsWeb: 0.9 },
      addressed: false,
      inConversation: false,
    });
    const strong = routeJevDecision({
      answers: { shouldSpeak: 0.9, mode: "correction", needsWeb: 0.9 },
      addressed: false,
      inConversation: false,
    });
    assert.equal(weak.speak, false);
    assert.equal(strong.speak, true);
    assert.equal(strong.mode, "correction");
  });

  it("uses a lower bar when they do not know a number", () => {
    const decision = routeJevDecision({
      answers: { shouldSpeak: 0.29, mode: "lookup", needsWeb: 0.8 },
      addressed: false,
      inConversation: false,
    });
    assert.equal(decision.speak, true);
    assert.equal(decision.mode, "lookup");
    assert.equal(decision.useWeb, true);
  });

  it("stays silent below lookup threshold and for silent mode", () => {
    const lowLookup = routeJevDecision({
      answers: { shouldSpeak: 0.2, mode: "lookup", needsWeb: 1 },
      addressed: false,
      inConversation: false,
    });
    const silent = routeJevDecision({
      answers: { shouldSpeak: 0.99, mode: "silent", needsWeb: 1 },
      addressed: false,
      inConversation: false,
    });
    assert.equal(lowLookup.speak, false);
    assert.equal(silent.speak, false);
  });

  it("allows follow-up during the in-conversation window", () => {
    const decision = routeJevDecision({
      answers: { shouldSpeak: 0.45, mode: "followup", needsWeb: 0.7 },
      addressed: false,
      inConversation: true,
    });
    assert.equal(decision.speak, true);
    assert.equal(decision.mode, "followup");
  });
});
