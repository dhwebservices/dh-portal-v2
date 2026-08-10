import { Routes, Route, useParams } from 'react-router-dom'
import Editor from './Editor'
import PageList from './PageList'

function EditorRoute() {
  const { slug } = useParams()
  return <Editor slug={slug} />
}

export default function Website() {
  return (
    <Routes>
      <Route index element={<PageList />} />
      <Route path="edit/:slug" element={<EditorRoute />} />
    </Routes>
  )
}
