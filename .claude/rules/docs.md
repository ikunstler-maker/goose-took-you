---
paths:
  - "docs/**"
---
# Docs rules
- Languages: SPEC, decisions, backlog, GLOSSARY in Ukrainian; TROUBLESHOOTING in English.
- `SPEC.md` changes only together with an owner-approved row in `decisions.md`, in the same PR.
- `decisions.md`: append only; a reversed decision gets a new row that refers to the old one; say who approved.
- `backlog.md` ≤40 lines. `TROUBLESHOOTING.md` ≤300 lines, ≤8 lines per entry, read by grep.
- `GLOSSARY.md`: one line per term; the UI word and the code name stay mapped; rename both in one PR.
- Full maintenance rules: `docs/MASTER_GUIDE.md`, Part A2. Do not edit MASTER_GUIDE without the owner asking.
