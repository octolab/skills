---
code: null
id: I_kwDOU7S7Ps8AAAABi0BA3A
databaseId: 6631211228
number: 5
url: https://github.com/octolab/skills/issues/5
title: "ci: read the published record with skills-action inspect"
issueType: null
labels:
  - "type: improvement"
  - "scope: code"
  - "scope: docs"
  - "impact: medium"
  - "effort: easy"
assignees:
  - kamilsk
milestone: null
parent: null
issueFields: {}
state: CLOSED
stateReason: COMPLETED
duplicateOf: null
createdAt: 2026-11-26T16:43:54Z
updatedAt: 2026-11-26T16:54:37Z
lastEditedAt: 2026-11-26T16:54:37Z
closedAt: 2026-11-26T16:54:13Z
---

# ci: read the published record with skills-action inspect

## Motivation

`ci (install)` reads `plugins/<tool>/provenance.json` itself, with
`p.skills ?? { [p.tool]: { path: p.source.path } }`, a copy of the action's
reading of the record. skills-action v0.2.0 changed the record, adding
`skills`, without changing `schema: 1`, so the next change can drift from that
copy silently, and the install check then compares the wrong skills or none.
`ci` reads the record too, for the version in its Codex step. The record is
the action's format: since octomation/skills-action#3, its `inspect` command
reads it, and the catalog should read nothing of it.

The two workflows also pin the action each on its own line, and nothing keeps
them on one version: a bump or a hand edit can reach one file only. And
`ci (install)` runs on tags and weekly only, so a new pin of the action runs
there for the first time on the next publication.

## PoC

```yaml
# ci.install.yml
- name: Read the published skills
  id: published
  uses: octomation/skills-action@v0.2.1
  with:
    command: inspect
    tool: ${{ matrix.tool }}
# then source-repository, source-tag and skills-paths drive the comparison
```

```bash
grep -rn provenance.json .github/workflows    # nothing
```

## Acceptance criteria

- [x] `ci.install.yml` reads the published skills, the source repository and
      the source tag from `inspect` at `v0.2.1`, and parses no
      `provenance.json` of its own; it still compares every skill with the
      tool's release and installs each by name, for the published
      `maintainer 0.5.2` and `indexit 0.4.2` and for a plugin with an extra
      skill.
- [x] `ci.yml` checks with `v0.2.1` and reads no `provenance.json`.
- [x] `ci` fails when `.github/workflows` pins more than one version of
      octomation/skills-action.
- [x] A pull request or a push to `main` that changes `ci.install.yml` runs it
      for the latest tag of every tool.
- [x] `AGENTS.md` describes the checks as they run.

## Out of scope

- Changes of the action: `inspect` ships in octomation/skills-action v0.2.1.
- Upgrading an installed plugin from one release to the next, still checked
  by hand.
