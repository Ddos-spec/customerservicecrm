import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import TenantManagement from './pages/TenantManagement';
import AgentManagement from './pages/AgentManagement';
import AgentWorkspace from './pages/AgentWorkspace';
import ChatHistory from './pages/ChatHistory';
import { Toaster } from 'sonner';

import AgentDashboard from './pages/AgentDashboard';

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" expand={true} richColors />
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Super Admin Routes */}
        <Route element={<ProtectedRoute allowedRoles={['super_admin']} />}>
          <Route path="/super-admin" element={<MainLayout />}>
            <Route index element={<SuperAdminDashboard />} />
            <Route path="tenants" element={<TenantManagement />} />
          </Route>
        </Route>

        {/* Admin Agent Routes */}
        <Route element={<ProtectedRoute allowedRoles={['admin_agent']} />}>
          <Route path="/admin" element={<MainLayout />}>
            <Route index element={<AgentDashboard />} /> {/* Home = Dashboard Statistik */}
            <Route path="chat" element={<AgentWorkspace />} /> {/* Menu Chat terpisah */}
            <Route path="history" element={<ChatHistory />} />
            <Route path="agents" element={<AgentManagement />} />
          </Route>
        </Route>

        {/* Agent Routes */}
        <Route element={<ProtectedRoute allowedRoles={['agent']} />}>
          <Route path="/agent" element={<MainLayout />}>
            <Route index element={<AgentDashboard />} /> {/* Home = Dashboard Statistik */}
            <Route path="chat" element={<AgentWorkspace />} /> {/* Menu Chat terpisah */}
            <Route path="history" element={<ChatHistory />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;