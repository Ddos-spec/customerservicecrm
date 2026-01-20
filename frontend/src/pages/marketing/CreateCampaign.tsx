import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Layers3, SendHorizontal, Smartphone, Clock, Info } from 'lucide-react';
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
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

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

  // --- Logic Variable Picker ---
  const insertVariable = (variable: string) => {
    if (!textAreaRef.current) return;
    
    const start = textAreaRef.current.selectionStart;
    const end = textAreaRef.current.selectionEnd;
    const text = messageTemplate;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    
    const newText = before + variable + after;
    setMessageTemplate(newText);
    
    // Restore focus and cursor position
    setTimeout(() => {
        if (textAreaRef.current) {
            textAreaRef.current.focus();
            textAreaRef.current.setSelectionRange(start + variable.length, start + variable.length);
        }
    }, 0);
  };

  // --- Logic Estimasi ---
  const totalTargets = useMemo(() => {
    return groups
        .filter(g => selectedGroupIds.includes(g.id))
        .reduce((acc, curr) => acc + Number(curr.member_count || 0), 0);
  }, [groups, selectedGroupIds]);

  const estimatedTimeMinutes = Math.ceil(totalTargets / 50); // 50 msg/min rate limit

  // --- Logic Formatting Preview ---
  const formatMessageForPreview = (text: string) => {
    if (!text) return <span className="text-gray-400 italic">Pratinjau pesan...</span>;
    
    // Simple formatter for newlines and basic bold *text*
    // Note: This is a basic visualizer, not a full markdown parser
    return text.split('\n').map((line, i) => (
        <div key={i} className="min-h-[1.2em]">
            {line.split(/(\*.\*? \*)/g).map((part, j) => {
                if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
                    return <strong key={j}>{part.slice(1, -1)}</strong>;
                }
                // Highlight variables
                if (part.includes('{{') && part.includes('}}')) {
                    return part.split(/(\{\{.*?\}\})/g).map((sub, k) => (
                        sub.startsWith('{{') ? <span key={k} className="text-blue-600 font-semibold bg-blue-50 rounded px-1">{sub}</span> : sub
                    ));
                }
                return part;
            })}
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
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Buat Campaign</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Susun pesan promosi dan jadwalkan pengiriman otomatis.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* LEFT COLUMN: FORM */}
        <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 space-y-6">
                {/* Campaign Info */}
                <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Nama Campaign</label>
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="Contoh: Promo Gajian Januari"
                />
                </div>

                {/* Message Editor */}
                <div className="space-y-2">
                    <div className="flex justify-between items-end">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Pesan</label>
                        <div className="flex gap-2">
                            <button onClick={() => insertVariable('{{full_name}}')} className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-2 py-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
                                + Nama
                            </button>
                            <button onClick={() => insertVariable('{{phone_number}}')} className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-2 py-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
                                + No. HP
                            </button>
                        </div>
                    </div>
                    <textarea
                        ref={textAreaRef}
                        value={messageTemplate}
                        onChange={(e) => setMessageTemplate(e.target.value)}
                        className="w-full min-h-[200px] px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono text-sm"
                        placeholder="Halo {{full_name}}, kami ada promo spesial..."
                    />
                    <p className="text-xs text-gray-400">
                        Tips: Gunakan <strong>*teks tebal*</strong> untuk menebalkan huruf.
                    </p>
                </div>

                {/* Schedule */}
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
                <p className="text-xs text-gray-400">Kosongkan untuk kirim sekarang (Immediate Blast).</p>
                </div>
            </div>

            {/* Target Selection */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                        <Layers3 size={18} />
                        <h2 className="text-lg font-bold">Target Penerima</h2>
                    </div>
                    {totalTargets > 0 && (
                        <span className="text-sm font-semibold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full">
                            {totalTargets} Kontak
                        </span>
                    )}
                </div>
                
                {groups.length === 0 && (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
                    Belum ada group kontak. <br/>
                    <span onClick={() => navigate('/admin/marketing/groups')} className="text-blue-600 cursor-pointer hover:underline">Buat group sekarang</span>
                </div>
                )}

                <div className="grid grid-cols-1 gap-3 max-h-[300px] overflow-y-auto pr-2">
                {groups.map((group) => (
                    <label
                    key={group.id}
                    className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${selectedGroupIds.includes(group.id)
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
                    }`}
                    >
                    <input
                        type="checkbox"
                        className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        checked={selectedGroupIds.includes(group.id)}
                        onChange={() => toggleGroup(group.id)}
                    />
                    <div className="flex-1">
                        <div className="flex justify-between items-center">
                            <span className="font-semibold text-gray-900 dark:text-white">{group.name}</span>
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                                {group.member_count || 0}
                            </span>
                        </div>
                        {group.description && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{group.description}</div>
                        )}
                    </div>
                    </label>
                ))}
                </div>
            </div>
        </div>

        {/* RIGHT COLUMN: PREVIEW & SUBMIT */}
        <div className="space-y-6 lg:sticky lg:top-24">
            {/* Phone Preview */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-6">
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Smartphone size={16} /> Live Preview
                </h3>
                
                {/* Mockup Container */}
                <div className="relative mx-auto border-gray-800 dark:border-gray-800 bg-gray-800 border-[10px] rounded-[2.5rem] h-[500px] w-[300px] shadow-xl overflow-hidden">
                    <div className="h-[32px] w-[3px] bg-gray-800 absolute -left-[14px] top-[72px] rounded-l-lg"></div>
                    <div className="h-[46px] w-[3px] bg-gray-800 absolute -left-[14px] top-[124px] rounded-l-lg"></div>
                    <div className="h-[64px] w-[3px] bg-gray-800 absolute -right-[14px] top-[142px] rounded-r-lg"></div>
                    <div className="rounded-[2rem] overflow-hidden w-full h-full bg-[#E5DDD5] dark:bg-[#111b21] relative flex flex-col">
                        
                        {/* WhatsApp Header Mockup */}
                        <div className="bg-[#008069] dark:bg-[#202c33] p-3 flex items-center gap-2 shadow-sm z-10 text-white">
                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs">A</div>
                            <div className="flex-1">
                                <div className="text-sm font-bold leading-none">Pelanggan</div>
                            </div>
                        </div>

                        {/* Chat Area */}
                        <div className="flex-1 p-3 overflow-y-auto bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat opacity-90">
                            <div className="flex flex-col gap-2">
                                <div className="self-end bg-[#d9fdd3] dark:bg-[#005c4b] p-2 rounded-lg rounded-tr-none shadow-sm max-w-[85%] text-sm text-gray-900 dark:text-white break-words whitespace-pre-wrap">
                                    {formatMessageForPreview(messageTemplate)}
                                    <div className="text-[10px] text-gray-500 dark:text-gray-400 text-right mt-1 flex items-center justify-end gap-1">
                                        12:00 <span className="text-blue-500">✓✓</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Input Mockup */}
                        <div className="bg-[#f0f2f5] dark:bg-[#202c33] p-2 flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                            <div className="flex-1 h-8 bg-white dark:bg-gray-700 rounded-full"></div>
                        </div>
                    </div>
                </div>

                {/* Estimation Info */}
                <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl flex items-start gap-3">
                    <Info className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" size={18} />
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                        <p className="font-bold mb-1">Estimasi Pengiriman</p>
                        <p>Total Kontak: <strong>{totalTargets}</strong></p>
                        <p>Kecepatan: <strong>~50 pesan/menit</strong></p>
                        <p className="mt-2 text-blue-700 dark:text-blue-300 font-semibold flex items-center gap-1">
                            <Clock size={14} /> 
                            Waktu Selesai: {estimatedTimeMinutes > 0 ? `~${estimatedTimeMinutes} menit` : '< 1 menit'}
                        </p>
                    </div>
                </div>
            </div>

            <button
                onClick={handleSubmit}
                disabled={isSubmitting || totalTargets === 0}
                className="w-full px-6 py-4 rounded-xl bg-green-600 text-white font-bold text-lg hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-green-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
                <SendHorizontal size={20} />
                {isSubmitting ? 'Memproses...' : scheduledAt ? 'Jadwalkan Campaign' : 'Kirim Sekarang'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default CreateCampaign;