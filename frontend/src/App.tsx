import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useThemeStore } from './store/useThemeStore';

const Login = lazy(() => import('./pages/Login'));
const MainLayout = lazy(() => import('./layouts/MainLayout'));
const ProtectedRoute = lazy(() => import('./components/ProtectedRoute'));
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'));
const SuperAdminUsers = lazy(() => import('./pages/SuperAdminUsers'));
const SuperAdminSessions = lazy(() => import('./pages/SuperAdminSessions'));
const TenantManagement = lazy(() => import('./pages/TenantManagement'));
const AgentManagement = lazy(() => import('./pages/AgentManagement'));
const AgentWorkspace = lazy(() => import('./pages/AgentWorkspace'));
const ChatHistory = lazy(() => import('./pages/ChatHistory'));
const InviteAccept = lazy(() => import('./pages/InviteAccept'));
const SuperAdminSettings = lazy(() => import('./pages/SuperAdminSettings'));
const SuperAdminApiDocs = lazy(() => import('./pages/SuperAdminApiDocs'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminReports = lazy(() => import('./pages/AdminReports'));
const AgentDashboard = lazy(() => import('./pages/AgentDashboard'));
const ChatbotSettings = lazy(() => import('./pages/ChatbotSettings'));
const BillingPage = lazy(() => import('./pages/BillingPage'));
const CampaignList = lazy(() => import('./pages/marketing/CampaignList'));
const CreateCampaign = lazy(() => import('./pages/marketing/CreateCampaign'));
const ContactGroups = lazy(() => import('./pages/marketing/ContactGroups'));
const CampaignDetail = lazy(() => import('./pages/marketing/CampaignDetail'));
const DebugAnalytics = lazy(() => import('./pages/DebugAnalytics')); // TEMP DEBUG

const RouteLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500 dark:bg-slate-950 dark:text-slate-400">
    <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-sm font-semibold shadow-sm dark:border-slate-800 dark:bg-slate-900">
      Memuat command center...
    </div>
  </div>
);

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
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/invite/:token" element={<InviteAccept />} />
            <Route path="/subscribe" element={<BillingPage />} />

            {/* Debug Route (Remove later) */}
            <Route path="/debug-analytics" element={<DebugAnalytics />} />

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

            {/* Owner Routes */}
            <Route element={<ProtectedRoute allowedRoles={['admin_agent']} />}>
              <Route path="/admin" element={<MainLayout />}>
                <Route index element={<AdminDashboard />} /> {/* Updated to AdminDashboard */}
                <Route path="tickets/*" element={<Navigate to="/admin/chat" replace />} />
                <Route path="reports" element={<AdminReports />} />
                <Route path="chat" element={<AgentWorkspace />} />
                <Route path="history" element={<ChatHistory />} />
                <Route path="agents" element={<AgentManagement />} />
                <Route path="chatbot" element={<ChatbotSettings />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="marketing" element={<CampaignList />} />
                <Route path="marketing/create" element={<CreateCampaign />} />
                <Route path="marketing/:id" element={<CampaignDetail />} />
                <Route path="marketing/groups" element={<ContactGroups />} />
              </Route>
            </Route>

            {/* Staff Routes */}
            <Route element={<ProtectedRoute allowedRoles={['agent']} />}>
              <Route path="/agent" element={<MainLayout />}>
                <Route index element={<AgentDashboard />} /> {/* Home = Dashboard Statistik */}
                <Route path="chat" element={<AgentWorkspace />} /> {/* Menu Chat terpisah */}
                <Route path="history" element={<ChatHistory />} />
              </Route>
            </Route>

            <Route path="/" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </div>
  );
}

export default App;
