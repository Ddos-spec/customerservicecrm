import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Smartphone, Search, RefreshCw, Wifi, WifiOff,
  QrCode, Building2, Trash2, Plus, Activity, ChevronDown, ShieldAlert, Power, X
} from 'lucide-react';
import api from '../lib/api';
import { createAuthenticatedWebSocket } from '../lib/realtime';

interface Session {
  sessionId: string;
  status: string;
  qr?: string;
  tenantId?: string | null;
  tenantName?: string | null;
  owner?: string;
  ownerName?: string | null;
  ownerType?: string;
  connectedNumber?: string;
  lastSeen?: string;
  identityMismatch?: boolean;
  expectedNumber?: string | null;
  detectedNumber?: string | null;
  deviceJid?: string | null;
  statusReason?: string | null;
}

const asDataUrl = (qr: string) => qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`;

const SESSION_FILTERS = ['ALL', 'CONNECTED', 'UNASSIGNED', 'IDENTITY_MISMATCH', 'SCAN_QR_CODE', 'CONNECTING', 'DISCONNECTED', 'UNKNOWN'] as const;
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
    case 'UNASSIGNED':
      return {
        label: 'Belum dipetakan',
        helper: 'Gateway terhubung, tetapi belum ada tenant yang secara resmi memiliki sesi ini.',
        icon: ShieldAlert,
        chipClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-700',
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

const isMappedToTenant = (session: Session) => Boolean(session.tenantId && session.ownerType === 'tenant');

const getSessionPresentation = (session: Session) => {
  if (session.status === 'CONNECTED' && !isMappedToTenant(session)) {
    return getStatusMeta('UNASSIGNED');
  }

  if (session.status === 'CONNECTED' && !session.connectedNumber) {
    return {
      ...getStatusMeta('CONNECTED'),
      label: 'Connected · cek device',
      helper: session.statusReason || 'Gateway terhubung, tetapi nomor device belum berhasil diverifikasi. Jangan gunakan untuk operasional sebelum nomor tampil.',
      icon: ShieldAlert,
      chipClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-700',
    };
  }

  return getStatusMeta(session.status);
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastVerifiedAt, setLastVerifiedAt] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<SessionFilter>('ALL');
  const [expandedQrSessionId, setExpandedQrSessionId] = useState<string | null>(null);
  const [disconnectingSessionId, setDisconnectingSessionId] = useState<string | null>(null);
  const [connectionSessionId, setConnectionSessionId] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<'qr' | 'pair'>('qr');
  const [connectionQr, setConnectionQr] = useState('');
  const [pairCode, setPairCode] = useState('');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isGeneratingConnection, setIsGeneratingConnection] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/sessions');
      if (Array.isArray(res.data)) {
        setSessions(res.data);
        setLoadError(null);
        setLastVerifiedAt(new Date());
      } else {
        setLoadError('Format status session tidak valid. Data lama tidak boleh dijadikan acuan.');
      }
    } catch (error: any) {
      console.error('Failed to fetch sessions:', error);
      setLoadError(error?.response?.data?.message || 'Status session gagal dimuat. Data yang tampil mungkin sudah tidak terbaru.');
    } finally {
      setIsLoading(false);
    }
  };

  // WebSocket for real-time updates
  useEffect(() => {
    let isDisposed = false;
    const socket = createAuthenticatedWebSocket();
    if (!socket) return;
    ws.current = socket;

    ws.current.onmessage = (event) => {
      try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'session-update') {
            setSessions(payload.data);
            setLoadError(null);
            setLastVerifiedAt(new Date());
          }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };

    ws.current.onclose = () => {
      if (isDisposed) return;
      setLoadError((current) => current || 'Koneksi realtime terputus. Gunakan Refresh untuk memverifikasi ulang status session.');
    };

    return () => {
      isDisposed = true;
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

  const handleDeleteSession = async (session: Session) => {
    const tenantWarning = session.tenantName
      ? ` Ini juga akan melepas mapping tenant ${session.tenantName}.`
      : '';
    if (!confirm(`Hapus session ${session.sessionId}? Device WhatsApp akan logout.${tenantWarning}`)) return;

    try {
      await api.delete(`/sessions/${session.sessionId}`);
      setSessions(sessions.filter(s => s.sessionId !== session.sessionId));
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

  const closeConnectionModal = () => {
    setConnectionSessionId(null);
    setConnectionQr('');
    setPairCode('');
    setConnectionError(null);
  };

  const requestConnection = async (sessionId: string, mode: 'qr' | 'pair') => {
    setConnectionSessionId(sessionId);
    setConnectionMode(mode);
    setConnectionQr('');
    setPairCode('');
    setConnectionError(null);
    setIsGeneratingConnection(true);

    try {
      if (mode === 'qr') {
        const response = await api.get(`/sessions/${sessionId}/qr`);
        const qr = response.data?.session?.qr;
        if (!qr) throw new Error(response.data?.message || 'Gateway tidak mengembalikan QR baru.');
        setConnectionQr(asDataUrl(qr));
      } else {
        const response = await api.get(`/sessions/${sessionId}/pair`);
        const code = response.data?.pairCode;
        if (!code) throw new Error(response.data?.message || 'Gateway tidak mengembalikan kode telepon.');
        setPairCode(code);
      }
      await fetchSessions();
    } catch (error: any) {
      console.error(`Failed to generate ${mode} connection for ${sessionId}:`, error);
      setConnectionError(error?.response?.data?.message || error?.message || 'Gateway gagal membuat koneksi.');
    } finally {
      setIsGeneratingConnection(false);
    }
  };

  const filteredSessions = sessions.filter(session => {
    if (activeFilter === 'UNASSIGNED' && isMappedToTenant(session)) return false;
    if (activeFilter !== 'ALL' && activeFilter !== 'UNASSIGNED' && session.status !== activeFilter) return false;
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
      count: sessions.filter(s => s.status === 'CONNECTED' && isMappedToTenant(s) && Boolean(s.connectedNumber)).length,
      helper: 'Tenant terpetakan dan device terverifikasi.',
      icon: Wifi,
      accent: 'emerald',
    },
    {
      label: 'Belum dipetakan',
      count: sessions.filter(s => !isMappedToTenant(s)).length,
      helper: 'Tidak dihitung sebagai koneksi tenant.',
      icon: ShieldAlert,
      accent: 'amber',
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
      count: sessions.filter(s => !isMappedToTenant(s) || s.status === 'DISCONNECTED' || s.status === 'UNKNOWN' || s.status === 'IDENTITY_MISMATCH').length,
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
              <span>Atur Notifier</span>
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {stats.map((stat) => {
            const accentClasses = {
              slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
              emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
              blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
              amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
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
                  const count = filter === 'ALL'
                    ? sessions.length
                    : filter === 'UNASSIGNED'
                      ? sessions.filter((session) => !isMappedToTenant(session)).length
                      : sessions.filter((session) => session.status === filter).length;
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
            Hanya session dengan tenant dan nomor device terverifikasi yang dihitung siap operasional. Session tanpa mapping ditandai untuk ditetapkan atau dihapus—bukan koneksi tenant.
            {lastVerifiedAt && <span className="ml-1 font-semibold text-gray-700 dark:text-gray-200">Terakhir diverifikasi: {lastVerifiedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.</span>}
          </div>
          {loadError && (
            <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200 sm:flex-row sm:items-center sm:justify-between">
              <span>{loadError}</span>
              <button type="button" onClick={fetchSessions} className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-rose-700 transition-colors hover:bg-rose-100 focus:outline-none focus:ring-4 focus:ring-rose-500/15 dark:bg-slate-900 dark:text-rose-200 dark:hover:bg-slate-800">Coba lagi</button>
            </div>
          )}
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
              const statusMeta = getSessionPresentation(session);
              const StatusIcon = statusMeta.icon;
              const hasQr = Boolean(session.qr) && session.status !== 'CONNECTED';
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
                            {session.tenantName ? `Tenant: ${session.tenantName}` : 'Belum dipetakan ke tenant'}
                          </p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${statusMeta.chipClass}`}>
                        <StatusIcon size={12} />
                        {statusMeta.label}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {session.status !== 'CONNECTED' && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void requestConnection(session.sessionId, 'qr')}
                            title="Buat QR baru yang masih berlaku"
                            className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-blue-700 transition-colors hover:bg-blue-100 focus:outline-none focus:ring-4 focus:ring-blue-500/15 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/40"
                          >
                            <QrCode size={16} />
                            <span>QR baru</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void requestConnection(session.sessionId, 'pair')}
                            title="Buat kode telepon baru"
                            className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-violet-700 transition-colors hover:bg-violet-100 focus:outline-none focus:ring-4 focus:ring-violet-500/15 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-900/40"
                          >
                            <Smartphone size={16} />
                            <span>Kode</span>
                          </button>
                        </div>
                      )}
                      {session.status !== 'DISCONNECTED' && (
                        <button
                          onClick={() => handleDisconnectSession(session.sessionId)}
                          disabled={disconnectingSessionId === session.sessionId}
                          title="Disconnect WhatsApp device tanpa menghapus mapping tenant"
                          className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-amber-700 shadow-sm transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40"
                        >
                          {disconnectingSessionId === session.sessionId ? (
                            <RefreshCw size={18} className="animate-spin" />
                          ) : (
                            <Power size={18} />
                          )}
                          <span>Disconnect</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteSession(session)}
                        title="Hapus session dan bersihkan referensi"
                        className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-rose-600 transition-colors hover:bg-rose-50 dark:hover:bg-rose-900/20"
                      >
                        <Trash2 size={18} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-gray-50 p-4 dark:bg-slate-800/80">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Kepemilikan</p>
                      <div className="mt-2 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                        {isMappedToTenant(session) ? <Building2 size={14} /> : <ShieldAlert size={14} className="text-amber-600 dark:text-amber-300" />}
                        <span className="truncate font-medium">{session.tenantName || 'Belum dipetakan'}</span>
                      </div>
                      {session.ownerName && <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">PIC owner: {session.ownerName}</p>}
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

                  {!isMappedToTenant(session) && (
                    <button
                      type="button"
                      onClick={() => navigate('/super-admin/tenants')}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-amber-800 transition-colors hover:bg-amber-100 focus:outline-none focus:ring-4 focus:ring-amber-500/15 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40"
                    >
                      <Building2 size={16} />
                      Tetapkan ke tenant
                    </button>
                  )}

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

      {connectionSessionId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Hubungkan WhatsApp" className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5 dark:border-slate-800">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">Koneksi perangkat</p>
                <h2 className="mt-1 text-lg font-black text-gray-900 dark:text-white">{connectionSessionId}</h2>
              </div>
              <button type="button" onClick={closeConnectionModal} className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/15 dark:hover:bg-slate-800 dark:hover:text-gray-200" aria-label="Tutup">
                <X size={20} />
              </button>
            </div>

            <div className="mx-6 mt-5 grid grid-cols-2 rounded-2xl bg-gray-100 p-1 dark:bg-slate-800">
              <button type="button" onClick={() => void requestConnection(connectionSessionId, 'qr')} disabled={isGeneratingConnection} className={`rounded-xl px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition-colors disabled:opacity-60 ${connectionMode === 'qr' ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}>QR Code</button>
              <button type="button" onClick={() => void requestConnection(connectionSessionId, 'pair')} disabled={isGeneratingConnection} className={`rounded-xl px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition-colors disabled:opacity-60 ${connectionMode === 'pair' ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}>Kode telepon</button>
            </div>

            <div className="p-6 text-center">
              {isGeneratingConnection ? (
                <div className="py-12 text-sm font-semibold text-gray-500 dark:text-gray-400"><RefreshCw className="mx-auto mb-3 animate-spin text-emerald-600" size={30} />Membuat koneksi baru...</div>
              ) : connectionError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left dark:border-rose-900/60 dark:bg-rose-950/30">
                  <p className="text-sm font-bold text-rose-800 dark:text-rose-200">Koneksi belum dibuat</p>
                  <p className="mt-2 text-xs leading-5 text-rose-700 dark:text-rose-300">{connectionError}</p>
                  <button type="button" onClick={() => void requestConnection(connectionSessionId, connectionMode)} className="mt-4 rounded-xl bg-rose-700 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-white transition-colors hover:bg-rose-800 focus:outline-none focus:ring-4 focus:ring-rose-500/25">Coba lagi</button>
                </div>
              ) : connectionMode === 'qr' && connectionQr ? (
                <div className="space-y-5">
                  <div className="inline-flex rounded-2xl border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950"><img src={connectionQr} alt="QR WhatsApp" className="h-64 w-64" /></div>
                  <div className="rounded-2xl bg-blue-50 p-4 text-left text-xs leading-5 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200"><strong className="block">Scan sekarang, jangan pakai QR lama.</strong>WhatsApp → Perangkat tertaut → Tautkan perangkat. Bila QR sudah lama terbuka, tekan “QR Code” untuk membuat yang baru.</div>
                </div>
              ) : connectionMode === 'pair' && pairCode ? (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-5 py-7 dark:border-violet-900/60 dark:bg-violet-950/30"><p className="font-mono text-4xl font-black tracking-[0.18em] text-violet-700 dark:text-violet-300">{pairCode}</p></div>
                  <p className="text-xs leading-5 text-gray-600 dark:text-gray-300">Di WhatsApp: Perangkat tertaut → Tautkan dengan nomor telepon → masukkan kode ini.</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminSessions;
