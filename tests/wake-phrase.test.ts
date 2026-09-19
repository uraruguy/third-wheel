import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectFollowUp, detectWakePhrase, normalizeSpeech } from "../lib/wake-phrase";

describe("wake phrase detection", () => {
  it("matches hey third wheel on partial tokens", () => {
    const result = detectWakePhrase("hey third wheel what is the capital");
    assert.equal(result.matched, true);
    assert.equal(result.phrase, "hey third wheel");
    assert.equal(result.remainder, "what is the capital");
  });

  it("matches third wheel without hey", () => {
    const result = detectWakePhrase("Third Wheel, how tall is Triglav?");
    assert.equal(result.matched, true);
    assert.equal(result.phrase, "third wheel");
    assert.match(result.remainder, /how tall is triglav/);
  });

  it("matches hej third wheel", () => {
    const result = detectWakePhrase("hej third wheel, poišči vreme");
    assert.equal(result.matched, true);
    assert.equal(result.phrase, "hej third wheel");
  });

  it("does not match third alone", () => {
    const result = detectWakePhrase("the third option is better");
    assert.equal(result.matched, false);
  });

  it("normalizes punctuation and case", () => {
    assert.equal(normalizeSpeech("HEY, Third-Wheel!"), "hey third wheel");
    assert.equal(detectWakePhrase("HEY, Third-Wheel!").matched, true);
  });

  it("detects English and Slovenian barge-in follow-ups", () => {
    assert.deepEqual(detectFollowUp("search for Triglav height instead"), {
      matched: true,
      query: "Triglav height",
    });
    assert.equal(detectFollowUp("poišči raje višino Triglava").matched, true);
    assert.equal(detectFollowUp("just chatting about dinner").matched, false);
  });
});
