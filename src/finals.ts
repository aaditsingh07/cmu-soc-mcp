/**
 * CMU final exams, from the University Registrar's PDFs:
 *   https://www.cmu.edu/hub/docs/final-exams.pdf      "<Season> <Year> Semester & Mini-N Final Examination Schedule"
 *   https://www.cmu.edu/hub/docs/final-exam-mini.pdf  "<Season> <Year> Mini-N Final Examination Schedule"
 *
 * The URLs are reused every semester, so each PDF's title line (not its URL) says
 * which semester it covers. Only the current semester is ever published, and it
 * appears around week 6 — so for the semester a student is planning, finals are
 * usually not out yet, and this module says so instead of implying "no final".
 */

import { extractText, getDocumentProxy } from "unpdf";
import { HOUR, fetchBytes } from "./http.js";
import {
  departmentForCourse,
  formatCourseNumber,
  getDepartmentCourses,
  normalizeCourseNumber,
  resolveSemester,
} from "./soc.js";

export const FINALS_PDF_URLS = [
  "https://www.cmu.edu/hub/docs/final-exams.pdf",
  "https://www.cmu.edu/hub/docs/final-exam-mini.pdf",
];

export interface FinalRow {
  course_number: string;
  section: string;
  title: string;
  date: string;
  day: string;
  time: string;
  delivery_mode: string;
  exam_space: string;
  status: "scheduled" | "room_tba" | "canceled" | "remote";
  instructors: string[];
}

export interface FinalsDocument {
  semester_name: string | null;
  kind: "semester" | "mini";
  rows: FinalRow[];
}

const DAYS = "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday";
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const TIME = String.raw`\d{1,2}:\d{2}\s*(?:[ap]\.m\.|AM|PM)`;
const ROW_RE = new RegExp(
  String.raw`^(\d{5})\s+(\S+)\s+(.+?)\s+(${DAYS}),\s+(${MONTHS})\s+(\d{1,2})(?:,\s+(\d{4}))?\s+` +
    String.raw`(${TIME})\s*-\s*(${TIME})\s+(In Person|Remote|Hybrid|Online)\s+(.*)$`,
  "i"
);
const TITLE_RE = /^(Spring|Fall|Summer)\s+(\d{4})\s+(.*?)Final Exam/i;
/**
 * One instructor: "LAST FIRST (andrewid)", occasionally "LAST, FIRST (andrewid)".
 * Names carry no digits; the comma is only allowed right after the surname.
 */
const INSTRUCTOR_RE = /([A-Z][A-Z'.\-]*,?(?:\s+[A-Z][A-Z'.\-]*)*)\s+\(([a-z0-9]+)\)/g;

/** "08:30 a.m." -> "08:30AM" */
function normTime(t: string): string {
  return t.replace(/\s*([ap])\.m\./i, (_m, ap: string) => `${ap.toUpperCase()}M`).replace(/\s+/g, "");
}

function titleCaseWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/(^|[-'.\s])([a-z])/g, (_m, sep: string, c: string) => sep + c.toUpperCase());
}

/**
 * "SMITH-JONES T. ANN" -> "Smith-Jones, T. Ann". The registrar writes surname first;
 * the first token is taken as the surname.
 */
export function titleCaseName(raw: string): string {
  const [last, ...rest] = raw.trim().replace(",", " ").split(/\s+/);
  const first = rest.map(titleCaseWord).join(" ");
  return first ? `${titleCaseWord(last)}, ${first}` : titleCaseWord(last);
}

function statusOf(space: string): FinalRow["status"] {
  if (/^canceled/i.test(space)) return "canceled";
  if (/^remote$/i.test(space)) return "remote";
  if (/^(to be announced|tba|tbd)$/i.test(space) || space === "") return "room_tba";
  return "scheduled";
}

/** Parse the extracted text of one finals PDF. Lines that aren't exam rows are skipped. */
export function parseFinalsText(text: string): FinalsDocument {
  let semester: string | null = null;
  let kind: FinalsDocument["kind"] = "semester";
  const rows: FinalRow[] = [];
  const pending: { row: FinalRow; hasYear: boolean }[] = [];

  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    const title = line.match(TITLE_RE);
    if (title && !semester) {
      semester = `${title[1][0].toUpperCase()}${title[1].slice(1).toLowerCase()} ${title[2]}`;
      kind = /semester/i.test(title[3]) ? "semester" : "mini";
      continue;
    }
    const m = line.match(ROW_RE);
    if (!m) continue;
    const [, course, section, courseTitle, day, month, dayNum, year, start, end, mode, tail] = m;

    // The tail is "<exam space> <instructors>"; instructors are the trailing "NAME (id)" list.
    const instructors = [...tail.matchAll(INSTRUCTOR_RE)];
    const spaceEnd = instructors.length > 0 ? instructors[0].index! : tail.length;
    const space = tail.slice(0, spaceEnd).replace(/,\s*$/, "").trim();

    const row: FinalRow = {
      course_number: formatCourseNumber(course),
      section,
      title: courseTitle.trim(),
      date: year ? `${month} ${dayNum}, ${year}` : `${month} ${dayNum}`,
      day,
      time: `${normTime(start)} - ${normTime(end)}`,
      delivery_mode: mode,
      exam_space: space,
      status: statusOf(space),
      instructors: instructors.map((i) => titleCaseName(i[1])),
    };
    rows.push(row);
    pending.push({ row, hasYear: Boolean(year) });
  }

  // The semester PDF's rows omit the year; take it from the title line (which may come after them).
  const titleYear = semester?.match(/\d{4}/)?.[0];
  if (titleYear) for (const p of pending) if (!p.hasYear) p.row.date += `, ${titleYear}`;
  return { semester_name: semester, kind, rows };
}

/** "Lec 1" -> "1": the finals PDFs number lectures without the "Lec". */
function finalsSectionName(section: string): string {
  return section.trim().replace(/^lec\s*/i, "").toUpperCase();
}

/**
 * Rows for one course. With a section, match it directly; a recitation also gets
 * its lecture's row (pass the lecture it belongs to). Without a section, every row.
 */
export function findFinals(
  rows: FinalRow[],
  courseNumber: string,
  section: string | null,
  lectureOfSection: string | null
): FinalRow[] {
  const course = formatCourseNumber(normalizeCourseNumber(courseNumber));
  const ofCourse = rows.filter((r) => r.course_number === course);
  if (!section) return ofCourse;
  const wanted = new Set([finalsSectionName(section)]);
  if (lectureOfSection) wanted.add(finalsSectionName(lectureOfSection));
  return ofCourse.filter((r) => wanted.has(r.section.toUpperCase()));
}

const FINALS_TTL = 6 * HOUR;

async function loadFinalsDocuments(): Promise<(FinalsDocument & { source_url: string })[]> {
  return Promise.all(
    FINALS_PDF_URLS.map(async (url) => {
      // pdf.js detaches the buffer it is given, so hand it a copy of the cached bytes.
      const pdf = await getDocumentProxy((await fetchBytes(url, FINALS_TTL)).slice());
      // Per page: unpdf's mergePages:true flattens every line break, and rows are lines.
      const { text } = await extractText(pdf, { mergePages: false });
      return { ...parseFinalsText((text as string[]).join("\n")), source_url: url };
    })
  );
}

export interface FinalsLookup {
  input: string;
  course_number: string;
  section: string | null;
  finals: FinalRow[];
  note: string | null;
}

/** Final exams for several courses ("15-122", "21-127 A", "15-213 Lec 1") in one semester. */
export async function getFinalExams(semesterInput: string, inputs: string[]) {
  const semester = await resolveSemester(semesterInput);
  const docs = await loadFinalsDocuments();
  const matching = docs.filter((d) => d.semester_name === semester.name);
  const covers = [...new Set(docs.map((d) => d.semester_name).filter(Boolean))];

  if (matching.length === 0) {
    return {
      semester: semester.code,
      semester_name: semester.name,
      published: false,
      note:
        `The registrar has not published ${semester.name} final exams. Its PDFs currently cover ` +
        `${covers.join(" and ") || "no readable semester"}. Finals are posted around the sixth week ` +
        "of classes; until then no final-exam conflict can be checked. Midterm and project dates " +
        "come from each course's syllabus.",
      sources: docs.map((d) => ({ url: d.source_url, covers: d.semester_name, kind: d.kind })),
      courses: [] as FinalsLookup[],
    };
  }

  const rows = matching.flatMap((d) => d.rows);
  const courses: FinalsLookup[] = await Promise.all(
    inputs.map(async (input) => {
      const number = normalizeCourseNumber(input);
      const section = input.replace(/^.*?\d{2}\s*-?\s*\d{3}\s*/, "").trim() || null;
      let lecture: string | null = null;
      if (section && !/^lec/i.test(section)) {
        // Which lecture does this recitation belong to? Ask the schedule.
        try {
          const dept = await departmentForCourse(number);
          const { courses } = await getDepartmentCourses(semester.code, dept.code);
          const course = courses.find((c) => c.course_number === formatCourseNumber(number));
          lecture =
            course?.sections.find((s) =>
              s.subsections?.some((x) => x.section.toUpperCase() === section.toUpperCase())
            )?.section ?? null;
        } catch {
          lecture = null; // the section still matches directly
        }
      }
      const finals = findFinals(rows, number, section, lecture);
      return {
        input,
        course_number: formatCourseNumber(number),
        section,
        finals,
        note:
          finals.length > 0
            ? null
            : `No final exam is listed for ${formatCourseNumber(number)}${section ? ` ${section}` : ""} in the ` +
              `${semester.name} schedule. That is not proof there is no final: confirm with the syllabus or instructor.`,
      };
    })
  );

  return {
    semester: semester.code,
    semester_name: semester.name,
    published: true,
    note:
      "Exam rooms are often 'To Be Announced' until shortly before finals, and the registrar " +
      "notes that dates can change: check again before making travel plans.",
    sources: matching.map((d) => ({ url: d.source_url, covers: d.semester_name, kind: d.kind })),
    courses,
  };
}
