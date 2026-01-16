// Shared test fixtures. Kept in code, not as SKILL.md files on disk, so the
// skills CLI never discovers them in this repository.

export const SKILL = `---
name: indexit
description: >-
  Export Telegram data with the indexit CLI.
  Use when the user wants to export chats.
license: MIT
compatibility: Requires the indexit binary.
metadata:
  author: octopot
  version: "0.2.0"
  tool: indexit
  tool-version-range: ">=0.2.0 <0.3.0"
---

# indexit

See [the CLI reference](references/cli.md).
`

export function skillFiles(skill = SKILL) {
  return new Map([
    ['SKILL.md', Buffer.from(skill)],
    ['references/cli.md', Buffer.from('# CLI\n')],
  ])
}

export const REGISTRY = {
  marketplace: { name: 'octolab', description: 'Agent skills', owner: { name: 'OctoLab' } },
  tools: {
    indexit: {
      repository: 'octopot/indexit',
      skill: 'skills/indexit',
      description: 'Export Telegram data with the indexit CLI',
      homepage: 'https://indexit.octolab.org/',
      license: 'MIT',
      keywords: ['telegram'],
    },
    zeta: {
      repository: 'octolab/zeta',
      skill: 'skills/zeta',
      description: 'Zeta',
      homepage: 'https://zeta.octolab.org/',
      license: 'MIT',
    },
  },
}
