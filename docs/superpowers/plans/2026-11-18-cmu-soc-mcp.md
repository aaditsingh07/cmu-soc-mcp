# CMU Schedule of Classes MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `cmu-soc-mcp`, a Claude Code plugin that does for CMU's public Schedule of
Classes what `ucla-soc-mcp` does for UCLA's: 9 read-only MCP tools, plus a CMU
`schedule-planning` skill and its template.

**Architecture:**
- A stdio MCP server in TypeScript. It fetches CMU's public pages on demand, through one
  shared fetch layer with in-memory TTL caches and per-host concurrency limits.
- Parsers are pure functions over HTML or text, and are unit-tested on hand-written
  fixtures.
- esbuild produces a committed, self-contained `dist/bundle.cjs`.

**Tech Stack:** TypeScript 5, `@modelcontextprotocol/sdk`, `zod`, `cheerio` 1.0.0-rc.12,
`unpdf`, esbuild, and `node:test` (tests run against the tsc output in `dist/`).

**Spec:** `docs/superpowers/specs/2026-11-18-cmu-soc-mcp-design.md`

## Global Constraints

- User-Agent: `Mozilla/5.0 (compatible; cmu-soc-mcp/1.0)`. No personal details in any request.
- Network behaviour:
  - At most 2 concurrent requests per host.
  - 25 s timeout.
  - 1 retry on network errors and 5xx, except course detail, where a 500 means "not offered"
    and is not retried.
- Cache TTLs: semesters 1 h, departments 12 h, department search 1 h, course detail 6 h,
  finals PDFs 6 h, catalog pages 24 h. All caches are in memory only.
- Catalog paths that are never requested: `/course-search/`, `/search/`, `/ribbit/`, `/pdf/`,
  `/previous/`.
- Fixtures are hand-written. No saved CMU pages or PDFs go in the repo.
- Final-exam instructors are names only, title-cased, with Andrew IDs stripped.
- Course numbers are 5 digits internally and displayed `NN-NNN`.
- Plugin `cmu-soc`, marketplace `cmu-soc-mcp`, Unlicense, with OSM attribution
  "© OpenStreetMap contributors, ODbL".
- Every tool is `readOnlyHint: true`.
- No commits or pushes without the user's go-ahead.

## Review Focus

- **Courses in two blocks, or not offered.** A course number listed twice in a department
  (topics) returns both blocks. A course not offered that semester returns a clear "not
  offered" error, never an HTTP 500 passed through. Tests: Task 2 `parseSearch duplicates`,
  Task 3 `getCourseInfo not offered`.
- **Finals PDF covers a different semester.** It must say "not published yet" and name the
  semester the PDF covers. Test: Task 4 `semester mismatch`.
- **Lecture-level final rows** (`15122 1`) must apply to recitation input (`15-122 A` under
  Lec 1). Test: Task 4 `lecture row covers recitation`.
- **Room strings with letter-prefixed rooms** (`DH A302`, `BH A51`) and names (`Gates 4401`).
  Test: Task 5 `matchBuilding`.
- **Summer pages:** a `Session` column, and `Lec 16` treated as mini 6. Tests: Task 3
  `summer columns`, Task 2 `mini from suffix`.

---

### Task 1: Scaffold + shared fetch layer

**Files:**
- Create: `package.json`, `tsconfig.json` (copied from the UCLA repo, renamed), `.gitignore`
  (UCLA's, plus `!dist/bundle.cjs`), `LICENSE` (Unlicense), `src/http.ts`,
  `test/http.test.mjs`

**Interfaces:**
- Produces:
  - `fetchText(url: string | URL, opts?: {method?: "GET"|"POST"; form?: Record<string,string>; ttlMs?: number; retry?: boolean}): Promise<{status: number; body: string}>`
  - `fetchBytes(url: string, ttlMs: number): Promise<Uint8Array>`
  - `TtlCache<T>` with `get(key)` and `set(key, value, ttlMs)`

Steps:

- [ ] Test `TtlCache` expiry, using an injectable clock.
- [ ] Implement `TtlCache`.
- [ ] Implement `fetchText` with a per-host semaphore of 2. A non-2xx response returns its
      status; it does not throw.
- [ ] Run `npm run test:unit`. Expected: PASS.

### Task 2: SOC semesters, departments, search parsing, normalizers (`src/soc.ts`)

**Interfaces:**
- Produces types:
  - `Semester {code, name, is_newest}`
  - `Department {code, name, course_prefix}`
  - `Meeting {days, begin, end, teaching_location, delivery_mode}`
  - `Section {section, kind: "lecture"|"section", mini: number|null, meetings: Meeting[], subsections?: Section[]}`
  - `CourseBlock {course_number, title, units, sections: Section[]}`
- Produces functions:
  - `parseSemesters(html)`
  - `parseDepartments(html)`
  - `parseSearch(html): {last_updated: string|null, courses: CourseBlock[]}`
  - `normalizeCourseNumber(input): string` (5 digits; throws a helpful error)
  - `formatCourseNumber("15122") -> "15-122"`
  - `resolveSemester(input)`
  - `resolveDepartment(input)`
  - `getDepartmentCourses(semester, deptCode): Promise<{last_updated; courses}>`
  - `filterCampus(blocks, campus)`
  - `matchSection(sections, input)`

Tests (`test/soc.test.mjs`) use fixtures with a missing `<tr>`, an extra-meeting row, Lec
plus letters, letter-only sections, a mini `A3`, `Lec 16`, Doha rows, and a duplicate course
number.

Steps:

- [ ] Write the fixtures and these failing tests:
  - `parseSearch nests letters under Lec`
  - `blank section = extra meeting`
  - `mini from suffix`
  - `duplicates`
  - `normalizeCourseNumber accepts 15-122/15122/cs 15-122`
  - `resolveSemester accepts Spring 2027/s27/summer 2026`
  - `resolveDepartment accepts CS/Computer Science/15`
- [ ] Implement, splitting the tbody on `</tr>`.
- [ ] Run the tests. Expected: PASS.

### Task 3: SOC course detail (`getCourseInfo`)

**Interfaces:**
- Produces:
  - `parseCourseDetail(html): CourseInfo`, where `CourseInfo = {title, semester_name, units, description, prerequisites:{text,courses}, corequisites:{text,courses}, cross_listed: string[], special_permission_required: boolean|null, notes, reservations: {section, restriction}[], related_urls: string[], sections: Section[]}`
  - `getCourseInfo(semester, courseNumber)`. It checks the department search first and throws
    `not offered in <name>` if the course is absent.

Steps:

- [ ] Write the failing tests: `parses dl fields`, `prereq course list`, `summer columns`,
      `reservations`.
- [ ] Implement, reading columns by header text.
- [ ] Run the tests. Expected: PASS.

### Task 4: Final exams (`src/finals.ts`)

**Interfaces:**
- Produces:
  - `parseFinalsText(text): {semester_name: string|null, kind: "semester"|"mini", rows: FinalRow[]}`
  - `FinalRow {course_number, section, title, date, day, time, delivery_mode, exam_space, status: "scheduled"|"room_tba"|"canceled"|"remote", instructors: string[]}`
  - `findFinals(rows, courseNumber, section|null, lectureOfSection|null)`
  - `getFinalExams(semester, inputs: string[])`, which uses unpdf on both PDF URLs

Steps:

- [ ] Write fixture text lines in both formats, plus noise lines, then these failing tests:
  - `parses semester title`
  - `two time formats`
  - `canceled`
  - `remote`
  - `multi instructor strips ids`
  - `lecture row covers recitation`
  - `semester mismatch`
- [ ] Implement.
- [ ] Spike: confirm unpdf bundles into CJS with esbuild.
- [ ] Run the tests. Expected: PASS.

### Task 5: Buildings (`src/buildings.ts`)

**Interfaces:**
- Produces the same exports as UCLA's `buildings.ts`: `BUILDINGS`, `matchBuilding`,
  `isVirtualLocation`, `suggestBuildings`, `estimateWalk`. `Building` carries `code`
  (replacing UCLA's `abbreviation`) and `off_campus?: true`.

Steps:

- [ ] Pull OSM building centroids for the legend's codes with one Overpass query (a dev-time
      script in the scratchpad), then hand-write the aliases.
- [ ] Write the failing tests:
  - `matchBuilding`: `GHC 4401`, `DH A302`, `Gates 4401`, `Wean Hall 7500`
  - `virtual`: TBA, DNM, Remote
  - `walk GHC->HL > 0`
- [ ] Port UCLA's matcher.
- [ ] Run the tests. Expected: PASS.

### Task 6: Catalog (`src/catalog.ts`, `src/catalog-pages.ts`, `scripts/build-catalog-pages.mjs`)

**Interfaces:**
- Produces:
  - `parseCourseblock(html, courseNumber): CatalogCourse | null`
  - `getCatalogCourse(courseNumber)`
  - `CATALOG_PAGES: Record<string, string[]>` (prefix to page paths)

Steps:

- [ ] Write the failing tests: `parses units+semesters`, `prereq/coreq/website lines`,
      `no units line`.
- [ ] Implement.
- [ ] Run the generator script once. It fetches sequentially, waits 1 s between pages, and
      only touches allowed paths.
- [ ] Run the tests. Expected: PASS.

### Task 7: MCP server, bundle, smoke test

**Files:**
- Create: `src/index.ts`, `scripts/smoke-test.mjs`, `.mcp.json`, `.claude-plugin/plugin.json`,
  `.claude-plugin/marketplace.json`

Steps:

- [ ] Register the 9 tools exactly as in spec §5.2. Each output from tools 3 and 4 carries
      `not_public`.
- [ ] Run `npm run build` (tsc + esbuild).
- [ ] Write the smoke test. It exercises every tool live and asserts:
  - 15-122 has Lec 1 with subsections;
  - info has prerequisites;
  - the catalog entry for 15-122 has units;
  - finals for the current PDF semester return a row for 15-122;
  - the planned semester returns either a row or `published:false`;
  - the walk estimate is > 0;
  - an unknown course gives a clean error.
- [ ] Run `npm test`. Expected: `SMOKE TEST PASSED`.
- [ ] From a copy of `dist/` with no `node_modules`, run `node bundle.cjs`. Expected: it lists
      9 tools.

### Task 8: Skill, template, README

- [ ] Write `skills/schedule-planning/SKILL.md` and `references/schedule-template.md` per spec
      §5.6, with the exam-conflict wording taken from CMU's conflict-guidelines page.
- [ ] Write the README: tools, access policy (spec §3.1), setup from a public GitHub repo, how
      it works, OSM attribution, unofficial notice.
