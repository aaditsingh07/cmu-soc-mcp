/**
 * Client for CMU's public Schedule of Classes (SOC):
 *   https://enr-apps.as.cmu.edu/open/SOC/SOCServlet
 *
 * There is no API; these are the pages the site itself serves:
 *   - Semesters + departments: <select name="SEMESTER"> / <select name="DEPT"> on GET /search
 *   - Courses + sections:      POST /search with one department (one table, all its courses)
 *   - Course detail:           GET /courseDetails?COURSE=15122&SEMESTER=F26 (see course-info.ts)
 *
 * The SOC publishes no seats, waitlists, rooms or instructors (those are in SIO, login
 * only), and it is refreshed nightly.
 */

import { HOUR, fetchText } from "./http.js";

export const SOC_BASE = "https://enr-apps.as.cmu.edu/open/SOC/SOCServlet";

/** What CMU's public SOC does not publish; every section-level result says so. */
export const NOT_PUBLIC = {
  fields: ["seats", "waitlist", "rooms", "instructors"],
  note:
    "CMU's public Schedule of Classes does not publish seat counts, waitlists, rooms or " +
    "instructors. Students see them in SIO (Student Information Online, login required).",
};

export interface Semester {
  code: string;
  name: string;
  is_newest: boolean;
}

export interface Department {
  code: string;
  name: string;
  course_prefix: string;
}

export interface Meeting {
  days: string;
  begin: string;
  end: string;
  teaching_location: string;
  delivery_mode: string;
}

export interface Section {
  section: string;
  kind: "lecture" | "section";
  mini: number | null;
  meetings: Meeting[];
  subsections?: Section[];
}

export interface CourseBlock {
  course_number: string;
  title: string;
  units: string;
  sections: Section[];
}

// ------------------------------------------------------------------ helpers

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** "15-122", "15122", "cs 15-122", "15-122 A" -> "15122". */
export function normalizeCourseNumber(input: string): string {
  const m = input.match(/(\d{2})\s*-?\s*(\d{3})/);
  if (!m) {
    throw new Error(
      `"${input}" is not a CMU course number. Use the 5-digit form, e.g. "15-122" or "15122".`
    );
  }
  return m[1] + m[2];
}

export function formatCourseNumber(fiveDigits: string): string {
  return `${fiveDigits.slice(0, 2)}-${fiveDigits.slice(2)}`;
}

/** Mini number from a mini section name: "A3" -> 3, summer "Lec 16" -> 6. */
function miniOf(section: string, miniFlag: string): number | null {
  if (miniFlag.toUpperCase() !== "Y") return null;
  const m = section.match(/(\d)\s*$/);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------- semesters + departments

export function parseSemesters(html: string): Semester[] {
  const select = html.match(/<select[^>]*name="SEMESTER"[^>]*>([\s\S]*?)<\/select>/i)?.[1] ?? "";
  const out: Semester[] = [];
  for (const m of select.matchAll(/<option[^>]*value="([^"]+)"[^>]*>([^<]*)/gi)) {
    out.push({ code: m[1].trim(), name: decode(m[2]), is_newest: out.length === 0 });
  }
  return out;
}

export function parseDepartments(html: string): Department[] {
  const select = html.match(/<select[^>]*name="DEPT"[^>]*>([\s\S]*?)<\/select>/i)?.[1] ?? "";
  const out: Department[] = [];
  for (const m of select.matchAll(/<option[^>]*value="([^"]+)"[^>]*>([^<]*)/gi)) {
    const label = decode(m[2]);
    const prefix = label.match(/\((\d{2})XXX\)\s*$/i);
    if (m[1] === "All" || !prefix) continue;
    out.push({
      code: m[1].trim(),
      name: label.slice(0, prefix.index).trim(),
      course_prefix: prefix[1],
    });
  }
  return out;
}

const SEARCH_PAGE_TTL = 12 * HOUR;

async function searchPage(): Promise<string> {
  const { status, body } = await fetchText(`${SOC_BASE}/search`, { ttlMs: SEARCH_PAGE_TTL });
  if (status !== 200) throw new Error(`CMU Schedule of Classes returned HTTP ${status}.`);
  return body;
}

export async function getSemesters(): Promise<Semester[]> {
  // The semester list changes a few times a year; re-read it hourly.
  const { status, body } = await fetchText(`${SOC_BASE}/search`, { ttlMs: HOUR });
  if (status !== 200) throw new Error(`CMU Schedule of Classes returned HTTP ${status}.`);
  const semesters = parseSemesters(body);
  if (semesters.length === 0) {
    throw new Error("Could not read the semester list from the SOC (the site layout may have changed).");
  }
  return semesters;
}

export async function getDepartments(): Promise<Department[]> {
  const departments = parseDepartments(await searchPage());
  if (departments.length === 0) {
    throw new Error("Could not read the department list from the SOC (the site layout may have changed).");
  }
  return departments;
}

const SEASONS: Record<string, string> = { spring: "S", fall: "F", summer: "M" };

export function resolveSemesterIn(semesters: Semester[], input: string): Semester {
  const needle = input.trim().toLowerCase().replace(/\s+/g, " ");
  let found =
    semesters.find((s) => s.code.toLowerCase() === needle) ??
    semesters.find((s) => s.name.toLowerCase() === needle);
  if (!found) {
    // "spring 27", "Spring 2027", "fall26"
    const m = needle.match(/^(spring|fall|summer)\s*'?(?:20)?(\d{2})$/);
    if (m) found = semesters.find((s) => s.code === `${SEASONS[m[1]]}${m[2]}`);
  }
  if (!found) {
    const list = semesters.map((s) => `${s.code} (${s.name})`).join(", ");
    throw new Error(`Unknown or unpublished semester "${input}". The SOC currently shows: ${list}`);
  }
  return found;
}

export function resolveDepartmentIn(departments: Department[], input: string): Department {
  const needle = input.trim().toLowerCase();
  const exact =
    departments.find((d) => d.code.toLowerCase() === needle) ??
    departments.find((d) => d.course_prefix === needle) ??
    departments.find((d) => d.name.toLowerCase() === needle);
  if (exact) return exact;
  const partial = departments.filter((d) => d.name.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    const opts = partial.slice(0, 8).map((d) => `"${d.code}" (${d.name})`).join(", ");
    throw new Error(`Department "${input}" is ambiguous. Matches: ${opts}`);
  }
  // Common shorthands the SOC's own names don't contain.
  const aliases: Record<string, string> = { math: "MSC", stats: "STA", statistics: "STA", ml: "MLG" };
  const alias = aliases[needle] && departments.find((d) => d.code === aliases[needle]);
  if (alias) return alias;
  throw new Error(
    `Department "${input}" not found. Use list_departments to see codes (e.g. "CS", "MSC", "ECE") ` +
      'or pass a course-number prefix such as "15".'
  );
}

export async function resolveSemester(input: string): Promise<Semester> {
  return resolveSemesterIn(await getSemesters(), input);
}

export async function resolveDepartment(input: string): Promise<Department> {
  return resolveDepartmentIn(await getDepartments(), input);
}

/** The department that owns a course number, from its two-digit prefix. */
export async function departmentForCourse(courseNumber: string): Promise<Department> {
  const prefix = normalizeCourseNumber(courseNumber).slice(0, 2);
  const dept = (await getDepartments()).find((d) => d.course_prefix === prefix);
  if (!dept) throw new Error(`No CMU department uses the course prefix ${prefix}.`);
  return dept;
}

// ----------------------------------------------------------- search results

const COLUMNS = 10; // Course, Title, Units, Sec, Mini, Days, Begin, End, Teaching Location, Delivery Mode

/**
 * Parse a department search result page. Continuation rows in the real markup
 * have no opening <tr>, so rows are found by splitting the table body on </tr>.
 */
export function parseSearch(html: string): { last_updated: string | null; courses: CourseBlock[] } {
  const lastUpdated = html.match(/last updated:\s*([^<\n]+)/i)?.[1].trim() ?? null;
  const courses: CourseBlock[] = [];
  let course: CourseBlock | null = null;
  let lecture: Section | null = null;
  let current: Section | null = null;

  // The real page opens <tbody> but never closes it; each table ends at </table>.
  for (const tbody of html.match(/<tbody[^>]*>[\s\S]*?(?=<\/tbody>|<\/table>|$)/gi) ?? []) {
    for (const chunk of tbody.split(/<\/tr>/i)) {
      const cells = [...chunk.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
      if (cells.length < COLUMNS) continue;
      const [num, title, units, sec, mini, days, begin, end, loc, mode] = cells.map(decode);
      const meeting: Meeting = { days, begin, end, teaching_location: loc, delivery_mode: mode };

      if (/^\d{5}$/.test(num)) {
        course = { course_number: formatCourseNumber(num), title, units, sections: [] };
        courses.push(course);
        lecture = null;
        current = null;
      }
      if (!course) continue;

      if (sec === "") {
        // A blank section cell is another meeting of the section above.
        current?.meetings.push(meeting);
        continue;
      }
      const isLecture = /^lec\b/i.test(sec);
      const section: Section = {
        section: sec,
        kind: isLecture ? "lecture" : "section",
        mini: miniOf(sec, mini),
        meetings: [meeting],
      };
      if (isLecture) {
        course.sections.push(section);
        lecture = section;
      } else if (lecture) {
        (lecture.subsections ??= []).push(section);
      } else {
        course.sections.push(section);
      }
      current = section;
    }
  }
  return { last_updated: lastUpdated, courses };
}

const SEARCH_TTL = HOUR;

/** Every course a department offers in a semester (one cached POST per department). */
export async function getDepartmentCourses(
  semesterCode: string,
  deptCode: string
): Promise<{ last_updated: string | null; courses: CourseBlock[] }> {
  const { status, body } = await fetchText(`${SOC_BASE}/search`, {
    ttlMs: SEARCH_TTL,
    form: {
      SEMESTER: semesterCode,
      MINI: "NO",
      GRAD_UNDER: "All",
      PRG_LOCATION: "All",
      DEPT: deptCode,
      BEG_TIME: "All",
      KEYWORD: "",
      TITLE_ONLY: "YES",
      SUBMIT: "",
    },
  });
  if (status !== 200) throw new Error(`CMU Schedule of Classes search returned HTTP ${status}.`);
  return parseSearch(body);
}

// ------------------------------------------------------------ filtering

/** Campus names people use, mapped to the SOC's teaching-location text. */
const CAMPUS_ALIASES: Record<string, string> = {
  pittsburgh: "pittsburgh",
  pgh: "pittsburgh",
  pit: "pittsburgh",
  doha: "doha",
  qatar: "doha",
  "silicon valley": "san jose",
  "san jose": "san jose",
  sv: "san jose",
};

function campusMatches(location: string, campus: string): boolean {
  const want = CAMPUS_ALIASES[campus.trim().toLowerCase()] ?? campus.trim().toLowerCase();
  return location.toLowerCase().includes(want);
}

/**
 * Keep only sections that meet on the given campus ("any" keeps everything).
 * A section is kept if its first meeting is on that campus; courses left with no
 * sections are dropped.
 */
export function filterCampus(courses: CourseBlock[], campus: string): CourseBlock[] {
  if (!campus || campus.trim().toLowerCase() === "any") return courses;
  const keep = (s: Section): Section | null => {
    if (!campusMatches(s.meetings[0]?.teaching_location ?? "", campus)) return null;
    const subs = s.subsections?.map(keep).filter((x): x is Section => x !== null);
    return subs ? { ...s, subsections: subs } : { ...s };
  };
  return courses
    .map((c) => ({ ...c, sections: c.sections.map(keep).filter((x): x is Section => x !== null) }))
    .filter((c) => c.sections.length > 0);
}

/**
 * Match "Lec 1", "lec1", "1", "A" against section names. Top-level sections win;
 * subsections are searched only if no top-level section matched.
 */
export function matchSection(sections: Section[], input: string): Section[] {
  const want = input.trim().toLowerCase().replace(/\s+/g, "");
  const hit = (s: Section) => {
    const name = s.section.toLowerCase().replace(/\s+/g, "");
    return name === want || (/^\d+$/.test(want) && name === `lec${want}`);
  };
  const top = sections.filter(hit);
  if (top.length > 0) return top;
  return sections.flatMap((s) => s.subsections ?? []).filter(hit);
}
