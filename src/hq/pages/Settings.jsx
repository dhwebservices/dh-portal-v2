import { useEffect } from 'react'
import PageHeader from '../components/PageHeader'
import PortalLinkGroups from '../components/PortalLinkGroups'
import { SETTINGS_GROUPS } from '../portalLinks'

// Settings: "Your settings" and "Admin", each linking to the existing portal page.
// Only the ones this person can already open are shown.
export default function Settings() {
  useEffect(() => { document.title = 'Settings · DH HQ' }, [])
  return (
    <>
      <PageHeader title="Settings" sub="Opens the existing portal pages" />
      <PortalLinkGroups groups={SETTINGS_GROUPS} empty="There are no settings pages you can open yet." />
    </>
  )
}
