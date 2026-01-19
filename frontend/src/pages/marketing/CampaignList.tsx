import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, Plus, Users } from 'lucide-react';
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

const CampaignList = () => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const limit = 20;

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/marketing/campaigns', {
        params: { page, limit }
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

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Marketing Campaign</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Kelola broadcast WhatsApp dengan aman dan terjadwal.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate('/admin/marketing/groups')}
            className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center gap-2"
          >
            <Users size={18} />
            Contact Groups
          </button>
          <button
            onClick={() => navigate('/admin/marketing/create')}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus size={18} />
            Buat Campaign
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
          <Megaphone className="text-blue-600" size={20} />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Daftar Campaign</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-900/60 text-gray-500 dark:text-gray-400">
              <tr>
                <th className="text-left px-6 py-4 font-semibold">Nama</th>
                <th className="text-left px-6 py-4 font-semibold">Status</th>
                <th className="text-left px-6 py-4 font-semibold">Progress</th>
                <th className="text-left px-6 py-4 font-semibold">Terjadwal</th>
                <th className="text-left px-6 py-4 font-semibold">Dibuat</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="px-6 py-6 text-gray-500 dark:text-gray-400" colSpan={5}>
                    Memuat data...
                  </td>
                </tr>
              )}
              {!loading && campaigns.length === 0 && (
                <tr>
                  <td className="px-6 py-6 text-gray-500 dark:text-gray-400" colSpan={5}>
                    Belum ada campaign.
                  </td>
                </tr>
              )}
              {!loading && campaigns.map((campaign) => {
                const totalTargets = Number(campaign.total_targets || 0);
                const success = Number(campaign.success_count || 0);
                const progressLabel = totalTargets > 0 ? `${success}/${totalTargets}` : '0/0';
                return (
                  <tr key={campaign.id} className="border-t border-gray-100 dark:border-slate-700">
                    <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                      {campaign.name}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {campaign.status || 'draft'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                      {progressLabel}
                    </td>
                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                      {campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString() : '-'}
                    </td>
                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                      {new Date(campaign.created_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-slate-700">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Total {total} campaign
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="px-3 py-1 text-xs rounded-lg border border-gray-200 dark:border-slate-700 disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-xs text-gray-600 dark:text-gray-300">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 text-xs rounded-lg border border-gray-200 dark:border-slate-700 disabled:opacity-50"
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
