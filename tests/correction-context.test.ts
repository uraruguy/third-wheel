import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertsCheckableWorldFact } from "../lib/correction-context";

describe("checkable world-fact detector", () => {
  it("treats year plus place as a checkable fact", () => {
    assert.equal(assertsCheckableWorldFact("2017 v Jugoslaviji"), true);
    assert.equal(
      assertsCheckableWorldFact("Ja, jaz mislim, da je bil 10. leta 2017 v Jugoslaviji."),
      true,
    );
  });

  it("treats a single proper name even when the line has a question mark", () => {
    assert.equal(assertsCheckableWorldFact("Je bil Tito?"), true);
    assert.equal(assertsCheckableWorldFact("Je bil Tito, a ni bil?"), true);
  });

  it("still flags the Elon poorest joke", () => {
    assert.equal(assertsCheckableWorldFact("Elon Musk je najrevnejši."), true);
    assert.equal(
      assertsCheckableWorldFact(
        "Okay, jaz mislim, da je Elon Musk najrevnejši človek na svetu.",
      ),
      true,
    );
  });

  it("rejects a bare interrogative", () => {
    assert.equal(assertsCheckableWorldFact("kaj?"), false);
    assert.equal(assertsCheckableWorldFact("Kaj?"), false);
  });
});
