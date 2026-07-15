import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Bot,
  CheckCircle2,
  Clock,
  FileText,
  KeyRound,
  Link2,
  Loader2,
  MessageSquareText,
  PlayCircle,
  Plus,
  Power,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

type AiConfig = {
  enabled: boolean;
  system_prompt: string;
  openrouter_api_key_masked: string | null;
  has_api_key: boolean;
  chat_model: string;
  embedding_model: string;
  temperature: number;
  max_tokens: number;
};

type AiModel = {
  id: string;
  name: string;
  description?: string;
  context_length?: number | null;
};

type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed';

type KnowledgeDocument = {
  id: string;
  source_type: 'file' | 'url';
  title: string;
  original_filename: string | null;
  source_url: string | null;
  status: DocumentStatus;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
};

type Faq = {
  id: string;
  question: string;
  answer: string;
  status: DocumentStatus;
  chunk_count: number;
};

const RECOMMENDED_CHAT_MODELS = [
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o mini (cepat & murah)' },
  { value: 'openai/gpt-4o', label: 'GPT-4o (lebih pintar)' },
  { value: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku (cepat)' },
  { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (lebih pintar)' },
  { value: 'meta-llama/llama-3.1-8b-instruct', label: 'Llama 3.1 8B (hemat)' },
];

const DEFAULT_CS_PROMPT = `Kamu adalah customer service profesional untuk bisnis ini.

Tugas utama:
- Sambut customer dengan ramah dan pahami kebutuhannya sebelum memberi solusi.
- Jawab singkat, jelas, hangat, dan gunakan bahasa Indonesia yang natural.
- Gunakan informasi dari sumber pengetahuan sebagai acuan fakta.
- Jangan mengarang harga, stok, kebijakan, alamat, atau janji yang tidak tersedia.
- Koordinasikan seluruh konsultasi dari chat WhatsApp ini. Jangan arahkan customer ke form, website, email, atau channel lain.
- Jika customer sendiri mengajak meeting, bantu tentukan waktu dan tanyakan apakah link meeting dibuat customer atau perlu disiapkan admin.
- Ajukan maksimal satu pertanyaan paling relevan setiap balasan dan jangan menanyakan informasi yang sudah diberikan.
- Hubungkan masalah customer dengan solusi yang relevan, jelaskan manfaat konkretnya, tangani keberatan, lalu arahkan percakapan menuju keputusan.
- Jangan menyerahkan lead terlalu cepat. Lanjutkan discovery saat customer tertarik, baru menanyakan harga, atau berkata mau lanjut. Eskalasi hanya jika customer meminta manusia secara eksplisit, meminta proposal/order formal setelah kebutuhan inti lengkap, atau keputusan memang harus diambil admin.
- Jika informasi belum cukup, jangan mengarang; jelaskan batasnya singkat lalu tanyakan satu detail yang paling relevan. Jika customer meminta manusia, jelaskan dengan sopan bahwa admin akan membantu langsung di chat ini.
- Jangan mengulang pertanyaan yang sudah dijawab customer.
- Fokus membantu customer menyelesaikan kebutuhannya, bukan sekadar memberi jawaban umum.`;

const EMBEDDING_MODELS = [
  { value: 'openai/text-embedding-3-small', label: 'OpenAI text-embedding-3-small (rekomendasi)' },
  { value: 'qwen/qwen3-embedding-0.6b', label: 'Qwen3 Embedding 0.6B (hemat)' },
];

const TABS = [
  { key: 'config', label: 'Konfigurasi', icon: Sparkles },
  { key: 'sources', label: 'Sumber Pengetahuan', icon: FileText },
  { key: 'faq', label: 'FAQ', icon: MessageSquareText },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const emptyConfig: AiConfig = {
  enabled: false,
  system_prompt: '',
  openrouter_api_key_masked: null,
  has_api_key: false,
  chat_model: 'openai/gpt-4o-mini',
  embedding_model: 'openai/text-embedding-3-small',
  temperature: 0.3,
  max_tokens: 500,
};

function StatusBadge({ status, errorMessage }: { status: DocumentStatus; errorMessage?: string | null }) {
  const variants: Record<DocumentStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
    pending: { label: 'Menunggu', className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', icon: Clock },
    processing: { label: 'Memproses', className: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', icon: Loader2 },
    ready: { label: 'Siap Dipakai', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', icon: CheckCircle2 },
    failed: { label: 'Gagal', className: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300', icon: XCircle },
  };
  const variant = variants[status];
  const Icon = variant.icon;
  return (
    <span
      title={status === 'failed' ? errorMessage || 'Terjadi kesalahan' : undefined}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${variant.className}`}
    >
      <Icon size={11} className={status === 'processing' ? 'animate-spin' : ''} />
      {variant.label}
    </span>
  );
}

const AiAgentSettings = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('config');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const [config, setConfig] = useState<AiConfig>(emptyConfig);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [models, setModels] = useState<AiModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [testMessage, setTestMessage] = useState('Halo, saya mau tahu produk atau layanan yang tersedia. Bisa dibantu?');
  const [testReply, setTestReply] = useState<string | null>(null);
  const [testMeta, setTestMeta] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [newFaq, setNewFaq] = useState({ question: '', answer: '' });
  const [isAddingFaq, setIsAddingFaq] = useState(false);
  const [savingFaqId, setSavingFaqId] = useState<string | null>(null);

  const fetchAll = async () => {
    try {
      const [configRes, docsRes, faqRes] = await Promise.all([
        api.get('/ai-agent/config'),
        api.get('/ai-agent/documents'),
        api.get('/ai-agent/faq'),
      ]);
      if (configRes.data?.success) setConfig(configRes.data.config);
      if (docsRes.data?.success) setDocuments(docsRes.data.documents || []);
      if (faqRes.data?.success) setFaqs(faqRes.data.faqs || []);
    } catch (error: any) {
      console.error('Failed to fetch AI agent data:', error);
      toast.error(error.response?.data?.error || 'Gagal memuat data AI Agent');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingModels(true);
    api.get('/ai-agent/models')
      .then((res) => {
        if (isMounted && res.data?.success) setModels(res.data.models || []);
      })
      .catch(() => {
        // Daftar rekomendasi lokal tetap tersedia bila katalog OpenRouter sedang bermasalah.
      })
      .finally(() => {
        if (isMounted) setIsLoadingModels(false);
      });
    return () => {
      isMounted = false;
    };
  }, [config.has_api_key]);

  // Poll status selama ada dokumen/FAQ yang masih diproses di background.
  useEffect(() => {
    const hasPending = [...documents, ...faqs].some((item) => item.status === 'pending' || item.status === 'processing');
    if (!hasPending) return;
    const interval = setInterval(async () => {
      try {
        const [docsRes, faqRes] = await Promise.all([api.get('/ai-agent/documents'), api.get('/ai-agent/faq')]);
        if (docsRes.data?.success) setDocuments(docsRes.data.documents || []);
        if (faqRes.data?.success) setFaqs(faqRes.data.faqs || []);
      } catch {
        // silent — polling, akan dicoba lagi di interval berikutnya
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [documents, faqs]);

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      const payload: Record<string, unknown> = {
        enabled: config.enabled,
        system_prompt: config.system_prompt,
        chat_model: config.chat_model,
        embedding_model: config.embedding_model,
        temperature: config.temperature,
        max_tokens: config.max_tokens,
      };
      if (apiKeyInput.trim()) payload.openrouter_api_key = apiKeyInput.trim();

      const res = await api.put('/ai-agent/config', payload);
      if (res.data?.success) {
        setConfig(res.data.config);
        setApiKeyInput('');
        toast.success(res.data.config.enabled ? 'AI Agent tersimpan dan aktif' : 'Konfigurasi tersimpan, AI Agent nonaktif');
      }
    } catch (error: any) {
      console.error('Failed to save AI config:', error);
      toast.error(error.response?.data?.error || 'Gagal menyimpan konfigurasi');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleTestConfig = async () => {
    if (!testMessage.trim()) return;
    setIsTesting(true);
    setTestReply(null);
    setTestMeta(null);
    try {
      const res = await api.post('/ai-agent/test', {
        openrouter_api_key: apiKeyInput.trim() || undefined,
        chat_model: config.chat_model,
        system_prompt: config.system_prompt,
        temperature: config.temperature,
        max_tokens: config.max_tokens,
        message: testMessage.trim(),
      });
      if (res.data?.success) {
        setTestReply(res.data.reply);
        setTestMeta(`${res.data.model || config.chat_model} • ${res.data.latency_ms} ms`);
        toast.success('Tes berhasil. Periksa apakah jawabannya sudah sesuai.');
      }
    } catch (error: any) {
      console.error('Failed to test AI config:', error);
      toast.error(error.response?.data?.error || 'Tes AI gagal');
    } finally {
      setIsTesting(false);
    }
  };

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/ai-agent/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.success) {
        setDocuments((prev) => [res.data.document, ...prev]);
        toast.success(`"${file.name}" ditambahkan, sedang diproses...`);
      }
    } catch (error: any) {
      console.error('Failed to upload document:', error);
      toast.error(error.response?.data?.error || 'Gagal mengunggah dokumen');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddUrl = async (e: FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setIsAddingUrl(true);
    try {
      const res = await api.post('/ai-agent/documents/url', { url: urlInput.trim() });
      if (res.data?.success) {
        setDocuments((prev) => [res.data.document, ...prev]);
        setUrlInput('');
        toast.success('URL ditambahkan, sedang diambil kontennya...');
      }
    } catch (error: any) {
      console.error('Failed to add URL:', error);
      toast.error(error.response?.data?.error || 'Gagal menambahkan URL');
    } finally {
      setIsAddingUrl(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      await api.delete(`/ai-agent/documents/${id}`);
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
      toast.success('Sumber pengetahuan dihapus');
    } catch (error: any) {
      console.error('Failed to delete document:', error);
      toast.error(error.response?.data?.error || 'Gagal menghapus');
    }
  };

  const handleAddFaq = async (e: FormEvent) => {
    e.preventDefault();
    if (!newFaq.question.trim() || !newFaq.answer.trim()) return;
    setIsAddingFaq(true);
    try {
      const res = await api.post('/ai-agent/faq', newFaq);
      if (res.data?.success) {
        setFaqs((prev) => [...prev, res.data.faq]);
        setNewFaq({ question: '', answer: '' });
        toast.success('FAQ ditambahkan');
      }
    } catch (error: any) {
      console.error('Failed to add FAQ:', error);
      toast.error(error.response?.data?.error || 'Gagal menambahkan FAQ');
    } finally {
      setIsAddingFaq(false);
    }
  };

  const handleUpdateFaq = async (faq: Faq) => {
    setSavingFaqId(faq.id);
    try {
      const res = await api.put(`/ai-agent/faq/${faq.id}`, { question: faq.question, answer: faq.answer });
      if (res.data?.success) {
        setFaqs((prev) => prev.map((f) => (f.id === faq.id ? res.data.faq : f)));
        toast.success('FAQ diperbarui');
      }
    } catch (error: any) {
      console.error('Failed to update FAQ:', error);
      toast.error(error.response?.data?.error || 'Gagal memperbarui FAQ');
    } finally {
      setSavingFaqId(null);
    }
  };

  const handleDeleteFaq = async (id: string) => {
    try {
      await api.delete(`/ai-agent/faq/${id}`);
      setFaqs((prev) => prev.filter((f) => f.id !== id));
      toast.success('FAQ dihapus');
    } catch (error: any) {
      console.error('Failed to delete FAQ:', error);
      toast.error(error.response?.data?.error || 'Gagal menghapus FAQ');
    }
  };

  const readyCount = [...documents, ...faqs].filter((item) => item.status === 'ready').length;
  const totalSources = documents.length + faqs.length;
  const hasApiKey = config.has_api_key || Boolean(apiKeyInput.trim());
  const hasPrompt = config.system_prompt.trim().length >= 20;
  const hasModel = Boolean(config.chat_model.trim());
  const canActivate = hasApiKey && hasPrompt && hasModel;
  const modelOptions = models.length > 0
    ? [...models]
    : RECOMMENDED_CHAT_MODELS.map((model) => ({ id: model.value, name: model.label }));

  if (config.chat_model && !modelOptions.some((model) => model.id === config.chat_model)) {
    modelOptions.unshift({ id: config.chat_model, name: config.chat_model });
  }

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="crm-page-tight animate-in fade-in duration-500">
      <div className="crm-page-header">
        <div>
          <h1 className="crm-page-title">AI Agent</h1>
          <p className="crm-page-subtitle">
            Atur kepribadian AI dan sumber pengetahuannya. Semua balasan otomatis memakai OpenRouter dengan API key milik Anda sendiri.
          </p>
        </div>
        <div className="crm-action-row xl:justify-end">
          <span className="px-4 py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-black uppercase tracking-widest">
            {readyCount}/{totalSources} sumber siap
          </span>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200 dark:border-slate-800 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                  : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'config' && (
        <div className="space-y-5">
          <div className={`flex flex-col gap-4 rounded-3xl border p-5 sm:flex-row sm:items-center sm:justify-between ${config.enabled ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
            <div className="flex items-start gap-4">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${config.enabled ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                <Power size={20} />
              </span>
              <div>
                <p className="text-sm font-black text-slate-950 dark:text-white">Balasan otomatis {config.enabled ? 'akan aktif' : 'nonaktif'}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {config.enabled
                    ? 'Setelah disimpan, AI mulai membalas chat baru. Agent manusia tetap bisa mengambil alih kapan saja.'
                    : 'Semua pesan tetap masuk ke inbox dan menunggu agent manusia. Perubahan berlaku setelah disimpan.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.enabled}
              aria-label="Aktifkan balasan otomatis AI Agent"
              disabled={!config.enabled && !canActivate}
              onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
              className={`relative h-8 w-14 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40 ${config.enabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'}`}
            >
              <span className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr] xl:items-start">
            <div className="crm-surface space-y-5">
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Instruksi & Kepribadian AI
                  </label>
                  <button
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, system_prompt: DEFAULT_CS_PROMPT }))}
                    className="rounded-xl border border-blue-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-blue-700 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/40"
                  >
                    Gunakan template CS andal
                  </button>
                </div>
                <textarea
                  value={config.system_prompt}
                  onChange={(e) => setConfig((prev) => ({ ...prev, system_prompt: e.target.value }))}
                  placeholder="Jelaskan nama bisnis, gaya bahasa, hal yang boleh dijawab, dan kapan AI harus menyerahkan chat ke manusia."
                  rows={9}
                  className="w-full resize-y rounded-xl border border-gray-200 bg-white p-4 text-sm font-semibold text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-gray-500"
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Tulis aturan bisnis dengan bahasa biasa. Sistem tetap menjaga AI agar tidak mengarang fakta.</p>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
                <p className="font-semibold">Handoff mengikuti System Prompt</p>
                <p className="mt-1 text-xs leading-relaxed text-blue-800 dark:text-blue-200">
                  Tentukan sendiri kapan AI harus berhenti dan menyerahkan chat ke admin melalui instruksi di System Prompt. Tidak ada aturan platform yang memaksa handoff berdasarkan kata kunci, minat lead, atau meeting.
                </p>
              </div>

              <div>
                <label className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <KeyRound size={13} /> API Key OpenRouter
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={config.has_api_key ? `Tersimpan: ${config.openrouter_api_key_masked}` : 'sk-or-v1-...'}
                  className="w-full rounded-xl border border-gray-200 bg-white p-4 text-sm font-semibold text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-gray-500"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Key tidak pernah ditampilkan kembali. Biaya pemakaian dibayar langsung melalui akun OpenRouter tenant.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Model Percakapan</label>
                  <select
                    value={config.chat_model}
                    onChange={(e) => setConfig((prev) => ({ ...prev, chat_model: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white p-4 text-sm font-semibold text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {modelOptions.map((model) => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {isLoadingModels
                      ? 'Memuat katalog model terbaru...'
                      : models.length > 0
                        ? `${models.length} model terbaru tersedia dari OpenRouter.`
                        : 'Pilihan rekomendasi tersedia. Katalog terbaru dimuat saat backend terhubung.'}
                  </p>
                </div>
                <div>
                  <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Pemahaman Dokumen</label>
                  <select
                    value={config.embedding_model}
                    onChange={(e) => setConfig((prev) => ({ ...prev, embedding_model: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white p-4 text-sm font-semibold text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {EMBEDDING_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>{model.label}</option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Dipakai untuk mencari jawaban dari FAQ dan dokumen.</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {config.enabled ? 'Simpan untuk mulai membalas customer otomatis.' : 'Konfigurasi aman disimpan tanpa mengaktifkan AI.'}
                </p>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={isSavingConfig || (config.enabled && !canActivate)}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
                >
                  {isSavingConfig ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  <span>{isSavingConfig ? 'Menyimpan...' : config.enabled ? 'Simpan & Aktifkan' : 'Simpan Konfigurasi'}</span>
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className={`rounded-3xl border p-6 ${canActivate ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20'}`}>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className={canActivate ? 'text-emerald-600' : 'text-amber-600'} />
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-700 dark:text-slate-200">Kesiapan AI</p>
                </div>
                <p className="mt-3 text-xl font-black text-slate-950 dark:text-white">{canActivate ? 'Siap diuji dan diaktifkan' : 'Lengkapi pengaturan'}</p>
                <div className="mt-4 space-y-2 text-sm font-semibold">
                  <p className={hasApiKey ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>{hasApiKey ? '✓' : '○'} API key OpenRouter</p>
                  <p className={hasPrompt ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>{hasPrompt ? '✓' : '○'} Instruksi AI yang jelas</p>
                  <p className={hasModel ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>{hasModel ? '✓' : '○'} Model percakapan</p>
                  <p className={readyCount > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}>{readyCount > 0 ? '✓' : '○'} Sumber pengetahuan <span className="font-normal">(disarankan)</span></p>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <PlayCircle size={18} className="text-blue-600" />
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-700 dark:text-slate-200">Simulasi Customer</p>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Tes prompt dan model sebelum AI berbicara dengan customer asli.</p>
                <textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={3}
                  className="mt-4 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleTestConfig}
                  disabled={isTesting || !canActivate || !testMessage.trim()}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-black uppercase tracking-wider text-blue-700 transition-colors hover:bg-blue-100 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70"
                >
                  {isTesting ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />}
                  {isTesting ? 'Menghubungi AI...' : 'Tes Balasan'}
                </button>
                {testReply && (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Balasan AI</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-100">{testReply}</p>
                    {testMeta && <p className="mt-3 text-[10px] text-slate-500 dark:text-slate-400">{testMeta}</p>}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Pengaman Customer</p>
                <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                  <p>• AI membawa riwayat chat agar tidak mengulang pertanyaan.</p>
                  <p>• Fakta bisnis hanya boleh berasal dari sumber pengetahuan.</p>
                  <p>• Saat ragu atau layanan AI bermasalah, chat dialihkan ke manusia.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sources' && (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="crm-surface">
              <p className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em] mb-3">Unggah Dokumen</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 px-6 py-10 text-center hover:border-blue-400 transition-colors disabled:opacity-60"
              >
                {isUploading ? <Loader2 className="animate-spin text-blue-500" size={28} /> : <UploadCloud className="text-blue-500" size={28} />}
                <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                  {isUploading ? 'Mengunggah...' : 'Klik untuk pilih file'}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">PDF, DOCX, atau XLSX — maks 15MB</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.xlsx"
                className="hidden"
                onChange={(e) => handleFileSelected(e.target.files?.[0] || null)}
              />
            </div>

            <div className="crm-surface">
              <p className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em] mb-3">Tambah dari URL</p>
              <form onSubmit={handleAddUrl} className="flex flex-col justify-center h-full gap-3">
                <div className="flex items-center gap-2 p-1 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                  <Link2 className="text-gray-400 ml-3" size={16} />
                  <input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://tokoanda.com/faq"
                    className="flex-1 bg-transparent px-2 py-3 text-sm font-semibold text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isAddingUrl || !urlInput.trim()}
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 transition-colors text-xs font-black uppercase tracking-widest"
                >
                  {isAddingUrl ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                  <span>Ambil & Tambahkan</span>
                </button>
              </form>
            </div>
          </div>

          <div className="crm-surface overflow-hidden p-0">
            <div className="p-6 border-b border-gray-100 dark:border-slate-700">
              <p className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">Daftar Sumber Pengetahuan</p>
            </div>
            <div className="p-6 space-y-3">
              {documents.length > 0 ? documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/60 p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {doc.source_type === 'url' ? <Link2 className="text-gray-400 shrink-0" size={18} /> : <FileText className="text-gray-400 shrink-0" size={18} />}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{doc.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{doc.chunk_count} bagian pengetahuan</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge status={doc.status} errorMessage={doc.error_message} />
                    <button
                      type="button"
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 hover:border-rose-400 transition-colors"
                      title="Hapus"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 px-6 py-10 text-center">
                  <Bot className="mx-auto text-blue-500 dark:text-blue-300 mb-4" size={28} />
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Belum ada dokumen atau URL.</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Unggah dokumen atau tambahkan URL supaya AI punya bahan jawaban.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'faq' && (
        <div className="crm-surface overflow-hidden p-0">
          <div className="p-6 border-b border-gray-100 dark:border-slate-700">
            <p className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">Tambah FAQ Baru</p>
          </div>
          <form onSubmit={handleAddFaq} className="p-6 space-y-3 border-b border-gray-100 dark:border-slate-700">
            <input
              value={newFaq.question}
              onChange={(e) => setNewFaq((prev) => ({ ...prev, question: e.target.value }))}
              placeholder="Pertanyaan, contoh: Berapa lama pengiriman?"
              className="w-full p-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <textarea
              value={newFaq.answer}
              onChange={(e) => setNewFaq((prev) => ({ ...prev, answer: e.target.value }))}
              placeholder="Jawaban, contoh: Pengiriman 2-3 hari kerja untuk area Jabodetabek."
              rows={3}
              className="w-full p-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isAddingFaq || !newFaq.question.trim() || !newFaq.answer.trim()}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 transition-colors text-xs font-black uppercase tracking-widest"
              >
                {isAddingFaq ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                <span>Tambah FAQ</span>
              </button>
            </div>
          </form>

          <div className="p-6 space-y-4">
            {faqs.length > 0 ? faqs.map((faq) => (
              <div key={faq.id} className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/60 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <StatusBadge status={faq.status} />
                  <button
                    type="button"
                    onClick={() => handleDeleteFaq(faq.id)}
                    className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 hover:border-rose-400 transition-colors"
                    title="Hapus FAQ"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <input
                  value={faq.question}
                  onChange={(e) => setFaqs((prev) => prev.map((f) => (f.id === faq.id ? { ...f, question: e.target.value } : f)))}
                  className="w-full p-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <textarea
                  value={faq.answer}
                  onChange={(e) => setFaqs((prev) => prev.map((f) => (f.id === faq.id ? { ...f, answer: e.target.value } : f)))}
                  rows={3}
                  className="w-full p-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleUpdateFaq(faq)}
                    disabled={savingFaqId === faq.id}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:border-blue-400 transition-colors text-xs font-black uppercase tracking-widest"
                  >
                    {savingFaqId === faq.id ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                    <span>Simpan</span>
                  </button>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 px-6 py-10 text-center">
                <MessageSquareText className="mx-auto text-blue-500 dark:text-blue-300 mb-4" size={28} />
                <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Belum ada FAQ.</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Tambahkan pertanyaan yang sering ditanyakan customer di atas.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AiAgentSettings;
