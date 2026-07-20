import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, BarChart3, Bot, ChevronDown, CircleHelp, Clock3, Code2,
  CreditCard, History, LayoutDashboard, Link2, LogOut, Megaphone,
  Menu, MessageSquareText, Moon, Search, Settings, Shield, Sparkles, Sun,
  UserCircle, Users, X
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';
import BrandLogo from '../components/BrandLogo';

type NavItem = {
  to: string;
  icon: React.ElementType;
  label: string;
  badge?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navigationByRole: Record<string, NavGroup[]> = {
  super_admin: [
    { label: 'Command center', items: [
      { to: '/super-admin', icon: LayoutDashboard, label: 'Overview' },
      { to: '/super-admin/chats', icon: MessageSquareText, label: 'Global Inbox', badge: 'Live' },
      { to: '/super-admin/tenants', icon: Shield, label: 'Tenant' },
    ] },
    { label: 'System', items: [
      { to: '/super-admin/users', icon: Users, label: 'Pengguna' },
      { to: '/super-admin/sessions', icon: Activity, label: 'Sesi Gateway' },
      { to: '/super-admin/api-docs', icon: Code2, label: 'API Integrasi' },
      { to: '/super-admin/settings', icon: Settings, label: 'Pengaturan' },
    ] },
  ],
  admin_agent: [
    { label: 'Workspace', items: [
      { to: '/admin', icon: LayoutDashboard, label: 'Overview' },
      { to: '/admin/chat', icon: MessageSquareText, label: 'Inbox' },
      { to: '/admin/history', icon: History, label: 'Riwayat' },
      { to: '/admin/reports', icon: BarChart3, label: 'Laporan' },
    ] },
    { label: 'Automation', items: [
      { to: '/admin/chatbot', icon: Bot, label: 'AI Agent' },
      { to: '/admin/assistant', icon: Sparkles, label: 'AI Assistant' },
      { to: '/admin/marketing', icon: Megaphone, label: 'Campaign' },
      { to: '/admin/marketing/groups', icon: Users, label: 'Grup Kontak' },
    ] },
    { label: 'Management', items: [
      { to: '/admin/agents', icon: UserCircle, label: 'Tim Staff' },
      { to: '/admin/integrations', icon: Link2, label: 'Integrasi' },
      { to: '/admin/billing', icon: CreditCard, label: 'Langganan' },
    ] },
  ],
  agent: [
    { label: 'Workspace', items: [
      { to: '/agent', icon: LayoutDashboard, label: 'Overview' },
      { to: '/agent/chat', icon: MessageSquareText, label: 'Inbox' },
      { to: '/agent/history', icon: Clock3, label: 'Riwayat' },
    ] },
  ],
};

const pageNames: Record<string, string> = {
  '/super-admin': 'System overview',
  '/super-admin/chats': 'Global inbox',
  '/super-admin/tenants': 'Tenant management',
  '/super-admin/users': 'User management',
  '/super-admin/sessions': 'Gateway sessions',
  '/super-admin/api-docs': 'API integration',
  '/super-admin/settings': 'System settings',
  '/admin': 'Business overview',
  '/admin/chat': 'Customer inbox',
  '/admin/history': 'Chat history',
  '/admin/reports': 'Performance report',
  '/admin/chatbot': 'AI agent',
  '/admin/assistant': 'AI assistant',
  '/admin/marketing': 'Campaign center',
  '/admin/marketing/groups': 'Contact groups',
  '/admin/marketing/create': 'Create campaign',
  '/admin/agents': 'Team management',
  '/admin/integrations': 'Integrations',
  '/admin/billing': 'Plan & billing',
  '/agent': 'Personal overview',
  '/agent/chat': 'Customer inbox',
  '/agent/history': 'Chat history',
};

const getRoleLabel = (role?: string | null) => {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'admin_agent') return 'Owner';
  if (role === 'agent') return 'Staff';
  return role || 'Workspace';
};

const MainLayout = () => {
  const { user, logout, stopImpersonate } = useAuthStore();
  const { isDarkMode, toggleDarkMode } = useThemeStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const navGroups = useMemo(() => navigationByRole[user?.role || ''] || [], [user?.role]);
  const isChatWorkspace = location.pathname.endsWith('/chat') || location.pathname.endsWith('/chats');
  const roleLabel = getRoleLabel(user?.role);
  const exactTitle = pageNames[location.pathname];
  const fallbackTitle = location.pathname.startsWith('/admin/marketing/') ? 'Campaign detail' : 'Command center';
  const pageTitle = exactTitle || fallbackTitle;

  const allItems = useMemo(() => navGroups.flatMap((group) => group.items), [navGroups]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setProfileOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  const isActive = (to: string) => {
    const rootRoutes = ['/super-admin', '/admin', '/agent'];
    if (rootRoutes.includes(to)) return location.pathname === to;
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const openRoute = (to: string) => {
    navigate(to);
    setMobileOpen(false);
    setCommandOpen(false);
  };

  const renderSidebarContent = () => (
    <>
      <div className="app-sidebar__brand">
        <button className="app-brand" onClick={() => openRoute(user?.role === 'super_admin' ? '/super-admin' : user?.role === 'agent' ? '/agent' : '/admin')}>
          <BrandLogo showTagline size="small" />
        </button>
        <button className="app-sidebar__close" onClick={() => setMobileOpen(false)} aria-label="Tutup menu"><X size={20} /></button>
      </div>

      <div className="workspace-switcher">
        <div className="workspace-switcher__avatar">{(user?.tenant_name || user?.name || 'W').slice(0, 1).toUpperCase()}</div>
        <div><small>ACTIVE WORKSPACE</small><strong>{user?.tenant_name || 'WACentral System'}</strong></div>
        <ChevronDown size={15} />
      </div>

      <nav className="app-navigation" aria-label="Navigasi dashboard">
        {navGroups.map((group) => (
          <div className="app-navigation__group" key={group.label}>
            <p>{group.label}</p>
            {group.items.map(({ to, icon: Icon, label, badge }) => (
              <button key={to} onClick={() => openRoute(to)} className={clsx('app-nav-item', isActive(to) && 'app-nav-item--active')}>
                <span className="app-nav-item__icon"><Icon size={18} /></span>
                <span>{label}</span>
                {badge && <b className={badge === 'Live' ? 'app-nav-badge app-nav-badge--live' : 'app-nav-badge'}>{badge}</b>}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="app-sidebar__footer">
        <button className="support-card">
          <span><CircleHelp size={18} /></span>
          <div><strong>Butuh bantuan?</strong><small>Buka support center</small></div>
          <ChevronRightIcon />
        </button>
        <div className="system-status"><span><i /> All systems operational</span><small>v1.0.0</small></div>
      </div>
    </>
  );

  return (
    <div className="app-shell">
      {user?.isImpersonating && (
        <div className="impersonation-banner">
          <span><UserCircle size={16} /> Mode impersonasi: <strong>{user.name}</strong> · {user.tenant_name}</span>
          <button onClick={() => stopImpersonate()}>Kembali ke Super Admin</button>
        </div>
      )}

      <aside className="app-sidebar">{renderSidebarContent()}</aside>

      <div className={clsx('app-mobile-drawer', mobileOpen && 'app-mobile-drawer--open')}>
        <aside>{renderSidebarContent()}</aside>
        <button className="app-mobile-backdrop" onClick={() => setMobileOpen(false)} aria-label="Tutup menu" />
      </div>

      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar__left">
            <button className="app-mobile-trigger" onClick={() => setMobileOpen(true)} aria-label="Buka menu"><Menu size={21} /></button>
            <div className="app-page-identity"><small>{roleLabel} / {user?.tenant_name || 'System'}</small><strong>{pageTitle}</strong></div>
          </div>

          <div className="app-topbar__actions">
            <button className="command-trigger" onClick={() => setCommandOpen(true)}><Search size={16} /><span>Cari menu atau aksi...</span><kbd>⌘ K</kbd></button>
            <div className="topbar-live"><i /> <span>Live</span></div>
            <button className="icon-button" onClick={toggleDarkMode} aria-label={isDarkMode ? 'Gunakan mode terang' : 'Gunakan mode gelap'}>{isDarkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            <div className="profile-menu">
              <button className="profile-trigger" onClick={() => setProfileOpen(!profileOpen)}>
                <span>{user?.name?.slice(0, 1).toUpperCase()}</span>
                <div><strong>{user?.name}</strong><small>{roleLabel}</small></div>
                <ChevronDown size={14} />
              </button>
              {profileOpen && (
                <div className="profile-popover">
                  <div><small>AKUN TERHUBUNG</small><strong>{user?.email}</strong></div>
                  <button onClick={handleLogout}><LogOut size={17} /> Keluar aplikasi</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className={clsx('app-content', isChatWorkspace && 'app-content--chat')}>
          <div className={isChatWorkspace ? 'app-content__chat-inner' : 'app-content__inner'}><Outlet /></div>
        </main>
      </div>

      {commandOpen && (
        <div className="command-overlay" onMouseDown={() => setCommandOpen(false)}>
          <div className="command-palette" onMouseDown={(event) => event.stopPropagation()}>
            <div className="command-palette__search"><Search size={19} /><input autoFocus placeholder="Cari halaman atau aksi..." /><kbd>ESC</kbd></div>
            <div className="command-palette__body"><small>NAVIGASI CEPAT</small>{allItems.map(({ to, icon: Icon, label }) => <button key={to} onClick={() => openRoute(to)}><span><Icon size={17} /></span>{label}<kbd>↵</kbd></button>)}</div>
            <div className="command-palette__footer"><span><kbd>↑</kbd><kbd>↓</kbd> navigasi</span><span><kbd>↵</kbd> buka</span></div>
          </div>
        </div>
      )}
    </div>
  );
};

const ChevronRightIcon = () => <span className="support-card__arrow">→</span>;

export default MainLayout;
