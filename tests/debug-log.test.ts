import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDebugAuthorized } from "../lib/debug-log";

describe("debug events auth", () => {
  it("rejects production GET without a secret", () => {
    const request = new Request("http://localhost/api/debug/events");
    assert.equal(
      isDebugAuthorized(request, { NODE_ENV: "production" }),
      false,
    );
  });

  it("accepts bearer or query secret", () => {
    const env = { DEBUG_LOG_SECRET: "test-secret", NODE_ENV: "production" };
    const bearer = new Request("http://localhost/api/debug/events", {
      headers: { authorization: "Bearer test-secret" },
    });
    const query = new Request(
      "http://localhost/api/debug/events?secret=test-secret",
    );
    const wrong = new Request("http://localhost/api/debug/events?secret=nope");
    assert.equal(isDebugAuthorized(bearer, env), true);
    assert.equal(isDebugAuthorized(query, env), true);
    assert.equal(isDebugAuthorized(wrong, env), false);
  });
});
