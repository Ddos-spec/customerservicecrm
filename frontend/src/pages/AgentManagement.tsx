import { useState, useMemo, useEffect } from 'react';
import { UserPlus, Mail, Shield, Trash2, Edit2, X, Loader2, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import Pagination from '../components/Pagination';
import api from '../lib/api';

interface AgentUser {
  id: string;
  name: string;
  email: string;
  status: string;
  role: string;
}

const AgentManagement = () => {
  const [agents, setAgents] = useState<AgentUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6; // Grid 3 kolom x 2 baris

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [seatLimit, setSeatLimit] = useState<number | null>(null);
  const [pendingInvites, setPendingInvites] = useState<number>(0);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteRecipient, setInviteRecipient] = useState({ name: '', email: '' });

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone_number: ''
  });

  const fetchAgents = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/admin/users');
      if (res.data.success) {
        setAgents(res.data.users || []);
        const parsedLimit = Number(res.data.seat_limit);
        setSeatLimit(Number.isFinite(parsedLimit) ? parsedLimit : null);
        setPendingInvites(Number(res.data.pending_invites || 0));
      }
    } catch (error) {
      console.error('Failed to fetch agents:', error);
      toast.error('Gagal memuat data staff');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchAgents();
  }, []);

  const usedSlots = agents.length + pendingInvites;
  const isAtLimit = seatLimit !== null ? usedSlots >= seatLimit : false;

  const totalPages = Math.ceil(agents.length / itemsPerPage);
  const currentData = useMemo(() => (
    agents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
  ), [agents, currentPage]);

  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAtLimit) {
      toast.error('Slot staff penuh. Hapus/aktifkan slot dulu.');
      return;
    }
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error('Semua field wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post('/admin/invites', {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone_number: formData.phone_number.trim() || undefined
      });
      if (res.data.success) {
        const token = res.data.invite?.token;
        if (token) {
          const baseUrl = `${window.location.origin}${import.meta.env.BASE_URL || '/'}`.replace(/\/+$/, '/');
          const link = `${baseUrl}invite/${token}`;
          setInviteLink(link);
          setInviteRecipient({ name: formData.name.trim(), email: formData.email.trim() });
          toast.success('Undangan berhasil dibuat');
        } else {
          toast.success('Undangan berhasil dibuat');
        }
        setFormData({ name: '', email: '', phone_number: '' });
        void fetchAgents();
      }
    } catch (error: any) {
      console.error('Failed to create agent:', error);
      toast.error(error.response?.data?.error || 'Gagal menambahkan staff');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAgent = async (agent: AgentUser) => {
    if (!confirm('Hapus staff ini?')) return;
    try {
      await api.delete(`/admin/users/${agent.id}`);
      setAgents(agents.filter((a) => a.id !== agent.id));
      toast.success('Staff berhasil dihapus');
    } catch (error: any) {
      console.error('Failed to delete agent:', error);
      toast.error(error.response?.data?.error || 'Gagal menghapus staff');
    }
  };

  return (
    <div className="animate-in fade-in duration-500 pb-20 md:pb-0 flex flex-col min-h-[80vh]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter uppercase">Manajemen Tim</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 font-medium">Atur staf support dan peran operasional mereka.</p>
        </div>
        
        <button 
          onClick={() => {
            setInviteLink('');
            setInviteRecipient({ name: '', email: '' });
            setFormData({ name: '', email: '', phone_number: '' });
            setIsModalOpen(true);
          }}
          disabled={isAtLimit}
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-slate-800 dark:disabled:text-gray-500 text-white px-6 py-3.5 rounded-2xl transition-all shadow-xl shadow-blue-100 dark:shadow-blue-900/30 font-black uppercase tracking-widest text-xs active:scale-95"
        >
          <UserPlus size={18} />
          <span>Tambah Staff Baru</span>
        </button>
      </div>

      <div className="mb-10 bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 rounded-[2.5rem] p-8 flex flex-col md:flex-row items-center justify-between overflow-hidden relative shadow-2xl shadow-blue-100 dark:shadow-blue-900/30">
        <div className="relative z-10 text-center md:text-left mb-6 md:mb-0">
          <div className="flex items-center justify-center md:justify-start space-x-3 text-blue-100 mb-2">
            <Shield size={24} />
            <span className="font-black uppercase tracking-[0.2em] text-xs">Kapasitas Langganan</span>
          </div>
          <p className="text-blue-100/80 text-sm font-medium">
            Slot terpakai: {agents.length} user aktif{pendingInvites ? ` + ${pendingInvites} undangan` : ''}{seatLimit ? ` / ${seatLimit}` : ''}.
          </p>
        </div>
        <div className="relative z-10 text-5xl font-black text-white tracking-tighter">
          {agents.length + (pendingInvites || 0)} <span className="text-blue-300 text-2xl">{seatLimit ? `/ ${seatLimit}` : ''}</span>
        </div>
        <div className="absolute -right-10 -bottom-10 text-blue-500 opacity-20 transform rotate-12"><Shield size={240} /></div>
      </div>

      <div className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {currentData.map((agent) => {
              const statusLabel = agent.status === 'active' ? 'Aktif' : 'Nonaktif';
              const roleLabel = agent.role === 'admin_agent' ? 'Owner (Pemilik)' : 'Support Staff';
              return (
                <div key={agent.id} className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-slate-700 p-8 hover:shadow-2xl hover:shadow-blue-100 dark:hover:shadow-blue-900/30 transition-all group relative overflow-hidden">
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-2xl font-black shadow-inner group-hover:scale-110 transition-transform">
                      {agent.name.charAt(0)}
                    </div>
                    <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      agent.status === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-gray-500'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${agent.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-gray-400 dark:bg-gray-500'}`}></div>
                      <span>{statusLabel}</span>
                    </div>
                  </div>
                  
                  <h3 className="font-black text-gray-900 dark:text-white text-xl leading-none tracking-tight">{agent.name}</h3>
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase tracking-widest mt-2">{roleLabel}</p>
                  
                  <div className="flex items-center space-x-3 text-gray-400 dark:text-gray-500 text-xs mt-6 bg-gray-50 dark:bg-slate-900 p-3 rounded-2xl border border-gray-100/50 dark:border-slate-700/60">
                    <Mail size={14} className="flex-shrink-0" />
                    <span className="truncate font-medium">{agent.email}</span>
                  </div>

                  <div className="flex items-center space-x-3 mt-8 pt-6 border-t border-gray-50 dark:border-slate-700">
                    <button className="flex-1 flex items-center justify-center space-x-2 py-3 bg-gray-950 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-600 transition-all active:scale-95 shadow-lg shadow-gray-200 dark:shadow-black/30">
                      <Edit2 size={14} />
                      <span>Edit</span>
                    </button>
                    <button 
                      onClick={() => handleDeleteAgent(agent)}
                      className="p-3 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all border border-transparent hover:border-red-100 dark:hover:border-red-900/30"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-auto bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
        <Pagination 
          currentPage={currentPage} 
          totalPages={totalPages} 
          onPageChange={setCurrentPage} 
          totalItems={agents.length}
          itemsPerPage={itemsPerPage}
          colorTheme="blue"
        />
      </div>

      {/* MODAL: Add New Agent */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] shadow-2xl p-10 relative">
            <div className="flex justify-between items-center mb-6">
               <h2 className="text-2xl font-black text-gray-900 dark:text-white">Undang Staff</h2>
               <button onClick={() => setIsModalOpen(false)}><X className="text-gray-400 dark:text-gray-500" /></button>
            </div>
            <form onSubmit={handleAddAgent} className="space-y-4">
               <input
                 required
                 placeholder="Nama Lengkap"
                 value={formData.name}
                 onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                 className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
               />
               <input
                 required
                 type="email"
                 placeholder="Email Kerja"
                 value={formData.email}
                 onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                 className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
               />
               <input
                 type="tel"
                 placeholder="No. WhatsApp (opsional)"
                 value={formData.phone_number}
                 onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                 className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
               />
               <button
                 disabled={isSubmitting}
                 className="w-full py-4 bg-blue-600 disabled:bg-blue-400 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center space-x-2"
               >
                 {isSubmitting && <Loader2 className="animate-spin" size={16} />}
                 <span>{isSubmitting ? 'Menyimpan...' : 'Kirim Undangan'}</span>
               </button>
            </form>
            {inviteLink && (
              <div className="mt-6 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-widest">Link Undangan</p>
                <div className="text-[11px] font-mono break-all text-gray-700 dark:text-gray-200">{inviteLink}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(inviteLink).then(() => {
                        toast.success('Link disalin');
                      }).catch(() => {
                        toast.error('Gagal menyalin link');
                      });
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-[10px] font-bold uppercase tracking-widest text-gray-700 dark:text-gray-200"
                  >
                    <Copy size={14} />
                    Salin
                  </button>
                  <button
                    onClick={() => {
                      const subject = encodeURIComponent('Undangan Akun Staff CRM');
                      const body = encodeURIComponent(`Halo ${inviteRecipient.name || ''},\n\nSilakan klik link undangan ini untuk aktivasi akun:\n${inviteLink}\n\nTerima kasih.`);
                      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(inviteRecipient.email || '')}&su=${subject}&body=${body}`, '_blank');
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest"
                  >
                    <ExternalLink size={14} />
                    Buka Gmail
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentManagement;
