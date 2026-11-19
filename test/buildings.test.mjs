import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILDINGS, matchBuilding, isVirtualLocation, suggestBuildings, estimateWalk } from "../dist/buildings.js";

const code = (s) => matchBuilding(s)?.building.code;
const room = (s) => matchBuilding(s)?.room;

test("matchBuilding: SOC-style code + room", () => {
  assert.deepEqual([code("GHC 4401"), room("GHC 4401")], ["GHC", "4401"]);
  assert.deepEqual([code("DH A302"), room("DH A302")], ["DH", "A302"]);
  assert.deepEqual([code("BH A51"), room("BH A51")], ["BH", "A51"]);
  assert.deepEqual([code("3SC 265"), room("3SC 265")], ["3SC", "265"]);
  assert.deepEqual([code("weh 5421"), room("weh 5421")], ["WEH", "5421"]);
});

test("matchBuilding: names and nicknames", () => {
  assert.deepEqual([code("Gates 4401"), room("Gates 4401")], ["GHC", "4401"]);
  assert.deepEqual([code("Wean Hall 7500"), room("Wean Hall 7500")], ["WEH", "7500"]);
  assert.equal(code("Cohon Center"), "CUC");
  assert.equal(code("CUC McConomy"), "CUC");
  assert.equal(room("CUC McConomy"), "McConomy");
  assert.equal(code("Tepper Quad 1403"), "TEP");
  assert.equal(code("Hunt Library"), "HL");
  assert.equal(code("Elliot Dunlap Smith Hall"), "EDS");
  assert.equal(code("Margaret Morrison 103"), "MM");
  assert.equal(code("Hamerschlag Hall B103"), "HH");
  assert.equal(code("Hamburg Hall 1000"), "HBH");
  assert.equal(code("Nowhere Hall 12"), undefined);
});

test("virtual locations are not walkable", () => {
  for (const s of ["TBA", "DNM", "TBD", "Remote", "Online", "Off Campus", "OFF", "To Be Announced"]) {
    assert.ok(isVirtualLocation(s), s);
  }
  assert.ok(!isVirtualLocation("GHC 4401"));
});

test("off-campus buildings are flagged", () => {
  assert.equal(matchBuilding("PTC").building.off_campus, true);
  assert.equal(matchBuilding("2NB 1101").building.off_campus, true);
});

test("walk GHC->HL is a few minutes", () => {
  const w = estimateWalk(matchBuilding("GHC").building, matchBuilding("HL").building);
  assert.ok(w.approx_walk_minutes > 1 && w.approx_walk_minutes < 10, String(w.approx_walk_minutes));
  assert.equal(estimateWalk(matchBuilding("GHC").building, matchBuilding("GHC").building).approx_walk_minutes, 0);
});

test("suggestBuildings tolerates typos", () => {
  assert.ok(suggestBuildings("Ween Hall").includes("Wean Hall"));
});

test("every on-campus building has coordinates on the CMU campus", () => {
  for (const b of BUILDINGS.filter((b) => !b.off_campus)) {
    assert.ok(b.lat > 40.437 && b.lat < 40.45 && b.lon > -79.956 && b.lon < -79.935, b.code);
  }
  assert.ok(BUILDINGS.length >= 37);
});
