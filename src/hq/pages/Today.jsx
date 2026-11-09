import Placeholder from './Placeholder'

const todayLabel = () =>
  new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

// Built in phase 1. Until then it shows its title and today's date.
export default function Today() {
  return <Placeholder title="Today" sub={todayLabel()} />
}
