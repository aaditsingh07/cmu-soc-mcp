#!/usr/bin/env node
/**
 * MCP server exposing Carnegie Mellon's public Schedule of Classes.
 * Transport: stdio. All tools are read-only queries against public data.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  BUILDINGS,
  LocationMatch,
  estimateWalk,
  isVirtualLocation,
  matchBuilding,
  suggestBuildings,
} from "./buildings.js";
import { getCatalogCourse } from "./catalog.js";
import { getCourseInfo } from "./course-info.js";
import { getFinalExams } from "./finals.js";
import {
  NOT_PUBLIC,
  departmentForCourse,
  filterCampus,
  formatCourseNumber,
  getDepartmentCourses,
  getDepartments,
  getSemesters,
  normalizeCourseNumber,
  resolveDepartment,
  resolveSemester,
} from "./soc.js";

const semesterSchema = z
  .string()
  .describe(
    'Semester code such as "S27" (Spring 2027), "F26" (Fall 2026), "M26" (Summer 2026). ' +
      "Names like 'Spring 2027' also work. Use list_semesters to see what is published."
  );

const courseSchema = z
  .string()
  .describe('CMU course number, e.g. "15-122", "15122" or "21-127".');

const campusSchema = z
  .string()
  .default("any")
  .describe(
    'Only sections taught on this campus: "Pittsburgh", "Doha", "Silicon Valley", ... ' +
      'Default "any". CMU lists other campuses\' sections inside the same course.'
  );

const server = new McpServer(
  { name: "cmu-soc", version: "1.0.0" },
  {
    instructions:
      "Tools for querying Carnegie Mellon's public Schedule of Classes (SOC), refreshed nightly. " +
      "Typical flow: list_semesters -> list_departments -> search_courses (a department's courses) -> " +
      "get_course_details (sections, recitations, minis, meeting days/times, delivery mode). " +
      "get_course_info adds the SOC's prerequisite/corequisite expressions, notes, reservations and " +
      "description; get_final_exams checks the registrar's final-exam schedule (only the current " +
      "semester is ever published, around week 6); get_course_description reads the current " +
      "undergraduate catalog; estimate_walk_time and list_buildings estimate walking time between " +
      "buildings from rooms like 'GHC 4401'. CMU does NOT publish seats, waitlists, rooms or " +
      "instructors publicly: never invent them; students see them in SIO.",
  }
);

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

server.registerTool(
  "list_semesters",
  {
    title: "List CMU semesters",
    description:
      "Semesters currently published in the CMU Schedule of Classes, newest first, with codes " +
      "(S = Spring, F = Fall, M = Summer; e.g. S27 = Spring 2027).",
    inputSchema: {},
    annotations: READ_ONLY,
  },
  async () => {
    try {
      return jsonResult(await getSemesters());
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "list_departments",
  {
    title: "List CMU departments",
    description:
      "Every department in the Schedule of Classes with its code (CS, MSC, ECE, ...) and the " +
      "two-digit course-number prefix it owns (CS = 15, MSC = 21).",
    inputSchema: {},
    annotations: READ_ONLY,
  },
  async () => {
    try {
      const departments = await getDepartments();
      return jsonResult({ count: departments.length, departments });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "search_courses",
  {
    title: "Search a department's courses",
    description:
      "Every course a department offers in a semester: course number, title and units. " +
      "Seat availability is not public at CMU, so there is no open/waitlist filter. For sections " +
      "and times of one course use get_course_details.",
    inputSchema: {
      semester: semesterSchema,
      department: z
        .string()
        .describe('Department code, name or course prefix: "CS", "Computer Science" or "15".'),
      campus: campusSchema,
    },
    annotations: READ_ONLY,
  },
  async ({ semester, department, campus }) => {
    try {
      const sem = await resolveSemester(semester);
      const dept = await resolveDepartment(department);
      const { last_updated, courses } = await getDepartmentCourses(sem.code, dept.code);
      const shown = filterCampus(courses, campus);
      return jsonResult({
        semester: sem.code,
        semester_name: sem.name,
        department: dept.code,
        department_name: dept.name,
        campus,
        data_last_updated: last_updated,
        course_count: shown.length,
        courses: shown.map((c) => ({ course_number: c.course_number, title: c.title, units: c.units })),
        not_public: NOT_PUBLIC.fields,
        hint: "Call get_course_details with a course_number for sections, minis and meeting times.",
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_course_details",
  {
    title: "Get course sections and meeting times",
    description:
      "Every section of one course in a semester: lectures with their nested recitations/labs, " +
      "mini (1-6; minis 1/3/5 are the first half of the semester, 2/4/6 the second), and each " +
      "meeting's days, begin/end time, campus and delivery mode. Extra meetings (e.g. an evening " +
      "exam slot) appear as additional meetings of the same section. Seats, waitlists, rooms and " +
      "instructors are not published publicly.",
    inputSchema: { semester: semesterSchema, course_number: courseSchema, campus: campusSchema },
    annotations: READ_ONLY,
  },
  async ({ semester, course_number, campus }) => {
    try {
      const sem = await resolveSemester(semester);
      const number = formatCourseNumber(normalizeCourseNumber(course_number));
      const dept = await departmentForCourse(number);
      const { last_updated, courses } = await getDepartmentCourses(sem.code, dept.code);
      const all = courses.filter((c) => c.course_number === number);
      if (all.length === 0) {
        const sample = courses.slice(0, 40).map((c) => c.course_number).join(", ");
        throw new Error(
          `${number} is not offered in ${sem.name}. ${dept.name} offers: ${sample}${courses.length > 40 ? ", ..." : ""}`
        );
      }
      const matches = filterCampus(all, campus);
      if (matches.length === 0) {
        throw new Error(`${number} has no ${campus} sections in ${sem.name} (it does have sections elsewhere; use campus "any").`);
      }
      return jsonResult({
        semester: sem.code,
        semester_name: sem.name,
        campus,
        data_last_updated: last_updated,
        matched_listings: matches.length,
        courses: matches.slice(0, 4),
        not_public: NOT_PUBLIC,
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_course_info",
  {
    title: "Get course prerequisites, notes and reservations",
    description:
      "The Schedule of Classes detail page for one course in a semester: description, prerequisite " +
      "and corequisite expressions as the SOC states them (e.g. '15112 or 02120') plus the course " +
      "numbers they mention, cross-listed courses, whether special permission is required, notes, " +
      "per-section reservations (seats held for certain students), and related URLs.",
    inputSchema: { semester: semesterSchema, course_number: courseSchema },
    annotations: READ_ONLY,
  },
  async ({ semester, course_number }) => {
    try {
      const { info, ...rest } = await getCourseInfo(semester, course_number);
      const { sections: _sections, ...fields } = info;
      return jsonResult({
        ...rest,
        ...fields,
        hint: "Sections and meeting times: get_course_details. Catalog wording with minimum grades: get_course_description.",
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_final_exams",
  {
    title: "Get final exam times",
    description:
      "Final exams from the University Registrar's published schedule for several courses at once " +
      '(e.g. ["15-122", "21-127 A", "15-213 Lec 1"]): date, day, time, exam room, delivery mode, ' +
      "status and instructors. A recitation input also returns its lecture's exam. The registrar only " +
      "publishes the current semester, around week 6; for any other semester the result says " +
      "published:false. A course with no row is 'none listed', not proof of no final.",
    inputSchema: {
      semester: semesterSchema,
      courses: z
        .array(z.string())
        .min(1)
        .max(12)
        .describe('Course numbers, optionally with a section: "15-122", "15-122 A", "21-127 Lec 2".'),
    },
    annotations: READ_ONLY,
  },
  async ({ semester, courses }) => {
    try {
      return jsonResult(await getFinalExams(semester, courses));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_course_description",
  {
    title: "Get catalog course description",
    description:
      "The current CMU Undergraduate Catalog entry for a course: title, semesters usually offered, " +
      "units, description, prerequisites (with minimum grades, e.g. '15-112 Min. grade C'), " +
      "corequisites and course website. Term-independent. Only the current catalog year is " +
      "available, and graduate courses are often absent; get_course_info covers any offered course.",
    inputSchema: { course_number: courseSchema },
    annotations: READ_ONLY,
  },
  async ({ course_number }) => {
    try {
      const course = await getCatalogCourse(course_number);
      return jsonResult({ ...course, has_prerequisites: course.prerequisites !== null });
    } catch (err) {
      return errorResult(err);
    }
  }
);

function resolveWalkLocation(input: string): LocationMatch {
  if (isVirtualLocation(input)) {
    throw new Error(`"${input}" is not a physical classroom (remote, TBA or no location), so walking time cannot be estimated.`);
  }
  const match = matchBuilding(input);
  if (!match) {
    const suggestions = suggestBuildings(input);
    throw new Error(
      `Could not match "${input}" to a CMU building. ` +
        (suggestions.length > 0 ? `Closest names: ${suggestions.join(", ")}. ` : "") +
        "Use list_buildings to see every building this tool knows."
    );
  }
  if (match.building.off_campus) {
    throw new Error(
      `${match.building.name} (${match.building.code}) is off the main campus${match.building.note ? `: ${match.building.note}` : "."} ` +
        "A walking estimate isn't meaningful; plan travel separately."
    );
  }
  return match;
}

server.registerTool(
  "estimate_walk_time",
  {
    title: "Estimate walking time between buildings",
    description:
      "Offline estimate of the walk between two CMU Pittsburgh buildings. Accepts room strings " +
      '("GHC 4401", "DH A302", "Wean Hall 7500") or bare building names/codes. Rooms are not in the ' +
      "public schedule, so they come from the student (SIO). Straight-line distance between building " +
      "centroids x 1.4 for real paths, at 80 m/min: for spotting tight passing periods, not navigation.",
    inputSchema: {
      from_location: z.string().describe('Where the earlier class meets, e.g. "GHC 4401" or "Baker Hall".'),
      to_location: z.string().describe('Where the later class meets, e.g. "DH 2210" or "Posner".'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ from_location, to_location }) => {
    try {
      const from = resolveWalkLocation(from_location);
      const to = resolveWalkLocation(to_location);
      const same = from.building.code === to.building.code;
      const describe = (m: LocationMatch) => ({
        input: m.input,
        building: m.building.name,
        code: m.building.code,
        room: m.room,
        approx_lat: m.building.lat,
        approx_lon: m.building.lon,
      });
      return jsonResult({
        from: describe(from),
        to: describe(to),
        same_building: same,
        ...estimateWalk(from.building, to.building),
        note:
          "Approximate: straight-line distance between building centroids x 1.4, walked at 80 m/min. " +
          "Ignores stairs, hills and elevators; CMU's campus has real grade changes (e.g. between the " +
          "Cut and Forbes Avenue, or down to Doherty/Wean's lower floors), so add a couple of minutes." +
          (same ? " Same building: still allow time for floors and connecting bridges." : ""),
      });
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "list_buildings",
  {
    title: "List known CMU buildings",
    description:
      "Every CMU building estimate_walk_time knows, with the Schedule of Classes building code, " +
      "alternate names and approximate coordinates (© OpenStreetMap contributors, ODbL).",
    inputSchema: {
      search: z.string().optional().describe('Only buildings whose code, name or aliases contain this text, e.g. "hall".'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ search }) => {
    const needle = search?.trim().toLowerCase() ?? "";
    const buildings = BUILDINGS.filter(
      (b) => needle.length === 0 || [b.code, b.name, ...b.aliases].join(" ").toLowerCase().includes(needle)
    );
    return jsonResult({
      search,
      count: buildings.length,
      total_known: BUILDINGS.length,
      coordinates_are_approximate: true,
      attribution: "Coordinates © OpenStreetMap contributors (ODbL)",
      buildings: buildings.map((b) => ({
        code: b.code,
        name: b.name,
        aliases: b.aliases.length > 0 ? b.aliases : undefined,
        off_campus: b.off_campus,
        note: b.note,
        approx_lat: b.off_campus && b.lat === 0 ? undefined : b.lat,
        approx_lon: b.off_campus && b.lon === 0 ? undefined : b.lon,
      })),
    });
  }
);

async function main() {
  await server.connect(new StdioServerTransport());
  console.error("cmu-soc MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
