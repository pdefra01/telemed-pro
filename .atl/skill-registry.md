# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

See `_shared/skill-resolver.md` for the full resolution protocol.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| When creating a pull request, opening a PR, or preparing changes for review. | branch-pr | C:\Users\pdefr\.gemini\antigravity\skills\branch-pr\SKILL.md |
| Trigger: PRs over 400 lines, stacked PRs, review slices. Split oversized changes into chained PRs that protect review focus. | chained-pr | C:\Users\pdefr\.gemini\antigravity\skills\chained-pr\SKILL.md |
| Trigger: writing guides, READMEs, RFCs, onboarding, architecture, or review-facing docs. | cognitive-doc-design | C:\Users\pdefr\.gemini\antigravity\skills\cognitive-doc-design\SKILL.md |
| Trigger: PR feedback, issue replies, reviews, Slack messages, or GitHub comments. | comment-writer | C:\Users\pdefr\.gemini\antigravity\skills\comment-writer\SKILL.md |
| Trigger: Go tests, go test coverage, Bubbletea teatest, golden files. Apply focused Go testing patterns. | go-testing | C:\Users\pdefr\.gemini\antigravity\skills\go-testing\SKILL.md |
| Trigger: creating GitHub issues, bug reports, or feature requests. | issue-creation | C:\Users\pdefr\.gemini\antigravity\skills\issue-creation\SKILL.md |
| Trigger: judgment day, dual review, adversarial review, juzgar. Run blind dual review, fix confirmed issues, then re-judge. | judgment-day | C:\Users\pdefr\.gemini\antigravity\skills\judgment-day\SKILL.md |
| Trigger: new skills, agent instructions, documenting AI usage patterns. Create LLM-first skills with valid frontmatter. | skill-creator | C:\Users\pdefr\.gemini\antigravity\skills\skill-creator\SKILL.md |
| Trigger: implementation, commit splitting, chained PRs, or keeping tests and docs with code. | work-unit-commits | C:\Users\pdefr\.gemini\antigravity\skills\work-unit-commits\SKILL.md |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### branch-pr
- Every PR MUST link an approved issue (`Closes #N` where issue has `status:approved`).
- Every PR MUST have exactly one `type:*` label.
- Branch naming: `^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$`.
- PR Body MUST contain: Linked Issue, PR Type, Summary, Changes Table, Test Plan, Contributor Checklist.
- Commits MUST follow Conventional Commits format `type(scope): description`.
- Do NOT add `Co-Authored-By` or AI attribution to commits.

### chained-pr
- Split PRs over **400 changed lines** unless a maintainer explicitly accepts `size:exception`.
- Keep each PR reviewable in about **≤60 minutes**.
- Use one deliverable work unit per PR; keep tests/docs with code.
- Every child PR must include a dependency diagram marking current PR with `📍`.
- Feature Branch Chain uses draft tracker PR; children target tracker or parent.

### cognitive-doc-design
- Lead with the answer: Put decision/action first, context after.
- Progressive disclosure: Happy path first, then details/edge cases.
- Chunking: Group related info into small sections.
- Signposting: Use headings, labels, callouts.
- Recognition over recall: Prefer tables, checklists, examples over prose.

### comment-writer
- Be useful fast: Start with actionable point.
- Be warm and direct: Sound like a teammate, not a bot.
- Keep it short: 1-3 short paragraphs or tight bullet list.
- Explain why: Give technical reason for changes.
- Match thread language: Use user's language (Rioplatense/voseo in Spanish).
- No em dashes (—).

### go-testing
- Prefer table-driven tests for multiple cases; use `t.Run(tt.name, ...)`.
- Test behavior and state transitions, not implementation trivia.
- Use `t.TempDir()` for filesystem tests.
- For Bubbletea, test `Model.Update()` directly; use `teatest` for interactive flows.
- Golden files must be deterministic; update only through `-update` path.

### issue-creation
- Blank issues are disabled — MUST use a template (Bug Report or Feature Request).
- Every issue gets `status:needs-review` automatically on creation.
- A maintainer MUST add `status:approved` before any PR can be opened.
- Questions belong in Discussions, not issues.
- Search existing issues for duplicates before creating.

### judgment-day
- Resolve project skills before launching agents (inject compact rules).
- Launch **two blind judges in parallel**; never review code yourself.
- Wait for both judges before synthesis.
- Classify warnings as `WARNING (real)` or `WARNING (theoretical)`.
- Ask before fixing Round 1 confirmed issues.
- After any fix agent runs, immediately re-launch both judges in parallel.

### skill-creator
- Create a skill when patterns repeat, conventions differ, or complex workflows need instructions.
- Follow `docs/skill-style-guide.md` if available.
- Frontmatter MUST include: `name`, `description`, `license`, `metadata.author`, `metadata.version`.
- Keep body concise: target 180-450 tokens.

### work-unit-commits
- Commit by work unit (deliverable behavior/fix/docs).
- Keep tests with code in the same commit.
- Keep docs with the user-visible change they explain.
- Tell a story: reviewer should understand why each commit exists.
- If SDD tasks forecast >400 lines, group commits into chained PR slices.

## Project Conventions

| File | Path | Notes |
|------|------|-------|

Read the convention files listed above for project-specific patterns and rules. All referenced paths have been extracted — no need to read index files to discover more.
