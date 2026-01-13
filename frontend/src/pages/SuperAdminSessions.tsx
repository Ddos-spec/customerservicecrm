import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Smartphone, Search, RefreshCw, Wifi, WifiOff,
  QrCode, User, Building2, Trash2, Plus
} from 'lucide-react';
import api from '../lib/api';

interface Session {
  sessionId: string;
  status: string;
  qr?: string;
  owner?: string;
  ownerType?: string;
  connectedNumber?: string;
  lastSeen?: string;
}

const SuperAdminSessions = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const ws = useRef<WebSocket | null>(null);

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/sessions');
      if (Array.isArray(res.data)) {
        setSessions(res.data);
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // WebSocket for real-time updates
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
    fetchSessions();
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm(`Hapus session ${sessionId}?`)) return;

    try {
      await api.delete(`/sessions/${sessionId}`);
      setSessions(sessions.filter(s => s.sessionId !== sessionId));
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert('Gagal menghapus session');
    }
  };

  const filteredSessions = sessions.filter(session => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      session.sessionId?.toLowerCase().includes(query) ||
      session.owner?.toLowerCase().includes(query) ||
      session.connectedNumber?.toLowerCase().includes(query)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONNECTED': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700';
      case 'CONNECTING': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-700';
      case 'SCAN_QR_CODE': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-700';
      case 'DISCONNECTED': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-700';
      default: return 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300 border-gray-200 dark:border-slate-600';
    }
  };

  const stats = [
    { label: 'Total Sessions', count: sessions.length, icon: Smartphone },
    { label: 'Connected', count: sessions.filter(s => s.status === 'CONNECTED').length, icon: Wifi },
    { label: 'Pending QR', count: sessions.filter(s => s.status === 'SCAN_QR_CODE').length, icon: QrCode },
    { label: 'Disconnected', count: sessions.filter(s => s.status === 'DISCONNECTED').length, icon: WifiOff },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">WhatsApp Sessions</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Kelola semua WhatsApp sessions dari seluruh sistem
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchSessions}
            disabled={isLoading}
            className="p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
          >
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => navigate('/super-admin/settings')}
            className="flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all"
          >
            <Plus size={20} />
            New Session
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700"
          >
            <div className="flex items-center justify-between mb-2">
              <stat.icon size={20} className="text-gray-400" />
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.count}</p>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Cari session ID, owner, atau nomor..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
        />
      </div>

      {/* Sessions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full p-12 text-center text-gray-400">
            <RefreshCw className="animate-spin mx-auto mb-3" size={32} />
            <p>Loading sessions...</p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="col-span-full p-12 text-center text-gray-400">
            <Smartphone className="mx-auto mb-3 opacity-30" size={48} />
            <p>Tidak ada session</p>
          </div>
        ) : (
          filteredSessions.map((session) => (
            <div
              key={session.sessionId}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 space-y-4 hover:shadow-lg transition-all"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Smartphone size={18} className="text-gray-400" />
                    <h3 className="font-bold text-gray-900 dark:text-white truncate">
                      {session.sessionId}
                    </h3>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border ${getStatusColor(session.status)}`}>
                    {session.status === 'CONNECTED' ? <Wifi size={12} /> : <WifiOff size={12} />}
                    {session.status}
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteSession(session.sessionId)}
                  className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              {/* Owner Info */}
              <div className="space-y-2 text-sm">
                {session.owner && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                    {session.ownerType === 'tenant' ? (
                      <Building2 size={14} />
                    ) : (
                      <User size={14} />
                    )}
                    <span className="truncate">{session.owner}</span>
                  </div>
                )}
                {session.connectedNumber && (
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
                    <Smartphone size={14} />
                    {session.connectedNumber}
                  </div>
                )}
              </div>

              {/* QR Code */}
              {session.status === 'SCAN_QR_CODE' && session.qr && (
                <div className="pt-4 border-t border-gray-200 dark:border-slate-700">
                  <div className="bg-white p-3 rounded-xl border border-gray-200 dark:border-slate-700">
                    <img
                      src={session.qr}
                      alt="QR Code"
                      className="w-full h-auto"
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                    Scan QR code dengan WhatsApp
                  </p>
                </div>
              )}

              {/* Last Seen */}
              {session.lastSeen && (
                <div className="text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-200 dark:border-slate-700">
                  Last seen: {new Date(session.lastSeen).toLocaleString('id-ID')}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SuperAdminSessions;
