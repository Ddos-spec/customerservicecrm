import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Smartphone, Search, RefreshCw, Wifi, WifiOff,
  QrCode, User, Building2, Trash2, Plus, Activity, ChevronDown, ShieldAlert, Power
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
  identityMismatch?: boolean;
  expectedNumber?: string | null;
  detectedNumber?: string | null;
  deviceJid?: string | null;
  statusReason?: string | null;
}

const SESSION_FILTERS = ['ALL', 'CONNECTED', 'IDENTITY_MISMATCH', 'SCAN_QR_CODE', 'CONNECTING', 'DISCONNECTED', 'UNKNOWN'] as const;
type SessionFilter = typeof SESSION_FILTERS[number];

const getStatusMeta = (status?: string) => {
  switch (status) {
    case 'CONNECTED':
      return {
        label: 'Connected',
        helper: 'Session aktif dan siap menerima pesan.',
        icon: Wifi,
        chipClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
      };
    case 'CONNECTING':
      return {
        label: 'Verifying',
        helper: 'Server sedang validasi koneksi ulang.',
        icon: Activity,
        chipClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-700',
      };
    case 'SCAN_QR_CODE':
      return {
        label: 'Needs QR',
        helper: 'Perlu scan QR untuk mengaktifkan perangkat.',
        icon: QrCode,
        chipClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-700',
      };
    case 'DISCONNECTED':
      return {
        label: 'Disconnected',
        helper: 'Session terputus atau sudah logout.',
        icon: WifiOff,
        chipClass: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-700',
      };
    case 'IDENTITY_MISMATCH':
      return {
        label: 'Identity mismatch',
        helper: 'Session ID tidak sama dengan nomor device yang sedang login. Logout lalu scan ulang nomor yang benar.',
        icon: ShieldAlert,
        chipClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-700',
      };
    default:
      return {
        label: 'Unknown',
        helper: 'Status belum terverifikasi penuh.',
        icon: ShieldAlert,
        chipClass: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300 border-gray-200 dark:border-slate-600',
      };
  }
};

const formatDetailedDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const SuperAdminSessions = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<SessionFilter>('ALL');
  const [expandedQrSessionId, setExpandedQrSessionId] = useState<string | null>(null);
  const [disconnectingSessionId, setDisconnectingSessionId] = useState<string | null>(null);
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

  const handleDisconnectSession = async (sessionId: string) => {
    if (!confirm(`Disconnect session ${sessionId}? Tenant tetap tersimpan, tapi device WA akan logout dan perlu scan/pair ulang untuk aktif lagi.`)) return;

    setDisconnectingSessionId(sessionId);
    try {
      await api.post(`/sessions/${sessionId}/disconnect`);
      await fetchSessions();
    } catch (error) {
      console.error('Failed to disconnect session:', error);
      alert('Gagal disconnect session');
    } finally {
      setDisconnectingSessionId(null);
    }
  };

  const filteredSessions = sessions.filter(session => {
    if (activeFilter !== 'ALL' && session.status !== activeFilter) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      session.sessionId?.toLowerCase().includes(query) ||
      session.owner?.toLowerCase().includes(query) ||
      session.connectedNumber?.toLowerCase().includes(query)
    );
  });

  const stats = [
    {
      label: 'Total Sessions',
      count: sessions.length,
      helper: 'Semua perangkat yang pernah terdeteksi gateway.',
      icon: Smartphone,
      accent: 'slate',
    },
    {
      label: 'Connected',
      count: sessions.filter(s => s.status === 'CONNECTED').length,
      helper: 'Siap kirim/terima pesan.',
      icon: Wifi,
      accent: 'emerald',
    },
    {
      label: 'Pending QR',
      count: sessions.filter(s => s.status === 'SCAN_QR_CODE').length,
      helper: 'Perlu scan QR dari device owner.',
      icon: QrCode,
      accent: 'blue',
    },
    {
      label: 'Need Attention',
      count: sessions.filter(s => s.status === 'DISCONNECTED' || s.status === 'UNKNOWN' || s.status === 'IDENTITY_MISMATCH').length,
      helper: 'Butuh pengecekan atau reconnect.',
      icon: ShieldAlert,
      accent: 'rose',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="rounded-[2rem] border border-emerald-100 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(255,255,255,0.92))] p-6 shadow-[0_24px_80px_-50px_rgba(16,185,129,0.45)] dark:border-emerald-900/40 dark:bg-[linear-gradient(135deg,rgba(6,78,59,0.45),rgba(15,23,42,0.92))] dark:shadow-none lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-300">WhatsApp Session Control</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-900 dark:text-white lg:text-4xl">WhatsApp Sessions</h1>
            <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
              Monitor semua koneksi WhatsApp lintas tenant, lihat QR yang masih pending, dan bedakan session aktif vs session yang perlu perhatian.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={fetchSessions}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-gray-700 shadow-sm transition-all hover:bg-white disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900/80 dark:text-gray-200 dark:hover:bg-slate-900"
            >
              <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => navigate('/super-admin/settings')}
              className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-xl shadow-emerald-200 transition-all hover:bg-emerald-700 dark:shadow-emerald-950/40"
            >
              <Plus size={18} />
              <span>New Session</span>
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => {
            const accentClasses = {
              slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
              emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
              blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
              rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
            }[stat.accent];

            return (
              <div key={stat.label} className="rounded-3xl border border-white/70 bg-white/85 p-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400 dark:text-gray-500">{stat.label}</p>
                    <p className="mt-2 text-2xl font-black tracking-tight text-gray-900 dark:text-white">{stat.count.toLocaleString('id-ID')}</p>
                  </div>
                  <div className={`rounded-2xl p-3 ${accentClasses}`}>
                    <stat.icon size={20} />
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{stat.helper}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1 max-w-xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Cari session ID, owner, atau nomor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-12 pr-4 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {SESSION_FILTERS.map((filter) => {
                const count = filter === 'ALL' ? sessions.length : sessions.filter((session) => session.status === filter).length;
                const active = activeFilter === filter;
                return (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`rounded-full px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] transition-all ${
                      active
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100 dark:shadow-emerald-950/40'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-slate-900 dark:text-gray-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {filter === 'ALL' ? 'Semua' : getStatusMeta(filter).label} · {count}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3 text-xs text-gray-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-gray-400">
            Session lama yang tidak punya owner sah seharusnya tidak lagi dianggap aktif. Jika status terlihat aneh, gunakan refresh untuk memaksa verifikasi ulang.
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {isLoading ? (
            <div className="col-span-full rounded-3xl border border-dashed border-gray-200 bg-gray-50/80 p-12 text-center text-gray-400 dark:border-slate-700 dark:bg-slate-900/70">
              <RefreshCw className="mx-auto mb-3 animate-spin" size={32} />
              <p className="font-semibold text-gray-700 dark:text-gray-200">Memuat session WhatsApp...</p>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="col-span-full rounded-3xl border border-dashed border-gray-200 bg-gray-50/80 p-12 text-center text-gray-400 dark:border-slate-700 dark:bg-slate-900/70">
              <Smartphone className="mx-auto mb-3 opacity-30" size={48} />
              <p className="text-base font-semibold text-gray-700 dark:text-gray-200">Tidak ada session yang cocok</p>
              <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">Coba ubah pencarian atau pilih filter status lain.</p>
            </div>
          ) : (
            filteredSessions.map((session) => {
              const statusMeta = getStatusMeta(session.status);
              const StatusIcon = statusMeta.icon;
              const hasQr = session.status === 'SCAN_QR_CODE' && session.qr;
              const isQrExpanded = expandedQrSessionId === session.sessionId;

              return (
                <div
                  key={session.sessionId}
                  className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-[0_18px_45px_-36px_rgba(15,23,42,0.55)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-34px_rgba(15,23,42,0.6)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="rounded-2xl bg-gray-100 p-3 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
                          <Smartphone size={18} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-black tracking-tight text-gray-900 dark:text-white">
                            {session.sessionId}
                          </h3>
                          <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                            {session.owner ? `Owner: ${session.owner}` : 'Belum terhubung ke tenant atau owner'}
                          </p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${statusMeta.chipClass}`}>
                        <StatusIcon size={12} />
                        {statusMeta.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {session.status !== 'DISCONNECTED' && (
                        <button
                          onClick={() => handleDisconnectSession(session.sessionId)}
                          disabled={disconnectingSessionId === session.sessionId}
                          title="Disconnect WhatsApp device tanpa menghapus mapping tenant"
                          className="rounded-2xl p-2.5 text-amber-600 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-amber-900/20"
                        >
                          {disconnectingSessionId === session.sessionId ? (
                            <RefreshCw size={18} className="animate-spin" />
                          ) : (
                            <Power size={18} />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteSession(session.sessionId)}
                        title="Hapus session dan bersihkan referensi"
                        className="rounded-2xl p-2.5 text-rose-600 transition-colors hover:bg-rose-50 dark:hover:bg-rose-900/20"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-gray-50 p-4 dark:bg-slate-800/80">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Kepemilikan</p>
                      <div className="mt-2 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                        {session.ownerType === 'tenant' ? <Building2 size={14} /> : <User size={14} />}
                        <span className="truncate font-medium">{session.owner || 'Tanpa owner'}</span>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-gray-50 p-4 dark:bg-slate-800/80">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Nomor Terhubung</p>
                      <div className="mt-2 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                        <Smartphone size={14} />
                        <span className="truncate font-medium">{session.connectedNumber || '-'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Keterangan Status</p>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{session.statusReason || statusMeta.helper}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-400 dark:text-gray-500">
                      <span className="rounded-full bg-white px-2.5 py-1 dark:bg-slate-900">Last seen: {formatDetailedDate(session.lastSeen)}</span>
                      {session.identityMismatch && (
                        <>
                          <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                            Expected: {session.expectedNumber || session.sessionId}
                          </span>
                          <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                            Detected: {session.detectedNumber || session.connectedNumber || '-'}
                          </span>
                        </>
                      )}
                      {session.ownerType && (
                        <span className="rounded-full bg-white px-2.5 py-1 dark:bg-slate-900">
                          {session.ownerType === 'tenant' ? 'Tenant-owned' : 'Internal owner'}
                        </span>
                      )}
                    </div>
                  </div>

                  {hasQr && (
                    <div className="mt-4 border-t border-gray-100 pt-4 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => setExpandedQrSessionId(isQrExpanded ? null : session.sessionId)}
                        className="flex w-full items-center justify-between rounded-2xl bg-blue-50 px-4 py-3 text-left text-sm font-bold text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
                      >
                        <span>Lihat QR untuk aktivasi perangkat</span>
                        <ChevronDown size={16} className={`transition-transform ${isQrExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      {isQrExpanded && (
                        <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                          <img
                            src={session.qr}
                            alt="QR Code"
                            className="mx-auto h-auto w-full max-w-[220px]"
                          />
                          <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
                            Scan QR code dengan WhatsApp dari perangkat yang sesuai.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default SuperAdminSessions;
