# Mock Schedule Artifact Template

Every mock schedule artifact MUST contain the five REQUIRED sections below, in this order. Render as a self-contained HTML artifact when an artifact/canvas tool is available (if your environment provides artifact design skills, load them before writing the page); otherwise render the same sections as Markdown in chat. Do not present a schedule to the student in any other format.

## REQUIRED section 1 — Header

- Title: `<Semester name> Mock Schedule` (e.g. "Spring 2027 Mock Schedule").
- Directly under it, the badge line: **`MOCK SCHEDULE — UNOFFICIAL — not a registration record`**.
- The date the schedule data was fetched and the SOC's "last updated" date.

## REQUIRED section 2 — Weekly grid

A Monday–Friday time grid (add Sat/Sun only if a class meets then):

- Rows span from one hour before the earliest meeting to one hour after the latest, in 30-minute increments; label hours down the left edge.
- One block per meeting at its real day/time, containing exactly: course number, section (e.g. "Lec 1" / "Rec A"), and the room if the student supplied it (otherwise nothing).
- Recitations, labs and extra meetings appear as their own blocks — never omitted.
- Mini courses carry a "Mini 3" (etc.) label; two minis that share a slot in different halves of the semester may be drawn side by side in one slot.
- One consistent color per course (lecture and its recitation share the color; lighter fill for the recitation). In HTML, ensure legibility in light and dark themes.

## REQUIRED section 3 — Course table

| Course | Section | Type | Mini | Days | Time | Room | Delivery mode | Units |
|---|---|---|---|---|---|---|---|---|

- Recitations/labs get their own rows under their lecture.
- `Room` is what the student gave from SIO, or "see SIO" — never a guess.
- Below the table, one line: **`Total units: N`**.

## REQUIRED section 4 — Finals table

| Course | Final exam date | Day | Time | Conflict? |
|---|---|---|---|---|

- If the registrar hasn't published this semester's finals, every row says "not yet published" and the verdict line says finals can't be checked yet.
- Courses with no listed final get "none listed" — never a blank cell.
- After the table, exactly one verdict line: "No final exam conflicts detected.", "Finals not yet published — any day of the exam period is possible.", or a bolded description of each conflict (two at the same time, or more than two starting within 25 hours).

## REQUIRED section 5 — Caveats

A visually distinct note block containing all of:

1. This is an unofficial mock schedule built from CMU's public Schedule of Classes (refreshed nightly); it is not a registration record.
2. Seats, waitlists, rooms and instructors aren't public — check them in SIO, and register through SIO during your registration time.
3. Final exam listings can change; midterms, quizzes and deadlines are set by each course's syllabus.
4. Walking-time estimates (if shown) are approximate.
5. Confirm degree requirements with your academic advisor; a Stellic audit pasted into chat is not official advising.

## Optional additions (allowed, after the required sections)

- A backup-plan table in the same format as section 3.
- Walk-time annotations between back-to-back blocks in the grid.
- Per-requirement notes mapping each course to the audit requirement it satisfies.
