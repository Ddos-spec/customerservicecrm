import { useState } from 'react';
import { Plus, Search, MoreVertical, Building2, X, Lock, Mail, Users, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const TenantManagement = () => {
  const [tenants, setTenants] = useState([
    { id: 1, name: 'Toko Maju Jaya', adminEmail: 'admin@majujaya.com', agents: 3, status: 'Aktif' },
    { id: 2, name: 'Batik Sejahtera', adminEmail: 'contact@batik.id', agents: 1, status: 'Aktif' },
    { id: 3, name: 'Kopi Kenangan Indah', adminEmail: 'owner@kopiindah.com', agents: 2, status: 'Ditangguhkan' },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });

  const toggleDropdown = (id: number) => {
    if (activeDropdown === id) setActiveDropdown(null);
    else setActiveDropdown(id);
  };

  const handleAction = (action: string, tenant: any) => {
    setActiveDropdown(null);
    if (action === 'suspend') {
      const updatedTenants = tenants.map(t => 
        t.id === tenant.id ? { ...t, status: t.status === 'Aktif' ? 'Ditangguhkan' : 'Aktif' } : t
      );
      setTenants(updatedTenants);
      toast.success(`Tenant ${tenant.name} berhasil ${tenant.status === 'Aktif' ? 'ditangguhkan' : 'diaktifkan'}.`);
    } else if (action === 'delete') {
      if (confirm(`Apakah Anda yakin ingin menghapus ${tenant.name}?`)) {
        setTenants(tenants.filter(t => t.id !== tenant.id));
        toast.success('Tenant berhasil dihapus.');
      }
    } else {
      toast.info(`Aksi ${action} dipicu untuk ${tenant.name}`);
    }
  };

  const handleAddTenant = (e: any) => {
    e.preventDefault();
    const newTenant = {
      id: tenants.length + 1,
      name: formData.name,
      adminEmail: formData.email,
      agents: 0,
      status: 'Aktif'
    };
    setTenants([newTenant, ...tenants]);
    setIsModalOpen(false);
    toast.success('Tenant Baru berhasil dibuat!');
    setFormData({ name: '', email: '', password: '' });
  };

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Manajemen Tenant</h1>
          <p className="text-gray-500 text-sm mt-1 font-medium">Pusat kendali seluruh entitas bisnis pelanggan SaaS.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3.5 rounded-2xl transition-all shadow-xl shadow-blue-100 font-black uppercase tracking-widest text-xs active:scale-95"
        >
          <Plus size={18} />
          <span>Tambah Tenant</span>
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex items-center bg-gray-50/30">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari berdasarkan nama atau email..." 
              className="pl-12 pr-4 py-3.5 w-full bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm transition-all"
            />
          </div>
        </div>

        {/* ================= DESKTOP TABLE ================= */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-400 text-[10px] font-black uppercase tracking-[0.2em]">
              <tr>
                <th className="px-8 py-5">Nama Perusahaan</th>
                <th className="px-8 py-5">Email Admin</th>
                <th className="px-8 py-5">Kapasitas Agen</th>
                <th className="px-8 py-5">Status Layanan</th>
                <th className="px-8 py-5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-blue-50/30 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                        <Building2 size={20} />
                      </div>
                      <span className="font-black text-gray-900 text-sm tracking-tight">{tenant.name}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-sm text-gray-500 font-medium">{tenant.adminEmail}</td>
                  <td className="px-8 py-6">
                    <div className="flex items-center space-x-2">
                       <span className="text-sm font-black text-gray-700">{tenant.agents}</span>
                       <span className="text-xs text-gray-300 font-bold">/ 3</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      tenant.status === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {tenant.status}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-right relative">
                    <button 
                      onClick={() => toggleDropdown(tenant.id)}
                      className="text-gray-300 hover:text-gray-600 p-2.5 hover:bg-white hover:shadow-md rounded-xl transition-all"
                    >
                      <MoreVertical size={20} />
                    </button>

                    {activeDropdown === tenant.id && (
                      <div className="absolute right-12 top-16 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 animate-in fade-in zoom-in-95 duration-200 overflow-hidden text-left ring-1 ring-black/5">
                        <div className="py-2">
                          <button onClick={() => handleAction('edit', tenant)} className="w-full px-5 py-3 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center space-x-3 font-bold uppercase tracking-wider"><span>Edit Detail</span></button>
                          <button onClick={() => handleAction('reset', tenant)} className="w-full px-5 py-3 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center space-x-3 font-bold uppercase tracking-wider border-b border-gray-50"><span>Reset Akses</span></button>
                          <button onClick={() => handleAction('suspend', tenant)} className="w-full px-5 py-3 text-xs text-orange-600 hover:bg-orange-50 flex items-center space-x-3 font-bold uppercase tracking-wider transition-colors"><span>{tenant.status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan'}</span></button>
                          <button onClick={() => handleAction('delete', tenant)} className="w-full px-5 py-3 text-xs text-red-600 hover:bg-red-50 flex items-center space-x-3 font-bold uppercase tracking-wider transition-colors"><span>Hapus Tenant</span></button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ================= MOBILE CARD LIST ================= */}
        <div className="md:hidden grid grid-cols-1 divide-y divide-gray-100">
           {tenants.map((tenant) => (
              <div key={tenant.id} className="p-6 active:bg-gray-50 transition-colors">
                 <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center space-x-4">
                       <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                          <Building2 size={24} />
                       </div>
                       <div>
                          <h4 className="font-black text-gray-900 uppercase tracking-tight">{tenant.name}</h4>
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${
                            tenant.status === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {tenant.status}
                          </span>
                       </div>
                    </div>
                    <button onClick={() => toggleDropdown(tenant.id)} className="p-2 text-gray-400"><MoreVertical size={20}/></button>
                 </div>
                 
                 <div className="space-y-2 mb-6">
                    <div className="flex items-center text-xs text-gray-500">
                       <Mail size={14} className="mr-2 opacity-50" />
                       <span className="font-medium">{tenant.adminEmail}</span>
                    </div>
                    <div className="flex items-center text-xs text-gray-500">
                       <Users size={14} className="mr-2 opacity-50" />
                       <span className="font-medium">Agen: {tenant.agents} / 3</span>
                    </div>
                 </div>

                 {/* Mobile Action Dropdown Fix */}
                 {activeDropdown === tenant.id && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
                       <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setActiveDropdown(null)}></div>
                       <div className="relative w-full max-w-sm bg-white rounded-[2.5rem] overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
                          <div className="p-6 border-b border-gray-50 flex justify-between items-center">
                             <h5 className="font-black uppercase text-sm tracking-widest text-gray-400">Opsi Tenant</h5>
                             <button onClick={() => setActiveDropdown(null)} className="p-2 bg-gray-50 rounded-full"><X size={18}/></button>
                          </div>
                          <div className="p-4 grid grid-cols-2 gap-3">
                             <button onClick={() => handleAction('edit', tenant)} className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-3xl hover:bg-blue-50 text-blue-600 transition-all"><Plus size={24} className="mb-2"/><span className="text-[10px] font-black uppercase tracking-widest">Edit</span></button>
                             <button onClick={() => handleAction('suspend', tenant)} className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-3xl hover:bg-orange-50 text-orange-600 transition-all"><Lock size={24} className="mb-2"/><span className="text-[10px] font-black uppercase tracking-widest">Status</span></button>
                             <button onClick={() => handleAction('delete', tenant)} className="flex flex-col items-center justify-center p-4 bg-red-50 rounded-3xl col-span-2 text-red-600 transition-all"><Trash2 size={24} className="mb-2"/><span className="text-[10px] font-black uppercase tracking-widest">Hapus Tenant Permanen</span></button>
                          </div>
                       </div>
                    </div>
                 )}
              </div>
           ))}
        </div>
      </div>

      {/* MODAL: Add New Tenant */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-10 relative animate-in zoom-in-95 duration-200 border border-white/20">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-8 right-8 text-gray-400 hover:text-gray-600 transition-transform active:scale-90"><X size={28} /></button>
            
            <div className="mb-10">
              <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase leading-none">Daftar Tenant</h2>
              <p className="text-gray-500 text-sm mt-2 font-medium">Buat akun perusahaan untuk klien baru.</p>
            </div>

            <form onSubmit={handleAddTenant} className="space-y-6">
              <div className="space-y-5">
                 <div className="group">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Nama Perusahaan</label>
                    <div className="relative">
                      <Building2 className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={20} />
                      <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Toko Sukses Makmur" className="w-full pl-14 pr-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-bold transition-all shadow-inner" />
                    </div>
                 </div>

                 <div className="group">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Email Admin Utama</label>
                    <div className="relative">
                      <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={20} />
                      <input required type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} placeholder="owner@bisnis.com" className="w-full pl-14 pr-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-bold transition-all shadow-inner" />
                    </div>
                 </div>

                 <div className="group">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Kata Sandi Default</label>
                    <div className="relative">
                      <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={20} />
                      <input required type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} placeholder="••••••••" className="w-full pl-14 pr-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-bold transition-all shadow-inner" />
                    </div>
                 </div>
              </div>

              <div className="pt-8 flex flex-col sm:flex-row gap-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-gray-400 hover:bg-gray-50 rounded-2xl transition-all">Batal</button>
                <button type="submit" className="flex-[2] py-4 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl shadow-blue-100 transition-all active:scale-95">Konfirmasi & Buat Akun</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantManagement;