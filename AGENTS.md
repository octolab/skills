# Agent guide

This repository is a catalog of agent skills for OctoLab tools. It is filled by
the tools' release workflows, like `octolab/homebrew-tap`. Read this before
changing anything.

## What is generated and what is not

| Path | Owner | Edit by hand |
| --- | --- | --- |
| `catalog.json` | maintainers | yes: registers tools |
| `plugins/<tool>/` | the tool's release workflow | never |
| `.claude-plugin/marketplace.json` | `scripts/generate.mjs` | never; regenerate |
| `plugins/<tool>/.claude-plugin/plugin.json` | `scripts/generate.mjs` | never; regenerate |
| `README.md`, `AGENTS.md`, `scripts/`, `tests/`, `.github/` | maintainers | yes |

After changing a tool's description, homepage or keywords in `catalog.json`,
run `node scripts/generate.mjs` and commit the result. The plugin `version`
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
`scripts/lib.mjs` rejects anything else. `metadata` must contain:

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
`tests/lib.test.mjs` holds the shared test vector.

**Tags.** `<tool>--v<version>` points at the commit that published that version.
Tags are never moved or deleted: the publish action never does it, and nobody
does it by hand. A ruleset enforcing this is deferred until the first
publications work end to end.

## Publishing

A tool's release workflow calls the action after GoReleaser has created the
GitHub release:

```yaml
- name: Mint the catalog token
  id: skills
  uses: actions/create-github-app-token@v3.2.0
  with:
    client-id: ${{ secrets.OCTOLAB_RELEASER_CLIENT_ID }}
    private-key: ${{ secrets.OCTOLAB_RELEASER_KEY }}
    owner: octolab
    repositories: skills
    permission-contents: write
- name: Publish the skill
  uses: octolab/skills/.github/actions/publish@<commit>
  with:
    tool: indexit
    token: ${{ steps.skills.outputs.token }}
```

`OCTOLAB_RELEASER_CLIENT_ID` and `OCTOLAB_RELEASER_KEY` belong to the GitHub App
"OctoLab Releaser", which also writes to the Homebrew tap. Mint a separate
token for this repository: the tap token is scoped to the tap. Pin the action to a reviewed commit.

`source-tag` and `source-sha` default to the tag push that triggered the
workflow. To re-run a publication from `workflow_dispatch`, pass both
explicitly: on a branch they would be the branch name and its head.

The action, `scripts/publish.mjs`:

1. Reads `catalog.json` from `main` and requires the caller's repository to be
   the tool's registered repository.
2. Requires the release tag to be annotated, signed and verified by GitHub, to
   point at the released commit, and to have a published, non-prerelease GitHub
   release. `allow-unverified-tag: true` is a maintainer exception.
3. Reads the skill directory at that commit, validates it, and requires
   `metadata.version` to equal the tag.
4. Writes `plugins/<tool>/` and regenerates `marketplace.json` in one
   `createCommitOnBranch` call, `chore(<tool>): publish vX.Y.Z`. If another
   tool published first, it re-reads `main` and retries; if the tool's
   registration changed meanwhile, it stops.
5. Tags the commit `<tool>--vX.Y.Z` only after GitHub reports it verified.
   Tags created with the App token trigger `ci.<tool>.yml`.

Running it again is safe:

| State | Result |
| --- | --- |
| Tag exists with the same source and files | success, nothing written |
| Version on `main` without its tag | tag the commit that published it, after checking it and only if GitHub shows it verified |
| Another run created the tag for the same publication | success |
| Tag exists with a different source or files | failure: the release is frozen |
| `main` holds a newer version | failure: no downgrades |

"Same files" means the files are hashed again, not the digest recorded in
`provenance.json` trusted. Submodules, symlinks and dotfiles in a skill fail
the publication.

Payload files are published as regular files: executable bits are not kept.
Run bundled scripts through their interpreter.

## Adding a tool

1. Register it in `catalog.json` and add a section to `README.md`.
2. Give the GitHub App access to the tool's repository if its workflow reads it
   with the catalog token; by default it reads with its own `github.token`.
3. Add the two steps above to the tool's release workflow.
4. Copy `.github/workflows/ci.indexit.yml` to `ci.<tool>.yml`.
5. Release the tool; check that `ci` and `ci.<tool>` pass.

## Checks

```sh
npm test                              # unit tests, publish idempotency
node scripts/generate.mjs --check     # generated files are current
node scripts/validate.mjs --tags      # registry, payloads, digests, tags
CLAUDE=claude node scripts/claude-validate.mjs
```

`ci` runs all of them on every push and pull request, plus `claude plugin
validate` at a pinned version, a skills CLI discovery check, and installing
every plugin from the working tree with Claude Code and Codex. `ci.<tool>.yml`
installs a published tag from GitHub through every channel.

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
