export const MAX_NAME_LENGTH = 40

const FALLBACK_NAME = 'Working on it'

const CODE_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts', 'py', 'rb', 'go', 'rs',
  'java', 'kt', 'swift', 'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'php', 'sh', 'bash',
  'zsh', 'ps1', 'sql', 'json', 'yaml', 'yml', 'toml', 'ini', 'xml', 'html', 'htm',
  'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'md', 'mdx', 'lock', 'env',
  'sol', 'lua', 'dart', 'scala', 'ex', 'exs', 'hs', 'tf', 'gradle', 'ipynb',
]

const BACKTICK_CODE = /`[^`]*`/g
const WITH_SLASH = /\S*[/\\]\S*/g
const FILE_NAME = new RegExp(`[\\w.-]*\\.(?:${CODE_EXTENSIONS.join('|')})(?![\\w.])`, 'gi')
const EMPTY_BRACKETS = /\(\s*\)|\[\s*\]|\{\s*\}/g
const EDGE_PUNCTUATION = /^[\s,;:–—-]+|[\s,;:–—-]+$/g

// One cleaner for every name the checklist shows: no code, paths or file
// names, at most 40 characters, never empty.
export function cleanName(raw: string): string {
  const name = raw
    .replace(BACKTICK_CODE, ' ')
    .replace(/`/g, ' ')
    .replace(WITH_SLASH, ' ')
    .replace(FILE_NAME, ' ')
    .replace(EMPTY_BRACKETS, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(EDGE_PUNCTUATION, '')

  if (name === '') {
    return FALLBACK_NAME
  }

  const capitalised = name[0]!.toUpperCase() + name.slice(1)

  return capitalised.length <= MAX_NAME_LENGTH ? capitalised : shorten(capitalised)
}

function shorten(name: string): string {
  const room = name.slice(0, MAX_NAME_LENGTH - 1)
  const lastSpace = room.lastIndexOf(' ')
  const cut = lastSpace > 0 ? room.slice(0, lastSpace) : room

  return cut.replace(EDGE_PUNCTUATION, '') + '…'
}
