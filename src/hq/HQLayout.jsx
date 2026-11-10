import { Routes, Route, Navigate } from 'react-router-dom'
import './hq.css'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import TabBar from './components/TabBar'
import QuickCreate from './components/QuickCreate'
import Today from './pages/Today'
import Inbox from './pages/Inbox'
import Clients from './pages/Clients'
import ClientPage from './pages/ClientPage'
import Jobs from './pages/Jobs'
import Money from './pages/Money'
import Apps from './pages/Apps'
import Phone from './pages/Phone'
import Team from './pages/Team'
import Settings from './pages/Settings'
import Library from './pages/Library'

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
            <Route path="phone" element={<Phone />} />
            <Route path="team" element={<Team />} />
            <Route path="settings" element={<Settings />} />
            <Route path="library" element={<Library />} />
            <Route path="*" element={<Navigate to="/hq" replace />} />
          </Routes>
        </main>
      </div>
      <TabBar />
      <QuickCreate />
    </div>
  )
}
