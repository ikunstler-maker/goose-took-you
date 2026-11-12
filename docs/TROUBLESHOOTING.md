# Troubleshooting

Solved problems: symptom → root cause → fix. Read by grep, never whole. Rules: `docs/MASTER_GUIDE.md`, Part A2.

Entry format (≤8 lines):

```
### <short title>
- Symptom: <exact error text or behaviour, searchable>
- Root cause: <one or two lines>
- Fix: <what to do; file/command>
- Verify: <command or check>
- Seen: YYYY-MM-DD
```

## Env

### PR cannot be opened in an empty repository
- Symptom: repository has no branches; `git ls-remote origin` prints nothing; no base branch for a PR.
- Root cause: GitHub needs an existing base branch that shares history with the head branch.
- Fix: with the owner's permission push one empty commit to `main` first, then branch from it.
- Verify: `git ls-remote origin` lists `refs/heads/main`.
- Seen: 2026-11-12

## Build

## Render

## Sim

## CI
