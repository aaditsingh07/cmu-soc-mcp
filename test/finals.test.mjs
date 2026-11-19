import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFinalsText, findFinals, titleCaseName } from "../dist/finals.js";

// Synthetic text in the shape of the registrar's PDFs (people and courses are made up).
const semesterPdf = [
  "Imaginary Department",
  "Course Sec Title Date Time (EST USA) Delivery Mode Assigned Exam Spaces Instructor(s)",
  "15999 1 IMAGINARY SYSTEMS Monday, December 7 08:30 a.m. - 11:30 a.m. In Person To Be Announced DOE JANE (jdoe), D'ANGELO MARK (mdangelo)",
  "15999 2 IMAGINARY SYSTEMS Monday, December 7 08:30 a.m. - 11:30 a.m. In Person DH B301 SMITH-JONES T. ANN (tasj)",
  "15777 B PHYSICS OF NOTHING Thursday, December 10 01:00 p.m. - 04:00 p.m. In Person To Be Announced ROSE, RITA (rrose2)",
  "15888 A ART OF THINGS Sunday, December 13 01:00 p.m. - 04:00 p.m. In Person CANCELED 21oct2026 ROE RICHARD (rroe)",
  "Fall 2026 Semester & Mini-2 Final Examination Schedule",
  "Notice: Before making travel arrangements, check with your teaching faculty for changes not reflected on this schedule. Teaching Assistants who grade must account for completing",
  "grading responsibilities before booking travel.",
  "University Registrar's Office Page 1 of 20 10/23/2026",
].join("\n");

const miniPdf = [
  "Fall 2026 Mini-1 Final Examination Schedule",
  "Saturday, October 10, 2026",
  "15777 A1 SHORT COURSE Saturday, October 10, 2026 08:30AM - 11:30AM In Person GHC 4307 POE ED (epoe)",
  "15777 41 SHORT COURSE Saturday, October 10, 2026 01:00PM - 04:00PM Remote Remote POE ED (epoe)",
  "University Registrar's Office 1 of 2 9/25/2026",
].join("\n");

const sem = parseFinalsText(semesterPdf);
const mini = parseFinalsText(miniPdf);

test("parses semester title", () => {
  assert.equal(sem.semester_name, "Fall 2026");
  assert.equal(sem.kind, "semester");
  assert.equal(mini.semester_name, "Fall 2026");
  assert.equal(mini.kind, "mini");
  assert.equal(parseFinalsText("no title here").semester_name, null);
});

test("skips noise lines", () => {
  assert.equal(sem.rows.length, 4);
  assert.equal(mini.rows.length, 2);
});

test("two time formats", () => {
  assert.equal(sem.rows[0].time, "08:30AM - 11:30AM");
  assert.equal(sem.rows[3].time, "01:00PM - 04:00PM");
  assert.equal(mini.rows[0].time, "08:30AM - 11:30AM");
});

test("dates gain the year from the title when the row omits it", () => {
  assert.equal(sem.rows[0].date, "December 7, 2026");
  assert.equal(sem.rows[0].day, "Monday");
  assert.equal(mini.rows[0].date, "October 10, 2026");
});

test("exam space and status", () => {
  assert.deepEqual([sem.rows[0].exam_space, sem.rows[0].status], ["To Be Announced", "room_tba"]);
  assert.deepEqual([sem.rows[1].exam_space, sem.rows[1].status], ["DH B301", "scheduled"]);
  assert.deepEqual([mini.rows[0].exam_space, mini.rows[0].status], ["GHC 4307", "scheduled"]);
});

test("a comma inside one instructor's name stays with that name", () => {
  const row = sem.rows.find((r) => r.course_number === "15-777");
  assert.equal(row.exam_space, "To Be Announced");
  assert.deepEqual(row.instructors, ["Rose, Rita"]);
});

test("canceled", () => {
  assert.equal(sem.rows[3].status, "canceled");
  assert.equal(sem.rows[3].exam_space, "CANCELED 21oct2026");
});

test("remote", () => {
  assert.equal(mini.rows[1].status, "remote");
  assert.equal(mini.rows[1].delivery_mode, "Remote");
});

test("multi instructor strips ids", () => {
  assert.deepEqual(sem.rows[0].instructors, ["Doe, Jane", "D'Angelo, Mark"]);
  assert.deepEqual(sem.rows[1].instructors, ["Smith-Jones, T. Ann"]);
  assert.ok(!JSON.stringify(sem.rows).includes("jdoe"));
  assert.equal(titleCaseName("MCMANUS JOEL"), "Mcmanus, Joel");
});

test("course and section fields", () => {
  assert.deepEqual(
    [sem.rows[0].course_number, sem.rows[0].section, sem.rows[0].title],
    ["15-999", "1", "IMAGINARY SYSTEMS"]
  );
});

test("lecture row covers recitation", () => {
  const rows = [...sem.rows, ...mini.rows];
  assert.deepEqual(findFinals(rows, "15999", "A", "Lec 1").map((r) => r.section), ["1"]);
  assert.deepEqual(findFinals(rows, "15999", "Lec 2", null).map((r) => r.section), ["2"]);
  assert.deepEqual(findFinals(rows, "15999", null, null).map((r) => r.section), ["1", "2"]);
  assert.deepEqual(findFinals(rows, "15777", "A1", null).map((r) => r.section), ["A1"]);
  assert.deepEqual(findFinals(rows, "15123", null, null), []);
});
