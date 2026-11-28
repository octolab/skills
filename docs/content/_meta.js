// One page: the landing is the catalog. The navbar links jump to its sections.
export default {
  '*': { theme: { timestamp: false } },
  index: {
    title: 'Home', type: 'page', display: 'hidden',
    theme: { layout: 'full', sidebar: false, toc: false, breadcrumb: false, pagination: false, copyPage: false },
  },
  tools: { title: 'Tools', type: 'page', href: '/#tools' },
  install: { title: 'Install', type: 'page', href: '/#install' },
  versions: { title: 'Versions', type: 'page', href: '/#versions' },
}
