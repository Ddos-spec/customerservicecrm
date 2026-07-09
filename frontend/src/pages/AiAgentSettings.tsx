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
  Plus,
  Save,
  Sparkles,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

type AiConfig = {
  system_prompt: string;
  openrouter_api_key_masked: string | null;
  has_api_key: boolean;
  chat_model: string;
  embedding_model: string;
  temperature: number;
  max_tokens: number;
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

const CHAT_MODELS = [
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o mini (cepat & murah)' },
  { value: 'openai/gpt-4o', label: 'GPT-4o (lebih pintar)' },
  { value: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku (cepat)' },
  { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (lebih pintar)' },
  { value: 'meta-llama/llama-3.1-8b-instruct', label: 'Llama 3.1 8B (hemat)' },
];

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
        toast.success('Konfigurasi AI Agent tersimpan');
      }
    } catch (error: any) {
      console.error('Failed to save AI config:', error);
      toast.error(error.response?.data?.error || 'Gagal menyimpan konfigurasi');
    } finally {
      setIsSavingConfig(false);
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
        <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr] xl:items-start">
          <div className="crm-surface space-y-5">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Kepribadian AI (System Prompt)
              </label>
              <textarea
                value={config.system_prompt}
                onChange={(e) => setConfig((prev) => ({ ...prev, system_prompt: e.target.value }))}
                placeholder="Contoh: Kamu adalah customer service toko sepatu ABC. Jawab dengan ramah, singkat, dan gunakan bahasa Indonesia santai."
                rows={6}
                className="w-full p-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                <KeyRound size={13} /> API Key OpenRouter
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={config.has_api_key ? `Tersimpan: ${config.openrouter_api_key_masked}` : 'sk-or-v1-...'}
                className="w-full p-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Dapatkan key gratis di openrouter.ai. Biaya pemakaian AI ditagih langsung ke akun OpenRouter Anda, bukan ke langganan CRM ini.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Model Percakapan</label>
                <select
                  value={config.chat_model}
                  onChange={(e) => setConfig((prev) => ({ ...prev, chat_model: e.target.value }))}
                  className="w-full p-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  {CHAT_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Model Pemahaman Dokumen</label>
                <select
                  value={config.embedding_model}
                  onChange={(e) => setConfig((prev) => ({ ...prev, embedding_model: e.target.value }))}
                  className="w-full p-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  {EMBEDDING_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={isSavingConfig}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400 transition-colors text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-900/10"
              >
                {isSavingConfig ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                <span>{isSavingConfig ? 'Menyimpan...' : 'Simpan Konfigurasi'}</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className={`rounded-[2rem] border p-6 ${config.has_api_key ? 'border-emerald-100 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-900/20' : 'border-amber-100 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-900/20'}`}>
              <p className={`text-xs font-black uppercase tracking-[0.2em] ${config.has_api_key ? 'text-emerald-800 dark:text-emerald-100' : 'text-amber-800 dark:text-amber-100'}`}>Status API Key</p>
              <p className="text-2xl font-black text-gray-900 dark:text-white mt-3">
                {config.has_api_key ? 'Terhubung' : 'Belum Diisi'}
              </p>
              <p className={`text-sm mt-3 leading-relaxed ${config.has_api_key ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                {config.has_api_key
                  ? 'AI Agent siap membalas pesan customer secara otomatis.'
                  : 'Tanpa API key, pesan customer akan tetap masuk ke inbox seperti biasa dan menunggu dibalas agent.'}
              </p>
            </div>

            <div className="rounded-[2rem] border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
              <p className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">Cara Kerja</p>
              <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
                <p>1. Isi kepribadian AI dan API key OpenRouter.</p>
                <p>2. Tambahkan dokumen, FAQ, atau URL di tab lain sebagai sumber pengetahuan.</p>
                <p>3. AI akan menjawab pakai sumber itu — kalau tidak yakin, otomatis dialihkan ke agent manusia.</p>
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
