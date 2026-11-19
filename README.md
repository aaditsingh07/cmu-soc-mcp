# UNOFFICIAL CMU Schedule of Classes — MCP Server & Claude Plugin

An MCP (Model Context Protocol) server that lets Claude, or any MCP-capable agent, query
Carnegie Mellon's public
[Schedule of Classes](https://enr-apps.as.cmu.edu/open/SOC/SOCServlet). No login or API key is
required. It reads the same pages the SOC website serves, plus the registrar's final-exam
schedule and the current undergraduate catalog.

The repo is also a **Claude Code plugin** (`cmu-soc`). It bundles the server with a
`schedule-planning` skill: a guided workflow that confirms the semester, collects the
student's goals and remaining requirements, verifies prerequisites, checks minis,
recitations and final exams, and renders a mock schedule from a fixed template.

A CMU counterpart of [ucla-soc-mcp](https://github.com/aaditsingh07/ucla-soc-mcp).

## Tools

| Tool | What it does |
| --- | --- |
| `list_semesters` | Semesters published in the SOC (`S27` = Spring 2027, `F26` = Fall 2026, `M26` = Summer 2026), newest first |
| `list_departments` | Every department's code (`CS`, `MSC`, `ECE`, …) and the course-number prefix it owns (`CS` = 15) |
| `search_courses` | Every course a department offers in a semester: number, title, units. Optional `campus` filter |
| `get_course_details` | Sections of one course: lectures with nested recitations/labs, mini (1–6), and each meeting's days, times, campus and delivery mode. Extra meetings (e.g. evening exam slots) are included |
| `get_course_info` | The SOC course page: prerequisite/corequisite expressions (`15112 or 02120`) and the courses they name, cross-listings, special permission, notes, per-section reservations, description, related URLs |
| `get_final_exams` | Registrar final exams for several courses at once: date, time, exam room, status, instructors. A recitation input returns its lecture's exam. Says `published: false` for semesters the registrar hasn't posted |
| `get_course_description` | Current Undergraduate Catalog entry: semesters offered, units, description, prerequisites with minimum grades, corequisites, course website |
| `estimate_walk_time` | Offline walking-time estimate between two buildings, from room strings like `GHC 4401` or names like `Wean Hall` |
| `list_buildings` | The 37 buildings `estimate_walk_time` knows, with SOC building codes and approximate coordinates |

Inputs are forgiving:

- Semesters accept `S27` or `Spring 2027`.
- Course numbers accept `15-122`, `15122`, or `cs 15-122`.
- Departments accept `CS`, `Computer Science`, or `15`.

Unknown inputs return errors that list the valid options.

### What CMU does not publish

CMU's public schedule has **no seat counts, waitlists, rooms or instructors**. Students see
those in SIO, which needs a login. The tools never invent them: each section-level result
carries a `not_public` note. Unlike the UCLA server, there is therefore no open-seat filter,
and walking estimates need rooms the student supplies. Instructors appear only in the final-exam
schedule, as names; Andrew IDs are removed.

Final exams cover the **current semester only**. The registrar posts them around week 6
(early October in fall, late February in spring), so for the semester being planned they
usually aren't out yet. `get_final_exams` says that explicitly rather than reporting "no
conflict".

### Degree audits

CMU audits live in Stellic, which needs a login and has no documented export format. A
Stellic parser (the equivalent of the UCLA plugin's DARS script) is not included yet. For
now, the skill asks the student to paste their unmet requirements.

## Setup

### Claude Code (plugin — recommended)

The repo is its own plugin marketplace. In Claude Code:

```
/plugin marketplace add aaditsingh07/cmu-soc-mcp
/plugin install cmu-soc@cmu-soc-mcp
```

No build step is needed: the plugin ships a self-contained server bundle (`dist/bundle.cjs`)
that runs on Node 18 or newer. Start planning with `/cmu-soc:schedule-planning`, or just ask
about CMU classes and Claude will pick the skill up on its own.

### Claude Desktop (one-click extension — recommended for Desktop)

1. Download **`cmu-soc.mcpb`** from the
   [latest release](https://github.com/aaditsingh07/cmu-soc-mcp/releases/latest).
2. Double-click it, or drag it into Claude Desktop's **Settings → Extensions**, and click
   **Install**. Claude Desktop runs it with its own built-in Node.js, so there's nothing else
   to install.
3. *(Optional, for the guided planner.)* Download **`cmu-schedule-planning.zip`** from the
   same release and upload it in Claude Desktop's Skills settings (**Settings → Capabilities
   → Skills**).
4. Ask something like "Plan my Spring 2027 schedule at CMU".

To rebuild both files from source, run `npm install && npm run pack:desktop`. They are
written to `dist/`.

### Claude Desktop (manual config)

If you'd rather not use the extension, add this to `claude_desktop_config.json`
(Settings → Developer → Edit Config), using the absolute path to `dist/bundle.cjs` in your
clone:

```json
{
  "mcpServers": {
    "cmu-soc": {
      "command": "node",
      "args": ["/absolute/path/to/cmu-soc-mcp/dist/bundle.cjs"]
    }
  }
}
```

Claude Desktop doesn't inherit your shell's `PATH`. If `node` isn't found, use its absolute
path for `command` (find it with `which node`). Restart Claude Desktop fully afterwards.

### Manual build / any other MCP host

```sh
git clone https://github.com/aaditsingh07/cmu-soc-mcp.git
cd cmu-soc-mcp
npm install
npm run build
```

The server uses stdio: run `node dist/bundle.cjs` (or `node dist/index.js` after a build). All
tools are read-only.

## Testing

```sh
npm run test:unit   # parsers against hand-written fixtures (offline)
npm test            # build + unit tests + live smoke test against CMU's sites
```

## Access policy

Checked on 2026-11-18.

| Host | robots.txt | How this server uses it |
| --- | --- | --- |
| `enr-apps.as.cmu.edu` (SOC) | none (404), so no restrictions | Course search and course detail pages. The site describes itself as being for "the general public" |
| `coursecatalog.web.cmu.edu` | disallows `/course-search/`, `/search/`, `/ribbit/`, `/pdf/`, `/previous/`, … | Department course pages only, current catalog only. Disallowed paths are never requested |
| `www.cmu.edu` | disallows `/cmufront/`, `/myandrew` | The registrar's final-exam PDFs under `/hub/docs/` |

CMU's [website terms](https://www.cmu.edu/legal/) allow "personal viewing and non-commercial
use" and prohibit redistributing site content. This project is built for that:

- each user runs it locally;
- it fetches public pages only when asked;
- it keeps responses in memory only (semesters 1 h, department searches 1 h, course pages
  6 h, final-exam PDFs 6 h, catalog pages 24 h);
- it sends a generic `cmu-soc-mcp/1.0` User-Agent;
- it never has more than two requests in flight per host.

The repo contains no CMU pages, PDFs or catalog text; test fixtures are hand-written. Don't
host it as a public service or use it commercially.

## How it works

- **Semesters and departments**: the `SEMESTER` and `DEPT` selects on `GET /open/SOC/SOCServlet/search`.
  Department labels carry their course prefix ("Computer Science (15XXX)").
- **Courses and sections**: `POST /open/SOC/SOCServlet/search` with one department returns
  one table of every course. Continuation rows omit their opening `<tr>`. A blank section
  cell is an extra meeting of the section above. Lettered sections after `Lec N` belong to
  that lecture. A mini's number is its section's last digit.
- **Course detail**: `GET /open/SOC/SOCServlet/courseDetails?COURSE=15122&SEMESTER=F26`.
  Columns are read by header, because summer adds a "Session" column. The server checks the
  department search first, because requesting a course that isn't offered returns HTTP 500.
- **Final exams**: `https://www.cmu.edu/hub/docs/final-exams.pdf` and `final-exam-mini.pdf`.
  Their text layer is read with [unpdf](https://github.com/unjs/unpdf) (pdf.js). The URLs are
  reused each semester, so each PDF's title line decides which semester it covers.
- **Catalog**: CourseLeaf department pages (`<dl class="courseblock">`).
  `src/catalog-pages.ts` maps course prefixes to pages; regenerate it each catalog year with
  `node scripts/build-catalog-pages.mjs`.
- **Buildings**: codes come from the SOC
  [building legend](https://www.cmu.edu/hub/legend.html). Walking time is the haversine
  distance × 1.4, at 80 m/min.

## Notes

- Not affiliated with Carnegie Mellon University. Data comes from public CMU pages and may
  change. The SOC is refreshed nightly, and departments may alter schedules at any time.
- `get_course_details` returns at most 4 listings for a course number (topics courses can
  repeat a number).
- `get_final_exams` takes up to 12 courses per call.

## License

Code: [Unlicense](LICENSE) — public domain.

Building coordinates in `src/buildings.ts` are derived from
[OpenStreetMap](https://www.openstreetmap.org/copyright) data, © OpenStreetMap contributors,
available under the [ODbL](https://opendatacommons.org/licenses/odbl/). One point (Gesling
Stadium) comes from Wikidata (CC0).
