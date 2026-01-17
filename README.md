# 🧑‍🔧 Skills

OctoLab's catalog of [agent skills](https://agentskills.io) that teach coding
agents — Claude Code, Codex and others — to use OctoLab command-line tools.
<!-- 🧑‍🔧 Skills to use OctoLab products. -->

Each skill ships with its tool: it lives in the tool's repository, is released
with the binary, and the tool's release workflow copies it here, the same way
[octolab/homebrew-tap](https://github.com/octolab/homebrew-tap) receives the
binaries. A skill teaches an agent how to use a tool; install the tool itself
separately.

## 🧩 Installation

Register the catalog once, then install the skills you need.

| Agent | Register | Install a skill | Update |
|:------|:---------|:----------------|:-------|
| Claude Code | `claude plugin marketplace add octolab/skills` | `claude plugin install <tool>@octolab` | `claude plugin update <tool>@octolab` |
| Codex | `codex plugin marketplace add octolab/skills` | `codex plugin add <tool>@octolab` | `codex plugin marketplace upgrade octolab` |
| Any agent, via [skills.sh](https://skills.sh/) | — | `npx skills add octolab/skills --skill <tool>` | `npx skills update` |

Install every skill at once with `npx skills add octolab/skills --skill '*'`.
Add `-a claude-code -a codex` to choose agents and `-g` to install for your user
instead of the current project.

### Versions and compatibility

A skill's version is the version of the tool it was written for, and it states
which binaries it supports in `metadata.tool-version-range`: up to the next
breaking release, which before 1.0 is the next minor version. A skill always
starts by checking the installed binary with `<tool> version`.

`main` holds the latest release of every skill, so updating a skill can move
it past what an older binary supports; the skill then tells the agent to use
the copy embedded in the binary instead. Codex upgrades registered catalogs
when a session starts; Claude Code does so only if you turn on auto-update.

Each release is also tagged `<tool>--v<version>`. To keep one skill on a
release (`X.Y.Z` stands for the version you need):

```bash
npx skills add 'octolab/skills#<tool>--vX.Y.Z' --skill <tool>
```

Registering the catalog at a tag pins the whole catalog, every tool included:
`claude plugin marketplace add 'octolab/skills#<tool>--vX.Y.Z'` or
`codex plugin marketplace add octolab/skills --ref <tool>--vX.Y.Z`. Codex
refuses to change the ref of a catalog that is already registered: run
`codex plugin marketplace remove octolab` first.

A tool that embeds its skill installs the copy that matches the binary, offline:
`<tool> skill install --agent claude-code` or `--agent codex`.

Use one channel per agent. Two copies of a skill — say, a plugin and an
installed copy — both load, and an outdated one can mislead the agent.

## 📦 Products

### 🗃️ [indexit][]

Export Telegram dialogs, history and media as JSONL.

> The skill and the `indexit skill` commands arrive with the next indexit
> release; until then these commands have nothing to install.

```bash
claude plugin install indexit@octolab
```

```bash
codex plugin add indexit@octolab
```

```bash
npx skills add octolab/skills --skill indexit
```

```bash
indexit skill install --agent claude-code
indexit skill status
```

[indexit]: https://indexit.octolab.org/


<p align="right">made with ❤️ for everyone by <a href="https://www.octolab.org/">OctoLab</a></p>
