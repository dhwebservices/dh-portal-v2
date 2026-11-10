import { useState } from 'react'
import SearchBox from './SearchBox'
import NewMenu from './NewMenu'

// White top bar: search (Ctrl K / Cmd K), the "Example data" label and the
// one red "New" button.
export default function TopBar() {
  const [searching, setSearching] = useState(false)

  return (
    <header className={`hq-bar${searching ? ' is-searching' : ''}`}>
      <SearchBox onOpenChange={setSearching} />
      <span className="hq-bar-gap" />
      <span className="hq-example-label" title="HQ shows made-up example data until it is connected">Example data</span>
      <NewMenu />
    </header>
  )
}
