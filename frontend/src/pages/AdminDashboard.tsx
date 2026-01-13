import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, MessageSquare, Clock, Shield, Settings,
  ExternalLink, ArrowUpRight, CheckCircle2, AlertCircle
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import api from '../lib/api';

interface Stats {
  tickets?: {
    open_tickets?: number;
    closed_tickets?: number;
    total_tickets?: number;
    avg_response_minutes?: number;
  };
  users?: {
    admin_count?: number;
    agent_count?: number;
    total_users?: number;
  };
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/admin/stats');
      if (res.data.success) {
        setStats(res.data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60000); // Refresh every 60s
    return () => clearInterval(interval);
  }, []);

  const quickStats = [
    {
      label: 'Agent Aktif',
      value: stats?.users?.agent_count?.toString() || '0',
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      onClick: () => navigate('/admin/agents'),
      description: 'Kelola tim agent'
    },
    {
      label: 'Tiket Open',
      value: stats?.tickets?.open_tickets?.toString() || '0',
      icon: AlertCircle,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
      onClick: () => navigate('/admin/tickets?status=open'),
      description: 'Lihat tiket open'
    },
    {
      label: 'Tiket Selesai',
      value: stats?.tickets?.closed_tickets?.toString() || '0',
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      onClick: () => navigate('/admin/tickets?status=closed'),
      description: 'Lihat tiket closed'
    },
    {
      label: 'Avg Response',
      value: stats?.tickets?.avg_response_minutes
        ? `${Math.round(stats.tickets.avg_response_minutes)}m`
        : '-',
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      onClick: () => navigate('/admin/reports'),
      description: 'Lihat laporan'
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Admin Console</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manajemen operasional untuk <span className="font-bold text-blue-600 dark:text-blue-400">{user?.tenant_name || 'Perusahaan'}</span>
          </p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={() => navigate('/admin/chat')}
            className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 dark:shadow-blue-900/30 hover:bg-blue-700 transition-all active:scale-95"
          >
            <MessageSquare size={18} />
            <span>Buka Workspace</span>
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {quickStats.map((stat, i) => (
          <div
            key={i}
            onClick={stat.onClick}
            className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm cursor-pointer hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-700 transition-all group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-xl ${stat.bg} dark:bg-opacity-10 ${stat.color} group-hover:scale-110 transition-transform`}>
                <stat.icon size={24} />
              </div>
              <ArrowUpRight size={16} className="text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{stat.label}</p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</h3>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {stat.description} →
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-gray-100 dark:border-slate-700 shadow-sm p-8">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Aktivitas Terbaru</h3>
              <button className="text-blue-600 dark:text-blue-400 text-sm font-bold hover:underline flex items-center gap-1">
                Laporan Lengkap <ExternalLink size={14} />
              </button>
            </div>
            
            <div className="space-y-6">
              {[1, 2, 3].map((item) => (
                <div key={item} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-slate-700/30 border border-transparent hover:border-gray-200 dark:hover:border-slate-600 transition-all cursor-pointer group">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-blue-600 font-bold border border-gray-100 dark:border-slate-700 shadow-sm group-hover:scale-110 transition-transform">
                      {item === 1 ? 'AG' : item === 2 ? 'BK' : 'RM'}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">
                        {item === 1 ? 'Admin Ganteng' : item === 2 ? 'Budi Kurniawan' : 'Rina Melati'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Membalas tiket #10293</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">2 Menit Lalu</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-8 rounded-3xl text-white shadow-xl shadow-blue-200 dark:shadow-blue-900/30 relative overflow-hidden">
            <Shield className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 rotate-12" />
            <h4 className="text-lg font-bold mb-2">Manajemen Agent</h4>
            <p className="text-sm text-blue-100 mb-6 leading-relaxed">Kelola hak akses dan performa tim Customer Service Anda.</p>
            <button 
              onClick={() => navigate('/admin/agents')}
              className="w-full py-3 bg-white text-blue-700 font-bold rounded-xl hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
            >
              <Users size={18} />
              Kelola Tim
            </button>
          </div>

          <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-gray-100 dark:border-slate-700 shadow-sm">
            <h4 className="font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <Settings size={18} className="text-gray-400" />
              Quick Actions
            </h4>
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={() => navigate('/admin/settings')}
                className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-slate-700/50 text-left hover:bg-gray-100 dark:hover:bg-slate-700 transition-all group"
              >
                <p className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">Pengaturan Chat</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Webhook & Auto Reply</p>
              </button>
              <button className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-slate-700/50 text-left hover:bg-gray-100 dark:hover:bg-slate-700 transition-all group">
                <p className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">Export Laporan</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">PDF & Excel bulanan</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;