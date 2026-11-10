// Where an item came from: Call, Email, Website… Small uppercase outlined label.
const LABELS = {
  call: ['Call'],
  voicemail: ['Voicemail', 'VM'],
  text: ['Text'],
  email: ['Email'],
  website: ['Website', 'Web'],
  client: ['Client'],
  app: ['App'],
  payment: ['Payment', 'Pay'],
  booking: ['Booking', 'Book'],
  note: ['Note'],
  job: ['Job'],
  agreement: ['Agreement', 'Agree'],
}

export default function SourceTag({ source }) {
  const [label, short] = LABELS[source] || [String(source || '')]
  return (
    <span className="hq-src">
      {short ? (
        <>
          <span className="hq-hide-phone">{label}</span>
          <span className="hq-show-phone" aria-hidden="true">{short}</span>
        </>
      ) : label}
    </span>
  )
}
