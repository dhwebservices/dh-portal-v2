import { useEffect } from 'react'
import PageHeader from '../components/PageHeader'

// Stand-in for each HQ screen until it is built in its own session.
export default function Placeholder({ title, sub, note }) {
  useEffect(() => {
    document.title = `${title} · DH HQ`
  }, [title])

  return (
    <>
      <PageHeader title={title} sub={sub} />
      <p className="hq-placeholder">{note || 'This screen is built in a later session.'}</p>
    </>
  )
}
