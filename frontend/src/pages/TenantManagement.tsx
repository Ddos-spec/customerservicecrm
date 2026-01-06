import { useState, useMemo } from 'react';
import { Plus, Search, MoreVertical, Building2, X } from 'lucide-react';
import { toast } from 'sonner';
import Pagination from '../components/Pagination';

const TenantManagement = () => {
  // Mock Data
  const initialTenants = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    name: i === 0 ? 'Toko Maju Jaya' : i === 1 ? 'Batik Sejahtera' : `Perusahaan Demo ${i + 1}`,
    adminEmail: `admin${i+1}@demo.com`,
    agents: (i % 4) + 1, // Deterministic agents count
    status: (i % 5 === 0) ? 'Ditangguhkan' : 'Aktif' // Deterministic status
  })), []);

  const [tenants, setTenants] = useState(initialTenants);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7; // Tampilkan 7 per halaman agar pas di layar

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });

  // Filter & Pagination Logic
  const filteredTenants = tenants.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.adminEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredTenants.length / itemsPerPage);
  const currentData = filteredTenants.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const toggleDropdown = (id: number) => {
    setActiveDropdown(activeDropdown === id ? null : id);
  };

  const handleAction = (action: string, tenant: any) => {
    setActiveDropdown(null);
    if (action === 'suspend') {
      setTenants(tenants.map(t => t.id === tenant.id ? { ...t, status: t.status === 'Aktif' ? 'Ditangguhkan' : 'Aktif' } : t));
      toast.success(`Status tenant diperbarui.`);
    } else if (action === 'delete') {
      if (confirm(`Hapus ${tenant.name}?`)) {
        setTenants(tenants.filter(t => t.id !== tenant.id));
        toast.success('Tenant dihapus.');
      }
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
    toast.success('Tenant berhasil dibuat!');
    setFormData({ name: '', email: '', password: '' });
  };

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Manajemen Tenant</h1>
          <p className="text-gray-500 text-sm mt-1 font-medium">Pusat kendali seluruh entitas bisnis pelanggan SaaS.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3.5 rounded-2xl transition-all shadow-xl shadow-blue-100 font-black uppercase tracking-widest text-xs active:scale-95">
          <Plus size={18} />
          <span>Tambah Tenant</span>
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[600px]">
        <div className="p-6 border-b border-gray-50 flex items-center bg-gray-50/30">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari tenant..." 
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="pl-12 pr-4 py-3.5 w-full bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm transition-all"
            />
          </div>
        </div>

        {/* DESKTOP TABLE */}
        <div className="hidden md:block overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-400 text-[10px] font-black uppercase tracking-[0.2em]">
              <tr>
                <th className="px-8 py-5">Nama Perusahaan</th>
                <th className="px-8 py-5">Email Admin</th>
                <th className="px-8 py-5">Kapasitas</th>
                <th className="px-8 py-5">Status</th>
                <th className="px-8 py-5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {currentData.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-blue-50/30 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
                        <Building2 size={20} />
                      </div>
                      <span className="font-black text-gray-900 text-sm tracking-tight">{tenant.name}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-sm text-gray-500 font-medium">{tenant.adminEmail}</td>
                  <td className="px-8 py-6 text-sm font-black text-gray-700">{tenant.agents} / 3</td>
                  <td className="px-8 py-6">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      tenant.status === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {tenant.status}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-right relative">
                    <button onClick={() => toggleDropdown(tenant.id)} className="text-gray-300 hover:text-gray-600 p-2.5 rounded-xl transition-all">
                      <MoreVertical size={20} />
                    </button>
                    {activeDropdown === tenant.id && (
                      <div className="absolute right-12 top-16 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden text-left ring-1 ring-black/5">
                        <button onClick={() => handleAction('edit', tenant)} className="w-full px-5 py-3 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-600 font-bold uppercase tracking-wider block">Edit Detail</button>
                        <button onClick={() => handleAction('suspend', tenant)} className="w-full px-5 py-3 text-xs text-orange-600 hover:bg-orange-50 font-bold uppercase tracking-wider block">{tenant.status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan'}</button>
                        <button onClick={() => handleAction('delete', tenant)} className="w-full px-5 py-3 text-xs text-red-600 hover:bg-red-50 font-bold uppercase tracking-wider block">Hapus</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARDS */}
        <div className="md:hidden flex-1">
           {currentData.map((tenant) => (
              <div key={tenant.id} className="p-6 border-b border-gray-50 last:border-0">
                 <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center space-x-4">
                       <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center"><Building2 size={24} /></div>
                       <div>
                          <h4 className="font-black text-gray-900 uppercase tracking-tight">{tenant.name}</h4>
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${
                            tenant.status === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>{tenant.status}</span>
                       </div>
                    </div>
                    <button onClick={() => toggleDropdown(tenant.id)} className="p-2 text-gray-400"><MoreVertical size={20}/></button>
                 </div>
                 {activeDropdown === tenant.id && (
                    <div className="bg-gray-50 rounded-xl p-2 mb-4 animate-in fade-in zoom-in-95">
                       <button onClick={() => handleAction('suspend', tenant)} className="w-full p-3 text-center text-xs font-bold text-orange-600 bg-white rounded-lg mb-2 shadow-sm">Ubah Status</button>
                       <button onClick={() => handleAction('delete', tenant)} className="w-full p-3 text-center text-xs font-bold text-red-600 bg-white rounded-lg shadow-sm">Hapus</button>
                    </div>
                 )}
              </div>
           ))}
        </div>

        {/* PAGINATION */}
        <Pagination 
          currentPage={currentPage} 
          totalPages={totalPages} 
          onPageChange={setCurrentPage} 
          totalItems={filteredTenants.length}
          itemsPerPage={itemsPerPage}
          colorTheme="blue"
        />
      </div>

      {/* MODAL: Add Tenant (Sama seperti sebelumnya, disederhanakan untuk brevity) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-gray-900">Tambah Tenant</h2>
                <button onClick={() => setIsModalOpen(false)}><X className="text-gray-400" /></button>
             </div>
             <form onSubmit={handleAddTenant} className="space-y-4">
                <input required placeholder="Nama Perusahaan" className="w-full p-4 bg-gray-50 rounded-xl font-bold text-sm" onChange={(e) => setFormData({...formData, name: e.target.value})} />
                <input required type="email" placeholder="Email Admin" className="w-full p-4 bg-gray-50 rounded-xl font-bold text-sm" onChange={(e) => setFormData({...formData, email: e.target.value})} />
                <button className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-xs">Simpan</button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantManagement;