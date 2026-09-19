import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  actionForIncoming,
  commitSpoken,
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
