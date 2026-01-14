import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, MessageSquare, Clock, Shield, Settings,
  ExternalLink, ArrowUpRight, CheckCircle2, AlertCircle, Wifi, Smartphone, X, RefreshCw
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import api from '../lib/api';
import { toast } from 'sonner';

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

interface RecentTicket {
  id: string;
  customer_name: string;
  agent_name?: string;
  updated_at: string;
}

const asDataUrl = (qr: string) => {
  if (!qr) return '';
  return qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentTickets, setRecentTickets] = useState<RecentTicket[]>([]);

  // WhatsApp Connection State
  const sessionId = user?.tenant_session_id || '';
  const [waStatus, setWaStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [connectedNumber, setConnectedNumber] = useState<string>('');
  const [qrUrl, setQrUrl] = useState('');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  const fetchStats = async () => {
    try {
      const res = await api.get('/admin/stats');
      if (res.data.success) {
        setStats(res.data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchRecentTickets = async () => {
    try {
      const res = await api.get('/admin/tickets?limit=3&offset=0');
      if (res.data.success) {
        setRecentTickets(res.data.tickets || []);
      }
    } catch (error) {
      console.error('Failed to fetch recent tickets:', error);
    }
  };

  const fetchSessionStatus = useCallback(async () => {
    if (!sessionId) {
      setWaStatus('disconnected');
      setQrUrl('');
      setConnectedNumber('');
      return;
    }

    try {
      const { data } = await api.get('/sessions');
      if (Array.isArray(data)) {
        const mySession = data.find((s: any) => s.sessionId === sessionId);
        if (mySession) {
          setWaStatus(mySession.status === 'CONNECTED' ? 'connected' : mySession.status === 'CONNECTING' ? 'connecting' : 'disconnected');
          if (mySession.qr) {
            setQrUrl(asDataUrl(mySession.qr));
          } else {
            setQrUrl('');
          }
          setConnectedNumber(mySession.connectedNumber || '');
        } else {
          setWaStatus('disconnected');
          setQrUrl('');
          setConnectedNumber('');
        }
      }
    } catch (error) {
      console.error('Failed to fetch session:', error);
    }
  }, [sessionId]);

  const handleRequestQr = async () => {
    if (!sessionId) {
      toast.error('Session WA belum diatur oleh Super Admin');
      return;
    }
    try {
      await api.get(`/sessions/${sessionId}/qr`);
      setIsQrModalOpen(true);
    } catch (error) {
      console.error('Failed to request QR:', error);
      toast.error('Gagal meminta QR. Coba lagi.');
    }
  };

  // WebSocket for real-time session updates
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
          const mySession = payload.data.find((s: any) => s.sessionId === sessionId);
          if (mySession) {
            setWaStatus(mySession.status === 'CONNECTED' ? 'connected' : mySession.status === 'CONNECTING' ? 'connecting' : 'disconnected');
            if (mySession.qr) {
              setQrUrl(asDataUrl(mySession.qr));
            } else {
              setQrUrl('');
            }
            setConnectedNumber(mySession.connectedNumber || '');

            if (mySession.status === 'CONNECTED') {
              toast.success('WhatsApp Terhubung!');
              setIsQrModalOpen(false);
            }
          }
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
  }, [sessionId]);

  useEffect(() => {
    fetchStats();
    fetchRecentTickets();
    fetchSessionStatus();
    const interval = setInterval(() => {
      fetchStats();
      fetchRecentTickets();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchSessionStatus]);

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
        <div className="flex items-center space-x-3">
          {/* WhatsApp Status */}
          <div className="flex flex-col items-end gap-2">
            <div
              onClick={waStatus !== 'connected' ? handleRequestQr : undefined}
              className={`flex items-center space-x-2 px-4 py-2 rounded-full border cursor-pointer ${
                waStatus === 'connected'
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                  : waStatus === 'connecting'
                  ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 animate-pulse'
                  : 'bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40'
              }`}
            >
              <Wifi size={16} />
              <span className="text-sm font-bold capitalize">
                {waStatus === 'connected' ? 'WhatsApp Connected' : waStatus === 'connecting' ? 'Connecting...' : 'Connect WhatsApp'}
              </span>
            </div>
            {waStatus === 'connected' && connectedNumber && (
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                <Smartphone className="text-emerald-600 dark:text-emerald-400" size={14} />
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  {connectedNumber}
                </span>
              </div>
            )}
          </div>
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
              {recentTickets.length > 0 ? (
                recentTickets.map((ticket) => {
                  const initials = ticket.customer_name
                    .split(' ')
                    .map((part) => part[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  const timeAgo = ticket.updated_at
                    ? new Date(ticket.updated_at).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '-';

                  return (
                    <div
                      key={ticket.id}
                      onClick={() => navigate(`/admin/tickets`)}
                      className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-slate-700/30 border border-transparent hover:border-gray-200 dark:hover:border-slate-600 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-blue-600 font-bold border border-gray-100 dark:border-slate-700 shadow-sm group-hover:scale-110 transition-transform">
                          {initials}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">
                            {ticket.customer_name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {ticket.agent_name ? `Ditangani oleh ${ticket.agent_name}` : 'Menunggu agent'}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-400 font-medium">{timeAgo}</span>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12">
                  <MessageSquare className="mx-auto mb-4 text-gray-300 dark:text-gray-600" size={48} />
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                    Belum ada aktivitas ticket
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Aktivitas terbaru akan muncul di sini
                  </p>
                </div>
              )}
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

      {/* QR MODAL */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 flex justify-between items-center border-b border-gray-100 dark:border-slate-700">
              <h3 className="font-bold text-gray-900 dark:text-white">Koneksi WhatsApp</h3>
              <button
                onClick={() => setIsQrModalOpen(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="p-10 text-center">
              {qrUrl ? (
                <div className="space-y-6">
                  <div className="inline-block p-4 bg-white dark:bg-slate-900 border-2 border-dashed border-gray-200 dark:border-slate-600 rounded-2xl">
                    <img src={qrUrl} alt="QR Code" className="w-64 h-64" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 font-medium mb-2">
                      Scan QR Code dengan WhatsApp
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      Buka WhatsApp &gt; Menu &gt; Perangkat Tertaut &gt; Tautkan Perangkat
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center">
                  <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center animate-pulse mb-4">
                    <RefreshCw size={32} className="animate-spin" />
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 font-medium">Menghubungkan ke Gateway...</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">QR Code akan muncul sebentar lagi</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;