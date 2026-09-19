import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isNoSpeakPrefix, parseSpeakResponse, replyDriftsFromContext } from "../lib/no-speak";

describe("NO_SPEAK parsing", () => {
  it("treats exact NO_SPEAK as silence", () => {
    assert.deepEqual(parseSpeakResponse("NO_SPEAK"), { speak: false });
    assert.deepEqual(parseSpeakResponse("  no_speak.  "), { speak: false });
  });

  it("parses spoken lines and source URLs", () => {
    const parsed = parseSpeakResponse(
      "Triglav is 2864 metres high.\n\nSOURCES:\n- https://en.wikipedia.org/wiki/Triglav\n",
    );
    assert.equal(parsed.speak, true);
    if (!parsed.speak) return;
    assert.match(parsed.text, /2864/);
    assert.equal(parsed.sources[0]?.url, "https://en.wikipedia.org/wiki/Triglav");
  });

  it("parses JSON with null or NO_SPEAK text", () => {
    assert.deepEqual(parseSpeakResponse(JSON.stringify({ text: "NO_SPEAK" })), {
      speak: false,
    });
    assert.deepEqual(parseSpeakResponse(JSON.stringify({ speak: false })), {
      speak: false,
    });
  });

  it("parses JSON spoken replies with sources", () => {
    const parsed = parseSpeakResponse(
      JSON.stringify({
        text: "Ljubljana is the capital of Slovenia.",
        sources: [{ title: "Britannica", url: "https://www.britannica.com/place/Ljubljana" }],
      }),
    );
    assert.equal(parsed.speak, true);
    if (!parsed.speak) return;
    assert.match(parsed.text, /Ljubljana/);
    assert.equal(parsed.sources.length, 1);
  });

  it("detects NO_SPEAK from a streaming prefix", () => {
    assert.equal(isNoSpeakPrefix(""), null);
    assert.equal(isNoSpeakPrefix("NO"), null);
    assert.equal(isNoSpeakPrefix("NO_SPEAK"), true);
    assert.equal(isNoSpeakPrefix("Triglav is"), false);
  });

  it("treats a topic-changing reply as drift that must NO_SPEAK", () => {
    const drifted = replyDriftsFromContext({
      reply: "You should change the button color to blue.",
      latestSpeech: "What are you talking about, Third Wheel?",
      lastSpokenTurn: "The United States is a country in North America.",
    });
    const onTopic = replyDriftsFromContext({
      reply: "I meant the United States is a country in North America.",
      latestSpeech: "What are you talking about, Third Wheel?",
      lastSpokenTurn: "The United States is a country in North America.",
    });
    assert.equal(drifted, true);
    assert.equal(onTopic, false);
  });

  it("treats kaj je to as a request to stay on the last claim", () => {
    const drifted = replyDriftsFromContext({
      reply: "Blue would look better on that button.",
      latestSpeech: "kaj je to?",
      lastSpokenTurn: "The United States is a country in North America.",
    });
    const onTopic = replyDriftsFromContext({
      reply: "I was talking about the United States in North America.",
      latestSpeech: "kaj je to?",
      lastSpokenTurn: "The United States is a country in North America.",
    });
    assert.equal(drifted, true);
    assert.equal(onTopic, false);
  });

  it("treats a new subject as the current topic, not the last spoken turn", () => {
    const gluedToFrance = replyDriftsFromContext({
      reply: "Govoril sem o Françoisu Hollandu, ki je bil takrat predsednik.",
      latestSpeech: "Ne vem, enkrat so mu nekaj sodili, samo ne vem.",
      priorUtterance: "A je on sploh bil obsojen? Da je Mark Zuckerberg en navaden.",
      lastSpokenTurn:
        "Leta 2014 je bil predsednik Francije François Hollande.",
    });
    const onZuckerberg = replyDriftsFromContext({
      reply: "Mark Zuckerberg ni bil kazensko obsojen, čeprav so mu sodili v civilnih zadevah.",
      latestSpeech: "Ne vem, enkrat so mu nekaj sodili, samo ne vem.",
      priorUtterance: "A je on sploh bil obsojen? Da je Mark Zuckerberg en navaden.",
      lastSpokenTurn:
        "Leta 2014 je bil predsednik Francije François Hollande.",
    });
    assert.equal(gluedToFrance, true);
    assert.equal(onZuckerberg, false);
  });
});
