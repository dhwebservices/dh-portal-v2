/**
 * XML property lists, the format every MDM message is in.
 *
 * Phones send XML plists (never binary) to the check-in and command URLs, and
 * expect XML back. This covers the types MDM uses: dict, array, string,
 * integer, real, true/false, date and data. Binary data is a Uint8Array.
 */

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" }
const unescape = (s) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (m) => {
  if (ENTITIES[m]) return ENTITIES[m]
  if (m.startsWith('&#x')) return String.fromCodePoint(parseInt(m.slice(3, -1), 16))
  return String.fromCodePoint(parseInt(m.slice(2, -1), 10))
})
const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function b64ToBytes(b64) {
  const bin = atob(String(b64).replace(/\s+/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bytesToB64(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Parse an XML plist into plain JS values. Throws on anything malformed. */
export function parsePlist(xml) {
  const text = String(xml)
  // Tokens: tags (open, close, self-closing) and the text between them.
  const re = /<(\/?)([A-Za-z]+)(?:\s[^>]*?)?\s*(\/?)>|<\?[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->|([^<]+)/g
  const tokens = []
  let m
  while ((m = re.exec(text))) {
    if (m[2]) tokens.push({ close: !!m[1], tag: m[2], self: !!m[3] })
    else if (m[4] !== undefined) tokens.push({ text: m[4] })
  }
  let i = 0
  const skipSpace = () => { while (i < tokens.length && tokens[i].text !== undefined && !tokens[i].text.trim()) i++ }
  const readText = (tag) => {
    let s = ''
    while (i < tokens.length && tokens[i].text !== undefined) s += tokens[i++].text
    const end = tokens[i++]
    if (!end || !end.close || end.tag !== tag) throw new Error(`plist: expected </${tag}>`)
    return unescape(s)
  }
  const value = () => {
    skipSpace()
    const t = tokens[i++]
    if (!t || t.close || t.text !== undefined) throw new Error('plist: expected a value')
    switch (t.tag) {
      case 'dict': {
        const out = {}
        if (t.self) return out
        for (;;) {
          skipSpace()
          const k = tokens[i]
          if (k && k.close && k.tag === 'dict') { i++; return out }
          i++
          if (!k || k.tag !== 'key') throw new Error('plist: expected <key>')
          const key = k.self ? '' : readText('key')
          out[key] = value()
        }
      }
      case 'array': {
        const out = []
        if (t.self) return out
        for (;;) {
          skipSpace()
          const k = tokens[i]
          if (k && k.close && k.tag === 'array') { i++; return out }
          out.push(value())
        }
      }
      case 'string': return t.self ? '' : readText('string')
      case 'integer': return Number.parseInt(readText('integer'), 10)
      case 'real': return Number.parseFloat(readText('real'))
      case 'true': if (!t.self) i++; return true
      case 'false': if (!t.self) i++; return false
      case 'date': return new Date(readText('date'))
      case 'data': return t.self ? new Uint8Array(0) : b64ToBytes(readText('data'))
      case 'plist': {
        const v = value()
        return v
      }
      default: throw new Error(`plist: unknown <${t.tag}>`)
    }
  }
  skipSpace()
  return value()
}

/** Serialise plain JS values to an XML plist. */
export function buildPlist(root) {
  const out = []
  const write = (v, pad) => {
    if (v instanceof Uint8Array) out.push(`${pad}<data>${bytesToB64(v)}</data>`)
    else if (v instanceof Date) out.push(`${pad}<date>${v.toISOString().replace(/\.\d{3}Z$/, 'Z')}</date>`)
    else if (Array.isArray(v)) {
      out.push(`${pad}<array>`)
      for (const x of v) write(x, pad + '\t')
      out.push(`${pad}</array>`)
    } else if (v && typeof v === 'object') {
      out.push(`${pad}<dict>`)
      for (const [k, x] of Object.entries(v)) {
        if (x === undefined || x === null) continue
        out.push(`${pad}\t<key>${escape(k)}</key>`)
        write(x, pad + '\t')
      }
      out.push(`${pad}</dict>`)
    } else if (typeof v === 'boolean') out.push(`${pad}<${v}/>`)
    else if (typeof v === 'number') out.push(Number.isInteger(v) ? `${pad}<integer>${v}</integer>` : `${pad}<real>${v}</real>`)
    else out.push(`${pad}<string>${escape(v)}</string>`)
  }
  write(root, '')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n${out.join('\n')}\n</plist>\n`
}
