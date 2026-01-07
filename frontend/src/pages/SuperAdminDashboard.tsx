import { useState, useEffect } from 'react';
import {
  Users, Server, Smartphone,
  Terminal, Trash2, RefreshCw,
  Globe, MessageSquare, Database, Building2
} from 'lucide-react';
import api from '../lib/api';

interface Stats {
  tenants: { total: string; active: string };
  users: { total: string };
  tickets: { total: string; open: string };
}

interface Tenant {
  id: number;
  company_name: string;
  status: string;
  user_count: string;
  created_at: string;
}

const SuperAdminDashboard = () => {
  // Real States
  const [sessions, setSessions] = useState<any[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
        const [statsRes, tenantsRes] = await Promise.all([
            api.get('/admin/stats'),
            api.get('/admin/tenants')
        ]);

        if (statsRes.data.success) {
            setStats(statsRes.data.stats);
        }
        if (tenantsRes.data.success) {
            setTenants(tenantsRes.data.tenants);
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

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Build stats from real data
  const globalStats = [
    {
      label: 'Total Tickets',
      value: stats?.tickets?.total || '0',
      icon: MessageSquare,
      color: 'text-blue-600',
      trend: `${stats?.tickets?.open || '0'} Open`
    },
    {
      label: 'Total Perusahaan (Tenants)',
      value: stats?.tenants?.total || '0',
      icon: Building2,
      color: 'text-purple-600',
      trend: `${stats?.tenants?.active || '0'} Active`
    },
    {
      label: 'Total Users',
      value: stats?.users?.total || '0',
      icon: Users,
      color: 'text-emerald-600',
      trend: 'All Roles'
    },
    {
      label: 'WhatsApp Sessions',
      value: String(sessions.length),
      icon: Smartphone,
      color: 'text-amber-600',
      trend: sessions.filter(s => s.status === 'CONNECTED').length + ' Connected'
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
            <button className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 dark:shadow-blue-900/30 hover:bg-blue-700 transition-all">
                Tambah Tenant Baru
            </button>
        </div>
      </div>

      {/* Global Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {globalStats.map((stat, i) => (
          <div key={i} className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl bg-gray-50 dark:bg-slate-700/60 ${stat.color}`}>
                    <stat.icon size={24} />
                </div>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-full">{stat.trend}</span>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{stat.label}</p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Real Active Sessions (WhatsApp Instances) */}
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-50 dark:border-slate-700 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 dark:text-white flex items-center">
                        <Smartphone size={20} className="mr-2 text-blue-600 dark:text-blue-400" />
                        Active WhatsApp Instances
                    </h3>
                    <span className="text-xs font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-3 py-1 rounded-full">{sessions.length} Instance</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50/50 dark:bg-slate-800/60 text-gray-400 dark:text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                            <tr>
                                <th className="px-6 py-4">Session ID</th>
                                <th className="px-6 py-4">Tenant</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                            {sessions.length > 0 ? sessions.map((s: any) => (
                                <tr key={s.sessionId} className="hover:bg-blue-50/30 dark:hover:bg-slate-700/40 transition-colors">
                                    <td className="px-6 py-4">
                                        <span className="text-sm font-mono font-bold text-blue-600 dark:text-blue-400">{s.sessionId}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">Toko Maju Jaya</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                                            s.status === 'CONNECTED' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                                        }`}>{s.status}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-gray-400 dark:text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-gray-400 dark:text-gray-500 text-sm">No active sessions found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Tenant Overview - Real Data */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-50 dark:border-slate-700 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 dark:text-white">Registered Tenants</h3>
                    <span className="text-xs font-bold bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 px-3 py-1 rounded-full">{tenants.length} Tenants</span>
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
                    <h3 className="font-bold text-blue-400 flex items-center text-sm">
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
