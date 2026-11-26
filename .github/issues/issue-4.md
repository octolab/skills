---
code: null
id: I_kwDOU7S7Ps8AAAABivNhNg
databaseId: 6626173238
number: 4
url: https://github.com/octolab/skills/issues/4
title: "catalog: accept the extra skills of a tool"
issueType: null
labels:
  - "type: feature"
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
createdAt: 2026-11-26T11:59:21Z
updatedAt: 2026-11-26T16:20:18Z
lastEditedAt: 2026-11-26T16:20:18Z
closedAt: 2026-11-26T16:19:31Z
---

# catalog: accept the extra skills of a tool

## Motivation

octomation/skills-action#2 lets a tool publish extra skills next to its main
one. The catalog checks every push with the action that `ci.yml` pins, and
`v0.1.1` refuses any file of a plugin outside `skills/<tool>/`. Once a tool
publishes a second skill with the new action, the catalog's own checks must
already run on it, and the catalog must state which extra skills a tool may
publish. The first tool is maintainer with `review`
(octomation/maintainer#549).

## PoC

```bash
# after octomation/skills-action v0.2.0
npx --yes github:octomation/skills-action#v0.2.0 check     # green on the live catalog
# catalog.json registers review as an extra skill of maintainer
# after maintainer v0.6.0:
plugins/maintainer/skills/maintainer/SKILL.md
plugins/maintainer/skills/review/SKILL.md
```

## Acceptance criteria

- [x] `ci.yml` pins octomation/skills-action `v0.2.0`, `ci.install.yml`
      reads provenance in the form that `v0.2.0` defines, and `check` is
      green on the live catalog: the published `maintainer 0.5.2` and
      `indexit 0.4.2` read as before.
- [x] `catalog.json` registers `review` as an extra skill of `maintainer`, in
      the form that skills-action#2 defines; `check` accepts it while the
      published maintainer lacks it.
- [x] `ci.install` compares every skill that the provenance of the checked
      tag lists, also on the weekly run over older tags.
- [x] `README.md` and `AGENTS.md` describe extra skills: the layout, the
      registry key and the `<plugin>:<skill>` names.
- [x] The entry of indexit does not change.

## Out of scope

- Publishing: maintainer v0.6.0 publishes `review` through its own release.
- The tag ruleset deferred in `AGENTS.md`.
