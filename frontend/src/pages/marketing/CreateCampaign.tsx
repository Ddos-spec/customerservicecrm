import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Calendar, CheckCircle2, Clock, Info, Layers3, MessageSquare, SendHorizontal, Smartphone, Sparkles, Users } from 'lucide-react';
import api from '../../lib/api';
import { toast } from 'sonner';

interface ContactGroup {
  id: string;
  name: string;
  description?: string | null;
  member_count?: number | string;
}

const TEMPLATE_PRESETS = [
  {
    label: 'Promo ringan',
    value: 'Halo {{full_name}}, kami ada promo spesial minggu ini. Kalau mau, saya bisa kirim detail produknya di sini ya.',
  },
  {
    label: 'Follow up',
    value: 'Halo {{full_name}}, kami follow up percakapan sebelumnya. Apakah masih ada yang bisa kami bantu?',
  },
  {
    label: 'Reminder pembayaran',
    value: 'Halo {{full_name}}, ini reminder pembayaran pesanan kamu. Kalau sudah transfer, boleh kirim bukti di chat ini ya.',
  },
];

const CreateCampaign = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const loadGroups = async () => {
      try {
        const res = await api.get('/marketing/groups');
        if (res.data?.status === 'success') {
          setGroups(res.data.data || []);
        }
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal memuat segment');
      }
    };
    void loadGroups();
  }, []);

  const selectedGroups = useMemo(
    () => groups.filter((group) => selectedGroupIds.includes(group.id)),
    [groups, selectedGroupIds],
  );

  const totalTargets = useMemo(() => (
    selectedGroups.reduce((acc, group) => acc + Number(group.member_count || 0), 0)
  ), [selectedGroups]);

  const estimatedTimeMinutes = Math.max(1, Math.ceil(totalTargets / 50));
  const isReady = name.trim().length > 0 && messageTemplate.trim().length > 0 && totalTargets > 0;

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) => (
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    ));
  };

  const insertAtCursor = (value: string) => {
    if (!textAreaRef.current) {
      setMessageTemplate((prev) => `${prev}${value}`);
      return;
    }

    const start = textAreaRef.current.selectionStart;
    const end = textAreaRef.current.selectionEnd;
    const next = `${messageTemplate.substring(0, start)}${value}${messageTemplate.substring(end)}`;
    setMessageTemplate(next);

    window.setTimeout(() => {
      textAreaRef.current?.focus();
      textAreaRef.current?.setSelectionRange(start + value.length, start + value.length);
    }, 0);
  };

  const renderInlinePreview = (line: string) => (
    line.split(/(\{\{.*?\}\}|\*[^*\n]+\*)/g).map((part, index) => {
      if (!part) return null;
      if (part.startsWith('{{') && part.endsWith('}}')) {
        const sample = part.toLowerCase().includes('phone') ? '628123456789' : 'Budi';
        return (
          <span key={`${part}-${index}`} className="rounded bg-blue-100 px-1 font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
            {sample}
          </span>
        );
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <strong key={`${part}-${index}`}>{part.slice(1, -1)}</strong>;
      }
      return <span key={`${part}-${index}`}>{part}</span>;
    })
  );

  const formatMessageForPreview = (text: string) => {
    if (!text.trim()) return <span className="text-gray-400 italic">Tulis pesan, preview WhatsApp muncul di sini...</span>;

    return text.split('\n').map((line, index) => (
      <div key={`${line}-${index}`} className="min-h-[1.2em]">
        {renderInlinePreview(line)}
      </div>
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
      toast.error('Pilih minimal 1 segment');
      return;
    }
    if (totalTargets === 0) {
      toast.error('Segment belum punya kontak valid. Tambahkan member dulu.');
      return;
    }

    const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString();
    if (Number.isNaN(new Date(scheduledIso).getTime())) {
      toast.error('Jadwal tidak valid');
      return;
    }

    const actionLabel = scheduledAt
      ? `dijadwalkan pada ${new Date(scheduledIso).toLocaleString('id-ID')}`
      : 'dimasukkan ke queue sekarang';
    if (!confirm(`Campaign akan ${actionLabel} untuk ${totalTargets.toLocaleString('id-ID')} kontak. Lanjut?`)) return;

    setIsSubmitting(true);
    try {
      const res = await api.post('/marketing/campaigns', {
        name: name.trim(),
        message_template: messageTemplate,
        scheduled_at: scheduledIso,
        group_ids: selectedGroupIds,
      });
      if (res.data?.status === 'success') {
        toast.success(scheduledAt ? 'Campaign berhasil dijadwalkan' : 'Campaign dibuat dan queue mulai diproses');
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
    <div className="crm-page">
      <div className="crm-page-header">
        <div>
          <button
            onClick={() => navigate('/admin/marketing')}
            className="mb-3 text-sm font-bold text-slate-500 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300"
          >
            ← Kembali ke Marketing
          </button>
          <h1 className="crm-page-title">Buat WhatsApp Campaign</h1>
          <p className="crm-page-subtitle">
            Flow dibuat 3 langkah: pilih target, susun pesan, lalu kirim/jadwalkan dengan preview aman.
          </p>
        </div>
        <button
          onClick={() => navigate('/admin/marketing/groups')}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Users size={18} />
          Kelola Segment
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-start">
        <div className="space-y-6">
          <section className="crm-surface space-y-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-800">
                <Sparkles size={20} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-950 dark:text-white">1. Campaign Info</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Nama internal agar nanti gampang dicari di report.</p>
              </div>
            </div>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              placeholder="Contoh: Promo Gajian Januari"
            />
          </section>

          <section className="crm-surface space-y-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 ring-1 ring-violet-100 dark:bg-violet-900/30 dark:text-violet-300 dark:ring-violet-800">
                  <Layers3 size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-950 dark:text-white">2. Pilih Target</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Pilih satu atau lebih segment kontak pribadi.</p>
                </div>
              </div>
              <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {totalTargets.toLocaleString('id-ID')} kontak
              </span>
            </div>

            {groups.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900">
                <p className="font-black text-slate-900 dark:text-white">Belum ada segment.</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Buat segment dan sync kontak dulu agar campaign bisa dipakai.</p>
                <button
                  onClick={() => navigate('/admin/marketing/groups')}
                  className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700"
                >
                  Buat Segment
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {groups.map((group) => {
                const memberCount = Number(group.member_count || 0);
                const selected = selectedGroupIds.includes(group.id);

                return (
                  <label
                    key={group.id}
                    className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                      selected
                        ? 'border-blue-500 bg-blue-50 ring-4 ring-blue-500/10 dark:bg-blue-950/30'
                        : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-900 dark:hover:bg-blue-950/20'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                        checked={selected}
                        onChange={() => toggleGroup(group.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate font-black text-slate-950 dark:text-white">{group.name}</p>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {memberCount.toLocaleString('id-ID')}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          {group.description || 'Tanpa deskripsi'}
                        </p>
                        {memberCount === 0 && (
                          <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-300">
                            <AlertTriangle size={13} />
                            Segment kosong
                          </p>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="crm-surface space-y-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800">
                <MessageSquare size={20} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-950 dark:text-white">3. Susun Pesan</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Gunakan variable dan preset agar pesan cepat jadi.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {TEMPLATE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setMessageTemplate(preset.value)}
                  className="rounded-full border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {preset.label}
                </button>
              ))}
              <button
                onClick={() => insertAtCursor('{{full_name}}')}
                className="rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300"
              >
                + Nama
              </button>
              <button
                onClick={() => insertAtCursor('{{phone_number}}')}
                className="rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300"
              >
                + No. HP
              </button>
            </div>

            <textarea
              ref={textAreaRef}
              value={messageTemplate}
              onChange={(event) => setMessageTemplate(event.target.value)}
              className="min-h-[240px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm leading-6 text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              placeholder="Halo {{full_name}}, kami ada promo spesial..."
            />
            <div className="rounded-2xl bg-slate-50 p-4 text-xs leading-6 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <p><strong className="text-slate-700 dark:text-slate-200">Format:</strong> *teks tebal*, Enter untuk baris baru, variable: {'{{full_name}}'} dan {'{{phone_number}}'}.</p>
              <p><strong className="text-slate-700 dark:text-slate-200">Anti-spam:</strong> hindari kata terlalu agresif dan jangan kirim ke segment yang belum consent.</p>
            </div>
          </section>

          <section className="crm-surface space-y-4">
            <label className="flex items-center gap-2 text-sm font-black text-slate-700 dark:text-slate-200">
              <Calendar size={17} />
              Jadwal Kirim
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Kosongkan untuk kirim sekarang. Campaign langsung masuk queue dan processor akan dipicu otomatis.
            </p>
          </section>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-24">
          <section className="crm-surface">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-slate-400">
              <Smartphone size={16} /> WhatsApp Preview
            </h3>

            <div className="relative mx-auto h-[520px] w-[310px] overflow-hidden rounded-[2.5rem] border-[10px] border-slate-800 bg-slate-800 shadow-2xl">
              <div className="flex h-full flex-col overflow-hidden rounded-[1.9rem] bg-[#efeae2] dark:bg-[#111b21]">
                <div className="flex items-center gap-3 bg-[#008069] p-3 text-white shadow-sm dark:bg-[#202c33]">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-xs font-black">B</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black">Budi Customer</p>
                    <p className="text-[10px] text-white/70">online</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.22),_transparent_28%)] p-3">
                  <div className="flex flex-col gap-2">
                    <div className="max-w-[86%] self-end rounded-xl rounded-tr-sm bg-[#d9fdd3] p-2 text-sm leading-5 text-slate-900 shadow-sm dark:bg-[#005c4b] dark:text-white">
                      <div className="whitespace-pre-wrap break-words">{formatMessageForPreview(messageTemplate)}</div>
                      <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500 dark:text-slate-300">
                        12:00 <span className="text-blue-500">✓✓</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-[#f0f2f5] p-2 dark:bg-[#202c33]">
                  <div className="h-8 flex-1 rounded-full bg-white dark:bg-slate-700" />
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#00a884] text-white">
                    <SendHorizontal size={15} />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-100 dark:bg-blue-950/30 dark:ring-blue-900/40">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-300" size={18} />
                <div className="text-sm leading-6 text-slate-700 dark:text-slate-300">
                  <p className="font-black text-slate-900 dark:text-white">Estimasi</p>
                  <p>Total target: <strong>{totalTargets.toLocaleString('id-ID')}</strong></p>
                  <p>Kecepatan aman: <strong>~50 pesan/menit</strong></p>
                  <p className="mt-1 inline-flex items-center gap-1 font-bold text-blue-700 dark:text-blue-300">
                    <Clock size={14} />
                    Selesai kira-kira ~{estimatedTimeMinutes} menit
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="crm-surface space-y-3">
            {[
              { label: 'Nama campaign terisi', ok: name.trim().length > 0 },
              { label: 'Pesan tidak kosong', ok: messageTemplate.trim().length > 0 },
              { label: 'Target punya kontak', ok: totalTargets > 0 },
              { label: scheduledAt ? 'Mode jadwal aktif' : 'Mode kirim sekarang', ok: true },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900">
                <CheckCircle2 className={item.ok ? 'text-emerald-500' : 'text-slate-300'} size={18} />
                <span className={`text-sm font-bold ${item.ok ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}>{item.label}</span>
              </div>
            ))}

            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !isReady}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-4 text-lg font-black text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <SendHorizontal size={20} />
              {isSubmitting ? 'Memproses...' : scheduledAt ? 'Jadwalkan Campaign' : 'Kirim Sekarang'}
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default CreateCampaign;
