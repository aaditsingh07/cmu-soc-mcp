# CMU Schedule of Classes MCP Server & Claude Plugin — Design

- **Date:** 2026-11-18
- **Status:** Draft, awaiting approval
- **Reference implementation:** `~/ucla-soc-mcp` (UCLA Schedule of Classes MCP server + `ucla-soc` plugin)

## 1. Intent

Build the Carnegie Mellon counterpart of `ucla-soc-mcp` for a CMU student to plan their own
class schedule with Claude. It has the same shape as the UCLA plugin:

- an MCP server with read-only tools over CMU's public schedule data, and
- a `schedule-planning` skill that takes the student from "which semester?" to a rendered
  mock schedule.

It is one student's personal tool. It runs locally as a Claude Code plugin and fetches public
data only when the student asks.

## 2. Goals, non-goals, anti-goals

**Goals**

- Match the UCLA server's capabilities wherever CMU publishes the data. Adapt the vocabulary
  and inputs to CMU: semesters, departments, five-digit course numbers, minis, units.
- Use the same packaging: its own repo and its own plugin marketplace.
  - A prebuilt self-contained bundle (`dist/bundle.cjs`) that runs with plain `node`, no
    `npm install`.
  - `.mcp.json` pointing at that bundle.
  - The skill and its artifact template.
- Be honest about missing data. When CMU doesn't publish something (seats, rooms,
  instructors, finals not yet posted), the tool says so explicitly instead of leaving a gap.
- Respect CMU's robots.txt and website terms (section 3.1).

**Non-goals**

- No login-only data. SIO and Stellic are never accessed by the server, and no credentials
  are handled. SIO holds seats, waitlists, rooms and registration.
- No hosted or remote deployment, and no commercial use.
- Walking times cover the Pittsburgh campus only. Doha, Silicon Valley and other locations
  still appear in schedule data.
- No changes to `ucla-soc-mcp`.

**Anti-goals** (failures even if everything "works")

- A Stellic audit parser written blind against guessed markup. A parser that silently
  misreads requirements is worse than no parser.
- CMU content shipped inside the repo, such as saved pages, PDFs, or catalog text used as
  test fixtures. CMU's terms forbid copying or redistributing site content, so all fixtures
  are hand-written to mimic the structure.
- Reporting "no conflict" when data is missing (finals not yet posted, rooms unknown).
- Hammering CMU's servers. Every source refreshes nightly at most, so cache accordingly.

## 3. Constraints (all verified live on 2026-11-18)

### 3.1 Access policy

| Host | robots.txt | Used for | Notes |
|---|---|---|---|
| `enr-apps.as.cmu.edu` | none (HTTP 404, so no restrictions under RFC 9309) | SOC course search and course detail | Home page offers "a Course Search and a Complete Schedule of Classes option for the general public". Refreshed nightly. |
| `coursecatalog.web.cmu.edu` | Disallows `/course-search/`, `/search/`, `/ribbit/`, `/pdf/`, `/previous/`, and admin paths | Department course pages only (`/schools-colleges/…/courses/`, `/aboutcmu/…/courses/`, `/intercollegeprograms/…/courses/`) and the `/coursedescriptions/` index | Only the **current** catalog (2026–27). Past catalogs live under the disallowed `/previous/`, so there is no `catalog_year` input. |
| `www.cmu.edu` | Disallows `/cmufront/`, `/myandrew`, one news page, and all of the Sogou spider | Final exam PDFs (`/hub/docs/`). The building legend (`/hub/legend.html`) is read once at development time, never at runtime. | [Terms](https://www.cmu.edu/legal/) §3: "you may use this Site only for your own personal viewing and non-commercial use". §5: no copying, storing or redistributing materials without permission. |

The terms define "the Site" as `www.cmu.edu`. The SOC and catalog hosts post no terms of
their own. A server that runs locally for one student and fetches on demand is personal,
non-commercial use. The README says so and marks the project as unofficial and unaffiliated.

Request etiquette:

- A generic User-Agent naming the tool (`Mozilla/5.0 (compatible; cmu-soc-mcp/1.0)`).
  It carries **no personal details**: no names, emails, or GitHub handles.
- At most 2 concurrent requests per host.
- 25 s timeout and 1 retry, the same as UCLA.
- In-memory caches only. Nothing fetched is written to disk.

### 3.2 What CMU publishes compared with UCLA

Checked across Fall 2025, Fall 2026 and Spring 2027:

| UCLA capability | CMU public source | Status |
|---|---|---|
| Terms, subject areas, course list | SOC search page | ✅ |
| Sections, days, times, units | SOC search results / course detail | ✅ CMU also has minis and delivery mode |
| Seats, enrolled/capacity, waitlist, `availability` filter | none | ❌ SIO only (login) |
| Room / building per section | none | ❌ Removed from the public SOC (CMU's own scheduling guide still says the SOC lists them) |
| Instructors | final-exam PDF only | ⚠️ Only for courses with a scheduled final, in the semester the PDF covers |
| Requisites, notes, restrictions, description | SOC course detail | ✅ Prereq/coreq expressions, cross-lists, notes, reservations, special permission, related URLs. No grading basis. |
| Final exams | registrar PDFs | ⚠️ Current semester only, posted "by the sixth week of classes", so usually unpublished for the semester being planned |
| Catalog description | undergraduate catalog | ✅ Current year only. Graduate courses may be missing (it is the *undergraduate* catalog). |
| Walking time between buildings | SOC legend codes + coordinates | ✅ Rooms must come from the student, because the SOC has none |
| DARS audit parser | Stellic | ❌ for now: Stellic is login-only and its saved-page format is unknown (phase 2, section 6) |

### 3.3 Data shapes (observed)

**Semesters.** `GET /open/SOC/SOCServlet/search` contains `<select name="SEMESTER">` with
options such as `S27` "Spring 2027", `F26`, `M26` (M = Summer), `S26` and `F25`. Five are
viewable, and none is marked as the default.

**Departments.** On the same page, `<select multiple name="DEPT">` has options like
`value="CS"` with label "Computer Science   (15XXX)". That gives a code, a name and a
two-digit course-number prefix. There are 58 departments, and each prefix belongs to exactly
one department. The list does not vary by semester.

**Search.** `POST /open/SOC/SOCServlet/search` takes form fields:

| Field | Values |
|---|---|
| `SEMESTER` | semester code |
| `MINI` | `NO` |
| `GRAD_UNDER` | `All` |
| `PRG_LOCATION` | `All` / `PIT` / `DOH` / `SJC` / … |
| `DEPT` | department code |
| `BEG_TIME` | `All` |
| `KEYWORD` | empty |
| `TITLE_ONLY` | `YES` |
| `SUBMIT` | empty |

The request is stateless: it works without a session cookie. The response is a full HTML page
with one table per department and a "last updated: Tue Nov 17, 2026" line. The table columns
are: Course, Course Title, Units, Sec, Mini, Days, Begin, End, Teaching Location, Delivery
Mode. How the rows work:

- **First row of a course.** It has a course-number link: an `openModal(…,
  '/SOC/SOCServlet/courseDetails?COURSE=15122&SEMESTER=S27', …)` onclick. It also carries
  the title and units.
- **Continuation rows.** These leave the course, title and units cells blank. The markup
  **omits their opening `<tr>`** (stray `<td>`s followed by `</tr>`). Either split the tbody
  on `</tr>`, or rely on parse5 (cheerio's default parser), which implies the row.
- **Section cell.** It reads `Lec 1`, `A`, or `A3`. A **blank** section cell is an extra
  meeting of the previous section. Example: 15-122 `Lec 1` meets TR 9:30–10:50 and also
  T 7:00–8:20 PM.
- **Hierarchy.** Lettered sections after a `Lec N` row belong to that lecture. Courses with
  no `Lec` rows have top-level lettered sections.
- **Mini column.** It is `Y` or blank. When it is `Y`, the mini number is the section's last
  digit: `A3` is mini 3, and summer's `Lec 16` is lecture 1, mini 6. Minis 1, 3 and 5 are the
  first half of the semester; 2, 4 and 6 the second.
- **Other columns.** Delivery modes seen: `In-person Expectation`, `In-person only`,
  `Remote only`. Units are a string (`12`, `12.0`, `VAR`).

**Course detail.** `GET /open/SOC/SOCServlet/courseDetails?COURSE=15122&SEMESTER=F26`
returns an HTML fragment. It contains:

- `data-maintitle="15122&nbsp;&nbsp;Principles of Imperative Computation"` and
  `data-subtitle="Fall 2026"`.
- A sections table: Units, Section, Mini, Days, Begin, End, Teaching Location. It has **no**
  delivery mode.
- A `<dl>` with these `<dt>`s: Related URLs, Special Permission Required, Prerequisites
  (e.g. `15112 or 02120`), Corequisites (`21127`), Cross-Listed Courses, Notes.
- An `<h4>Description:` block (`#course-detail-description`).
- An `<h4>Reservations` table (Section, Restriction), e.g. "A: Some reservations are for
  First-Year in SCS".

Two traps on this page:

- **Column order varies.** Summer pages add a leading **Session** column, so read columns
  by their header text, never by position.
- **Unknown courses crash it.** A course that isn't offered that semester returns **HTTP 500**
  with "An error has occurred in this application". Confirm the course appears in the
  department search before requesting its detail page. Don't retry a 500 here; report "not
  offered in <semester>".

**Final exams.** The registrar publishes PDFs at:

- `https://www.cmu.edu/hub/docs/final-exams.pdf`, titled "Fall 2026 Semester & Mini-2 Final
  Examination Schedule", 20 pages.
- `https://www.cmu.edu/hub/docs/final-exam-mini.pdf`, titled "Fall 2026 Mini-1 Final
  Examination Schedule".

Both have a real text layer (Excel exports). The URLs are reused each semester, so **the
title line identifies the semester; the URL does not.** Rows look like:

```
15122 1 PRIN IMPRTV COMPTATN Monday, December 7 08:30 a.m. - 11:30 a.m. In Person To Be Announced KOHLBRENNER ANNE (akohlbre), CERVESATO ILIANO (iliano)
48628 A1 GEOAI Saturday, October 10, 2026 08:30AM - 11:30AM In Person WEH 5202 LI SUZY (zekunl)
60157 A DRAWING NON-MAJORS Sunday, December 13 01:00 p.m. - 04:00 p.m. In Person CANCELED 21oct2026 WILLIAMS LONDON (lpwillia)
17614 41 FORMAL METHODS Saturday, October 10, 2026 01:00PM - 04:00PM Remote Remote GARLAN DAVID (dg4d), KANG EUNSUK (eunsukk)
```

How to read them:

- **Time formats.** There are two: `08:30 a.m. - 11:30 a.m.` and `08:30AM - 11:30AM`.
- **Dates.** They may omit the year, in which case take it from the title line.
- **Exam space.** A room (`CFA 308`, `DH B301`), `To Be Announced`, `CANCELED <date>`, or
  `Remote`.
- **Instructors.** Formatted as `LAST FIRST (andrewid)`, comma-separated.
- **Sections.** Section `1` means SOC `Lec 1`, and lettered sections match the SOC as-is.
- **Noise lines.** Department headers, column headers, "Notice: …" and "University
  Registrar's Office Page N of M" lines are interleaved and must be skipped.

**Catalog.** Course pages use CourseLeaf markup:
`<dl class="courseblock"><dt class="keepwithnext">15-122 Principles of Imperative Computation</dt><dd>Fall and Spring: 12 units<br/>…description…<br/>Prerequisites: … <a class="bubblelink code">15-112</a> …<br/>Corequisites: …<br/>Course Website: <a …>…</a></dd></dl>`.

- There are 38 department pages, listed on `/coursedescriptions/`.
- One page can hold several prefixes. The SCS page (~840 KB) covers 02, 05, 07, 10, 11, 15,
  16 and 17.
- The first `<dd>` line can be "Fall and Spring: 12 units", "Spring: 9 units", "All
  Semesters", or just a semester list with no units.

**Building legend.** `www.cmu.edu/hub/legend.html` lists 39 Pittsburgh codes: 2NB, 3SC, 4SC,
ANS, BH, CA, CFA, CIC, CMU, CUC, CYH, DH, EDS, GES, GHC, GYM, HBH, HH, HL, HOA, III, INI, MI,
MM, NSH, OFF, PCA, PH, POS, PTC, REH, SC, SEI, SH, TCS, TEP, WEH, WH, WW.

- Not buildings: `CMU` ("Carnegie Mellon"), `OFF` (Off Campus), `TBA`, `DNM` (Does Not
  Meet), `TBD`.
- `PTC` is the Pittsburgh Technology Center on Second Avenue, off the main campus.
- Other campuses: Silicon Valley `B23`, Qatar `CMB`.

## 4. Approaches considered

1. **Standalone repo that mirrors the UCLA architecture: picked.**
   - What it is: a new `~/cmu-soc-mcp` repo with its own plugin and marketplace. Tools fetch
     CMU's public pages at call time and cache in memory.
   - Why: it reuses everything that already works in the UCLA project (packaging, bundle,
     skill/template pattern, smoke test). The student installs one plugin, and the UCLA repo
     is untouched.
2. **A second plugin inside the UCLA repo.** The code that would be shared is small: fetch
   plumbing and walk math. It would mean restructuring the repo the UCLA plugin installs
   from, and a CMU student would install from a repo named `ucla-soc-mcp`. Rejected.
3. **Use CMU's nightly "Complete Schedule" HTML files** (`/assets/SOC/sched_layout_{fall,spring,summer}.htm`, ~1.5 MB each).
   - Upside: fewer requests.
   - Downside: only the newest semester per season, so Fall 2025 and Spring 2026 would be
     unreachable, and the files lack the delivery-mode column.
   - The per-department search is one request per department and has every column.
     Rejected.

## 5. Design (phase 1)

### 5.1 Repo layout (mirrors `ucla-soc-mcp`)

```
cmu-soc-mcp/
  .claude-plugin/plugin.json         plugin "cmu-soc" ("CMU Schedule Planner")
  .claude-plugin/marketplace.json    marketplace "cmu-soc-mcp", one plugin, source "./"
  .mcp.json                          {"cmu-soc": node ${CLAUDE_PLUGIN_ROOT}/dist/bundle.cjs}
  src/index.ts                       tool registration + server instructions
  src/http.ts                        shared fetch: UA, timeout, retry, per-host concurrency, TTL cache
  src/soc.ts                         semesters, departments, search parsing, course detail parsing, normalizers
  src/finals.ts                      final-exam PDF fetch, semester detection, row parsing
  src/catalog.ts                     catalog page lookup + courseblock parsing
  src/catalog-pages.ts               generated map: course prefix -> catalog page path
  src/buildings.ts                   building dataset + matching + walk math (port of UCLA's)
  scripts/build-catalog-pages.mjs    regenerates catalog-pages.ts (run once per catalog year)
  scripts/smoke-test.mjs             live end-to-end test over stdio (like UCLA's)
  test/                              unit tests on hand-written fixtures
  skills/schedule-planning/SKILL.md
  skills/schedule-planning/references/schedule-template.md
  dist/bundle.cjs                    committed, self-contained (like UCLA)
  README.md, LICENSE (Unlicense), package.json, tsconfig.json, .gitignore
```

Same toolchain as UCLA: TypeScript, `@modelcontextprotocol/sdk`, `zod`, `cheerio`, and
`esbuild` for the bundle. The one new runtime dependency is a PDF text extractor. `unpdf`
(pdf.js) was verified to extract both final-exam PDFs correctly.

### 5.2 Tools

All tools are read-only (`readOnlyHint: true`). The network tools are `openWorldHint: true`;
the two building tools are offline. Inputs are forgiving, and unknown values return errors
that list the valid options, as UCLA's do.

| # | Tool | Inputs | Returns | UCLA counterpart |
|---|---|---|---|---|
| 1 | `list_semesters` | — | `[{code, name, is_newest}]` | `list_terms` |
| 2 | `list_departments` | — | `[{code, name, course_prefix}]` | `list_subject_areas` |
| 3 | `search_courses` | `semester`, `department`, `campus?` | `{semester, department, data_last_updated, course_count, courses: [{course_number, title, units}], not_public: [...]}` | `search_courses` (no availability filter) |
| 4 | `get_course_details` | `semester`, `course_number`, `campus?` | sections with `{section, kind: lecture/section, mini, meetings: [{days, begin, end, teaching_location, delivery_mode}], subsections}` + `not_public` note | `get_course_details` |
| 5 | `get_course_info` | `semester`, `course_number` | `{title, units, description, prerequisites: {text, courses}, corequisites: {text, courses}, cross_listed, special_permission_required, notes, reservations: [{section, restriction}], related_urls}` | `get_class_detail` (requisites/notes part) |
| 6 | `get_final_exams` | `semester`, `courses: string[]` (e.g. `["15-122", "21-127 A"]`) | per course: matching rows `{section, date, day, time, exam_space, delivery_mode, status, instructors}` or an explicit reason none are listed | `get_class_detail` (final-exam part) |
| 7 | `get_course_description` | `course_number` | catalog entry `{code, title, semesters_offered, units, description, prerequisites, corequisites, course_website, catalog_year, source_url}` | `get_course_description` (current year only) |
| 8 | `estimate_walk_time` | `from_location`, `to_location` | same shape as UCLA (`from`, `to`, `same_building`, distances, minutes, `note`) | same |
| 9 | `list_buildings` | `search?` | `{count, total_known, buildings: [{code, name, aliases, approx_lat, approx_lon}]}` | same |

Notes on tool behaviour:

- **Why the UCLA detail tool is split.** UCLA's `get_class_detail` covers both requisites and
  finals. CMU has these in two different sources (a per-course page and one semester-wide
  PDF), so they become `get_course_info` and `get_final_exams`. One `get_final_exams` call
  checks a whole schedule with a single PDF fetch.
- **The `campus` input** (tools 3 and 4) defaults to `any`. It accepts `Pittsburgh`, `Doha`,
  `Silicon Valley`, etc. CMU mixes campuses inside one course: 15-122 has a Doha lecture.
  The filter runs client-side on each meeting's teaching location; the search request always
  uses `PRG_LOCATION=All`.
- **The department search is the shared source for tools 3 and 4.** It is cached per
  (semester, department), so looking up several courses in one department costs one request,
  whatever the campus filter. The department comes from the course number's prefix. A number listed more than
  once (topics courses) returns every block, capped at 4 as in UCLA.
- **`not_public`** lists exactly what CMU does not publish: seats, waitlist, rooms,
  instructors. It points to SIO, so Claude never invents those fields.

`get_final_exams` behaviour:

- It fetches both PDFs and reads each one's semester from its title line.
- **Semester not covered:** it returns `published: false` with the semester the PDFs
  currently cover, plus "the registrar posts finals by about week 6 of the semester".
- **Semester covered but course absent:** it returns "no final listed — confirm with the
  instructor/syllabus". That is never phrased as "no final".
- **Section mapping:** a lecture-level row (`1`) applies to all of that lecture's lettered
  sections.
- **Status values:** `scheduled`, `room_tba`, `canceled`, `remote`.
- **Instructors:** names only, title-cased. **Andrew IDs are stripped.** The student needs
  names, not email handles.

`get_course_description` behaviour:

- It looks up the prefix in `catalog-pages.ts` and fetches that one department page (cached
  24 h).
- It finds the `<dt>` whose code matches `NN-NNN` and parses the `<dd>`.
- If the course is absent, the error suggests `get_course_info`, which has the
  term-specific description and requisites (useful for graduate courses).

### 5.3 Input normalization

| Input | Accepts |
|---|---|
| Semester | Codes `S27` / `F26` / `M26`, or names "Spring 2027", "fall 2026", "Summer 2026", "spring 27". Case-insensitive; "Summer" maps to `M`. |
| Course number | `15-122`, `15122`, `15 122`, `cs 15-122`, `15-122 A` (a trailing section is accepted where a section makes sense). Five digits internally, displayed as `15-122`. |
| Department | Code (`CS`), name or unique substring ("Computer Science"), or prefix (`15`). |
| Section | `Lec 1`, `lec1`, `1`, `A`, `A3`. |

### 5.4 Caching

| Data | TTL |
|---|---|
| Semesters | 1 h |
| Departments | 12 h |
| Department search | 1 h |
| Course detail | 6 h |
| Final-exam PDFs | 6 h |
| Catalog pages | 24 h |

The department-search TTL keeps a planning session fast without serving yesterday's data
all day.

### 5.5 Buildings and walking time

The matching and walk math are a straight port of UCLA's `buildings.ts`:

- Keys are matched longest first; whatever follows the key is the room.
- The virtual-location regex is extended with `TBA`, `TBD`, `DNM`, `Remote`, `Online`,
  `Off Campus`, `CMU`.
- Walking pace is 80 m/min and the path factor is 1.4.
- The note mentions CMU's hills and stairs, as UCLA's mentions its north/south grade.

The building data:

- **Codes and names** come from the SOC legend (facts, not copied content), plus
  hand-written aliases ("Gates", "Gates Hillman Center", "Cohon Center", "UC", "Tepper",
  "Hunt", "Purnell", "Mellon Institute", "Wean", …).
- **Coordinates** are centroids of the matching OpenStreetMap building outlines, pulled once
  at development time through Overpass and rounded to 5 decimals. The data file header and
  the README credit "© OpenStreetMap contributors, ODbL". Any building OSM lacks gets
  hand-placed coordinates, flagged as such.
- **PTC** is included but flagged off-campus, so a walk estimate to it is visibly long and
  annotated.

The SOC has no rooms, so the tool's inputs come from the student, who reads them from SIO.
Examples: "GHC 4401", "Wean Hall 7500", "DH A302".

### 5.6 Skill: `schedule-planning` (CMU)

Same eight steps and the same "verify, don't assume" principle as UCLA's, with CMU specifics:

1. **Confirm the semester.**
   - Infer it from today's date and CMU's release cycle (Spring SOC posts late October, Fall
     late March, Summer mid-February), then confirm with the student.
   - Also confirm the campus, defaulting to Pittsburgh.
2. **Wants and needs.** Collect required courses, interests, and a target load in units.
   CMU units are roughly hours per week. Overload limits vary by college, so ask rather than
   assume.
3. **Course history and requirements.**
   - Phase 1: ask the student to paste their Stellic audit's unmet requirements, or type
     their course history.
   - Phase 2: use the parser resource.
   - Reconcile with step 2, as UCLA does.
4. **Prerequisites.**
   - Use `get_course_info` (the SOC's prerequisite and corequisite expressions, e.g. `15112
     or 02120`) and `get_course_description` (catalog wording).
   - Check them against history. Coreqs must be taken before or with the course.
   - Ask about anything unclear (AP credit, transfer, in-progress). Never plan a course with
     unconfirmed prerequisites.
5. **Logistics.** Ask about earliest and latest times, gaps, and free days. Check walking
   only when the student supplies rooms from SIO, and say rooms aren't public.
6. **Build the schedule.**
   - Use `get_course_details`.
   - Conflict-check every meeting: recitations, labs, and extra meetings such as 15-122's
     evening slot.
   - **Minis in different halves don't conflict**; minis in the same half do.
   - Exclude other-campus and remote sections unless wanted.
   - Seats aren't public, so tell the student to check SIO and propose backups for popular
     courses.
7. **Final exams.**
   - Use `get_final_exams`. For the semester being planned they are usually "not yet
     published"; say so plainly.
   - Flag overlaps and 3+ finals in a day when the data exists.
   - Link CMU's exam-conflict guidelines.
8. **Render** the artifact from the template, only after the student agrees to the plan.

Template changes from UCLA's (the five required sections stay):

- **Grid blocks** show the mini ("Mini 3").
- **Course table columns:** Course, Section, Type, Mini, Days, Time, Room (student-supplied
  or "see SIO"), Delivery mode, Units.
- **Totals:** "Total units: N".
- **Finals table:** allows "not yet published" and "none listed".
- **Caveats:**
  - unofficial data, refreshed nightly;
  - seats and waitlists are only in SIO, so register through SIO during your registration
    time;
  - finals and syllabus dates can change;
  - walking estimates are approximate;
  - Stellic and this plan are not official advising, so confirm with your academic advisor.

### 5.7 Testing and verification

- **Unit tests** run on **hand-written** fixtures and cover:
  - the search table (missing `<tr>`, Lec/lettered nesting, extra-meeting rows, minis);
  - the course-detail fragment;
  - final-exam rows: both time formats, canceled, TBA, remote, multiple instructors, noise
    lines, semester-title detection;
  - a catalog courseblock;
  - semester, course-number and department normalization;
  - building matching.
- **Live smoke test** (`npm test`): builds, then exercises every tool over stdio against
  live CMU endpoints, like UCLA's `scripts/smoke-test.mjs`.
- **Bundle check:** `node dist/bundle.cjs` starts and lists all tools from a directory with
  no `node_modules`.
- **Node floor:** the UCLA plugin says Node ≥ 18. Verify the PDF library runs on the floor
  the plugin claims; if it doesn't, raise `engines` and document it.

### 5.8 Risks to check early

- **`unpdf` is ESM-only.** It must bundle into the CommonJS `dist/bundle.cjs` with esbuild.
  If it doesn't, ship an ESM bundle (`dist/bundle.mjs`) and point `.mcp.json` at it.
- **Bundle size grows** with pdf.js. That's acceptable, but check it.
- **The exam-conflict rule** the skill flags must use CMU's own wording from
  `www.cmu.edu/hub/registrar/exams-and-grading/conflict-guidelines.html`, not UCLA's
  "3+ finals in a day".

## 6. Phase 2: Stellic audit parser

Phase 2 is blocked on a real saved audit from the student. The request is: Chrome → Save
Page As → *Webpage, Complete* on the Stellic audit view, plus a PDF if Stellic offers a
download or print option.

Once the audit arrives:

- Build `src/audit.ts`, `src/parse-degree-audit-cli.ts` and `dist/parse-degree-audit.cjs`.
- Serve it as the resource `cmu-soc://scripts/parse-degree-audit.cjs`, with the same
  contract as UCLA's: the script is saved and run locally against the saved file, prints
  JSON, and takes a `status_filter`.
- The output shape follows UCLA's as far as Stellic's data allows.

Privacy:

- The real audit stays outside the repo (or in a gitignored folder). It is never committed
  and never sent anywhere.
- Tests use a scrubbed copy with a fake name, ID and grades.

## 7. Decisions made without the user (open to correction)

- New repo at `~/cmu-soc-mcp`, plugin name `cmu-soc`, marketplace `cmu-soc-mcp`, Unlicense
  (plus OSM attribution for the coordinates).
- Tool names use CMU vocabulary: semesters, departments, course numbers.
- UCLA's `get_class_detail` is split into `get_course_info` and `get_final_exams`.
- A `campus` filter is added. The UCLA `availability` filter and `catalog_year` input are
  dropped, because seats aren't public and past catalogs are robots-disallowed.
- Instructor Andrew IDs are stripped from final-exam output.
- Building coordinates come from OpenStreetMap, not hand estimates.
- No git commits or pushes unless asked.

## 8. Left to the builder

- Exact JSON field names beyond those above, module boundaries inside `src/`, the test
  runner, regex details, and bundle-size tuning.
- Whether the OSM extraction stays as a committed script or a documented one-off.

## 9. Left to the user

- Getting the student's saved Stellic audit (phase 2).
- Making the repo installable for the student: push to GitHub (whose account, what name),
  or share the folder and add it with `/plugin marketplace add <path>`.
