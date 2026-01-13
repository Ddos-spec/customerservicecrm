import { useEffect, useState, useRef } from 'react';
import { Bell, RefreshCw, Loader2, CheckCircle2, Wifi, WifiOff, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const SuperAdminSettings = () => {
  const NOTIFIER_ID = 'notifier';
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const ws = useRef<WebSocket | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const sessionRes = await api.get('/sessions');
      if (Array.isArray(sessionRes.data)) {
        const notifier = sessionRes.data.find((s) => s.sessionId === NOTIFIER_ID);
        setSession(notifier || null);
      }
    } catch (error) {
      console.error('Failed to fetch notifier settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // WebSocket Connection
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
        if (payload.type === 'session-update' && Array.isArray(payload.data)) {
          const notifier = payload.data.find((s: any) => s.sessionId === NOTIFIER_ID);
          setSession(notifier || null);
          if (notifier?.status === 'CONNECTED') {
            toast.success('Notifier terhubung ke WhatsApp!');
          }
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };

    return () => {
      if (ws.current) ws.current.close();
    };
  }, []);

  const asDataUrl = (qr: string) => {
    if (!qr) return '';
    return qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
  };

  const handleConnect = async () => {
    setIsProcessing(true);
    try {
      await api.post('/sessions', { sessionId: NOTIFIER_ID });
      await api.post('/admin/notifier-session', { session_id: NOTIFIER_ID });
      toast.success('Scan QR untuk menghubungkan notifier');
      await fetchData();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Gagal membuat notifier');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRefreshQr = async () => {
    setIsProcessing(true);
    try {
      await api.get(`/sessions/${NOTIFIER_ID}/qr`);
      toast.success('QR code diperbarui');
      await fetchData();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Gagal refresh QR');
    } finally {
      setIsProcessing(false);
    }
  };

  const isConnected = session?.status === 'CONNECTED';
  const hasSession = !!session;
  const hasQr = Boolean(session?.qr);
  const statusLabel = isConnected ? 'Terhubung' : hasSession ? 'Menunggu Scan' : 'Belum Aktif';
  const statusMessage = isConnected
    ? 'Notifier aktif dan siap kirim pesan'
    : hasSession
    ? 'Scan QR dengan WhatsApp untuk menyelesaikan koneksi'
    : 'Buat session baru untuk memulai';
  const statusBadge = isConnected
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
    : hasSession
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
    : 'bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-gray-300';

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8 flex items-center gap-3">
        <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-200">
          <Bell size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pengaturan Notifier</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            WhatsApp khusus notifikasi otomatis ke super admin
          </p>
        </div>
      </div>

      {/* Main Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">

        {/* Status Header */}
        <div className={`px-6 py-4 flex items-center justify-between ${
          isConnected
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-800'
            : 'bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              isConnected
                ? 'bg-emerald-100 dark:bg-emerald-800/50 text-emerald-600 dark:text-emerald-400'
                : 'bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-gray-400'
            }`}>
              {isConnected ? <Wifi size={20} /> : <WifiOff size={20} />}
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">{statusLabel}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{statusMessage}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${statusBadge}`}>
              {statusLabel}
            </span>
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="animate-spin text-emerald-500 mb-3" size={32} />
              <p className="text-sm text-gray-500 dark:text-gray-400">Memuat data...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-700/40 text-sm text-gray-700 dark:text-gray-200 border border-gray-100 dark:border-slate-700">
                <p className="font-semibold text-gray-900 dark:text-white">WhatsApp khusus notifikasi admin</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Dipakai untuk mengirim alert saat session tenant disconnect atau butuh perhatian.
                </p>
              </div>

              {isConnected ? (
                /* Connected State */
                <div className="flex flex-col items-center py-6">
                  <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
                    <CheckCircle2 className="text-emerald-500" size={40} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Notifier Aktif</h3>

                  {/* Display Connected WhatsApp Number */}
                  {session?.connectedNumber && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg mb-3">
                      <Smartphone className="text-emerald-600 dark:text-emerald-400" size={16} />
                      <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                        {session.connectedNumber}
                      </span>
                    </div>
                  )}

                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm">
                    Sistem akan otomatis memberi tahu super admin ketika ada session yang disconnect atau logout.
                  </p>
                </div>
              ) : hasSession ? (
                /* QR / Pending State */
                <div className="flex flex-col items-center">
                  <div className="bg-white p-4 rounded-xl border border-gray-200 dark:border-slate-600 mb-4">
                    {hasQr ? (
                      <img
                        src={asDataUrl(session.qr)}
                        alt="QR Code"
                        className="w-52 h-52"
                      />
                    ) : (
                      <div className="w-52 h-52 rounded-lg bg-gray-50 dark:bg-slate-700 border border-dashed border-gray-300 dark:border-slate-500 flex items-center justify-center text-xs text-gray-400 dark:text-gray-500">
                        Menunggu QR...
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-1 font-medium">
                    Scan dengan WhatsApp
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                    Buka WhatsApp &gt; Menu &gt; Linked Devices &gt; Link a Device
                  </p>
                  <button
                    onClick={handleRefreshQr}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    <RefreshCw size={16} className={isProcessing ? 'animate-spin' : ''} />
                    {isProcessing ? 'Memuat...' : 'Refresh QR'}
                  </button>
                </div>
              ) : (
                /* No Session State */
                <div className="flex flex-col items-center py-6">
                  <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center mb-4">
                    <Bell className="text-gray-400 dark:text-gray-500" size={36} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Setup Notifier</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm mb-6">
                    Hubungkan WhatsApp untuk menerima notifikasi otomatis saat terjadi masalah pada session tenant.
                  </p>
                  <button
                    onClick={handleConnect}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-60"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Memproses...
                      </>
                    ) : (
                      <>
                        <Wifi size={18} />
                        Hubungkan WhatsApp
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Info Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-slate-700/30 border-t border-gray-100 dark:border-slate-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Notifier akan mengirim pesan ke nomor super admin yang terdaftar saat ada session disconnect.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminSettings;
