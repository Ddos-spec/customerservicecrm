import { useState, useMemo } from 'react';
import { UserPlus, Mail, Shield, Trash2, Edit2, X } from 'lucide-react';
import { toast } from 'sonner';
import Pagination from '../components/Pagination';

const AgentManagement = () => {
  // Mock Data - 4 slots: 1 Admin Agent + 3 User Agent
  const initialAgents = useMemo(() => [
    { id: 1, name: 'Admin Toko Maju', email: 'admin@tokomaju.com', status: 'Online', role: 'Admin Agent (Pemilik)' },
    { id: 2, name: 'Siti Aminah', email: 'siti@tokomaju.com', status: 'Online', role: 'Support Shift Pagi' },
    { id: 3, name: 'Budi Santoso', email: 'budi@tokomaju.com', status: 'Offline', role: 'Support Shift Siang' },
    { id: 4, name: 'Dewi Lestari', email: 'dewi@tokomaju.com', status: 'Offline', role: 'Support Shift Malam' },
  ], []);

  const [agents, setAgents] = useState(initialAgents);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6; // Grid 3 kolom x 2 baris

  const [isModalOpen, setIsModalOpen] = useState(false);
  const maxAgents = 4; // Limit: 1 Admin Agent + 3 User Agent

  const totalPages = Math.ceil(agents.length / itemsPerPage);
  const currentData = agents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleAddAgent = (e: any) => {
    e.preventDefault();
    if (agents.length >= maxAgents) {
      toast.error('Batas maksimum agen tercapai.');
      return;
    }
    toast.success('Undangan agen berhasil dikirim!');
    setIsModalOpen(false);
  };

  return (
    <div className="animate-in fade-in duration-500 pb-20 md:pb-0 flex flex-col min-h-[80vh]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter uppercase">Manajemen Tim</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 font-medium">Atur staf support dan peran operasional mereka.</p>
        </div>
        
        <button 
          onClick={() => setIsModalOpen(true)}
          disabled={agents.length >= maxAgents}
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-slate-800 dark:disabled:text-gray-500 text-white px-6 py-3.5 rounded-2xl transition-all shadow-xl shadow-blue-100 dark:shadow-blue-900/30 font-black uppercase tracking-widest text-xs active:scale-95"
        >
          <UserPlus size={18} />
          <span>Tambah Agen Baru</span>
        </button>
      </div>

      <div className="mb-10 bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 rounded-[2.5rem] p-8 flex flex-col md:flex-row items-center justify-between overflow-hidden relative shadow-2xl shadow-blue-100 dark:shadow-blue-900/30">
        <div className="relative z-10 text-center md:text-left mb-6 md:mb-0">
          <div className="flex items-center justify-center md:justify-start space-x-3 text-blue-100 mb-2">
            <Shield size={24} />
            <span className="font-black uppercase tracking-[0.2em] text-xs">Kapasitas Langganan</span>
          </div>
          <p className="text-blue-100/80 text-sm font-medium">Anda menggunakan {agents.length} dari {maxAgents} slot agen yang tersedia.</p>
        </div>
        <div className="relative z-10 text-5xl font-black text-white tracking-tighter">
          {agents.length} <span className="text-blue-300 text-2xl">/ {maxAgents}</span>
        </div>
        <div className="absolute -right-10 -bottom-10 text-blue-500 opacity-20 transform rotate-12"><Shield size={240} /></div>
      </div>

      <div className="flex-1">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {currentData.map((agent) => (
            <div key={agent.id} className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-slate-700 p-8 hover:shadow-2xl hover:shadow-blue-100 dark:hover:shadow-blue-900/30 transition-all group relative overflow-hidden">
              <div className="flex justify-between items-start mb-6">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-2xl font-black shadow-inner group-hover:scale-110 transition-transform">
                  {agent.name.charAt(0)}
                </div>
                <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                  agent.status === 'Online' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-gray-500'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${agent.status === 'Online' ? 'bg-green-500 animate-pulse' : 'bg-gray-400 dark:bg-gray-500'}`}></div>
                  <span>{agent.status}</span>
                </div>
              </div>
              
              <h3 className="font-black text-gray-900 dark:text-white text-xl leading-none tracking-tight">{agent.name}</h3>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase tracking-widest mt-2">{agent.role}</p>
              
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
                  onClick={() => {
                    if(confirm('Hapus agen ini?')) setAgents(agents.filter(a => a.id !== agent.id));
                  }}
                  className="p-3 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all border border-transparent hover:border-red-100 dark:hover:border-red-900/30"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
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
               <h2 className="text-2xl font-black text-gray-900 dark:text-white">Undang Agen</h2>
               <button onClick={() => setIsModalOpen(false)}><X className="text-gray-400 dark:text-gray-500" /></button>
            </div>
            <form onSubmit={handleAddAgent} className="space-y-4">
               <input required placeholder="Nama Lengkap" className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
               <input required type="email" placeholder="Email Kerja" className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
               <input required type="password" placeholder="Password Awal" className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
               <button className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-xs">Kirim Undangan</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentManagement;
