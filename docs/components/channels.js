// The ways to install a skill, as the README of the catalog lists them: plain
// data, read by the server components of catalog.jsx and by install.jsx.

export const CATALOG = 'octolab/skills'

export const CHANNELS = {
  'claude-code': {
    label: 'Claude Code',
    register: `claude plugin marketplace add ${CATALOG}`,
    install: (t) => [`claude plugin install ${t.tool}@octolab`],
    update: (t) => `claude plugin update ${t.tool}@octolab`,
    note: 'The plugin installs every skill of the tool; Claude Code shows each as <plugin>:<skill>.',
  },
  codex: {
    label: 'Codex',
    register: `codex plugin marketplace add ${CATALOG}`,
    install: (t) => [`codex plugin add ${t.tool}@octolab`],
    update: () => 'codex plugin marketplace upgrade octolab',
    note: 'Codex upgrades the registered catalog when a session starts.',
  },
  skills: {
    label: 'skills CLI',
    register: null,
    install: (t) => [`npx skills add ${CATALOG} ${t.skills.map((s) => `--skill ${s.name}`).join(' ')}`],
    all: `npx skills add ${CATALOG} --skill '*'`,
    update: () => 'npx skills update',
    note: 'Any agent the skills CLI knows. Add -a claude-code -a codex to choose agents, -g for your user.',
  },
  binary: {
    label: 'The binary',
    register: null,
    install: (t) => (t.embedded ? [`${t.tool} skill install --agent claude-code`] : []),
    update: (t) => `${t.tool} skill status`,
    updateLabel: 'Check',
    note: 'The binary installs the copy it embeds, offline, at its own version; use --agent codex for Codex.',
  },
}

export const DEFAULT = 'claude-code'
