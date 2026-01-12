import { useEffect, useState } from 'react';
import { QrCode, RefreshCw, Trash2, Smartphone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const SuperAdminSettings = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [notifierSessionId, setNotifierSessionId] = useState<string | null>(null);
  const [newSessionId, setNewSessionId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isRefreshingQr, setIsRefreshingQr] = useState<string | null>(null);
  const [isSettingNotifier, setIsSettingNotifier] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const pickAutoNotifier = async (sessionList: any[], currentId: string | null) => {
    if (currentId) return;
    const connected = sessionList.find((s) => s.status === 'CONNECTED');
    const pick = connected?.sessionId || sessionList[0]?.sessionId;
    if (!pick) return;
    try {
      setIsSettingNotifier(pick);
      await api.post('/admin/notifier-session', { session_id: pick });
      setNotifierSessionId(pick);
      toast.success(`Session ${pick} otomatis dijadikan notifier`);
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Gagal set notifier otomatis';
      toast.error(msg);
    } finally {
      setIsSettingNotifier(null);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [sessionRes, notifierRes] = await Promise.all([
        api.get('/sessions'),
        api.get('/admin/notifier-session')
      ]);
      if (Array.isArray(sessionRes.data)) {
        setSessions(sessionRes.data);
      }
      if (notifierRes.data?.success) {
        setNotifierSessionId(notifierRes.data.notifier_session_id || null);
      }
      await pickAutoNotifier(Array.isArray(sessionRes.data) ? sessionRes.data : [], notifierRes.data?.notifier_session_id || null);
    } catch (error) {
      console.error('Failed to fetch notifier settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const asDataUrl = (qr: string) => {
    if (!qr) return '';
    return qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
  };

  const handleCreateSession = async () => {
    const trimmed = newSessionId.trim();
    if (!trimmed) {
      toast.error('Isi Session ID terlebih dahulu');
      return;
    }
    setIsCreating(true);
    try {
      await api.post('/sessions', { sessionId: trimmed });
      toast.success(`Session ${trimmed} dibuat, tunggu QR muncul`);
      setNewSessionId('');
      await fetchData();
      await handleSetNotifier(trimmed);
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Gagal membuat session';
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRegenerateQr = async (sessionId: string) => {
    setIsRefreshingQr(sessionId);
    try {
      await api.get(`/sessions/${sessionId}/qr`);
      toast.success('QR diregenerate, tunggu sebentar');
      await fetchData();
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Gagal regenerate QR';
      toast.error(msg);
    } finally {
      setIsRefreshingQr(null);
    }
  };

  const handleSetNotifier = async (sessionId: string) => {
    setIsSettingNotifier(sessionId);
    try {
      await api.post('/admin/notifier-session', { session_id: sessionId });
      toast.success(`Session ${sessionId} dijadikan notifier`);
      setNotifierSessionId(sessionId);
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Gagal set notifier';
      toast.error(msg);
    } finally {
      setIsSettingNotifier(null);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm(`Hapus session ${sessionId}? Session akan logout dari WhatsApp.`)) return;
    try {
      await api.delete(`/sessions/${sessionId}`);
      toast.success(`Session ${sessionId} dihapus`);
      await fetchData();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Gagal hapus session');
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
            <label className="text-xs text-gray-500 dark:text-gray-400 font-semibold">Buat Session WA</label>
            <div className="flex gap-2 mt-1">
              <input
                value={newSessionId}
                onChange={(e) => setNewSessionId(e.target.value)}
                placeholder="contoh: notifier"
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white"
              />
              <button
                onClick={handleCreateSession}
                disabled={isCreating}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
              >
                <QrCode size={16} />
                {isCreating ? 'Memproses...' : 'Generate QR'}
              </button>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Gunakan untuk notifikasi, bukan chat operasional.</p>
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
                    {notifierSessionId === s.sessionId && (
                      <span className="ml-2 text-[10px] font-bold text-emerald-600 dark:text-emerald-300">Notifier</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {s.qr ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={asDataUrl(s.qr)}
                          alt="QR"
                          className="w-20 h-20 rounded-lg border border-gray-200 dark:border-slate-700 bg-white"
                        />
                        <button
                          onClick={() => handleRegenerateQr(s.sessionId)}
                          disabled={isRefreshingQr === s.sessionId}
                          className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                        >
                          {isRefreshingQr === s.sessionId ? 'Mengambil...' : 'Regenerate QR'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleRegenerateQr(s.sessionId)}
                        disabled={isRefreshingQr === s.sessionId}
                        className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 flex items-center gap-1"
                      >
                        <QrCode size={14} />
                        {isRefreshingQr === s.sessionId ? 'Mengambil...' : 'Tampilkan QR'}
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleSetNotifier(s.sessionId)}
                        disabled={isSettingNotifier === s.sessionId}
                        className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border ${
                          notifierSessionId === s.sessionId
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-slate-700'
                        } disabled:opacity-50`}
                        title="Jadikan nomor notifikasi"
                      >
                        {notifierSessionId === s.sessionId ? 'Notifier' : (isSettingNotifier === s.sessionId ? 'Setting...' : 'Set Notifier')}
                      </button>
                      <button
                        onClick={() => handleDeleteSession(s.sessionId)}
                        className="text-gray-400 dark:text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                        title="Hapus session"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
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
