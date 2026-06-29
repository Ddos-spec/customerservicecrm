import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, CalendarClock, Eye, Megaphone, PauseCircle, PlayCircle, Plus, RefreshCcw, RotateCcw, Search, Trash2, Users } from 'lucide-react';
import api from '../../lib/api';
import { toast } from 'sonner';

interface Campaign {
  id: string;
  name: string;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  total_targets: number | string;
  success_count: number | string;
  failed_count: number | string;
}

const statusLabel: Record<string, string> = {
  scheduled: 'Terjadwal',
  processing: 'Berjalan',
  completed: 'Selesai',
  failed: 'Gagal',
  paused: 'Paused',
  draft: 'Draft',
};

const statusTone = (status: string) => {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800';
  if (status === 'failed') return 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800';
  if (status === 'paused') return 'bg-orange-50 text-orange-700 ring-orange-100 dark:bg-orange-900/30 dark:text-orange-300 dark:ring-orange-800';
  if (status === 'processing') return 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800';
  return 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-800';
};

const CampaignList = () => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const limit = 20;

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/marketing/campaigns', {
        params: { page, limit },
      });
      if (res.data?.status === 'success') {
        setCampaigns(res.data.data || []);
        setTotal(res.data.total || 0);
      } else {
        toast.error('Gagal memuat campaign');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal memuat campaign');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void fetchCampaigns();
  }, [fetchCampaigns]);

  const visibleCampaigns = useMemo(() => {
    const q = query.toLowerCase().trim();
    return campaigns.filter((campaign) => {
      const matchesQuery = !q || campaign.name.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || campaign.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [campaigns, query, statusFilter]);

  const stats = useMemo(() => {
    const sent = campaigns.reduce((sum, campaign) => sum + Number(campaign.success_count || 0), 0);
    const failed = campaigns.reduce((sum, campaign) => sum + Number(campaign.failed_count || 0), 0);
    const targets = campaigns.reduce((sum, campaign) => sum + Number(campaign.total_targets || 0), 0);
    const active = campaigns.filter((campaign) => ['scheduled', 'processing'].includes(campaign.status || '')).length;
    return { sent, failed, targets, active };
  }, [campaigns]);

  const handleCancel = async (id: string) => {
    if (!confirm('Pause campaign ini? Pesan yang belum terkirim akan berhenti sementara.')) return;
    try {
      const res = await api.post(`/marketing/campaigns/${id}/cancel`);
      if (res.data?.status === 'success') {
        toast.success('Campaign di-pause');
        void fetchCampaigns();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal pause campaign');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus campaign ini? Riwayat pengiriman campaign akan hilang.')) return;
    try {
      const res = await api.delete(`/marketing/campaigns/${id}`);
      if (res.data?.status === 'success') {
        toast.success('Campaign dihapus');
        void fetchCampaigns();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal hapus campaign');
    }
  };

  const handleResume = async (id: string) => {
    try {
      const res = await api.post(`/marketing/campaigns/${id}/resume`);
      if (res.data?.status === 'success') {
        toast.success('Campaign dilanjutkan dan queue dipicu');
        void fetchCampaigns();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal resume campaign');
    }
  };

  const handleRetryFailed = async (id: string) => {
    if (!confirm('Retry semua pesan gagal campaign ini?')) return;
    try {
      const res = await api.post(`/marketing/campaigns/${id}/retry-failed`);
      if (res.data?.status === 'success') {
        toast.success(res.data.message || 'Retry dijalankan');
        void fetchCampaigns();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal retry failed');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="crm-page">
      <div className="crm-page-header">
        <div>
          <h1 className="crm-page-title">WhatsApp Marketing</h1>
          <p className="crm-page-subtitle">
            Broadcast WhatsApp yang lebih aman: segment dulu, preview pesan, lalu kirim bertahap via queue.
          </p>
        </div>
        <div className="crm-action-row xl:justify-end">
          <button
            onClick={() => navigate('/admin/marketing/groups')}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Users size={18} />
            Segments
          </button>
          <button
            onClick={() => navigate('/admin/marketing/create')}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/15 transition-all hover:bg-blue-700 active:scale-[0.98]"
          >
            <Plus size={18} />
            Buat Campaign
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Active', value: stats.active, hint: 'scheduled/processing', icon: <Megaphone className="text-blue-600" /> },
          { label: 'Targets', value: stats.targets, hint: 'kontak di halaman ini', icon: <Users className="text-violet-600" /> },
          { label: 'Sent', value: stats.sent, hint: 'berhasil terkirim', icon: <BarChart3 className="text-emerald-600" /> },
          { label: 'Failed', value: stats.failed, hint: 'bisa retry', icon: <RotateCcw className="text-rose-600" /> },
        ].map((card) => (
          <div key={card.label} className="crm-surface">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{card.label}</p>
                <p className="mt-2 text-3xl font-black text-slate-950 dark:text-white">{card.value.toLocaleString('id-ID')}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{card.hint}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="crm-surface overflow-hidden p-0">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">Campaign Queue</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pantau status, retry pesan gagal, pause/resume pengiriman.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:w-64"
                placeholder="Cari campaign..."
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="all">Semua status</option>
              <option value="scheduled">Terjadwal</option>
              <option value="processing">Berjalan</option>
              <option value="paused">Paused</option>
              <option value="completed">Selesai</option>
              <option value="failed">Gagal</option>
            </select>
            <button
              onClick={() => void fetchCampaigns()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {loading && (
            <div className="p-8 text-sm text-slate-500 dark:text-slate-400">Memuat campaign...</div>
          )}

          {!loading && visibleCampaigns.length === 0 && (
            <div className="p-10 text-center">
              <Megaphone className="mx-auto text-slate-300" size={46} />
              <p className="mt-4 text-lg font-black text-slate-900 dark:text-white">Belum ada campaign yang cocok.</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Buat campaign pertama atau ubah filter pencarian.</p>
              <button
                onClick={() => navigate('/admin/marketing/create')}
                className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
              >
                <Plus size={18} />
                Buat Campaign
              </button>
            </div>
          )}

          {!loading && visibleCampaigns.map((campaign) => {
            const totalTargets = Number(campaign.total_targets || 0);
            const success = Number(campaign.success_count || 0);
            const failed = Number(campaign.failed_count || 0);
            const done = success + failed;
            const progress = totalTargets > 0 ? Math.min(100, Math.round((done / totalTargets) * 100)) : 0;
            const canCancel = ['scheduled', 'processing'].includes(campaign.status || '');
            const canDelete = ['draft', 'paused', 'failed', 'completed'].includes(campaign.status || '');

            return (
              <article key={campaign.id} className="p-5 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/60">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-black text-slate-950 dark:text-white">{campaign.name}</h3>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${statusTone(campaign.status || 'draft')}`}>
                        {statusLabel[campaign.status] || campaign.status || 'Draft'}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
                      <span className="inline-flex items-center gap-2"><Users size={14} /> Target {totalTargets.toLocaleString('id-ID')}</span>
                      <span className="inline-flex items-center gap-2"><BarChart3 size={14} /> Sent {success.toLocaleString('id-ID')}</span>
                      <span className="inline-flex items-center gap-2"><RotateCcw size={14} /> Failed {failed.toLocaleString('id-ID')}</span>
                      <span className="inline-flex items-center gap-2">
                        <CalendarClock size={14} />
                        {campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString('id-ID') : new Date(campaign.created_at).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="w-12 text-right text-xs font-black text-slate-500">{progress}%</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <button onClick={() => navigate(`/admin/marketing/${campaign.id}`)} className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300" title="Detail Report">
                      <Eye size={16} />
                      Detail
                    </button>
                    {campaign.status === 'paused' && (
                      <button onClick={() => handleResume(campaign.id)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300" title="Resume Campaign">
                        <PlayCircle size={16} />
                        Resume
                      </button>
                    )}
                    {failed > 0 && (
                      <button onClick={() => handleRetryFailed(campaign.id)} className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 transition-colors hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300" title="Retry Failed">
                        <RotateCcw size={16} />
                        Retry
                      </button>
                    )}
                    {canCancel && (
                      <button onClick={() => handleCancel(campaign.id)} className="inline-flex items-center gap-2 rounded-xl bg-orange-50 px-3 py-2 text-xs font-black text-orange-700 transition-colors hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-300" title="Pause Campaign">
                        <PauseCircle size={16} />
                        Pause
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => handleDelete(campaign.id)} className="inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 transition-colors hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-300" title="Hapus Campaign">
                        <Trash2 size={16} />
                        Hapus
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
            Total {total.toLocaleString('id-ID')} campaign
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Prev
            </button>
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CampaignList;
