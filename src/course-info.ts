/**
 * The SOC course-detail page:
 *   GET /open/SOC/SOCServlet/courseDetails?COURSE=15122&SEMESTER=F26
 * an HTML fragment with the course's sections, description, prerequisite and
 * corequisite expressions, cross-listings, notes, reservations and related URLs.
 *
 * Two traps: summer pages add a leading "Session" column (so columns are read by
 * header), and a course that isn't offered makes the page return HTTP 500 (so we
 * check the department search first and never request details for absent courses).
 */

import * as cheerio from "cheerio";
import { HOUR, fetchText } from "./http.js";
import {
  Section,
  SOC_BASE,
  departmentForCourse,
  formatCourseNumber,
  getDepartmentCourses,
  normalizeCourseNumber,
  resolveSemester,
} from "./soc.js";

export interface Requisite {
  /** The SOC's own expression, e.g. "(15112 or 02120) and 21127"; null when none. */
  text: string | null;
  /** Every course number mentioned in it, as "15-112". */
  courses: string[];
}

export interface CourseInfo {
  title: string;
  semester_name: string;
  units: string | null;
  description: string | null;
  prerequisites: Requisite;
  corequisites: Requisite;
  cross_listed: string[];
  special_permission_required: boolean | null;
  notes: string | null;
  reservations: { section: string; restriction: string }[];
  related_urls: string[];
  sections: Section[];
}

function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** "15-112 or 15112, 21127" -> ["15-112", "21-127"] (deduplicated, in order). */
export function courseNumbersIn(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(/\b(\d{2})-?(\d{3})\b/g)) seen.add(formatCourseNumber(m[1] + m[2]));
  return [...seen];
}

/**
 * Notes come hard-wrapped at a fixed width, sometimes mid-word ("If sp" / "ace").
 * Strip the common indentation and join the lines without a separator; a space
 * that belongs in the text survives as extra indentation on the next line.
 */
function unwrapNotes(raw: string): string | null {
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;
  const indent = Math.min(...lines.map((l) => l.match(/^ */)![0].length));
  return squash(lines.map((l) => l.slice(indent).replace(/\s+$/, "")).join("")) || null;
}

function requisite(text: string | undefined): Requisite {
  const t = squash(text ?? "");
  if (!t || /^none$/i.test(t)) return { text: null, courses: [] };
  return { text: t, courses: courseNumbersIn(t) };
}

export function parseCourseDetail(html: string): CourseInfo {
  const $ = cheerio.load(html);
  const head = $("[data-maintitle]").first();
  const mainTitle = squash(head.attr("data-maintitle") ?? "");

  // <dt>Label</dt><dd>value</dd> pairs, keyed by label. Notes keep their raw text.
  const fields = new Map<string, cheerio.Cheerio<any>>();
  $("dt").each((_i, el) => {
    fields.set(squash($(el).text()).toLowerCase(), $(el).next("dd"));
  });
  const field = (label: string) => fields.get(label.toLowerCase());

  // Sections table: columns by header text, since summer adds a "Session" column.
  const table = $("table")
    .filter((_i, t) => $(t).find("th").toArray().some((th) => squash($(th).text()) === "Days"))
    .first();
  const headers = table.find("thead th").toArray().map((th) => squash($(th).text()));
  const col = (name: string) => headers.indexOf(name);
  const sections: Section[] = [];
  let lecture: Section | null = null;
  let current: Section | null = null;
  let units: string | null = null;
  table.find("tbody tr").each((_i, tr) => {
    const cells = $(tr).find("td").toArray().map((td) => squash($(td).text()));
    const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? "") : "");
    units ??= get("Units") || null;
    const meeting = {
      days: get("Days"),
      begin: get("Begin"),
      end: get("End"),
      teaching_location: get("Teaching Location"),
      delivery_mode: "", // the detail page has no delivery-mode column
    };
    const name = get("Section");
    if (!name) {
      current?.meetings.push(meeting);
      return;
    }
    const isLecture = /^lec\b/i.test(name);
    const miniDigit = get("Mini").toUpperCase() === "Y" ? name.match(/(\d)\s*$/)?.[1] : undefined;
    const section: Section = {
      section: name,
      kind: isLecture ? "lecture" : "section",
      mini: miniDigit ? Number(miniDigit) : null,
      meetings: [meeting],
    };
    if (isLecture) {
      sections.push(section);
      lecture = section;
    } else if (lecture) (lecture.subsections ??= []).push(section);
    else sections.push(section);
    current = section;
  });

  const reservations: CourseInfo["reservations"] = [];
  $("h4")
    .filter((_i, h) => /reservations/i.test($(h).text()))
    .first()
    .nextAll("table")
    .first()
    .find("tr")
    .each((_i, tr) => {
      const tds = $(tr).find("td");
      if (tds.length >= 2) {
        reservations.push({ section: squash(tds.eq(0).text()), restriction: squash(tds.eq(1).text()) });
      }
    });

  const permission = squash(field("Special Permission Required")?.text() ?? "");
  const crossListed = squash(field("Cross-Listed Courses")?.text() ?? "");
  const description = squash($("#course-detail-description p").first().text());

  return {
    title: mainTitle.replace(/^\d{5}\s*/, ""),
    semester_name: squash(head.attr("data-subtitle") ?? ""),
    units,
    description: description || null,
    prerequisites: requisite(field("Prerequisites")?.text()),
    corequisites: requisite(field("Corequisites")?.text()),
    // The SOC lists a course as cross-listed with itself; keep only the others.
    cross_listed: courseNumbersIn(crossListed).filter(
      (n) => n !== formatCourseNumber(mainTitle.match(/^\d{5}/)?.[0] ?? "")
    ),
    special_permission_required: /^yes$/i.test(permission) ? true : /^no$/i.test(permission) ? false : null,
    notes: unwrapNotes(field("Notes")?.text() ?? ""),
    reservations,
    related_urls: (field("Related URLs")?.find("a").toArray() ?? [])
      .map((a) => $(a).attr("href") ?? "")
      .filter((h) => h.length > 0),
    sections,
  };
}

const DETAIL_TTL = 6 * HOUR;

/**
 * Course detail for one course in one semester. Confirms the course is in the
 * department's search results first: asking the SOC for a course it doesn't
 * offer makes it return HTTP 500.
 */
export async function getCourseInfo(
  semesterInput: string,
  courseInput: string
): Promise<{ semester: string; semester_name: string; course_number: string; info: CourseInfo }> {
  const semester = await resolveSemester(semesterInput);
  const number = normalizeCourseNumber(courseInput);
  const dept = await departmentForCourse(number);
  const { courses } = await getDepartmentCourses(semester.code, dept.code);
  if (!courses.some((c) => c.course_number === formatCourseNumber(number))) {
    throw new Error(
      `${formatCourseNumber(number)} is not offered in ${semester.name}. ` +
        "Try another semester, or get_course_description for the catalog entry."
    );
  }
  const url = `${SOC_BASE}/courseDetails?COURSE=${number}&SEMESTER=${semester.code}`;
  const { status, body } = await fetchText(url, { ttlMs: DETAIL_TTL, retry: false });
  if (status !== 200) {
    throw new Error(`The SOC returned HTTP ${status} for ${formatCourseNumber(number)} in ${semester.name}.`);
  }
  return {
    semester: semester.code,
    semester_name: semester.name,
    course_number: formatCourseNumber(number),
    info: parseCourseDetail(body),
  };
}
