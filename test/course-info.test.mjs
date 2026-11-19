import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCourseDetail, courseNumbersIn } from "../dist/course-info.js";

const read = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const info = parseCourseDetail(read("course-detail.html"));
const summer = parseCourseDetail(read("course-detail-summer.html"));

test("parses dl fields", () => {
  assert.equal(info.title, "Imaginary Systems");
  assert.equal(info.semester_name, "Spring 2027");
  assert.equal(info.units, "12.0");
  assert.equal(info.description, "An imaginary course about imaginary systems & their invariants.");
  assert.equal(info.special_permission_required, false);
  assert.deepEqual(info.related_urls, ["https://example.edu/dept", "https://example.edu/~15999"]);
  assert.deepEqual(info.cross_listed, ["98-999"]); // the SOC lists a course as cross-listed with itself
});

test("prereq course list", () => {
  assert.deepEqual(info.prerequisites, {
    text: "(15112 or 02120) and 21127",
    courses: ["15-112", "02-120", "21-127"],
  });
  assert.deepEqual(info.corequisites, { text: "21128", courses: ["21-128"] });
  assert.equal(summer.prerequisites.text, null);
  assert.deepEqual(summer.prerequisites.courses, []);
});

test("notes are de-wrapped even mid-word", () => {
  assert.equal(
    info.notes,
    "Lecture 1 is reserved for first-year students in the imaginary college. If space remains, the waitlist will be worked for lecture 1."
  );
});

test("reservations", () => {
  assert.deepEqual(info.reservations, [{ section: "A", restriction: "Some reservations are for First-Year in SCS" }]);
});

test("sections nest and keep extra meetings", () => {
  assert.equal(info.sections.length, 1);
  assert.equal(info.sections[0].meetings.length, 2);
  assert.deepEqual(info.sections[0].subsections.map((s) => s.section), ["A"]);
});

test("summer columns are read by header", () => {
  assert.equal(summer.units, "12.0");
  assert.equal(summer.special_permission_required, true);
  assert.equal(summer.sections[0].section, "Lec 16");
  assert.equal(summer.sections[0].mini, 6);
  assert.equal(summer.sections[0].meetings[0].days, "MTWRF");
  assert.equal(summer.sections[0].subsections[0].section, "A6");
});

test("courseNumbersIn pulls 5-digit numbers", () => {
  assert.deepEqual(courseNumbersIn("15-112 or 15112, 21127"), ["15-112", "21-127"]);
});
