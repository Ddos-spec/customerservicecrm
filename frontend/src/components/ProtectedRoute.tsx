import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import type { UserRole } from '../store/useAuthStore';

interface ProtectedRouteProps {
  allowedRoles: UserRole[];
}

const ProtectedRoute = ({ allowedRoles }: ProtectedRouteProps) => {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-sm font-semibold shadow-sm dark:border-slate-800 dark:bg-slate-900">
          Memvalidasi sesi...
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    // Redirect based on their actual role if they try to access unauthorized page
    if (user.role === 'super_admin') return <Navigate to="/super-admin" replace />;
    if (user.role === 'admin_agent') return <Navigate to="/admin" replace />;
    if (user.role === 'agent') return <Navigate to="/agent" replace />;
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
