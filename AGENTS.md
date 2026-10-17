# Agent guide

This repository is a catalog of agent skills for OctoLab tools. It is filled by
the tools' release workflows, like `octolab/homebrew-tap`, and holds only data:
the publisher, the checks and the generator live in
[octomation/skills-action](https://github.com/octomation/skills-action). Read this
before changing anything.

## What is generated and what is not

| Path | Owner | Edit by hand |
| --- | --- | --- |
| `catalog.json` | maintainers | yes: registers tools |
| `plugins/<tool>/` | the tool's release workflow | never |
| `.claude-plugin/marketplace.json` | `octolab-skills generate` | never; regenerate |
| `plugins/<tool>/.claude-plugin/plugin.json` | `octolab-skills generate` | never; regenerate |
| `README.md`, `AGENTS.md`, `.github/` | maintainers | yes |

After changing a tool's description, homepage or keywords in `catalog.json`,
run `npx --yes github:octomation/skills-action#vX.Y.Z generate` with the version
`ci.yml` pins, and commit the result. The plugin `version`
doesn't change, so Claude Code users see the new text with the tool's next
release.

A published skill is frozen. A wrong skill is fixed in the tool's repository
and ships with its next release; never patch `plugins/<tool>/` here.

## Layout

```text
catalog.json                        registry: tools allowed to publish
.claude-plugin/marketplace.json     catalog "octolab" for Claude Code, Codex, skills CLI
plugins/<tool>/
  .claude-plugin/plugin.json        generated; version = the tool release
  provenance.json                   source repository, tag, commit, payload digest
  skills/<tool>/                    exact copy of the tool's skills/<tool>/ at the release tag
```

Claude Code and Codex read the same `.claude-plugin/` manifests. The skills CLI
follows the catalog's local `./plugins/<tool>` entries. Keep every entry local:
remote sources are invisible to the skills CLI.

Don't add a `bin/` or `CLAUDE.md` to a plugin root, or SKILL.md files anywhere
outside `plugins/`: the skills CLI would discover them.

## Contracts

**Skill.** `SKILL.md` uses only Agent Skills fields. The supported YAML subset is
scalars, folded and literal blocks, and one level of nested string maps;
the action rejects anything else. `metadata` must contain:

- `version`: the tool release without `v`;
- `tool`: the tool name, equal to `name` and the directory;
- `tool-version-range`: space-separated comparators (`=`, `>=`, `>`, `<=`, `<`)
  that must include `version`.

The default range covers binaries up to the next breaking release:
`1.4.2` → `>=1.4.2 <2.0.0`, `0.4.2` → `>=0.4.2 <0.5.0`, `0.0.2` and prereleases
→ exact. Patch compatibility within `0.Y.*` is an OctoLab commitment, not a
semver guarantee. A tool may declare a narrower range, never a wider one: it
always starts at the release itself and ends no later than the default.
Versions are strict semver without build metadata; a prerelease matches only a
range that names a prerelease of the same version.

**Digest.** `octolab-skill-sha256-v1`: for every file of the skill directory, in
bytewise order of its UTF-8 POSIX relative path, sha256 takes the path, NUL, the
decimal byte length, NUL and the bytes. Symlinks and dotfiles are not allowed.
Tools that embed their skill compute the same value in `<tool> skill info`;
the action's `tests/lib.test.mjs` holds the shared test vector.

**Tags.** `<tool>--v<version>` points at the commit that published that version.
Tags are never moved or deleted: the action never does it, and nobody
does it by hand. A ruleset enforcing this is deferred until the first
publications work end to end.

## Publishing

A tool's release workflow calls
[octomation/skills-action](https://github.com/octomation/skills-action) after
GoReleaser has created the GitHub release; its README describes the inputs,
the checks and what a repeated run does. The token comes from the GitHub App
"OctoLab Releaser" (`OCTOLAB_RELEASER_CLIENT_ID`, `OCTOLAB_RELEASER_KEY`),
which also writes to the Homebrew tap: mint a separate token for this
repository, the tap token is scoped to the tap.

Each publication is one commit `chore(<tool>): publish vX.Y.Z`, signed by the
App, that writes `plugins/<tool>/` and regenerates `marketplace.json`, and
the tag `<tool>--vX.Y.Z` on it. Tags created with the App token trigger
`ci.install.yml`.

## Adding a tool

1. Register it in `catalog.json` and add a section to `README.md`.
2. Add the token and publish steps from the action's README to the tool's
   release workflow; the action reads the tool with the workflow's own
   `github.token`.
3. Release the tool; check that `ci` and `ci.install` pass.

## Checks

```sh
npx --yes github:octomation/skills-action#vX.Y.Z check   # generated files, registry, payloads, digests, tags, claude plugin validate
```

`ci` runs the action's `check` on every push and pull request, plus a skills
CLI discovery check and installing every plugin from the working tree with
Claude Code and Codex. `ci.install.yml` installs a published tag from GitHub
through every channel: each new tag, and weekly the latest tag of every tool.

Not covered automatically: upgrading an installed plugin from one release to
the next. Codex accepts only git hosts for upgradable catalogs, so this needs
two real releases; check it by hand when a tool publishes its second release. While the
catalog is empty, the "Marketplace has no plugins defined" warning is the one
finding tolerated.

## Repository settings

`.github/settings.yml` describes the repository and is applied by the settings
app. Configure by hand:

- no required reviews on `main`, so the GitHub App can commit;
- the GitHub App "OctoLab Releaser" with contents write access.

Deferred: a tag ruleset for `*--v*` that blocks updates and deletions and
allows creation.
