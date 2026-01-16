import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import SuperAdminUsers from './pages/SuperAdminUsers';
import SuperAdminSessions from './pages/SuperAdminSessions';
import TenantManagement from './pages/TenantManagement';
import AgentManagement from './pages/AgentManagement';
import AgentWorkspace from './pages/AgentWorkspace';
import ChatHistory from './pages/ChatHistory';
import InviteAccept from './pages/InviteAccept';
import SuperAdminSettings from './pages/SuperAdminSettings';
import SuperAdminApiDocs from './pages/SuperAdminApiDocs';
import AdminDashboard from './pages/AdminDashboard';
import AdminReports from './pages/AdminReports';
import AgentDashboard from './pages/AgentDashboard';
import { Toaster } from 'sonner';
import { useThemeStore } from './store/useThemeStore';

function App() {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  // --- CONTENT PROTECTION LOGIC (DISABLED FOR DEBUGGING) ---
  // useEffect(() => {
  //   // 1. Disable Right Click
  //   const handleContextMenu = (e: MouseEvent) => {
  //     e.preventDefault();
  //   };

  //   // 2. Disable Keyboard Shortcuts (Inspect, Save, Print, Source)
  //   const handleKeyDown = (e: KeyboardEvent) => {
  //     if (
  //       e.key === 'F12' ||
  //       (e.ctrlKey && (e.key === 's' || e.key === 'S')) || // Save
  //       (e.ctrlKey && (e.key === 'u' || e.key === 'U')) || // View Source
  //       (e.ctrlKey && (e.key === 'p' || e.key === 'P')) || // Print
  //       (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I')) || // DevTools
  //       (e.ctrlKey && e.shiftKey && (e.key === 'c' || e.key === 'C')) || // DevTools
  //       (e.ctrlKey && e.shiftKey && (e.key === 'j' || e.key === 'J'))    // DevTools
  //     ) {
  //       e.preventDefault();
  //       return false;
  //     }
  //   };

  //   // 3. Disable Image Dragging
  //   const handleDragStart = (e: DragEvent) => {
  //       e.preventDefault();
  //   };

  //   document.addEventListener('contextmenu', handleContextMenu);
  //   document.addEventListener('keydown', handleKeyDown);
  //   document.addEventListener('dragstart', handleDragStart);

  //   return () => {
  //     document.removeEventListener('contextmenu', handleContextMenu);
  //     document.removeEventListener('keydown', handleKeyDown);
  //     document.removeEventListener('dragstart', handleDragStart);
  //   };
  // }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.body.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Toaster position="top-right" expand={true} richColors />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/invite/:token" element={<InviteAccept />} />
          
          {/* Super Admin Routes */}
          <Route element={<ProtectedRoute allowedRoles={['super_admin']} />}>
            <Route path="/super-admin" element={<MainLayout />}>
              <Route index element={<SuperAdminDashboard />} />
              <Route path="tickets/*" element={<Navigate to="/super-admin" replace />} />
              <Route path="users" element={<SuperAdminUsers />} />
              <Route path="sessions" element={<SuperAdminSessions />} />
              <Route path="tenants" element={<TenantManagement />} />
              <Route path="settings" element={<SuperAdminSettings />} />
              <Route path="api-docs" element={<SuperAdminApiDocs />} />
            </Route>
          </Route>

          {/* Admin Agent Routes */}
          <Route element={<ProtectedRoute allowedRoles={['admin_agent']} />}>
            <Route path="/admin" element={<MainLayout />}>
              <Route index element={<AdminDashboard />} /> {/* Updated to AdminDashboard */}
              <Route path="tickets/*" element={<Navigate to="/admin/chat" replace />} />
              <Route path="reports" element={<AdminReports />} />
              <Route path="chat" element={<AgentWorkspace />} />
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
    </div>
  );
}

export default App;
