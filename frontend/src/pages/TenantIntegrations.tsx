import { useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, Link2, Loader2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '../components/ConfirmDialog';
import api from '../lib/api';

type Webhook = { id: string; url: string };
type WebhookEvents = {
  groups: boolean;
  private: boolean;
  self: boolean;
  image: boolean;
  video: boolean;
  audio: boolean;
  document: boolean;
};

const DEFAULT_EVENTS: WebhookEvents = {
  groups: true, private: true, self: false, image: true, video: true, audio: true, document: true,
};

const eventOptions: Array<{ key: keyof WebhookEvents; label: string; description: string }> = [
  { key: 'private', label: 'Pesan pribadi', description: 'Pesan masuk dari chat personal.' },
  { key: 'groups', label: 'Pesan grup', description: 'Pesan dari grup WhatsApp.' },
  { key: 'self', label: 'Pesan keluar', description: 'Pesan yang dikirim dari nomor Anda.' },
  { key: 'image', label: 'Gambar', description: 'Lampiran foto.' },
  { key: 'video', label: 'Video', description: 'Lampiran video.' },
  { key: 'audio', label: 'Audio', description: 'Voice note dan audio.' },
  { key: 'document', label: 'Dokumen', description: 'PDF, file, dan dokumen lain.' },
];

export default function TenantIntegrations() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [events, setEvents] = useState<WebhookEvents>(DEFAULT_EVENTS);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingEvents, setSavingEvents] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/tenant/integrations');
      if (res.data?.success) {
        setWebhooks(res.data.webhooks || []);
        setEvents({ ...DEFAULT_EVENTS, ...(res.data.tenant?.webhook_events || {}) });
        setApiKey(res.data.tenant?.api_key || null);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Gagal memuat pengaturan integrasi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const copy = async (value: string | null, label: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast.success(`${label} disalin`);
  };

  const saveEvents = async () => {
    setSavingEvents(true);
    try {
      await api.put('/admin/tenant/integrations/webhook-events', { webhook_events: events });
      toast.success('Filter event webhook disimpan');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Gagal menyimpan filter event');
    } finally {
      setSavingEvents(false);
    }
  };

  const addWebhook = async () => {
    const normalizedUrl = url.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      toast.error('Masukkan URL webhook publik yang diawali http:// atau https://');
      return;
    }
    setSavingWebhook(true);
    try {
      const res = await api.post('/admin/tenant/integrations/webhooks', { url: normalizedUrl });
      setWebhooks((current) => [res.data.webhook, ...current]);
      setUrl('');
      toast.success('Webhook tersimpan');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Gagal menyimpan webhook');
    } finally {
      setSavingWebhook(false);
    }
  };

  const deleteWebhook = async (id: string) => {
    const ok = await confirmDialog({ title: 'Hapus webhook ini?', description: 'Webhook ini tidak akan menerima event lagi setelah dihapus.', confirmLabel: 'Hapus', danger: true });
    if (!ok) return;
    setDeletingId(id);
    try {
      await api.delete(`/admin/tenant/integrations/webhooks/${id}`);
      setWebhooks((current) => current.filter((webhook) => webhook.id !== id));
      toast.success('Webhook dihapus');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Gagal menghapus webhook');
    } finally {
      setDeletingId(null);
    }
  };

  const regenerateKey = async () => {
    const ok = await confirmDialog({
      title: 'Regenerate API key?',
      description: 'Integrasi yang memakai key lama akan berhenti sampai key-nya diperbarui.',
      confirmLabel: 'Regenerate',
      danger: true,
    });
    if (!ok) return;
    setRegenerating(true);
    try {
      const res = await api.post('/admin/tenant/integrations/regenerate-key');
      setApiKey(res.data.api_key || null);
      setShowKey(true);
      toast.success('API key diperbarui');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Gagal memperbarui API key');
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500 dark:text-gray-400"><Loader2 className="mr-2 animate-spin" size={18} /> Memuat integrasi…</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm dark:border-blue-900/50 dark:from-slate-900 dark:to-slate-900">
        <div className="flex gap-4">
          <div className="rounded-2xl bg-blue-600 p-3 text-white"><Link2 size={24} /></div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">Integrasi Anda</p>
            <h1 className="mt-1 text-2xl font-black text-gray-900 dark:text-white">Webhook & API</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-300">Atur endpoint tujuan dan event yang diteruskan untuk tenant Anda. Pengaturan ini tidak mengubah koneksi WhatsApp yang sedang aktif.</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-bold text-gray-900 dark:text-white">API key tenant</h2><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Kirim sebagai header <code className="font-semibold">X-Tenant-Key</code> untuk integrasi API tenant Anda.</p></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowKey((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:border-blue-400 dark:border-slate-700 dark:text-gray-200">{showKey ? <EyeOff size={15} /> : <Eye size={15} />}{showKey ? 'Sembunyikan' : 'Tampilkan'}</button>
            <button onClick={regenerateKey} disabled={regenerating} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60">{regenerating ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}Regenerate</button>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-gray-50 p-3 dark:bg-slate-900">
          <code className="min-w-0 flex-1 break-all text-xs text-gray-700 dark:text-gray-200">{showKey ? (apiKey || 'Belum tersedia') : '••••••••••••••••••••••••••••••••'}</code>
          <button onClick={() => void copy(apiKey, 'API key')} aria-label="Salin API key" className="rounded-lg p-2 text-gray-500 hover:bg-white hover:text-blue-600 dark:hover:bg-slate-800"><Copy size={16} /></button>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-800">
        <div className="flex items-start justify-between gap-4"><div><h2 className="font-bold text-gray-900 dark:text-white">Endpoint webhook</h2><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Pesan yang dipilih akan diteruskan ke setiap endpoint publik di bawah.</p></div><ShieldCheck className="text-emerald-500" size={22} /></div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row"><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://domain-anda.com/webhook" className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /><button onClick={addWebhook} disabled={savingWebhook} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">{savingWebhook ? 'Menyimpan…' : 'Tambah webhook'}</button></div>
        <div className="mt-4 space-y-2">{webhooks.length === 0 ? <p className="rounded-xl border border-dashed border-gray-200 p-4 text-xs text-gray-500 dark:border-slate-700 dark:text-gray-400">Belum ada endpoint webhook.</p> : webhooks.map((webhook) => <div key={webhook.id} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-900"><code className="min-w-0 flex-1 break-all text-xs text-gray-700 dark:text-gray-200">{webhook.url}</code><button onClick={() => void copy(webhook.url, 'URL webhook')} className="p-2 text-gray-500 hover:text-blue-600"><Copy size={15} /></button><button onClick={() => void deleteWebhook(webhook.id)} disabled={deletingId === webhook.id} className="p-2 text-rose-500 hover:text-rose-700 disabled:opacity-50"><Trash2 size={16} /></button></div>)}</div>
      </section>

      <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-bold text-gray-900 dark:text-white">Event yang diteruskan</h2><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Pilih jenis pesan yang boleh dikirim ke endpoint webhook Anda.</p></div><button onClick={saveEvents} disabled={savingEvents} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{savingEvents ? 'Menyimpan…' : 'Simpan event'}</button></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{eventOptions.map((option) => <label key={option.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-gray-100 p-4 transition hover:border-blue-300 dark:border-slate-700"><span><span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">{option.label}</span><span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{option.description}</span></span><input type="checkbox" checked={events[option.key]} onChange={(event) => setEvents((current) => ({ ...current, [option.key]: event.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /></label>)}</div>
      </section>
    </div>
  );
}
