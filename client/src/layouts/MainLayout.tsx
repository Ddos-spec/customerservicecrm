import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { 
  Menu, X, LogOut, 
  LayoutDashboard, Users, MessageSquare, 
  ShieldCheck, Clock, ChevronDown
} from 'lucide-react';
import { clsx } from 'clsx';

const MainLayout = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getNavItems = () => {
    switch (user?.role) {
      case 'super_admin':
        return [
          { to: '/super-admin', icon: LayoutDashboard, label: 'Dashboard' },
          { to: '/super-admin/tenants', icon: Users, label: 'Manage Tenants' },
        ];
      case 'admin_agent':
        return [
          { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
          { to: '/admin/chat', icon: MessageSquare, label: 'Workspace' },
          { to: '/admin/history', icon: Clock, label: 'History' },
          { to: '/admin/agents', icon: Users, label: 'Team' },
        ];
      case 'agent':
        return [
          { to: '/agent', icon: LayoutDashboard, label: 'Dashboard' },
          { to: '/agent/chat', icon: MessageSquare, label: 'Workspace' },
          { to: '/agent/history', icon: Clock, label: 'History' },
        ];
      default:
        return [];
    }
  };

  const NavItemMobile = ({ to, icon: Icon, label }: any) => {
    const isActive = location.pathname === to;
    return (
      <button
        onClick={() => {
          navigate(to);
          setIsMobileMenuOpen(false);
        }}
        className={clsx(
          "w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors mb-1",
          isActive 
            ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20" 
            : "text-gray-400 hover:bg-gray-800 hover:text-white"
        )}
      >
        <Icon size={20} />
        <span className="font-medium">{label}</span>
      </button>
    );
  };

  const NavItemDesktop = ({ to, icon: Icon, label }: any) => {
    const isActive = location.pathname === to;
    return (
      <button
        onClick={() => navigate(to)}
        className={clsx(
          "flex items-center space-x-2 px-4 py-2 rounded-full transition-all text-sm font-bold",
          isActive 
            ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100" 
            : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
        )}
      >
        <Icon size={18} />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      
      {/* ================= DESKTOP NAVBAR (Visible on lg+) ================= */}
      <header className="hidden lg:flex bg-white border-b border-gray-200 h-16 sticky top-0 z-40 shadow-sm/50">
        <div className="max-w-6xl mx-auto w-full px-8 flex items-center justify-between">
          <div className="flex items-center space-x-8">
            {/* Logo */}
            <div className="flex items-center space-x-2 text-indigo-700">
              <ShieldCheck size={28} />
              <span className="text-xl font-bold tracking-tight text-gray-900">CRM<span className="text-indigo-600">SaaS</span></span>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="flex items-center space-x-1">
              {getNavItems().map((item) => (
                <NavItemDesktop key={item.to} {...item} />
              ))}
            </nav>
          </div>

          {/* User Profile Dropdown (Desktop) */}
          <div className="relative">
            <button 
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center space-x-3 p-1.5 pr-3 rounded-full hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-sm">
                {user?.name.charAt(0)}
              </div>
              <div className="text-left hidden xl:block">
                <p className="text-sm font-bold text-gray-800 leading-none">{user?.name}</p>
                <p className="text-[10px] text-gray-500 font-medium pt-0.5">{user?.tenantName || user?.role}</p>
              </div>
              <ChevronDown size={14} className="text-gray-400" />
            </button>

            {/* Dropdown Menu */}
            {isProfileMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-4 py-2 border-b border-gray-50 mb-2">
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Signed in as</p>
                  <p className="text-sm font-bold text-gray-900 truncate">{user?.email}</p>
                </div>
                <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 font-medium flex items-center space-x-2">
                  <LogOut size={16} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>


      {/* ================= MOBILE HEADER (Visible on < lg) ================= */}
      <div className="lg:hidden fixed top-0 w-full bg-gray-900 text-white z-50 px-4 py-3 flex justify-between items-center shadow-md">
        <div className="font-bold text-lg flex items-center space-x-2">
          <ShieldCheck className="text-indigo-400" />
          <span>CRM SaaS</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-1">
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* ================= MOBILE SIDEBAR DRAWER ================= */}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-40 w-72 bg-gray-900 text-white transform transition-transform duration-300 ease-in-out lg:hidden flex flex-col shadow-2xl",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 border-b border-gray-800 mt-14 flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-lg font-bold">
            {user?.name.charAt(0)}
          </div>
          <div className="overflow-hidden">
             <p className="font-bold truncate text-gray-100">{user?.name}</p>
             <p className="text-xs text-indigo-400 truncate">{user?.tenantName || user?.role}</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 overflow-y-auto">
          <div className="mb-4 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
            Navigation
          </div>
          {getNavItems().map((item) => (
            <NavItemMobile key={item.to} {...item} />
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-red-400 hover:text-red-300 hover:bg-gray-800/50 rounded-xl transition-colors font-medium"
          >
            <LogOut size={20} />
            <span className="text-sm">Log Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}


      {/* ================= MAIN CONTENT AREA ================= */}
      <main className="flex-1 pt-16 lg:pt-0 overflow-x-hidden">
        <div className="max-w-6xl mx-auto p-4 lg:p-8 w-full">
          <Outlet />
        </div>
      </main>

    </div>
  );
};

export default MainLayout;