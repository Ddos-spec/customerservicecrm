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
      <div className="app-loader">
        <div className="app-loader__orb" aria-hidden="true" />
        <div className="app-loader__content">
          <div className="brand-mark brand-mark--small"><span>W</span></div>
          <p>Memvalidasi sesi</p>
          <span className="app-loader__line" />
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
