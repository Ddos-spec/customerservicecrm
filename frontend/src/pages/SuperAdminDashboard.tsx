import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Server, Smartphone,
  Terminal, RefreshCw,
  Globe, MessageSquare, Database, Building2, Plus,
  Bell, Wifi, ArrowRight
} from 'lucide-react';
import api from '../lib/api';

interface Stats {
  tenants: { total: string; active: string };
  users: { total: string };
  chats: { total: string; total_unread: string };
  whatsapp_sessions?: { total: number };
}

interface Tenant {
  id: string; // UUID
  company_name: string;
  status: string;
  user_count: string;
  created_at: string;
}

const SuperAdminDashboard = () => {
  const navigate = useNavigate();

  // Real States
  const [sessions, setSessions] = useState<any[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notifierSessionId, setNotifierSessionId] = useState<string | null>(null);
  
  const ws = useRef<WebSocket | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
        const [statsRes, tenantsRes, notifierRes] = await Promise.all([
            api.get('/admin/stats'),
            api.get('/admin/tenants'),
            api.get('/admin/notifier-session')
        ]);

        if (statsRes.data.success) {
            setStats(statsRes.data.stats);
        }
        if (tenantsRes.data.success) {
            setTenants(tenantsRes.data.tenants);
        }
        if (notifierRes.data.success) {
            setNotifierSessionId(notifierRes.data.notifier_session_id || null);
        }

        // Try to fetch sessions (may fail if no WhatsApp API token)
        try {
            const sessionRes = await api.get('/sessions');
            if (Array.isArray(sessionRes.data)) {
                setSessions(sessionRes.data);
            }
        } catch {
            // WhatsApp sessions require API token, skip if unauthorized
        }
    } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
    } finally {
        setIsLoading(false);
    }
  };

  // WebSocket Connection for Real-time Updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_API_URL 
      ? new URL(import.meta.env.VITE_API_URL).host 
      : window.location.host;
    
    const wsUrl = `${protocol}//${host}`;
    
    ws.current = new WebSocket(wsUrl);

    ws.current.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'session-update') {
            // Update sessions state directly
            setSessions(payload.data);
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      await fetchData();
    };
    void init();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Build stats from real data
  const whatsappSessionCount = sessions.length > 0
    ? sessions.length
    : (stats?.whatsapp_sessions?.total || 0);
  const connectedCount = sessions.filter(s => s.status === 'CONNECTED').length;

  const globalStats = [
    {
      label: 'Total Percakapan (Chats)',
      value: stats?.chats?.total || '0',
      icon: MessageSquare,
      color: 'text-emerald-600',
      trend: `${stats?.chats?.total_unread || '0'} Unread`,
      onClick: () => navigate('/super-admin/chats'), // Nanti bisa diarahkan ke global chat log jika ada
      description: 'Lihat semua percakapan'
    },
    {
      label: 'Total Perusahaan (Tenants)',
      value: stats?.tenants?.total || '0',
      icon: Building2,
      color: 'text-emerald-600',
      trend: `${stats?.tenants?.active || '0'} Active`,
      onClick: () => navigate('/super-admin/tenants'),
      description: 'Kelola tenants'
    },
    {
      label: 'Total Users',
      value: stats?.users?.total || '0',
      icon: Users,
      color: 'text-emerald-600',
      trend: 'All Roles',
      onClick: () => navigate('/super-admin/users'),
      description: 'Lihat semua users'
    },
    {
      label: 'WhatsApp Sessions',
      value: String(whatsappSessionCount),
      icon: Smartphone,
      color: 'text-amber-600',
      trend: connectedCount > 0 ? `${connectedCount} Connected` : 'No Active Sessions',
      onClick: () => navigate('/super-admin/sessions'),
      description: 'Kelola sessions'
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">System Global Overview</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Pusat kendali infrastruktur CRM Multitenant.</p>
        </div>
        <div className="flex space-x-3">
            <button onClick={fetchData} className="p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300 transition-all">
                <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
                onClick={() => navigate('/super-admin/tenants')}
                className="flex items-center space-x-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 dark:shadow-emerald-900/30 hover:bg-emerald-700 transition-all"
            >
                <Plus size={18} />
                <span>Tambah Tenant Baru</span>
            </button>
        </div>
      </div>

      {/* Global Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {globalStats.map((stat, i) => (
          <div
            key={i}
            onClick={stat.onClick}
            className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm cursor-pointer hover:shadow-lg hover:border-emerald-200 dark:hover:border-emerald-700 transition-all group"
          >
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl bg-gray-50 dark:bg-slate-700/60 ${stat.color} group-hover:scale-110 transition-transform`}>
                    <stat.icon size={24} />
                </div>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-full">{stat.trend}</span>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{stat.label}</p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</h3>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {stat.description} →
            </p>
          </div>
        ))}
      </div>

      {/* Notifier Status Card - Distinct CTA */}
      {(() => {
        const notifierSession = sessions.find(s => s.sessionId === notifierSessionId);
        const isConnected = notifierSession?.status === 'CONNECTED';
        const isSetup = !!notifierSessionId;
        const statusTone = isConnected
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700'
          : isSetup
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-700'
          : 'bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-gray-300 border-gray-300 dark:border-slate-600';

        return (
          <div
            onClick={() => navigate('/super-admin/settings')}
            className={`relative overflow-hidden p-5 rounded-2xl border cursor-pointer transition-all hover:shadow-md ${
              isConnected
                ? 'bg-gradient-to-r from-emerald-50 via-white to-cyan-50 dark:from-emerald-900/30 dark:via-slate-800 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'
            }`}
          >
            <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-emerald-50/80 to-transparent dark:from-emerald-900/10 pointer-events-none" />
            <div className="flex items-start justify-between relative">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl border ${
                  isConnected
                    ? 'bg-white/80 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 border-emerald-200/70 dark:border-emerald-700'
                    : 'bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-600'
                }`}>
                  {isConnected ? <Wifi size={22} /> : <Bell size={22} />}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-300">
                    Notifier
                  </p>
                  <p className="font-semibold text-gray-900 dark:text-white text-lg">WhatsApp Owner Alerts</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-bold uppercase tracking-widest ${statusTone}`}>
                <span className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-emerald-500' : isSetup ? 'bg-amber-500' : 'bg-gray-500'
                }`} />
                {isConnected ? 'Connected' : isSetup ? 'Menunggu Scan' : 'Belum Aktif'}
              </span>
            </div>
            <p className="relative mt-3 text-sm text-gray-600 dark:text-gray-300 max-w-3xl">
              Dipakai untuk notifikasi owner ketika ada session WhatsApp tenant yang disconnect atau logout.
            </p>
            <div className="relative mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <div className={`w-2.5 h-2.5 rounded-full ${
                  isConnected ? 'bg-emerald-500' : isSetup ? 'bg-amber-500' : 'bg-gray-400'
                }`} />
                <span>{isConnected ? 'Realtime status aktif' : isSetup ? 'Menunggu scan QR di pengaturan' : 'Belum dikonfigurasi'}</span>
              </div>
              <div className="flex items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                Kelola Notifier
                <ArrowRight size={16} />
              </div>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Tenant Overview */}
        <div className="lg:col-span-2 space-y-6">

            {/* Tenant Overview - Real Data */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-50 dark:border-slate-700 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 dark:text-white">Registered Tenants</h3>
                    <div className="flex items-center space-x-3">
                        <span className="text-xs font-bold bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 px-3 py-1 rounded-full">{tenants.length} Tenants</span>
                        <button
                            onClick={() => navigate('/super-admin/tenants')}
                            className="text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:underline"
                        >
                                                        Lihat Semua
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
                    {tenants.length > 0 ? tenants.slice(0, 6).map((t) => (
                        <div key={t.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl border border-gray-100 dark:border-slate-700">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 flex items-center justify-center text-xs font-bold text-gray-400 dark:text-gray-500">
                                    {t.company_name.charAt(0)}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-gray-900 dark:text-white">{t.company_name}</p>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400">{t.user_count} Users</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                                    t.status === 'active'
                                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                                }`}>{t.status}</span>
                            </div>
                        </div>
                    )) : (
                        <div className="col-span-2 text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                            No tenants registered yet. Click "Tambah Tenant Baru" to create one.
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* System Logs & Health */}
        <div className="space-y-6">
            <div className="bg-gray-900 rounded-2xl shadow-xl overflow-hidden p-6 border border-gray-800">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-emerald-400 flex items-center text-sm">
                        <Terminal size={16} className="mr-2" />
                        Live System Logs
                    </h3>
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                </div>
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    <div className="font-mono text-[10px] border-l border-gray-700 pl-3 py-1">
                        <span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span>
                        <span className="text-emerald-400 ml-2">system.ready</span>
                        <p className="text-gray-300 mt-1">Backend connected, waiting for activity...</p>
                    </div>
                    <div className="text-gray-600 text-[10px] italic">Real-time logs will appear here when WhatsApp sessions are active.</div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
                <h3 className="font-bold text-gray-900 dark:text-white mb-4">Infrastructure Status</h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                            <Globe size={16} />
                            <span>CDN Edge (Vercel)</span>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Active</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                            <Server size={16} />
                            <span>Main Node (Easypanel)</span>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Active</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                            <Database size={16} />
                            <span>Redis Cache</span>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Active</span>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
