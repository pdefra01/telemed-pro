# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

See `_shared/skill-resolver.md` for the full resolution protocol.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| When creating a pull request, opening a PR, or preparing changes for review. | branch-pr | ~/.gemini/antigravity/skills/branch-pr/SKILL.md |
| When writing Go tests, using teatest, or adding test coverage. | go-testing | ~/.gemini/antigravity/skills/go-testing/SKILL.md |
| When creating a GitHub issue, reporting a bug, or requesting a feature. | issue-creation | ~/.gemini/antigravity/skills/issue-creation/SKILL.md |
| When user says "judgment day", "judgment-day", "review adversarial", "dual review", "doble review", "juzgar", "que lo juzguen". | judgment-day | ~/.gemini/antigravity/skills/judgment-day/SKILL.md |
| When user asks to create a new skill, add agent instructions, or document patterns for AI. | skill-creator | ~/.gemini/antigravity/skills/skill-creator/SKILL.md |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### branch-pr
- Every PR MUST link an approved issue (`Closes #N` where issue has `status:approved`)
- Every PR MUST have exactly one `type:*` label (e.g. `type:bug`, `type:feature`)
- Branch naming: `^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$`
- PR Body MUST contain: Linked Issue, PR Type, Summary, Changes Table, Test Plan, Contributor Checklist
- Commits MUST follow Conventional Commits format `type(scope): description`
- Do NOT add `Co-Authored-By` or AI attribution to commits

### go-testing
- Use table-driven tests for pure functions and multiple test cases
- Test Bubbletea Model state transitions directly (`m.Update()`)
- Use `teatest.NewTestModel` for full interactive flow tests
- Use golden file testing for visual output comparisons (`os.WriteFile` if `*update` else `os.ReadFile`)

### issue-creation
- Blank issues are disabled — MUST use Bug Report or Feature Request template
- Every issue gets `status:needs-review` automatically
- Maintainer MUST add `status:approved` before any PR can be opened
- Questions belong in Discussions, not issues
- Fill all required template fields including Pre-flight Checks

### judgment-day
- Always follow Skill Resolver Protocol before launching judges (inject compact rules into judge prompts)
- Launch TWO sub-agents as `delegate` (async, parallel), they must work independently
- Orchestrator synthesizes verdicts, never reviews code itself
- WARNINGs must be classified as real (fix required) or theoretical (report as INFO, do not fix)
- Fix and re-judge: if confirmed CRITICALs or real WARNINGs, delegate Fix Agent, then re-launch both judges
- Stop and ASK user after 2 fix iterations if issues remain
- DO NOT declare APPROVED until Round 1 judges return CLEAN or Round 2 has 0 CRITICALs and 0 real WARNINGs

### skill-creator
- Create skills when patterns repeat or project differs from generic best practices (don't duplicate existing docs)
- SKILL.md MUST include frontmatter: `name`, `description` (with "Trigger: ..."), `license: Apache-2.0`, `metadata.author`, `metadata.version`
- Include sections: When to Use, Critical Patterns, Code Examples, Commands, Resources
- Use `assets/` for templates/schemas and `references/` for local doc links (NO web URLs)
- Register new skill in `AGENTS.md` table

## Project Conventions

| File | Path | Notes |
|------|------|-------|

Read the convention files listed above for project-specific patterns and rules. All referenced paths have been extracted — no need to read index files to discover more.
