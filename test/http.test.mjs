import { test } from "node:test";
import assert from "node:assert/strict";
import { TtlCache } from "../dist/http.js";

test("TtlCache returns a value until its TTL passes", () => {
  let now = 1000;
  const cache = new TtlCache(() => now);
  cache.set("k", "v", 500);
  assert.equal(cache.get("k"), "v");
  now = 1499;
  assert.equal(cache.get("k"), "v");
  now = 1500;
  assert.equal(cache.get("k"), undefined);
});

test("TtlCache keeps keys independent", () => {
  const cache = new TtlCache(() => 0);
  cache.set("a", 1, 10);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);
});
