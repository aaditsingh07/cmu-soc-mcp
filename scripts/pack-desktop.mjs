// Builds the Claude Desktop artifacts from an up-to-date dist/bundle.cjs (run `npm run build` first):
//   dist/cmu-soc.mcpb                  one-click Desktop Extension (server only)
//   dist/cmu-schedule-planning.zip     the schedule-planning skill, for Settings -> Capabilities -> Skills
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const run = (cmd, args, cwd) => execFileSync(cmd, args, { stdio: "inherit", cwd });

// Extension: manifest + the self-contained server bundle, nothing else.
rmSync("dist/mcpb-staging", { recursive: true, force: true });
mkdirSync("dist/mcpb-staging/server", { recursive: true });
cpSync("mcpb/manifest.json", "dist/mcpb-staging/manifest.json");
cpSync("LICENSE", "dist/mcpb-staging/LICENSE");
cpSync("dist/bundle.cjs", "dist/mcpb-staging/server/bundle.cjs");
run("npx", ["-y", "@anthropic-ai/mcpb@2.1.2", "validate", "dist/mcpb-staging/manifest.json"]);
run("npx", ["-y", "@anthropic-ai/mcpb@2.1.2", "pack", "dist/mcpb-staging", "dist/cmu-soc.mcpb"]);

// Skill zip: the folder at the zip root, renamed so it can't collide with the UCLA plugin's skill.
rmSync("dist/skill-staging", { recursive: true, force: true });
mkdirSync("dist/skill-staging", { recursive: true });
cpSync("skills/schedule-planning", "dist/skill-staging/cmu-schedule-planning", { recursive: true });
const skillPath = "dist/skill-staging/cmu-schedule-planning/SKILL.md";
writeFileSync(skillPath, readFileSync(skillPath, "utf8").replace(/^name: schedule-planning$/m, "name: cmu-schedule-planning"));
rmSync("dist/cmu-schedule-planning.zip", { force: true });
run("zip", ["-qr", "../cmu-schedule-planning.zip", "cmu-schedule-planning"], "dist/skill-staging");
console.log("wrote dist/cmu-soc.mcpb and dist/cmu-schedule-planning.zip");
