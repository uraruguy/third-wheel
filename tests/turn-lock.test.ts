import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  actionForIncoming,
  commitSpoken,
  looksLikeLanguageSwitchJunk,
  spokenAfterInterrupt,
} from "../lib/turn-lock";

describe("in-flight turn lock", () => {
  it("drops a second lookup while a turn is in flight", () => {
    assert.equal(actionForIncoming(true, "jev"), "drop");
    assert.equal(actionForIncoming(true, "followup"), "drop");
    assert.equal(actionForIncoming(false, "jev"), "start");
  });

  it("lets a name-call barge and replace the in-flight turn", () => {
    assert.equal(actionForIncoming(true, "name-call"), "barge");
    assert.equal(actionForIncoming(false, "name-call"), "start");
  });

  it("drops a language-switch lookup while an addressed turn is still pending", () => {
    const junk = "Hey, I want you to make a model that is really extremely fragile.";
    const anchor =
      "Povej, hej Third Wheel, povej mi, koliko je ocenjena premoženje Janija Pravdiča iz Ljubljane.";
    assert.equal(
      actionForIncoming(true, "jev", {
        inFlightMode: "addressed",
        text: junk,
        anchorText: anchor,
        protectLookups: true,
      }),
      "drop",
    );
    assert.equal(
      actionForIncoming(false, "jev", {
        text: junk,
        anchorText: anchor,
        protectLookups: true,
      }),
      "drop",
    );
    assert.equal(looksLikeLanguageSwitchJunk(junk, anchor), true);
    assert.equal(
      looksLikeLanguageSwitchJunk(
        "Ja, jaz mislim, da je bil 10. leta 2017 v Jugoslaviji.",
        anchor,
      ),
      false,
    );
  });

  it("keeps committed spoken text after barge or stop", () => {
    const spoken = commitSpoken(null, {
      text: "Leta 2014 je bila predsednica vlade Alenka Bratušek.",
      mode: "lookup",
      sources: [{ title: "gov.si", url: "https://www.gov.si/" }],
    });
    assert.ok(spoken);
    assert.equal(spokenAfterInterrupt(spoken), spoken);
    assert.equal(
      commitSpoken(spoken, { text: "", mode: "lookup" })?.text,
      spoken.text,
    );
    assert.equal(spokenAfterInterrupt(spoken)?.sources[0]?.url, "https://www.gov.si/");
  });
});
