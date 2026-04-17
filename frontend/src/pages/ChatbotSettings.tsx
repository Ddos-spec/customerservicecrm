import { useEffect, useState } from 'react';
import { Bot, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

type ChatbotPair = {
  id?: string;
  question: string;
  answer: string;
};

type TenantConfig = {
  id: string | number;
  company_name: string;
  ai_mode: 'agent' | 'chatbot';
  wa_provider?: 'whatsmeow' | 'meta';
};

const createEmptyPair = (): ChatbotPair => ({
  question: '',
  answer: ''
});

const ChatbotSettings = () => {
  const [tenant, setTenant] = useState<TenantConfig | null>(null);
  const [pairs, setPairs] = useState<ChatbotPair[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/admin/chatbot-config');
      if (res.data?.success) {
        setTenant(res.data.tenant || null);
        setPairs(Array.isArray(res.data.chatbot_pairs) ? res.data.chatbot_pairs : []);
      }
    } catch (error: any) {
      console.error('Failed to fetch chatbot config:', error);
      toast.error(error.response?.data?.error || 'Gagal memuat konfigurasi chatbot');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchConfig();
  }, []);

  const handlePairChange = (index: number, field: 'question' | 'answer', value: string) => {
    setPairs((prev) => prev.map((pair, currentIndex) => (
      currentIndex === index ? { ...pair, [field]: value } : pair
    )));
  };

  const handleAddPair = () => {
    setPairs((prev) => [...prev, createEmptyPair()]);
  };

  const handleRemovePair = (index: number) => {
    setPairs((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await api.put('/admin/chatbot-config', {
        chatbot_pairs: pairs
      });
      if (res.data?.success) {
        setPairs(Array.isArray(res.data.chatbot_pairs) ? res.data.chatbot_pairs : []);
        toast.success('Knowledge chatbot berhasil disimpan');
      }
    } catch (error: any) {
      console.error('Failed to save chatbot config:', error);
      toast.error(error.response?.data?.error || 'Gagal menyimpan knowledge chatbot');
    } finally {
      setIsSaving(false);
    }
  };

  const validPairsCount = pairs.filter((pair) => pair.question.trim() && pair.answer.trim()).length;

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter uppercase">Knowledge Chatbot</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">
            Atur pertanyaan dan jawaban otomatis untuk tenant {tenant?.company_name || 'Anda'}.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleAddPair}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:border-blue-400 transition-colors text-xs font-black uppercase tracking-widest"
          >
            <Plus size={16} />
            <span>Tambah Q/A</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400 transition-colors text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-900/10"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            <span>{isSaving ? 'Menyimpan...' : 'Simpan Knowledge'}</span>
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.25fr_0.75fr]">
        <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">Pertanyaan & Jawaban</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Chatbot akan membalas exact-match setelah pesan dirapikan huruf kecil dan spasi.</p>
            </div>
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              {validPairsCount} aktif
            </span>
          </div>

          <div className="p-6 space-y-4">
            {pairs.length > 0 ? pairs.map((pair, index) => (
              <div key={pair.id || `pair-${index}`} className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/60 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">Rule #{index + 1}</p>
                  <button
                    type="button"
                    onClick={() => handleRemovePair(index)}
                    className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 hover:border-rose-400 transition-colors"
                    title="Hapus rule"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Pertanyaan Customer</label>
                  <input
                    value={pair.question}
                    onChange={(e) => handlePairChange(index, 'question', e.target.value)}
                    placeholder="Contoh: halo"
                    className="w-full p-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Jawaban Chatbot</label>
                  <textarea
                    value={pair.answer}
                    onChange={(e) => handlePairChange(index, 'answer', e.target.value)}
                    placeholder="Contoh: Hai, ada yang bisa kami bantu?"
                    rows={4}
                    className="w-full p-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y"
                  />
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 px-6 py-10 text-center">
                <Bot className="mx-auto text-blue-500 dark:text-blue-300 mb-4" size={28} />
                <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Belum ada knowledge chatbot.</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Tambahkan pasangan pertanyaan dan jawaban pertama untuk mulai auto-reply.</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[2rem] border border-blue-100 dark:border-blue-900 bg-blue-50/70 dark:bg-blue-900/20 p-6">
            <p className="text-xs font-black text-blue-800 dark:text-blue-100 uppercase tracking-[0.2em]">Status Tenant</p>
            <p className="text-2xl font-black text-gray-900 dark:text-white mt-3">
              {tenant?.ai_mode === 'chatbot' ? 'Chatbot FAQ Aktif' : 'Masih Mode AI Agent'}
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-3 leading-relaxed">
              {tenant?.ai_mode === 'chatbot'
                ? 'Pesan pribadi yang cocok dengan knowledge di halaman ini akan dibalas otomatis oleh chatbot.'
                : 'Knowledge tetap bisa disiapkan dari sekarang, tapi auto-reply baru jalan saat tenant diubah ke mode chatbot oleh super admin.'}
            </p>
          </div>

          <div className="rounded-[2rem] border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
            <p className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">Cara Kerja</p>
            <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <p>1. Tambahkan pertanyaan customer yang ingin dikenali chatbot.</p>
              <p>2. Isi jawaban yang harus dikirim otomatis.</p>
              <p>3. Klik simpan, lalu chatbot akan memakai knowledge itu untuk pesan WA masuk yang cocok.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatbotSettings;
