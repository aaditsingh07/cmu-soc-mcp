// End-to-end smoke test: spawns the built server over stdio and exercises every tool
// against the live CMU sites. Pass a server command to test another build, e.g.
// `node scripts/smoke-test.mjs node dist/bundle.cjs`.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [cmd = "node", ...args] = process.argv.slice(2);
const client = new Client({ name: "smoke-test", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: cmd, args: args.length ? args : ["dist/index.js"] }));

const text = (r) => r.content[0].text;
const call = async (name, a) => {
  const res = await client.callTool({ name, arguments: a });
  if (res.isError) throw new Error(`${name} failed: ${text(res)}`);
  return JSON.parse(text(res));
};
const expectError = async (name, a, re) => {
  const res = await client.callTool({ name, arguments: a });
  if (!res.isError || !re.test(text(res))) throw new Error(`${name}: expected error ${re}, got ${text(res).slice(0, 200)}`);
  return text(res);
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const tools = (await client.listTools()).tools.map((t) => t.name);
console.log("tools:", tools.join(", "));
assert(tools.length === 9, "expected 9 tools");

const semesters = await call("list_semesters", {});
const newest = semesters[0];
console.log(`list_semesters: ${semesters.map((s) => s.code).join(", ")} (newest ${newest.name})`);

const depts = await call("list_departments", {});
console.log(`list_departments: ${depts.count}; CS prefix ${depts.departments.find((d) => d.code === "CS")?.course_prefix}`);

const cs = await call("search_courses", { semester: newest.name, department: "Computer Science" });
console.log(`search_courses(CS, ${newest.code}): ${cs.course_count} courses, updated ${cs.data_last_updated}`);
assert(cs.course_count > 20, "expected many CS courses");

// 15-122 runs every fall and spring; use the newest fall/spring semester.
const regular = semesters.find((s) => /^[SF]/.test(s.code)).code;
const d = await call("get_course_details", { semester: regular, course_number: "15122", campus: "Pittsburgh" });
const lec1 = d.courses[0].sections[0];
console.log(`get_course_details(15-122, ${regular}, Pittsburgh): ${d.courses[0].sections.map((s) => `${s.section}[${(s.subsections ?? []).length} recs]`).join(" ")}`);
assert(/^Lec/.test(lec1.section) && (lec1.subsections ?? []).length > 0, "expected Lec 1 with recitations");
assert(d.courses[0].sections.every((s) => /Pittsburgh/.test(s.meetings[0].teaching_location)), "campus filter leaked");

const info = await call("get_course_info", { semester: regular, course_number: "15-122" });
console.log(`get_course_info(15-122): prereqs "${info.prerequisites.text}", coreqs "${info.corequisites.text}", ${info.reservations.length} reservations`);
assert(info.prerequisites.courses.length > 0, "expected 15-122 prerequisites");

await expectError("get_course_info", { semester: regular, course_number: "15-999" }, /not offered/);
console.log("get_course_info(15-999): clean 'not offered' error");

const cat = await call("get_course_description", { course_number: "15-122" });
console.log(`get_course_description(15-122): ${cat.title}, ${cat.semesters_offered}, ${cat.units}, catalog ${cat.catalog_year}; prereqs: ${cat.prerequisites}`);
assert(cat.units, "expected catalog units");

// Finals: probe every published semester; exactly the PDF's semester comes back published.
let publishedFor = null;
for (const s of semesters) {
  const f = await call("get_final_exams", { semester: s.code, courses: ["15-122", "15-122 A"] });
  if (f.published) {
    publishedFor = s.code;
    const rows = f.courses[0].finals;
    console.log(`get_final_exams(${s.code}): published; 15-122 -> ${rows.map((r) => `${r.section} ${r.date} ${r.time} ${r.exam_space}`).join(" | ") || f.courses[0].note}; 15-122 A -> ${f.courses[1].finals.map((r) => r.section).join(",")}`);
  } else {
    console.log(`get_final_exams(${s.code}): not published (${f.note.slice(0, 90)}...)`);
  }
}
assert(publishedFor, "expected the registrar's PDF to cover one published semester");

const walk = await call("estimate_walk_time", { from_location: "GHC 4401", to_location: "Porter Hall 100" });
console.log(`estimate_walk_time: ${walk.from.code} ${walk.from.room} -> ${walk.to.code} ${walk.to.room}: ~${walk.approx_distance_m} m, ~${walk.approx_walk_minutes} min`);
assert(walk.approx_walk_minutes > 0, "expected a non-zero walk");
await expectError("estimate_walk_time", { from_location: "Remote", to_location: "GHC 4401" }, /not a physical classroom/);
await expectError("estimate_walk_time", { from_location: "PTC", to_location: "GHC 4401" }, /off the main campus/);
console.log("estimate_walk_time: remote and off-campus inputs rejected");

const b = await call("list_buildings", { search: "hall" });
console.log(`list_buildings(hall): ${b.count} of ${b.total_known}`);

await client.close();
console.log("SMOKE TEST PASSED");
