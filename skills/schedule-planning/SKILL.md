---
name: schedule-planning
description: Use when a Carnegie Mellon (CMU) student wants help planning classes for a semester — deciding what to take, building a conflict-free schedule, checking minis, recitations, prerequisites or final exams, working around degree requirements, or asking "what should I take next semester".
---

# CMU Schedule Planning

## Overview

Guided workflow for planning one CMU student's class schedule for one semester, ending in a rendered mock-schedule artifact. Core principle: **verify, don't assume** — the semester, the student's requirements, every prerequisite, and every conflict get an explicit check, and the student confirms anything the data cannot.

Uses the `cmu-soc` MCP tools (`list_semesters`, `list_departments`, `search_courses`, `get_course_details`, `get_course_info`, `get_final_exams`, `get_course_description`, `estimate_walk_time`, `list_buildings`). All data is CMU's public Schedule of Classes (refreshed nightly), the registrar's final-exam PDFs and the current undergraduate catalog — unofficial and subject to change.

**CMU does not publish seats, waitlists, rooms or instructors publicly.** Never state or guess them; the student sees them in SIO.

**Create a todo for each step below and work them in order.** Steps 2 and 3 may be asked in one message; nothing else merges.

## Step 1 — Confirm the semester and campus

Call `list_semesters`. Infer the semester being planned from today's date (students plan the *next* semester: the Spring schedule posts in late October for November registration, Fall in late March, Summer in mid-February). **State the inference and get confirmation** — e.g. "It's mid-November 2026, so I'll assume you're planning **Spring 2027** — is that right?" Also confirm the campus (default Pittsburgh); pass it as `campus` so Doha or Silicon Valley sections don't creep in.

## Step 2 — Ask what they want or need to take

Ask for required courses, courses of interest, and a target load in **units** (CMU units ≈ hours of work per week; a 12-unit course is a full-weight course). Overload limits differ by college and class year — ask rather than assume. Record answers; don't skip this even though the audit will also suggest courses.

## Step 3 — Get course history and remaining requirements

CMU degree audits live in **Stellic** (login only). Ask the student to open their Stellic audit and paste (or type) the requirements still unmet plus the courses already taken or in progress — a pasted audit, a transcript, or a typed list all work. If the audit contradicts what they said in Step 2 (different major, a "needed" course already satisfied, a timeline that doesn't fit), stop and clarify before going on.

## Step 4 — Verify prerequisites

For every candidate course, call `get_course_info` (the Schedule of Classes' own prerequisite/corequisite expressions, e.g. `15112 or 02120`, and its notes/reservations) and `get_course_description` (catalog wording, including minimum grades like "15-112 Min. grade C"). Check each requisite against the history from Step 3. Corequisites must be taken before or alongside. In-progress courses usually count for registration, but say so rather than silently assuming. If a requisite is **not clearly satisfied** (AP/transfer credit, a different course, a waiver), ask the student how it's covered. Never put a course with unconfirmed prerequisites in the plan. Note reservations (seats held for certain students) and "special permission required".

## Step 5 — Logistics preferences

Ask about earliest start / latest end, back-to-back classes vs. gaps, and days they'd like free. Rooms are **not** in the public schedule: if the student wants walking checks, ask them for the rooms from SIO, then run `estimate_walk_time` on back-to-back pairs (e.g. "GHC 4401" → "DH 2210") and flag anything near the passing period. Estimates are approximate and ignore CMU's stairs and grade changes — treat anything within ~2 minutes of the gap as tight.

## Step 6 — Build the schedule

Use `get_course_details` for sections. Conflict-check **every required meeting**: lectures, their recitations/labs (enrollment needs both), and extra meetings such as an evening exam slot listed under the same section. **Minis:** courses in mini 1/3/5 (first half) and mini 2/4/6 (second half) don't conflict with each other even at the same time; two minis in the same half do. Exclude other-campus and remote sections unless wanted. Seat availability isn't public — tell the student to check seats and waitlists in SIO, and propose a backup section or course for anything popular. Present the plan (and backup) in chat and get agreement before rendering anything.

## Step 7 — Check final exams

Call `get_final_exams` once with every chosen course and section (e.g. `["15-122 A", "21-127 Lec 2"]`). The registrar publishes only the current semester (usually by early October for Fall, late February for Spring), so for the semester being planned the answer is usually `published: false` — say plainly that finals can't be checked yet and that any day of the exam period is possible, so no travel plans. When finals are published, flag CMU's two conflict cases: two finals at the same time, and **more than two finals starting within a 25-hour period** (both are grounds to request a resolution under the registrar's Exam Conflict Guidelines). A course with no row is "none listed", not "no final". Exam rooms are often "To Be Announced" — never feed them to `estimate_walk_time`. Midterms and project deadlines come from each syllabus.

## Step 8 — Render the mock schedule artifact

Only after the student agrees on a plan. **REQUIRED: follow [schedule-template.md](references/schedule-template.md) and fill every REQUIRED slot it defines.** Close with the template's caveats: data is unofficial, seats and waitlists are only in SIO, register through SIO during your registration time, and confirm requirements with your academic advisor.

## Quick reference

| Need | Tool |
|---|---|
| Which semesters are published | `list_semesters` |
| Department codes / course prefixes | `list_departments` |
| What a department offers | `search_courses` |
| Sections, recitations, minis, times, delivery mode | `get_course_details` |
| SOC prerequisites, notes, reservations | `get_course_info` |
| Final exam times (current semester only) | `get_final_exams` |
| Catalog description + minimum grades | `get_course_description` |
| Walking time between buildings | `estimate_walk_time` |
| Look up building codes | `list_buildings` |

## Common mistakes

| Mistake | Fix |
|---|---|
| Stating seat counts, rooms or instructors | They aren't public — point to SIO (Steps 5–6) |
| Flagging two minis in different halves as a conflict | Check the mini numbers (Step 6) |
| Conflict-checking lectures only | Recitations and extra meetings count (Step 6) |
| Treating "finals not published" as "no conflicts" | Say it can't be checked yet (Step 7) |
| Using UCLA-style "3 finals in a day" | CMU's rule: >2 finals starting within 25 hours (Step 7) |
| Rendering before the student agrees | Agreement first, artifact last (Step 6 → 8) |
