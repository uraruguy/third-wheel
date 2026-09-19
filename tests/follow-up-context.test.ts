import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { followUpContext } from "../lib/follow-up-context";
import { buildSpeakUserPrompt } from "../lib/openrouter";

describe("follow-up payload", () => {
  it("packs last spoken sentence, latest utterance, and 90s window", () => {
    const payload = followUpContext({
      lastSpokenTurn: "America is a continent-sized country in North America.",
      latestSpeech: "kaj je to?",
      topicWindow: "Speaker 1: wait that cannot be right\nSpeaker 2: kaj je to?",
    });
    assert.equal(payload.lastSpokenTurn.startsWith("America"), true);
    assert.equal(payload.latestSpeech, "kaj je to?");
    assert.match(payload.topicWindow, /cannot be right/);
  });

  it("puts that context into the speak prompt so the model cannot invent a new thread", () => {
    const prompt = buildSpeakUserPrompt({
      mode: "addressed",
      latestSpeech: "what are you talking about",
      lastSpokenTurn: "The United States is a country in North America.",
      topicWindow: "Speaker 1: America is a city\nSpeaker 2: no it is not",
    });
    assert.match(prompt, /United States/);
    assert.match(prompt, /what are you talking about/);
    assert.match(prompt, /90 seconds/);
    assert.doesNotMatch(prompt, /button color/);
  });

  it("makes the current utterance beat the previous Hollande turn", () => {
    const prompt = buildSpeakUserPrompt({
      mode: "lookup",
      latestSpeech: "A je on sploh bil obsojen?",
      lastSpokenTurn: "Leta 2014 je bil predsednik Francije François Hollande.",
      topicWindow:
        "Speaker 1: Da je Mark Zuckerberg en navaden\nSpeaker 2: A je on sploh bil obsojen?",
    });
    assert.match(prompt, /Current utterance/);
    assert.match(prompt, /Zuckerberg/);
    assert.match(prompt, /obsojen/);
    assert.match(prompt, /ignore unless they ask/);
    assert.match(prompt, /Hollande/);
  });
});
