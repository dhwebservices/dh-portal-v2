import { useEffect } from 'react'
import PageHeader from '../components/PageHeader'
import PortalLinkGroups from '../components/PortalLinkGroups'
import { TEAM_GROUPS } from '../portalLinks'

// Team: links to the existing people, rota, leave, pay, contracts and recruiting
// pages, grouped. Only the ones this person can already open are shown.
export default function Team() {
  useEffect(() => { document.title = 'Team · DH HQ' }, [])
  return (
    <>
      <PageHeader title="Team" sub="Opens the existing portal pages" />
      <PortalLinkGroups groups={TEAM_GROUPS} empty="There are no team pages you can open yet. Ask David if you need one." />
    </>
  )
}
