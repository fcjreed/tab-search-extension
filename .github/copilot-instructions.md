# Project Guidelines

## Workflow Memory
When acting as `orchestrator` or doing coordination work, keep repository memory in the workspace under `memory/`.

- Write important decisions and their rationale to `memory/repository-decisions.md`.
- Write major learnings, gotchas, and non-obvious repository findings to `memory/repository-learnings.md`.
- Use `memory/trackers/split-task-template.md` and `memory/trackers/bug-tracker-template.md` as the canonical tracker templates for this repository.

## Orchestration Requirements
Before any implementation handoff, produce a scope breakdown, ambiguity summary, and complexity assessment.

- Do not jump straight to implementation planning.
- If review has not happened yet, say `Not yet reviewed` instead of omitting the review score.
- If the review loop is active, keep the bug tracker current and use it to determine whether work should continue.
- Keep orchestration outputs compact and table-friendly by default.
- Use short complexity labels such as `S`, `M`, `L`, and `XL`.
- For small work, prefer the shortest useful format and avoid detailed reasoning or verbose tracking summaries.

## Repository Notes
Keep memory entries short and durable. Record only information that is likely to matter in later sessions.