import { useState } from 'react';
import { UserPlus, Mail, Shield, Trash2, Edit2, X, Lock } from 'lucide-react';
import { toast } from 'sonner';

const AgentManagement = () => {
  const [agents, setAgents] = useState([
    { id: 1, name: 'Budi Santoso', email: 'budi@tokomaju.com', status: 'Online', role: 'Support Shift Pagi' },
    { id: 2, name: 'Siti Aminah', email: 'siti@tokomaju.com', status: 'Offline', role: 'Support Shift Siang' },
    { id: 3, name: 'Rudi Hermawan', email: 'rudi@tokomaju.com', status: 'Offline', role: 'Support Shift Malam' },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const maxAgents = 3;

  const handleAddAgent = (e: any) => {
    e.preventDefault();
    if (agents.length >= maxAgents) {
      toast.error('Anda telah mencapai batas maksimum 3 agen.');
      return;
    }
    toast.success('Undangan agen berhasil dikirim!');
    setIsModalOpen(false);
  };

  return (
    <div className="animate-in fade-in duration-500 pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Manajemen Tim</h1>
          <p className="text-gray-500 text-sm mt-1 font-medium">Atur staf support dan peran operasional mereka.</p>
        </div>
        
        <button 
          onClick={() => setIsModalOpen(true)}
          disabled={agents.length >= maxAgents}
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white px-6 py-3.5 rounded-2xl transition-all shadow-xl shadow-blue-100 font-black uppercase tracking-widest text-xs active:scale-95"
        >
          <UserPlus size={18} />
          <span>Tambah Agen Baru</span>
        </button>
      </div>

      <div className="mb-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-[2.5rem] p-8 flex flex-col md:flex-row items-center justify-between overflow-hidden relative shadow-2xl shadow-blue-100">
        <div className="relative z-10 text-center md:text-left mb-6 md:mb-0">
          <div className="flex items-center justify-center md:justify-start space-x-3 text-blue-100 mb-2">
            <Shield size={24} />
            <span className="font-black uppercase tracking-[0.2em] text-xs">Kapasitas Langganan</span>
          </div>
          <p className="text-blue-100/80 text-sm font-medium">Anda menggunakan {agents.length} dari {maxAgents} slot agen yang tersedia di paket ini.</p>
        </div>
        <div className="relative z-10 text-5xl font-black text-white tracking-tighter">
          {agents.length} <span className="text-blue-300 text-2xl">/ {maxAgents}</span>
        </div>
        <div className="absolute -right-10 -bottom-10 text-blue-500 opacity-20 transform rotate-12"><Shield size={240} /></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agents.map((agent) => (
          <div key={agent.id} className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-8 hover:shadow-2xl hover:shadow-blue-100 transition-all group relative overflow-hidden">
            <div className="flex justify-between items-start mb-6">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl font-black shadow-inner group-hover:scale-110 transition-transform">
                {agent.name.charAt(0)}
              </div>
              <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                agent.status === 'Online' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${agent.status === 'Online' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                <span>{agent.status}</span>
              </div>
            </div>
            
            <h3 className="font-black text-gray-900 text-xl leading-none tracking-tight">{agent.name}</h3>
            <p className="text-xs text-blue-600 font-bold uppercase tracking-widest mt-2">{agent.role}</p>
            
            <div className="flex items-center space-x-3 text-gray-400 text-xs mt-6 bg-gray-50 p-3 rounded-2xl border border-gray-100/50">
              <Mail size={14} className="flex-shrink-0" />
              <span className="truncate font-medium">{agent.email}</span>
            </div>

            <div className="flex items-center space-x-3 mt-8 pt-6 border-t border-gray-50">
              <button className="flex-1 flex items-center justify-center space-x-2 py-3 bg-gray-950 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-600 transition-all active:scale-95 shadow-lg shadow-gray-200">
                <Edit2 size={14} />
                <span>Edit Profil</span>
              </button>
              <button 
                onClick={() => {
                   if(confirm('Hapus agen ini?')) {
                      setAgents(agents.filter(a => a.id !== agent.id));
                      toast.success('Agen telah dihapus');
                   }
                }}
                className="p-3 text-red-400 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}

        {/* Action placeholder for mobile bottom reach */}
        <div className="md:hidden h-4"></div>
      </div>

      {/* MODAL: Add New Agent */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-10 relative animate-in zoom-in-95 duration-200 border border-white/20">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-8 right-8 text-gray-400 hover:text-gray-600 transition-transform active:scale-90"><X size={28} /></button>
            
            <div className="mb-10">
              <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase leading-none">Undang Agen</h2>
              <p className="text-gray-500 text-sm mt-2 font-medium">Tambahkan anggota tim baru ke workspace Anda.</p>
            </div>

            <form onSubmit={handleAddAgent} className="space-y-6">
              <div className="space-y-5">
                <div className="group">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Nama Lengkap Agen</label>
                  <div className="relative">
                    <UserPlus className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={20} />
                    <input required type="text" placeholder="Budi Santoso" className="w-full pl-14 pr-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-bold transition-all shadow-inner" />
                  </div>
                </div>
                <div className="group">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Email Kerja</label>
                  <div className="relative">
                    <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={20} />
                    <input required type="email" placeholder="budi@tokomaju.com" className="w-full pl-14 pr-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-bold transition-all shadow-inner" />
                  </div>
                </div>
                <div className="group relative">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Kata Sandi Awal</label>
                  <div className="relative">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={20} />
                    <input required type="password" placeholder="••••••••" className="w-full pl-14 pr-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-bold transition-all shadow-inner" />
                  </div>
                </div>
              </div>

              <div className="pt-8 flex flex-col sm:flex-row gap-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-gray-400 hover:bg-gray-50 rounded-2xl transition-all">Batal</button>
                <button type="submit" className="flex-[2] py-4 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl shadow-blue-100 transition-all active:scale-95">Kirim Undangan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentManagement;