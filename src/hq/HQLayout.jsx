import { Routes, Route, Navigate } from 'react-router-dom'
import './hq.css'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import TabBar from './components/TabBar'
import Placeholder from './pages/Placeholder'
import Today from './pages/Today'
import Inbox from './pages/Inbox'
import Clients from './pages/Clients'
import ClientPage from './pages/ClientPage'
import Jobs from './pages/Jobs'
import Money from './pages/Money'
import Apps from './pages/Apps'

// The HQ frame: dark sidebar (desktop), white top bar, and bottom tab bar (phones).
// Each screen is a placeholder showing its title until it is built.
export default function HQLayout() {
  return (
    <div className="hq">
      <Sidebar />
      <div className="hq-main">
        <TopBar />
        <main className="hq-content">
          <Routes>
            <Route index element={<Today />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="clients" element={<Clients />} />
            <Route path="clients/:id" element={<ClientPage />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="money" element={<Money />} />
            <Route path="apps" element={<Apps />} />
            <Route path="phone" element={<Placeholder title="Phone" note="The DH Phone screen moves into HQ in a later phase." />} />
            <Route path="*" element={<Navigate to="/hq" replace />} />
          </Routes>
        </main>
      </div>
      <TabBar />
    </div>
  )
}
