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

  const isSuperAdmin = user?.role === 'super_admin';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getNavItems = () => {
    switch (user?.role) {
      case 'super_admin':
        return [
          { to: '/super-admin', icon: LayoutDashboard, label: 'Dashboard' },
          { to: '/super-admin/tenants', icon: Users, label: 'Kelola Tenant' },
        ];
      case 'admin_agent':
        return [
          { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
          { to: '/admin/chat', icon: MessageSquare, label: 'Workspace' },
          { to: '/admin/history', icon: Clock, label: 'Riwayat' },
          { to: '/admin/agents', icon: Users, label: 'Tim Agen' },
        ];
      case 'agent':
        return [
          { to: '/agent', icon: LayoutDashboard, label: 'Dashboard' },
          { to: '/agent/chat', icon: MessageSquare, label: 'Workspace' },
          { to: '/agent/history', icon: Clock, label: 'Riwayat' },
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
          "w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all mb-1",
          isActive 
            ? (isSuperAdmin ? "bg-green-600 text-white shadow-lg shadow-green-500/20" : "bg-blue-600 text-white shadow-lg shadow-blue-500/20")
            : "text-gray-400 hover:bg-gray-800 hover:text-white"
        )}
      >
        <Icon size={20} />
        <span className="font-bold text-sm">{label}</span>
      </button>
    );
  };

  const NavItemDesktop = ({ to, icon: Icon, label }: any) => {
    const isActive = location.pathname === to;
    return (
      <button
        onClick={() => navigate(to)}
        className={clsx(
          "flex items-center space-x-2 px-5 py-2.5 rounded-full transition-all text-xs font-black uppercase tracking-widest",
          isActive 
            ? (isSuperAdmin ? "bg-green-50 text-green-700 ring-1 ring-green-100" : "bg-blue-50 text-blue-700 ring-1 ring-blue-100")
            : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
        )}
      >
        <Icon size={16} />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      
      {/* ================= DESKTOP NAVBAR ================= */}
      <header className="hidden lg:flex bg-white/80 backdrop-blur-md border-b border-gray-100 h-20 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto w-full px-8 flex items-center justify-between">
          <div className="flex items-center space-x-12">
            {/* Logo */}
            <div className={clsx("flex items-center space-x-2", isSuperAdmin ? "text-green-600" : "text-blue-600")}>
              <ShieldCheck size={32} />
              <span className="text-xl font-black tracking-tighter text-gray-900 uppercase">CRM<span className={isSuperAdmin ? "text-green-600" : "text-blue-600"}>SaaS</span></span>
            </div>

            {/* Desktop Navigation */}
            <nav className="flex items-center space-x-1">
              {getNavItems().map((item) => (
                <NavItemDesktop key={item.to} {...item} />
              ))}
            </nav>
          </div>

          {/* User Profile (Desktop) */}
          <div className="relative">
            <button 
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center space-x-3 p-1.5 pr-4 rounded-2xl hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all"
            >
              <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black shadow-lg", isSuperAdmin ? "bg-green-600 shadow-green-100" : "bg-blue-600 shadow-blue-100")}>
                {user?.name.charAt(0)}
              </div>
              <div className="text-left hidden xl:block">
                <p className="text-sm font-black text-gray-900 leading-none">{user?.name}</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pt-1">{user?.tenantName || user?.role}</p>
              </div>
              <ChevronDown size={14} className="text-gray-300" />
            </button>

            {isProfileMenuOpen && (
              <div className="absolute right-0 mt-3 w-56 bg-white rounded-2xl shadow-2xl border border-gray-50 py-3 animate-in fade-in zoom-in-95 duration-200">
                <div className="px-5 py-3 border-b border-gray-50 mb-2">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Akun Terhubung</p>
                  <p className="text-sm font-bold text-gray-900 truncate mt-1">{user?.email}</p>
                </div>
                <button onClick={handleLogout} className="w-full text-left px-5 py-3 text-sm text-red-500 hover:bg-red-50 font-bold flex items-center space-x-2 transition-colors">
                  <LogOut size={18} />
                  <span>Keluar Aplikasi</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>


      {/* ================= MOBILE HEADER ================= */}
      <div className={clsx("lg:hidden fixed top-0 w-full z-50 px-6 py-4 flex justify-between items-center shadow-lg", isSuperAdmin ? "bg-green-900" : "bg-blue-900")}>
        <div className="font-black text-lg flex items-center space-x-2 text-white uppercase tracking-tighter">
          <ShieldCheck className={isSuperAdmin ? "text-green-400" : "text-blue-400"} />
          <span>CRM SaaS</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 bg-white/10 rounded-xl text-white">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* ================= MOBILE SIDEBAR ================= */}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-50 w-80 bg-gray-950 text-white transform transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1) lg:hidden flex flex-col shadow-2xl",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-8 border-b border-white/5 flex items-center space-x-4">
          <div className={clsx("w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shadow-2xl", isSuperAdmin ? "bg-green-600 shadow-green-900/50" : "bg-blue-600 shadow-blue-900/50")}>
            {user?.name.charAt(0)}
          </div>
          <div className="overflow-hidden">
             <p className="font-black text-lg truncate text-white leading-tight">{user?.name}</p>
             <p className={clsx("text-xs font-bold uppercase tracking-widest mt-1 truncate", isSuperAdmin ? "text-green-400" : "text-blue-400")}>{user?.tenantName || user?.role}</p>
          </div>
        </div>

        <nav className="flex-1 px-6 py-8 overflow-y-auto">
          <div className="mb-6 px-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
            Menu Navigasi
          </div>
          {getNavItems().map((item) => (
            <NavItemMobile key={item.to} {...item} />
          ))}
        </nav>

        <div className="p-6 border-t border-white/5 bg-gray-950/50">
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-5 py-4 text-red-400 hover:text-white hover:bg-red-500/20 rounded-2xl transition-all font-black uppercase tracking-widest text-xs"
          >
            <LogOut size={20} />
            <span>Keluar Sesi</span>
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/80 z-40 lg:hidden backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}


      {/* ================= MAIN CONTENT AREA ================= */}
      <main className="flex-1 pt-24 lg:pt-0 overflow-x-hidden bg-gray-50/50">
        <div className="max-w-7xl mx-auto p-6 lg:p-12 w-full">
          <Outlet />
        </div>
      </main>

    </div>
  );
};

export default MainLayout;