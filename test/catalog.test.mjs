import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCourseblock, prefixesOnPage, catalogYearOf } from "../dist/catalog.js";
import { CATALOG_PAGES } from "../dist/catalog-pages.js";

const page = readFileSync(new URL("./fixtures/catalog-page.html", import.meta.url), "utf8");

test("parses units+semesters", () => {
  const c = parseCourseblock(page, "15999");
  assert.equal(c.code, "15-999");
  assert.equal(c.title, "Imaginary Systems");
  assert.equal(c.semesters_offered, "Fall and Spring");
  assert.equal(c.units, "12 units");
  assert.equal(c.description, "A course about imaginary systems. It prepares students for 15-998.");
});

test("prereq/coreq/website lines", () => {
  const c = parseCourseblock(page, "15-999");
  assert.equal(c.prerequisites, "(15-112 Min. grade C or 02-120) and 21-127");
  assert.deepEqual(c.prerequisite_courses, ["15-112", "02-120", "21-127"]);
  assert.equal(c.corequisites, "21-128");
  assert.equal(c.course_website, "https://example.edu/~15999");
});

test("no units line", () => {
  const c = parseCourseblock(page, "15-998");
  assert.equal(c.semesters_offered, "Intermittent");
  assert.equal(c.units, null);
  assert.equal(c.prerequisites, null);
  assert.equal(parseCourseblock(page, "05-999").units, "6-12 units");
  assert.equal(parseCourseblock(page, "05-999").prerequisites, "15-999");
});

test("absent course is null", () => {
  assert.equal(parseCourseblock(page, "15-123"), null);
});

test("prefixesOnPage and catalogYearOf", () => {
  assert.deepEqual(prefixesOnPage(page), ["05", "15"]);
  assert.equal(catalogYearOf(page), "2026-2027");
});

test("CATALOG_PAGES maps CS to the SCS page via allowed paths only", () => {
  assert.ok(CATALOG_PAGES["15"].some((p) => p.includes("schoolofcomputerscience")));
  for (const paths of Object.values(CATALOG_PAGES)) {
    for (const p of paths) assert.match(p, /^\/(schools-colleges|aboutcmu|intercollegeprograms)\/.*courses\/$/);
  }
});
