// The cards of the catalog site: what a person reads about each tool, written
// by hand. Everything that changes with a release (version, skills, ranges,
// digests, tags, dates) comes from the catalog itself through catalog.mjs.
//
// One entry per tool registered in catalog.json, under the same key, with a
// summary for every skill catalog.json registers for it: the build stops when
// a registered tool or skill has no card here, published or not. Order does
// not matter; the page follows catalog.json. AGENTS.md ("The site") describes
// each field.
export const products = {
  indexit: {
    emoji: '🗃️',
    tagline: 'Your Telegram. Your data.',
    summary: 'Export dialogs, history and media as JSONL, fetch messages by link and turn a post into a Markdown note whose photos keep displaying.',
    install: 'brew install --formula octolab/tap/indexit',
    guide: 'https://indexit.octolab.org/guide/agents/',
    releaseNotes: 'https://indexit.octolab.org/changelog/v{version}/',
    embedded: true,
    skills: {
      indexit: 'Lists dialogs and forum topics, exports history as JSONL, downloads media and saves a post as a note with its photos.',
    },
  },
  maintainer: {
    emoji: '👨‍🔧',
    tagline: 'Keep the little things moving.',
    summary: 'Keep a workspace of GitHub checkouts in step, see local work across them in a local hub and plan your next contribution.',
    install: 'brew install --formula octolab/tap/maintainer',
    guide: 'https://maintainer.octolab.org/agents/',
    releaseNotes: 'https://maintainer.octolab.org/changelog/v{version}/',
    embedded: true,
    skills: {
      maintainer: 'Plans and applies fetch, reads status across checkouts, runs the local hub and plans contributions with the calendar.',
      review: 'Writes a code, issue or security review report of a repository in one fixed form, and checks the form.',
    },
  },
}
