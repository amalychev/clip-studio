import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AppLayout } from './components/layout/AppLayout'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectSettingsPage } from './pages/ProjectSettingsPage'
import { WorkspacePage } from './pages/WorkspacePage'
import { SettingsPage } from './pages/SettingsPage'
import { StartupPage } from './pages/StartupPage'
import './index.css'

function App() {
  const [ready, setReady] = useState(false)

  if (!ready) {
    return <StartupPage onDone={() => setReady(true)} />
  }

  return (
    <HashRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/project/:projectId/settings" element={<ProjectSettingsPage />} />
          <Route path="/project/:projectId/workspace" element={<WorkspacePage />} />
        </Routes>
      </AppLayout>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1a1e28',
            color: '#fff',
            border: '1px solid #2a2f42',
            fontSize: '13px',
          },
        }}
      />
    </HashRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
