# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

See `_shared/skill-resolver.md` for the full resolution protocol.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| creating, opening, or preparing PRs for review. | branch-pr | C:\Users\pdefr\.gemini\config\skills\branch-pr\SKILL.md |
| PRs over 400 lines, stacked PRs, review slices. Split oversized changes into chained PRs that protect review focus. | chained-pr | C:\Users\pdefr\.gemini\config\skills\chained-pr\SKILL.md |
| writing guides, READMEs, RFCs, onboarding, architecture, or review-facing docs. | cognitive-doc-design | C:\Users\pdefr\.gemini\config\skills\cognitive-doc-design\SKILL.md |
| PR feedback, issue replies, reviews, Slack messages, or GitHub comments. | comment-writer | C:\Users\pdefr\.gemini\config\skills\comment-writer\SKILL.md |
| Go tests, go test coverage, Bubbletea teatest, golden files. Apply focused Go testing patterns. | go-testing | C:\Users\pdefr\.gemini\config\skills\go-testing\SKILL.md |
| creating GitHub issues, bug reports, or feature requests. | issue-creation | C:\Users\pdefr\.gemini\config\skills\issue-creation\SKILL.md |
| judgment day, dual review, adversarial review, juzgar. Run blind dual review, fix confirmed issues, then re-judge. | judgment-day | C:\Users\pdefr\.gemini\config\skills\judgment-day\SKILL.md |
| new skills, agent instructions, documenting AI usage patterns. Create LLM-first skills with valid frontmatter. | skill-creator | C:\Users\pdefr\.gemini\config\skills\skill-creator\SKILL.md |
| improve skills, audit skills, refactor skills, skill quality. Audit and upgrade existing LLM-first skills. | skill-improver | C:\Users\pdefr\.claude\skills\skill-improver\SKILL.md |
| implementation, commit splitting, chained PRs, or keeping tests and docs with code. | work-unit-commits | C:\Users\pdefr\.gemini\config\skills\work-unit-commits\SKILL.md |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### branch-pr
- Ensure the PR description matches the implemented issue.
- Verify tests pass before proposing the branch for merge.

### chained-pr
- Keep each PR in the chain under 400 lines to ensure focused reviews.
- Stack PRs logically based on dependencies (e.g. data layer first, then UI).

### cognitive-doc-design
| Pattern | Rule |
|---------|------|
| Lead with the answer | Put the decision, action, or outcome first. Context comes after. |
| Progressive disclosure | Start with the happy path, then add details, edge cases, and references. |
| Chunking | Group related information into small sections. Keep flat lists short. |
| Signposting | Use headings, labels, callouts, and summaries so readers know where they are. |
| Recognition over recall | Prefer tables, checklists, examples, and templates over prose that must be remembered. |
| Review empathy | Design docs so reviewers can verify intent without reconstructing the whole story. |

### comment-writer
- Keep comments concise and direct.
- Explain "why" instead of just "what".
- Ensure a warm and collaborative tone.

### go-testing
- Use table-driven tests where appropriate.
- Include failure cases in tests, not just the happy path.
- Avoid tight coupling to internal implementation details.

### issue-creation
- Include steps to reproduce, expected vs actual behavior in bugs.
- Provide clear context and proposed solutions in feature requests.

### judgment-day
- Validate fixes independently of the author’s original context.
- Identify edge cases not covered by the initial implementation.
- Escalate unresolvable issues rather than forcing a fix.

### skill-creator
- Output skills following the SKILL.md template with YAML frontmatter.
- Focus on practical triggers, inputs, and strict rules.

### skill-improver
- Refactor skills to improve precision and trigger words.
- Consolidate rules to stay under 15 actionable lines per skill.

### work-unit-commits
- Make atomic commits that accomplish exactly one logical change.
- Use conventional commits format.

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| (None) | | |

Read the convention files listed above for project-specific patterns and rules. All referenced paths have been extracted — no need to read index files to discover more.
