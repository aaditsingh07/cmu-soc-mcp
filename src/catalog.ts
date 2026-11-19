/**
 * CMU Undergraduate Catalog course descriptions (coursecatalog.web.cmu.edu, CourseLeaf).
 *
 * Each department page lists its courses as
 *   <dl class="courseblock"><dt>15-122 Principles of Imperative Computation</dt>
 *   <dd>All Semesters: 12 units<br/>description<br/>Prerequisites: ...<br/>Course Website: ...</dd></dl>
 * and catalog-pages.ts maps each two-digit course prefix to the page(s) holding it.
 *
 * robots.txt disallows /course-search/, /search/, /ribbit/ (the course pop-up API),
 * /pdf/ and /previous/ (past catalogs), so only the current catalog's department
 * pages are ever requested.
 */

import { CATALOG_PAGES } from "./catalog-pages.js";
import { HOUR, fetchText } from "./http.js";
import { formatCourseNumber, normalizeCourseNumber } from "./soc.js";

export const CATALOG_BASE = "https://coursecatalog.web.cmu.edu";

export interface CatalogCourse {
  code: string;
  title: string;
  semesters_offered: string | null;
  units: string | null;
  description: string;
  prerequisites: string | null;
  prerequisite_courses: string[];
  corequisites: string | null;
  course_website: string | null;
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function courseNumbers(s: string): string[] {
  return [...new Set([...s.matchAll(/\b(\d{2})-(\d{3})\b/g)].map((m) => `${m[1]}-${m[2]}`))];
}

const LABEL_RE = /^(Prerequisites?|Corequisites?|Course Website):\s*(.*)$/i;

/** The course block for one course number on a department page, or null. */
export function parseCourseblock(html: string, courseNumber: string): CatalogCourse | null {
  const code = formatCourseNumber(normalizeCourseNumber(courseNumber));
  for (const block of html.match(/<dl class="courseblock">[\s\S]*?<\/dl>/gi) ?? []) {
    const dt = text(block.match(/<dt[^>]*>([\s\S]*?)<\/dt>/i)?.[1] ?? "");
    if (!dt.startsWith(`${code} `)) continue;
    const dd = block.match(/<dd[^>]*>([\s\S]*?)<\/dd>/i)?.[1] ?? "";
    const lines = dd.split(/<br\s*\/?>/i).map(text).filter((l) => l.length > 0);

    // First line: "Fall and Spring: 12 units", "Intermittent", "All Semesters: 6-12 units".
    const head = lines.shift() ?? "";
    const headMatch = head.match(/^([^:]+?)(?::\s*(.*\bunits?\b.*))?$/i);
    const isHead = /^(fall|spring|summer|intermittent|all semesters)/i.test(head);

    const course: CatalogCourse = {
      code,
      title: dt.slice(code.length).trim(),
      semesters_offered: isHead ? (headMatch?.[1].trim() ?? null) : null,
      units: isHead ? (headMatch?.[2]?.trim() ?? null) : null,
      description: "",
      prerequisites: null,
      prerequisite_courses: [],
      corequisites: null,
      course_website: null,
    };
    if (!isHead) lines.unshift(head);

    const description: string[] = [];
    for (const line of lines) {
      const m = line.match(LABEL_RE);
      if (!m) {
        description.push(line);
        continue;
      }
      const label = m[1].toLowerCase();
      if (label.startsWith("prerequisite")) {
        course.prerequisites = m[2];
        course.prerequisite_courses = courseNumbers(m[2]);
      } else if (label.startsWith("corequisite")) course.corequisites = m[2];
      else course.course_website = m[2] || null;
    }
    course.description = description.join(" ");
    return course;
  }
  return null;
}

/** Two-digit course prefixes present on a department page, sorted. */
export function prefixesOnPage(html: string): string[] {
  const prefixes = new Set<string>();
  for (const m of html.matchAll(/<dt[^>]*>\s*(\d{2})-\d{3}\b/gi)) prefixes.add(m[1]);
  return [...prefixes].sort();
}

/** "2026-2027" from the page's "2026-2027 Catalog" breadcrumb, or null. */
export function catalogYearOf(html: string): string | null {
  return html.match(/(\d{4}-\d{4})\s+Catalog/)?.[1] ?? null;
}

const CATALOG_TTL = 24 * HOUR;

/** Catalog entry for one course from the current undergraduate catalog. */
export async function getCatalogCourse(courseInput: string) {
  const number = normalizeCourseNumber(courseInput);
  const code = formatCourseNumber(number);
  const pages = CATALOG_PAGES[number.slice(0, 2)] ?? [];
  if (pages.length === 0) {
    throw new Error(
      `The undergraduate catalog has no course pages for the ${number.slice(0, 2)}-xxx prefix. ` +
        "Use get_course_info for the Schedule of Classes description and requisites."
    );
  }
  for (const path of pages) {
    const url = CATALOG_BASE + path;
    const { status, body } = await fetchText(url, { ttlMs: CATALOG_TTL });
    if (status !== 200) throw new Error(`CMU course catalog returned HTTP ${status} for ${url}`);
    const course = parseCourseblock(body, number);
    if (course) {
      return { ...course, catalog_year: catalogYearOf(body), source_url: url };
    }
  }
  throw new Error(
    `${code} is not in the current undergraduate catalog (graduate and new courses often aren't). ` +
      "Use get_course_info for the Schedule of Classes description and requisites."
  );
}
