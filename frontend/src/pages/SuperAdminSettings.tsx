import { useEffect, useState, useRef } from 'react';
import { QrCode, RefreshCw, Smartphone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const SuperAdminSettings = () => {
  const NOTIFIER_ID = 'notifier';
  const [sessions, setSessions] = useState<any[]>([]);
  const [isRefreshingQr, setIsRefreshingQr] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const ws = useRef<WebSocket | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const sessionRes = await api.get('/sessions');
      if (Array.isArray(sessionRes.data)) {
        setSessions(sessionRes.data.filter((s) => s.sessionId === NOTIFIER_ID));
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
        if (payload.type === 'session-update') {
            // Filter only notifier session for this page
            const notifierData = payload.data.filter((s: any) => s.sessionId === NOTIFIER_ID);
            if (notifierData.length > 0) {
                 setSessions(notifierData);
                 if (notifierData[0].status === 'CONNECTED') {
                     toast.success('Notifier Terhubung!');
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
  }, []);

  const asDataUrl = (qr: string) => {
    if (!qr) return '';
    return qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
  };

  const handleConnectNotifier = async () => {
    setIsConnecting(true);
    try {
      await api.post('/sessions', { sessionId: NOTIFIER_ID });
      await api.post('/admin/notifier-session', { session_id: NOTIFIER_ID });
      toast.success('Notifier dibuat, scan QR sekarang');
      await fetchData();
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Gagal membuat notifier';
      toast.error(msg);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRegenerateQr = async () => {
    setIsRefreshingQr(true);
    try {
      await api.get(`/sessions/${NOTIFIER_ID}/qr`);
      toast.success('QR diregenerate, tunggu sebentar');
      await fetchData();
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Gagal regenerate QR';
      toast.error(msg);
    } finally {
      setIsRefreshingQr(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pengaturan Notifier</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Kelola session WhatsApp khusus notifikasi super admin.</p>
        </div>
        <button onClick={fetchData} className="p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300 transition-all">
          <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-50 dark:border-slate-700 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 dark:text-white flex items-center">
            <Smartphone size={20} className="mr-2 text-blue-600 dark:text-blue-400" />
            Session WhatsApp
          </h3>
          <span className="text-xs font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-3 py-1 rounded-full">{sessions.length} Instance</span>
        </div>
        <div className="px-6 pb-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-semibold">Notifier ID</label>
            <div className="flex gap-2 mt-1 items-center">
              <span className="px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm font-mono text-gray-900 dark:text-white">
                notifier
              </span>
              <button
                onClick={handleConnectNotifier}
                disabled={isConnecting}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
              >
                <QrCode size={16} />
                {isConnecting ? 'Memproses...' : 'Connect Notifier'}
              </button>
              <button
                onClick={handleRegenerateQr}
                disabled={isRefreshingQr}
                className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm font-bold rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-60"
              >
                {isRefreshingQr ? 'Regenerating...' : 'Regenerate QR'}
              </button>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Notifier dipakai khusus untuk notifikasi admin.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 dark:bg-slate-800/60 text-gray-400 dark:text-gray-500 text-[10px] uppercase font-bold tracking-widest">
              <tr>
                <th className="px-6 py-4">Session ID</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">QR Code</th>
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
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                      s.status === 'CONNECTED' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                    }`}>{s.status}</span>
                    <span className="ml-2 text-[10px] font-bold text-emerald-600 dark:text-emerald-300">Notifier</span>
                  </td>
                  <td className="px-6 py-4">
                        {s.qr ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={asDataUrl(s.qr)}
                          alt="QR"
                          className="w-40 h-40 rounded-lg border border-gray-200 dark:border-slate-700 bg-white"
                        />
                        <button
                        onClick={handleRegenerateQr}
                        disabled={isRefreshingQr}
                        className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                      >
                          {isRefreshingQr ? 'Mengambil...' : 'Regenerate QR'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleRegenerateQr}
                        disabled={isRefreshingQr}
                        className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 flex items-center gap-1"
                      >
                        <QrCode size={14} />
                        {isRefreshingQr ? 'Mengambil...' : 'Tampilkan QR'}
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-300">Notifier</span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="animate-spin" size={16} /> Memuat sesi...
                      </span>
                    ) : 'Belum ada session.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminSettings;
