import { Routes, Route, Navigate } from 'react-router-dom'
import PageManager from './PageManager'
import Editor from './Editor'
import '../../styles/website-builder/pages.css'

export default function WebsiteBuilder() {
  return (
    <Routes>
      <Route path="/" element={<PageManager />} />
      <Route path="/edit/:pageId" element={<Editor />} />
      <Route path="*" element={<Navigate to="/website-builder" replace />} />
    </Routes>
  )
}
