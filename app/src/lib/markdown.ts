// The small Markdown that talking points and hints may use (ADR 0025): bold, italic, inline
// code, and a bulleted or numbered sub-list one level deep. Links show their text alone. It is
// parsed into styled text spans, never HTML: the overlays render each span as text, so whatever a
// talk file holds (raw HTML included) is shown as typed and never run.

/** A run of text in one style. Flags that are off are left out. */
export interface Span {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
}

export type Block = { kind: 'line'; spans: Span[] } | { kind: 'list'; ordered: boolean; items: Span[][] }

type Style = Omit<Span, 'text'>

const ESCAPABLE = '\\*_`[]'
const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c)
const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c)

function push(out: Span[], text: string, style: Style) {
  if (text === '') return
  const span: Span = { text }
  if (style.bold) span.bold = true
  if (style.italic) span.italic = true
  if (style.code) span.code = true
  const last = out.at(-1)
  if (last && !!last.bold === !!span.bold && !!last.italic === !!span.italic && !!last.code === !!span.code) last.text += text
  else out.push(span)
}

/** Where a run opened by `mark` at `from` closes, or -1. Emphasis may not start or end on a space. */
function closing(text: string, mark: string, from: number): number {
  if (isSpace(text[from])) return -1
  for (let j = text.indexOf(mark, from); j !== -1; j = text.indexOf(mark, j + 1)) {
    if (j === from || isSpace(text[j - 1]) || text[j - 1] === '\\') continue
    // A single mark must not be part of a double one (bold inside italic): skip the whole run.
    if (mark.length === 1 && (text[j + 1] === mark || text[j - 1] === mark)) {
      while (text[j + 1] === mark) j += 1
      continue
    }
    if (mark[0] === '_' && isWordChar(text[j + mark.length])) continue
    return j
  }
  return -1
}

function parse(text: string, style: Style, out: Span[]): Span[] {
  let i = 0
  let plain = ''
  const flush = () => {
    push(out, plain, style)
    plain = ''
  }
  while (i < text.length) {
    const c = text[i]
    if (c === '\\' && i + 1 < text.length && ESCAPABLE.includes(text[i + 1])) {
      plain += text[i + 1]
      i += 2
      continue
    }
    if (c === '`') {
      const j = text.indexOf('`', i + 1)
      if (j > i + 1) {
        flush()
        push(out, text.slice(i + 1, j), { ...style, code: true })
        i = j + 1
        continue
      }
    }
    if (c === '[') {
      const link = /^\[([^\]]+)\]\([^)]*\)/.exec(text.slice(i))
      if (link) {
        flush()
        parse(link[1], style, out)
        i += link[0].length
        continue
      }
    }
    if (c === '*' || c === '_') {
      // `_` only opens at the start of a word, so snake_case stays as typed.
      const opens = c === '*' || !isWordChar(text[i - 1])
      // Three marks are bold and italic together.
      const triple = text.startsWith(c + c + c, i)
      if (opens && triple) {
        const j = closing(text, c + c + c, i + 3)
        if (j !== -1) {
          flush()
          parse(text.slice(i + 3, j), { ...style, bold: true, italic: true }, out)
          i = j + 3
          continue
        }
      }
      const double = text[i + 1] === c
      const mark = double ? c + c : c
      const j = opens ? closing(text, mark, i + mark.length) : -1
      if (j !== -1) {
        flush()
        parse(text.slice(i + mark.length, j), double ? { ...style, bold: true } : { ...style, italic: true }, out)
        i = j + mark.length
        continue
      }
      plain += double ? mark : c
      i += mark.length
      continue
    }
    plain += c
    i += 1
  }
  flush()
  return out
}

/** One line of a point or hint, as styled spans. */
export function parseInline(text: string): Span[] {
  return parse(text, {}, [])
}

const ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/

/** A point or hint: its lines, and its sub-list after its first line (one level deep; deeper items join it). */
export function parseNote(text: string): Block[] {
  const blocks: Block[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    // A sub-list belongs to a point: its first line is always the point itself, so text typed
    // as "1) do X" or "- aside" reads as it always did.
    const item = blocks.length > 0 ? ITEM.exec(line) : null
    if (!item) {
      blocks.push({ kind: 'line', spans: parseInline(line.trim()) })
      continue
    }
    const ordered = item[2] !== undefined
    const last = blocks.at(-1)
    if (last?.kind === 'list') last.items.push(parseInline(item[3]))
    else blocks.push({ kind: 'list', ordered, items: [parseInline(item[3])] })
  }
  return blocks
}

/** A point as the short inline notes show it: its first line, never a sub-list. */
export function firstLine(text: string): Span[] {
  const first = parseNote(text)[0]
  return first?.kind === 'line' ? first.spans : []
}
