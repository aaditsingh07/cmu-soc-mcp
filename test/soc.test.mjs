import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseSemesters, parseDepartments, parseSearch, normalizeCourseNumber, formatCourseNumber,
  resolveSemesterIn, resolveDepartmentIn, filterCampus, matchSection,
} from "../dist/soc.js";

const page = readFileSync(new URL("./fixtures/search-page.html", import.meta.url), "utf8");
const results = readFileSync(new URL("./fixtures/search-results.html", import.meta.url), "utf8");
const parsed = parseSearch(results);
const byNumber = (n) => parsed.courses.filter((c) => c.course_number === n);

test("parseSemesters reads codes and names, newest first", () => {
  assert.deepEqual(parseSemesters(page), [
    { code: "S27", name: "Spring 2027", is_newest: true },
    { code: "F26", name: "Fall 2026", is_newest: false },
    { code: "M26", name: "Summer 2026", is_newest: false },
  ]);
});

test("parseDepartments reads code, name and prefix, skipping All", () => {
  const depts = parseDepartments(page);
  assert.equal(depts.length, 3);
  assert.deepEqual(depts[0], { code: "CS", name: "Computer Science", course_prefix: "15" });
  assert.equal(depts[2].name, "Electrical & Computer Engineering");
});

test("parseSearch reads the last-updated date", () => {
  assert.equal(parsed.last_updated, "Tue Nov 17, 2026");
});

test("parseSearch nests letters under Lec", () => {
  const [c] = byNumber("15-999");
  assert.equal(c.title, "Imaginary Systems");
  assert.equal(c.units, "12");
  assert.deepEqual(c.sections.map((s) => s.section), ["Lec 1", "Lec 2"]);
  assert.deepEqual(c.sections[0].subsections.map((s) => s.section), ["A", "B"]);
  assert.equal(c.sections[0].kind, "lecture");
  assert.equal(c.sections[0].subsections[0].kind, "section");
  assert.deepEqual(c.sections[1].subsections.map((s) => s.section), ["W"]);
});

test("blank section = extra meeting of the previous section", () => {
  const lec1 = byNumber("15-999")[0].sections[0];
  assert.equal(lec1.meetings.length, 2);
  assert.deepEqual(lec1.meetings[1], {
    days: "T", begin: "07:00PM", end: "08:20PM",
    teaching_location: "Pittsburgh, Pennsylvania", delivery_mode: "In-person Expectation",
  });
});

test("letter-only courses have top-level sections", () => {
  const [c] = byNumber("15-901");
  assert.deepEqual(c.sections.map((s) => s.section), ["A3", "B4"]);
  assert.equal(c.sections[0].subsections, undefined);
  assert.equal(c.title, "Short Topics & Things");
});

test("mini from suffix", () => {
  assert.deepEqual(byNumber("15-901")[0].sections.map((s) => s.mini), [3, 4]);
  const summer = byNumber("15-916")[0];
  assert.equal(summer.sections[0].section, "Lec 16");
  assert.equal(summer.sections[0].mini, 6);
  assert.equal(summer.sections[0].subsections[0].mini, 6);
  assert.equal(byNumber("15-999")[0].sections[0].mini, null);
});

test("duplicates: a number listed twice keeps both blocks", () => {
  assert.deepEqual(byNumber("15-988").map((c) => c.title), ["Special Topic: Alpha", "Special Topic: Beta"]);
  assert.equal(byNumber("15-988")[1].sections[0].meetings[0].days, "TBA");
});

test("filterCampus drops other-campus sections and empty courses", () => {
  const pgh = filterCampus(parsed.courses, "Pittsburgh");
  const c = pgh.find((x) => x.course_number === "15-999");
  assert.deepEqual(c.sections.map((s) => s.section), ["Lec 1"]);
  const doha = filterCampus(parsed.courses, "doha");
  assert.deepEqual(doha.map((x) => x.course_number), ["15-999"]);
  assert.equal(filterCampus(parsed.courses, "any").length, parsed.courses.length);
});

test("normalizeCourseNumber accepts 15-122/15122/cs 15-122", () => {
  for (const s of ["15-122", "15122", "15 122", "cs 15-122", " 15-122 A"]) {
    assert.equal(normalizeCourseNumber(s), "15122", s);
  }
  assert.equal(formatCourseNumber("15122"), "15-122");
  assert.throws(() => normalizeCourseNumber("122"), /5-digit/);
});

test("resolveSemester accepts Spring 2027/s27/summer 2026", () => {
  const sems = parseSemesters(page);
  assert.equal(resolveSemesterIn(sems, "Spring 2027").code, "S27");
  assert.equal(resolveSemesterIn(sems, "s27").code, "S27");
  assert.equal(resolveSemesterIn(sems, "summer 2026").code, "M26");
  assert.equal(resolveSemesterIn(sems, "fall 26").code, "F26");
  assert.throws(() => resolveSemesterIn(sems, "Fall 2030"), /S27 \(Spring 2027\)/);
});

test("resolveDepartment accepts CS/Computer Science/15", () => {
  const depts = parseDepartments(page);
  assert.equal(resolveDepartmentIn(depts, "cs").code, "CS");
  assert.equal(resolveDepartmentIn(depts, "Computer Science").code, "CS");
  assert.equal(resolveDepartmentIn(depts, "15").code, "CS");
  assert.equal(resolveDepartmentIn(depts, "math").code, "MSC");
  assert.throws(() => resolveDepartmentIn(depts, "e"), /ambiguous/);
  assert.throws(() => resolveDepartmentIn(depts, "Basket Weaving"), /list_departments/);
});

test("matchSection matches Lec 1 / 1 / lec1 / A", () => {
  const secs = byNumber("15-999")[0].sections;
  assert.deepEqual(matchSection(secs, "1").map((s) => s.section), ["Lec 1"]);
  assert.deepEqual(matchSection(secs, "lec1").map((s) => s.section), ["Lec 1"]);
  assert.deepEqual(matchSection(secs, "Lec 2").map((s) => s.section), ["Lec 2"]);
  assert.deepEqual(matchSection(secs, "b").map((s) => s.section), ["B"]);
  assert.deepEqual(matchSection(secs, "Z"), []);
});
