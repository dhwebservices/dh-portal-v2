// A status word on a coloured background. Always a word, never colour alone.
// tone: 'ok' (good), 'warn' (waiting), 'bad' (problem), 'info', 'mute'.
export default function StatusTag({ tone = 'mute', children }) {
  return <span className={`hq-tag hq-tag-${tone}`}>{children}</span>
}
