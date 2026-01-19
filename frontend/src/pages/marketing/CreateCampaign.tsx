import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Layers3, SendHorizontal } from 'lucide-react';
import api from '../../lib/api';
import { toast } from 'sonner';

interface ContactGroup {
  id: string;
  name: string;
  description?: string | null;
  member_count?: number | string;
}

const CreateCampaign = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadGroups = async () => {
      try {
        const res = await api.get('/marketing/groups');
        if (res.data?.status === 'success') {
          setGroups(res.data.data || []);
        }
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal memuat group');
      }
    };
    void loadGroups();
  }, []);

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) => (
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    ));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Nama campaign wajib diisi');
      return;
    }
    if (!messageTemplate.trim()) {
      toast.error('Pesan wajib diisi');
      return;
    }
    if (selectedGroupIds.length === 0) {
      toast.error('Pilih minimal 1 group');
      return;
    }

    const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString();

    setIsSubmitting(true);
    try {
      const res = await api.post('/marketing/campaigns', {
        name,
        message_template: messageTemplate,
        scheduled_at: scheduledIso,
        group_ids: selectedGroupIds
      });
      if (res.data?.status === 'success') {
        toast.success('Campaign berhasil dibuat');
        navigate('/admin/marketing');
      } else {
        toast.error('Gagal membuat campaign');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal membuat campaign');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Buat Campaign</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Susun pesan promosi dan jadwalkan pengiriman otomatis.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Nama Campaign</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
            placeholder="Promo Januari"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Pesan</label>
          <textarea
            value={messageTemplate}
            onChange={(e) => setMessageTemplate(e.target.value)}
            className="w-full min-h-[140px] px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
            placeholder="Tulis pesan promosi di sini..."
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Calendar size={16} />
            Jadwal Kirim
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
          />
          <p className="text-xs text-gray-400">Kosongkan untuk kirim sekarang.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 space-y-4">
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
          <Layers3 size={18} />
          <h2 className="text-lg font-bold">Pilih Contact Group</h2>
        </div>
        {groups.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Belum ada group. Buat group terlebih dahulu.
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-3">
          {groups.map((group) => (
            <label
              key={group.id}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selectedGroupIds.includes(group.id)
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                  : 'border-gray-200 dark:border-slate-700'
              }`}
            >
              <input
                type="checkbox"
                className="mr-2"
                checked={selectedGroupIds.includes(group.id)}
                onChange={() => toggleGroup(group.id)}
              />
              <span className="font-semibold text-gray-900 dark:text-white">{group.name}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                {group.member_count || 0} kontak
              </span>
              {group.description && (
                <div className="text-xs text-gray-400 mt-1">{group.description}</div>
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
        >
          <SendHorizontal size={18} />
          {isSubmitting ? 'Menyimpan...' : 'Simpan Campaign'}
        </button>
      </div>
    </div>
  );
};

export default CreateCampaign;
