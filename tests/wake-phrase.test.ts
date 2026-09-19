import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectFollowUp,
  detectWakePhrase,
  normalizeSpeech,
  planUtterance,
} from "../lib/wake-phrase";

describe("wake phrase detection", () => {
  it("matches hey third wheel on partial tokens", () => {
    const result = detectWakePhrase("hey third wheel what is the capital");
    assert.equal(result.matched, true);
    assert.equal(result.phrase, "hey third wheel");
    assert.equal(result.remainder, "what is the capital");
    assert.equal(result.nameOnly, false);
  });

  it("matches third wheel without hey", () => {
    const result = detectWakePhrase("Third Wheel, how tall is Triglav?");
    assert.equal(result.matched, true);
    assert.equal(result.phrase, "third wheel");
    assert.match(result.remainder, /how tall is triglav/);
  });

  it("matches the name at the end of a sentence", () => {
    const result = detectWakePhrase("What are you talking about, Third Wheel?");
    assert.equal(result.matched, true);
    assert.equal(result.nameOnly, false);
    assert.match(result.remainder, /what are you talking about/);
  });

  it("matches hej third wheel", () => {
    const result = detectWakePhrase("hej third wheel, poišči vreme");
    assert.equal(result.matched, true);
    assert.equal(result.phrase, "hej third wheel");
  });

  it("treats a bare name as name-only", () => {
    const result = detectWakePhrase("Third Wheel?");
    assert.equal(result.matched, true);
    assert.equal(result.nameOnly, true);
  });

  it("does not match third alone", () => {
    const result = detectWakePhrase("the third option is better");
    assert.equal(result.matched, false);
  });

  it("does not treat meta talk about him joining as a name-call", () => {
    const result = detectWakePhrase(
      "Dajmo zdaj še malo nadaljevat, da vidimo, če bo sam on.",
    );
    assert.equal(result.matched, false);
    assert.equal(
      planUtterance({
        text: "Dajmo zdaj še malo nadaljevat, da vidimo, če bo sam on.",
        lastSpokenText: "Da, Elon Musk je trenutno najbogatejši človek na svetu.",
        pendingNameOnly: false,
        isEcho: false,
      }).action,
      "jev",
    );
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

describe("addressed routing after he speaks", () => {
  const lastSpoken = "The United States is a country in North America.";

  it("does not drop a name-call after TTS because of echo/cooldown", () => {
    const plan = planUtterance({
      text: "What are you talking about, Third Wheel?",
      lastSpokenText: lastSpoken,
      pendingNameOnly: false,
      isEcho: false,
    });
    assert.equal(plan.action, "speak-addressed");
    if (plan.action !== "speak-addressed") return;
    assert.match(plan.question, /what are you talking about/);
  });

  it("still answers a name-call even if STT looks a bit like echo", () => {
    const plan = planUtterance({
      text: "What are you talking about, Third Wheel?",
      lastSpokenText: lastSpoken,
      pendingNameOnly: false,
      isEcho: true,
    });
    assert.equal(plan.action, "speak-addressed");
  });

  it("waits for the next utterance when they only said the name", () => {
    const wait = planUtterance({
      text: "hey third wheel",
      lastSpokenText: lastSpoken,
      pendingNameOnly: false,
      isEcho: false,
    });
    assert.equal(wait.action, "wait-for-question");

    const next = planUtterance({
      text: "kaj je to?",
      lastSpokenText: lastSpoken,
      pendingNameOnly: true,
      isEcho: false,
    });
    assert.equal(next.action, "speak-addressed");
    if (next.action !== "speak-addressed") return;
    assert.match(next.question, /kaj je to/i);
  });

  it("ignores his own TTS echo when they did not call him", () => {
    const plan = planUtterance({
      text: lastSpoken,
      lastSpokenText: lastSpoken,
      pendingNameOnly: false,
      isEcho: true,
    });
    assert.equal(plan.action, "ignore-echo");
  });
});
