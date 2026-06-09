import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, Loader2, RotateCcw, Send, XCircle } from 'lucide-react';
import api from '../../lib/api';
import { toast } from 'sonner';

interface CampaignDetailData {
  id: string;
  name: string;
  status: string;
  message_template: string;
  scheduled_at: string | null;
  created_at: string;
  completed_at: string | null;
  total_targets: number | string;
  success_count: number | string;
  failed_count: number | string;
  pending_count?: number | string;
  processing_count?: number | string;
  sent_count?: number | string;
  failed_message_count?: number | string;
  last_error?: string | null;
}

interface CampaignMessage {
  id: string;
  phone_number: string;
  full_name?: string | null;
  jid?: string | null;
  status: string;
  error_message?: string | null;
  sent_at?: string | null;
  wa_message_id?: string | null;
  created_at: string;
}

const statusTone = (status: string) => {
  if (status === 'sent' || status === 'completed') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  if (status === 'failed') return 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
  if (status === 'processing') return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  if (status === 'paused') return 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
  return 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
};

const CampaignDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<CampaignDetailData | null>(null);
  const [messages, setMessages] = useState<CampaignMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isActing, setIsActing] = useState(false);
  const limit = 50;

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [detailRes, messagesRes] = await Promise.all([
        api.get(`/marketing/campaigns/${id}`),
        api.get(`/marketing/campaigns/${id}/messages`, {
          params: { page, limit, status: statusFilter || undefined }
        })
      ]);
      if (detailRes.data?.status === 'success') setCampaign(detailRes.data.data);
      if (messagesRes.data?.status === 'success') {
        setMessages(messagesRes.data.data || []);
        setTotal(messagesRes.data.total || 0);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal memuat detail campaign');
    } finally {
      setLoading(false);
    }
  }, [id, page, statusFilter]);

  useEffect(() => {
    void fetchDetail();
    const timer = setInterval(() => {
      void fetchDetail();
    }, 15000);
    return () => clearInterval(timer);
  }, [fetchDetail]);

  const metrics = useMemo(() => {
    const totalTargets = Number(campaign?.total_targets || 0);
    const sent = Number(campaign?.sent_count ?? campaign?.success_count ?? 0);
    const failed = Number(campaign?.failed_message_count ?? campaign?.failed_count ?? 0);
    const pending = Number(campaign?.pending_count || 0);
    const processing = Number(campaign?.processing_count || 0);
    const progress = totalTargets > 0 ? Math.round(((sent + failed) / totalTargets) * 100) : 0;
    return { totalTargets, sent, failed, pending, processing, progress };
  }, [campaign]);

  const retryFailed = async () => {
    if (!id) return;
    if (!confirm('Retry semua pesan yang gagal?')) return;
    setIsActing(true);
    try {
      const res = await api.post(`/marketing/campaigns/${id}/retry-failed`);
      toast.success(res.data?.message || 'Retry dijalankan');
      await fetchDetail();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal retry pesan');
    } finally {
      setIsActing(false);
    }
  };

  const resumeCampaign = async () => {
    if (!id) return;
    setIsActing(true);
    try {
      await api.post(`/marketing/campaigns/${id}/resume`);
      toast.success('Campaign dilanjutkan');
      await fetchDetail();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal resume campaign');
    } finally {
      setIsActing(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="crm-page">
      <div className="crm-page-header">
        <div>
          <button onClick={() => navigate('/admin/marketing')} className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-blue-600">
            <ArrowLeft size={16} />
            Kembali ke Marketing
          </button>
          <h1 className="crm-page-title">{campaign?.name || 'Detail Campaign'}</h1>
          <p className="crm-page-subtitle">Pantau pengiriman, penerima, error, dan retry campaign.</p>
        </div>
        <div className="crm-action-row xl:justify-end">
          {campaign?.status === 'paused' && (
            <button disabled={isActing} onClick={resumeCampaign} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
              <Send size={16} />
              Resume
            </button>
          )}
          {metrics.failed > 0 && (
            <button disabled={isActing} onClick={retryFailed} className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 disabled:opacity-60 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/60">
              <RotateCcw size={16} className={isActing ? 'animate-spin' : ''} />
              Retry Failed
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        {[
          { label: 'Status', value: campaign?.status || '-', icon: Clock },
          { label: 'Target', value: metrics.totalTargets.toLocaleString('id-ID'), icon: Send },
          { label: 'Sent', value: metrics.sent.toLocaleString('id-ID'), icon: CheckCircle2 },
          { label: 'Failed', value: metrics.failed.toLocaleString('id-ID'), icon: XCircle },
          { label: 'Pending', value: (metrics.pending + metrics.processing).toLocaleString('id-ID'), icon: Loader2 },
        ].map((item) => (
          <div key={item.label} className="crm-surface">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{item.label}</p>
                <p className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{item.value}</p>
              </div>
              <item.icon size={22} className="text-blue-600" />
            </div>
          </div>
        ))}
      </div>

      <div className="crm-surface space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Progress Pengiriman</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Jadwal: {campaign?.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString('id-ID') : '-'}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${statusTone(campaign?.status || '')}`}>
            {campaign?.status || '-'}
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.min(metrics.progress, 100)}%` }} />
        </div>
        <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-slate-900/70 dark:text-gray-300">
          <p className="mb-2 font-bold text-gray-900 dark:text-white">Template</p>
          <pre className="whitespace-pre-wrap font-sans">{campaign?.message_template || '-'}</pre>
          {campaign?.last_error && <p className="mt-3 text-rose-600">Last error: {campaign.last_error}</p>}
        </div>
      </div>

      <div className="crm-surface overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-6 dark:border-slate-700 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Recipient Report</h2>
          <select
            value={statusFilter}
            onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-200"
          >
            <option value="">Semua status</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 dark:bg-slate-900/60 dark:text-gray-400">
              <tr>
                <th className="px-6 py-4 text-left">Kontak</th>
                <th className="px-6 py-4 text-left">Nomor</th>
                <th className="px-6 py-4 text-left">Status</th>
                <th className="px-6 py-4 text-left">WA ID</th>
                <th className="px-6 py-4 text-left">Error</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-6 py-6 text-gray-500">Memuat...</td></tr>
              )}
              {!loading && messages.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-6 text-gray-500">Belum ada recipient.</td></tr>
              )}
              {!loading && messages.map((message) => (
                <tr key={message.id} className="border-t border-gray-100 dark:border-slate-700">
                  <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">{message.full_name || '-'}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{message.phone_number}</td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${statusTone(message.status)}`}>{message.status}</span>
                  </td>
                  <td className="max-w-[180px] truncate px-6 py-4 font-mono text-xs text-gray-500">{message.wa_message_id || '-'}</td>
                  <td className="max-w-[320px] truncate px-6 py-4 text-rose-600">{message.error_message || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 dark:border-slate-700">
          <span className="text-xs text-gray-500">Total {total} recipient</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1} className="rounded-lg border border-gray-200 px-3 py-1 text-xs disabled:opacity-50 dark:border-slate-700">Prev</button>
            <span className="text-xs text-gray-600 dark:text-gray-300">{page} / {totalPages}</span>
            <button onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page >= totalPages} className="rounded-lg border border-gray-200 px-3 py-1 text-xs disabled:opacity-50 dark:border-slate-700">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CampaignDetail;
