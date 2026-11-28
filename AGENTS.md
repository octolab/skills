# Agent guide

This repository is a catalog of agent skills for OctoLab tools. It is filled by
the tools' release workflows, like `octolab/homebrew-tap`, and holds only data
and the site that shows it at <https://skills.octolab.org/>. The publisher, the
checks and the generator live in
[octomation/skills-action](https://github.com/octomation/skills-action). Read this
before changing anything.

## What is generated and what is not

| Path | Owner | Edit by hand |
| --- | --- | --- |
| `catalog.json` | maintainers | yes: registers tools and their extra skills |
| `plugins/<tool>/` | the tool's release workflow | never |
| `.claude-plugin/marketplace.json` | `octolab-skills generate` | never; regenerate |
| `plugins/<tool>/.claude-plugin/plugin.json` | `octolab-skills generate` | never; regenerate |
| `README.md`, `AGENTS.md`, `.github/` | maintainers | yes |
| `docs/products.mjs` | maintainers | yes: the card of every registered tool on the site |
| `docs/` other than `products.mjs` | maintainers | yes: the site, see [docs/README.md](docs/README.md) |

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
docs/                               the catalog site, built from the files below
  products.mjs                      the cards of the site, by hand
.claude-plugin/marketplace.json     catalog "octolab" for Claude Code, Codex, skills CLI
plugins/<tool>/
  .claude-plugin/plugin.json        generated; version = the tool release
  provenance.json                   source repository, tag, commit, digest of every skill
  skills/<tool>/                    exact copy of the tool's main skill at the release tag
  skills/<name>/                    exact copy of each extra skill the release published
```

A tool has one main skill, named after the tool, and may register extra skills
in `catalog.json` under `extra-skills`, a list of names:

```json
"maintainer": {
  "repository": "octomation/maintainer",
  "skill": "skills/maintainer",
  "extra-skills": ["review"]
}
```

An extra skill lives in the tool's repository next to the main one, in
`skills/review/` for `skill: skills/maintainer`. Agents show plugin skills as
`<plugin>:<skill>`, e.g. `maintainer:review`; the skills CLI installs them by
bare name, so a skill name is unique across the catalog: an extra skill can't
be named after a tool or another tool's extra skill. A registered skill that a
published version lacks is valid; a release fails to publish if a registered
skill is missing at its tag, so register a skill once the release that ships
it is near.

Claude Code and Codex read the same `.claude-plugin/` manifests. The skills CLI
follows the catalog's local `./plugins/<tool>` entries. Keep every entry local:
remote sources are invisible to the skills CLI.

Don't add a `bin/` or `CLAUDE.md` to a plugin root, or SKILL.md files anywhere
outside `plugins/`, the site in `docs/` included: the skills CLI would discover
them.

## Contracts

**Skill.** `SKILL.md` uses only Agent Skills fields. The supported YAML subset is
scalars, folded and literal blocks, and one level of nested string maps;
the action rejects anything else. `metadata` must contain:

- `version`: the tool release without `v`;
- `tool`: the tool name, equal to `name` and the directory for the main
  skill; an extra skill has `name` equal to its directory and `tool` the tool;
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

**Provenance.** `source.path` and `digest` describe the main skill. A
publication with extra skills adds `skills`: a map from each published skill,
the main one first, to its `path` in the tool's repository and its digest. A
record without `skills`, as every single-skill tool and every publication
before skills-action v0.2.0 writes, holds the main skill only.

**Tags.** `<tool>--v<version>` points at the commit that published that version.
Tags are never moved or deleted: the action never does it, and the
ruleset "release tags" refuses it to everyone, admins included.

## Publishing

A tool's release workflow calls
[octomation/skills-action](https://github.com/octomation/skills-action) after
GoReleaser has created the GitHub release; its README describes the inputs,
the checks and what a repeated run does. The token comes from the GitHub App
"OctoLab Releaser" (`OCTOLAB_RELEASER_CLIENT_ID`, `OCTOLAB_RELEASER_KEY`),
which also writes to the Homebrew tap: mint a separate token for this
repository, the tap token is scoped to the tap.

Each publication is one commit `chore(<tool>): publish vX.Y.Z`, signed by the
App, that writes `plugins/<tool>/` with every published skill and regenerates
`marketplace.json`, and the tag `<tool>--vX.Y.Z` on it. Tags created with the
App token trigger `ci.install.yml`.

## Adding a tool

1. Register it in `catalog.json` and add a section to `README.md`; list its
   extra skills, if any, under `extra-skills`.
2. Add its card to `docs/products.mjs`, as [The site](#the-site) describes,
   in the same pull request: `cd.docs` builds the pull request and stops
   without the card. The site shows the tool from its first publication.
3. Add the token and publish steps from the action's README to the tool's
   release workflow; the action reads the tool with the workflow's own
   `github.token`.
4. Release the tool; check that `ci`, `ci.install` and `cd.docs` pass and
   that the tool's card is on <https://skills.octolab.org/>.

## The site

`docs/` builds <https://skills.octolab.org/>, one page that shows what the
catalog holds and links each tool to its own site. Everything that changes
with a release, the version, the skills, the supported binaries, the source
tag, the digest, the publication date and the release history, is read at
build time from `catalog.json`, `plugins/<tool>/` and the `<tool>--v*` tags
(`docs/catalog.mjs`). What a person reads about a tool is written by hand in
`docs/products.mjs`; for now nothing else writes it.

A publication commit touches `plugins/`, so it runs `cd.docs`, which rebuilds
and deploys the site. What each event needs:

| Event | By hand |
| --- | --- |
| A new release of a published tool | nothing; check the card after `cd.docs` |
| A new tool | its card in `docs/products.mjs`, in the pull request that registers it |
| A new extra skill | its summary under the tool's `skills`, in the pull request that registers it |
| A new site, release notes path or install command of a tool | the card's fields |
| A homepage or repository in `catalog.json` | the site reads them; move the card's `guide` and `releaseNotes` with the homepage, and regenerate as above |
| A registered tool removed from `catalog.json` | remove its card too: the build refuses a card it cannot match |

A card is an entry of `products`, under the tool's name:

```js
maintainer: {
  emoji: '👨‍🔧',                     // the tool's own emoji, as its README and site use it
  tagline: 'Keep the little things moving.', // the tool's slogan, from its site
  summary: 'Keep a workspace of …',  // one sentence: what the tool does, not the skill
  install: 'brew install --formula octolab/tap/maintainer', // how to get the binary
  guide: 'https://maintainer.octolab.org/agents/',          // the tool's page about agents
  releaseNotes: 'https://maintainer.octolab.org/changelog/v{version}/', // {version} is the published one
  embedded: true,                    // the binary has `skill install`; false when omitted
  skills: {                          // one line per registered skill, main first
    maintainer: 'Plans and applies fetch, …',
    review: 'Writes a code, issue or security review report …',
  },
},
```

Take the words from the tool's own site and README, not from its SKILL.md: a
skill's description is written for an agent to choose it, a card for a person.
Check every link with `curl -sI`, and that the release notes path holds for
the published version. `emoji`, `tagline`, `summary`, `install` and a summary
for every registered skill are required; `guide` and `releaseNotes` are
optional; `embedded` is false unless the card says true.

The build stops, naming the file and the tool, when a registered tool has no
card or misses a required field, a registered skill has no summary, a card or
summary names something `catalog.json` does not register, or a plugin
publishes a skill the registry does not list. These are checked whether or
not the tool has published, so a registration without its card fails its own
pull request, not the first publication on main. A registered tool shows only
once `plugins/<tool>/provenance.json` exists. A tool can't be named `tools`,
`install` or `versions`: those are the anchors of the page's sections. To see
the page, run the site as [docs/README.md](docs/README.md) says; its tests are
`node --test .github/scripts/pages.test.mjs docs/catalog.test.mjs`.

After the deploy, `cd.docs` and the daily `doctor` check that the page shows a
card for every published tool at its version: a red `doctor` the morning after
a release means the site did not deploy it; read the failed `cd.docs` run.

## Checks

```sh
npx --yes github:octomation/skills-action#vX.Y.Z check   # generated files, registry, payloads, digests, tags, claude plugin validate
```

`ci` runs the action's `check` on every push and pull request, plus a skills
CLI discovery check and installing every plugin from the working tree with
Claude Code and Codex; it fails if the workflows pin more than one version of
the action. `ci.install.yml` installs a published tag from GitHub through
every channel and compares every skill that the action's `inspect` reads from
the tag with the tool's release: each new tag, weekly and on a change of the
workflow the latest tag of every tool.

`cd.docs` builds the site on every pull request that touches it, the catalog
or `plugins/`, and deploys it from main to GitHub Pages; the daily `doctor`
compares the Pages settings with `.github/settings.json` and smoke-tests the
live site. [docs/README.md](docs/README.md) has the details.

Not covered automatically: upgrading an installed plugin from one release to
the next. Codex accepts only git hosts for upgradable catalogs, so this needs
two real releases. It was checked by hand with maintainer releases up to v0.6.2;
check it again when a channel changes how it upgrades plugins.

## Repository settings

`.github/settings.yml` describes the repository and is applied by the settings
app. Configure by hand:

- no required reviews on `main`, so the GitHub App can commit;
- the GitHub App "OctoLab Releaser" with contents write access;
- Settings → Pages: Source **GitHub Actions**, custom domain
  `skills.octolab.org` with Enforce HTTPS, as `pages` in
  `.github/settings.json` declares; the `github-pages` environment deploys
  from `main` only. Nothing applies `.github/settings.json`: `pages.mjs` reads
  it to check the build and the live site against Settings, while the settings
  app applies `.github/settings.yml`. Set Pages first: until the domain in
  Settings matches `pages.cname` and Enforce HTTPS is on, `cd.docs` on main
  stops at "Check the Pages domain": Pages reports an `http://` URL until
  HTTPS is enforced;
- the tag ruleset "release tags" for `refs/tags/*--v*`: active, rules
  "Restrict updates" and "Restrict deletions", no bypass, so creation stays
  open to the GitHub App.
