# The catalog site

One English page at <https://skills.octolab.org/>: what the catalog holds, a
card per tool linked to the tool's own site, the four ways to install a skill
and how versions work. Nextra 4 on Next.js, the stack shared with
octopot/indexit, octomation/maintainer, octopot/sushi, octomation/pulse and
octomation/skills-action. The site has its own npm dependencies; the catalog
itself has none.

The page is built from the catalog: a new release of a tool reaches it with no
edit here. Only a new tool or a new skill needs a hand, its card in
`products.mjs`; [AGENTS.md](../AGENTS.md#the-site) describes the steps.

## Run locally

Use Node 24 (the CI version). From `docs/`:

```sh
npm ci
npm run dev
```

Open the local URL printed by Next.js, normally <http://localhost:3000>.

## Build

For GitHub Pages:

```sh
TARGET=static SITE_URL=https://skills.octolab.org/ npm run build
```

Static output is written to `docs/dist/`. `SITE_URL` is required; add
`BASE_PATH=/skills` only when hosting under a path, as on the default
`octolab.github.io/skills/`. The [Pages workflow](../.github/workflows/cd.docs.yml)
supplies both: from the Pages configuration on main, from
[`.github/settings.json`](../.github/settings.json) for pull requests.

Tests of the data and of the Pages checks, from the root of the repository:

```sh
node --test .github/scripts/pages.test.mjs docs/catalog.test.mjs
```

## Where the page comes from

| Location | Purpose |
| --- | --- |
| `catalog.mjs` | Reads the catalog at build time: `catalog.json`, `plugins/<tool>/provenance.json`, every `SKILL.md` (with the frontmatter rules of skills-action) and the `<tool>--v*` tags; stops the build when a registered tool or skill has no card |
| `products.mjs` | The cards, written by hand: emoji, tagline, summary, install command, links and a summary per skill |
| `catalog.test.mjs` | The rules of `catalog.mjs`, on the real catalog and on made-up ones |
| `content/index.mdx` | The page: hero, cards, channels, versions, the publisher |
| `content/_meta.js` | The navbar: anchors into the page |
| `components/catalog.jsx` | Server components drawn from the catalog: counts, cards, release history, channels, the pinning example |
| `components/install.jsx` | The agent switch, the install terminal and the command of each card; one choice for the whole page, kept in `localStorage` |
| `components/channels.js` | The four channels and their commands, as the README lists them |
| `components/reveal.jsx` | Fades a block in when it scrolls into view; without scripts the page is whole |
| `app/globals.css` | Shared layouts, kept byte-identical to octopot/indexit |
| `app/brand.css` | The tokens of the catalog: card cream, plum ink, the violet of a date stamp |
| `app/landing.css` | The page: the aubergine terminal, the cards, the channels and the feature rows |
| `app/layout.jsx` | Site identity and Nextra theme |
| `app/[[...mdxPath]]/page.jsx` | Title and social metadata |
| `public/icon.svg` | The favicon: 📚 from Noto Emoji, Apache-2.0 |
| `public/og.png`, `scripts/og.html`, `scripts/og.mjs` | The social preview, its source and its renderer |

What a card shows and where it comes from:

| On the card | Source |
| --- | --- |
| Version, source tag and commit, digest | `plugins/<tool>/provenance.json` |
| Skills, in the order main then extra | the folders of `plugins/<tool>/skills/`, ordered by `catalog.json` |
| Supported binaries | `metadata.tool-version-range` of the main `SKILL.md` |
| Repository, site | `catalog.json` |
| Publication date | the commit of the `<tool>--v<version>` tag, or the last commit of `provenance.json` while the tag is not there yet |
| Release history | the `<tool>--v*` tags with their commit dates |
| Emoji, tagline, summary, install, links, skill summaries | `products.mjs` |

The cd workflow checks out the full history, so the dates and the history are
there; a shallow clone builds the page without dates and history rather than
with the dates of its shallow boundary.

## Social preview image

`public/og.png`, 1733×908, is the social preview. It is rendered from
`scripts/og.html`: the 📚 wordmark, the slogan, the three channels, the domain
and, on the right, a drawer of blank catalog cards with one stamped. It names
no tool and no version, so a release or a new tool leaves it as it is. To
render it, point `PLAYWRIGHT_CORE` at an installed `playwright-core` with a
Chromium of its own and run:

```sh
PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core/index.mjs node scripts/og.mjs
```

Check `width`, `height` and `alt` in `app/[[...mdxPath]]/page.jsx` when the
image or its text changes.

## Change the domain

The site is served from the custom domain `skills.octolab.org`, with HTTPS
enforced; `octolab.github.io/skills/` redirects to it, keeping the path. The
build bakes the domain into asset paths and metadata, and changing it in
Settings → Pages triggers no rebuild. To change it:

1. Update `pages.cname` in [`.github/settings.json`](../.github/settings.json)
   (remove it for the default domain) and push.
2. Change Settings → Pages → Custom domain to match, and turn Enforce HTTPS on
   again once the certificate is issued.
3. Rebuild: `gh workflow run cd.docs.yml -f reason="domain change"`.

The build stops while the two disagree, the deployment is smoke-tested, and
the daily [doctor](../.github/workflows/doctor.yml) reports a domain, HTTPS
enforcement or source that differs from the settings, a stale site, or a
published tool whose card the site does not show at its version.

## Keep it accurate

The catalog is the source of truth: the commands of `components/channels.js`
follow the [README](../README.md#-installation), and both change together.
Say on the page only what the catalog does; the tools' own sites describe the
tools.

`package.json` pins Zod to `4.1.12` under `nextra-theme-docs` to avoid [a
validation regression](https://github.com/shuding/nextra/issues/5036), and
overrides the xmldom of `speech-rule-engine@4.1.4`, as the sibling sites do;
see the [maintainer docs](https://github.com/octomation/maintainer/blob/main/docs/README.md#keep-the-release-accurate)
for when to drop them. Search is disabled: one page needs none.

No file of the site may be named `SKILL.md`: the skills CLI would discover it
as a skill of the catalog, and `ci` fails on the discovery check.
