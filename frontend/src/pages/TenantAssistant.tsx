import { useEffect, useRef, useState } from 'react';
import { Bot, Copy, KeyRound, Loader2, Send, Sparkles, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { confirmDialog } from '../components/ConfirmDialog';
import api from '../lib/api';

type AssistantMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type AssistantStatus = {
  ready: boolean;
  model: string | null;
  tenant: { id: string; company_name: string };
};

const SUGGESTIONS = [
  'Buatkan 3 variasi balasan profesional untuk customer yang menanyakan harga.',
  'Bantu buat checklist kerja CS untuk opening shift hari ini.',
  'Buat SOP singkat untuk menangani komplain customer.',
  'Susun prioritas kerja tim hari ini dari daftar tugas yang akan saya kirim.',
];

const makeMessage = (role: AssistantMessage['role'], content: string): AssistantMessage => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
});

export default function TenantAssistant() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const welcome = (companyName: string) => makeMessage('assistant', `Siap membantu ${companyName}. Saya bisa menyusun draft balasan, SOP, checklist, prioritas kerja, ide kampanye, atau merangkum materi yang Anda kirim.`);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await api.get('/assistant/status');
        if (!active || !res.data?.success) return;
        const nextStatus = res.data as AssistantStatus;
        setStatus(nextStatus);
        const storageKey = `tenant-assistant:${nextStatus.tenant.id}`;
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.every((item) => item?.role && typeof item.content === 'string')) {
            setMessages(parsed.slice(-30));
            return;
          }
        }
        setMessages([welcome(nextStatus.tenant.company_name)]);
      } catch (error: any) {
        if (active) toast.error(error.response?.data?.error || 'Gagal memuat AI Assistant');
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!status || messages.length === 0) return;
    localStorage.setItem(`tenant-assistant:${status.tenant.id}`, JSON.stringify(messages.slice(-30)));
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, status]);

  const send = async () => {
    const message = input.trim();
    if (!message || isSending || !status?.ready) return;
    const userMessage = makeMessage('user', message);
    const history = messages.filter((item) => item.role === 'user' || item.role === 'assistant').slice(-14);
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setIsSending(true);
    try {
      const res = await api.post('/assistant/chat', { message, history });
      if (res.data?.success) {
        setMessages((current) => [...current, makeMessage('assistant', res.data.reply)]);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'AI Assistant belum dapat menjawab. Coba lagi.');
    } finally {
      setIsSending(false);
      composerRef.current?.focus();
    }
  };

  const clearConversation = async () => {
    if (!status) return;
    const ok = await confirmDialog({ title: 'Mulai percakapan baru?', description: 'Riwayat di perangkat ini akan dihapus.', confirmLabel: 'Mulai baru', danger: true });
    if (!ok) return;
    localStorage.removeItem(`tenant-assistant:${status.tenant.id}`);
    setMessages([welcome(status.tenant.company_name)]);
    setInput('');
    composerRef.current?.focus();
  };

  const copy = async (content: string) => {
    await navigator.clipboard.writeText(content);
    toast.success('Jawaban disalin');
  };

  if (isLoading) return <div className="flex min-h-[55vh] items-center justify-center text-sm text-gray-500 dark:text-gray-400"><Loader2 className="mr-2 animate-spin" size={18} /> Menyiapkan AI Assistant…</div>;

  if (!status?.ready) {
    return <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center p-6"><section className="w-full rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-900/50 dark:bg-amber-950/20"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500 text-white"><KeyRound size={25} /></div><h1 className="mt-5 text-2xl font-black text-gray-900 dark:text-white">Masukkan API key untuk mulai</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-600 dark:text-gray-300">AI Assistant menggunakan API key OpenRouter tenant. Menyimpan key di konfigurasi tidak akan mengaktifkan balasan otomatis customer.</p><button onClick={() => navigate('/admin/chatbot')} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-bold text-white hover:bg-amber-700"><KeyRound size={16} /> Buka konfigurasi API key</button></section></div>;
  }

  return <div className="mx-auto flex h-[calc(100dvh-8.5rem)] max-w-6xl min-h-[620px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_22px_80px_-48px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-900">
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950 lg:block"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-600 text-white"><Sparkles size={19} /></div><h1 className="mt-4 text-lg font-black text-slate-900 dark:text-white">AI Assistant</h1><p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Partner kerja untuk owner dan tim {status.tenant.company_name}.</p><div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50 p-4 text-xs leading-5 text-violet-900 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-100"><p className="font-bold">Bisa bantu</p><ul className="mt-2 space-y-1 text-violet-800 dark:text-violet-200"><li>• Draft balasan customer</li><li>• SOP & checklist</li><li>• Ide konten dan kampanye</li><li>• Prioritas dan ringkasan</li></ul></div><p className="mt-5 text-[11px] leading-5 text-slate-400">Model: {status.model || '-'}. Assistant tidak mengirim pesan atau mengubah data tanpa tindakan Anda.</p></aside>
    <section className="flex min-w-0 flex-1 flex-col"><header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800"><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white lg:hidden"><Bot size={19} /></div><div className="min-w-0"><p className="truncate font-bold text-slate-900 dark:text-white">AI Assistant</p><p className="truncate text-xs text-slate-500 dark:text-slate-400">{status.tenant.company_name} · {status.model || 'OpenRouter'}</p></div></div><button onClick={clearConversation} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:border-rose-300 hover:text-rose-600 dark:border-slate-700 dark:text-slate-300"><Trash2 size={15} /> <span className="hidden sm:inline">Percakapan baru</span></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-6 dark:bg-slate-950 sm:px-7"><div className="mx-auto max-w-3xl space-y-5">{messages.map((item) => <article key={item.id} className={`group flex gap-3 ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[76%] ${item.role === 'user' ? 'rounded-br-md bg-violet-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'}`}><div className="whitespace-pre-wrap break-words">{item.content}</div>{item.role === 'assistant' && <button onClick={() => void copy(item.content)} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 opacity-0 transition group-hover:opacity-100 focus:opacity-100 hover:text-violet-600"><Copy size={12} /> Salin</button>}</div></article>)}{isSending && <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Loader2 className="animate-spin" size={16} /> Memikirkan jawaban…</div>}<div ref={endRef} /></div></div>
      <div className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="mx-auto max-w-3xl"><div className="mb-3 flex gap-2 overflow-x-auto pb-1">{SUGGESTIONS.map((suggestion) => <button key={suggestion} onClick={() => { setInput(suggestion); composerRef.current?.focus(); }} className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-left text-[11px] font-semibold text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-700 dark:text-slate-300">{suggestion}</button>)}</div><div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-500/10 dark:border-slate-700 dark:bg-slate-950"><textarea ref={composerRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={1} placeholder="Tanya atau beri instruksi…" className="min-h-[38px] max-h-36 min-w-0 flex-1 resize-y bg-transparent px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white" /><button onClick={() => void send()} disabled={!input.trim() || isSending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Kirim ke AI Assistant">{isSending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}</button></div><p className="mt-2 text-[11px] text-slate-400">Enter untuk kirim · Shift+Enter untuk baris baru · Jangan masukkan password atau rahasia.</p></div></div>
    </section>
  </div>;
}
