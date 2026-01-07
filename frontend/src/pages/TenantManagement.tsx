import { useState, useEffect } from 'react';
import { Plus, Search, MoreVertical, Building2, X, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import Pagination from '../components/Pagination';
import api from '../lib/api';

interface Tenant {
  id: number;
  company_name: string;
  status: string;
  user_count: string;
  created_at: string;
  session_id?: string | null;
}

interface TenantWebhook {
  id: number;
  url: string;
  created_at: string;
}

const TenantManagement = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [webhookTenant, setWebhookTenant] = useState<Tenant | null>(null);
  const [webhooks, setWebhooks] = useState<TenantWebhook[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isWebhookLoading, setIsWebhookLoading] = useState(false);
  const [isWebhookSubmitting, setIsWebhookSubmitting] = useState(false);
  const [deletingWebhookId, setDeletingWebhookId] = useState<number | null>(null);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [sessionTenant, setSessionTenant] = useState<Tenant | null>(null);
  const [sessionIdInput, setSessionIdInput] = useState('');
  const [isSessionSaving, setIsSessionSaving] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    company_name: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
    session_id: ''
  });

  // Fetch tenants from API
  const fetchTenants = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/admin/tenants');
      if (res.data.success) {
        setTenants(res.data.tenants);
      }
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
      toast.error('Gagal memuat data tenant');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  // Filter & Pagination Logic
  const filteredTenants = tenants.filter(t =>
    t.company_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredTenants.length / itemsPerPage);
  const currentData = filteredTenants.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const toggleDropdown = (id: number) => {
    setActiveDropdown(activeDropdown === id ? null : id);
  };

  const handleStatusToggle = async (tenant: Tenant) => {
    setActiveDropdown(null);
    const newStatus = tenant.status === 'active' ? 'suspended' : 'active';

    try {
      const res = await api.patch(`/admin/tenants/${tenant.id}/status`, { status: newStatus });
      if (res.data.success) {
        setTenants(tenants.map(t =>
          t.id === tenant.id ? { ...t, status: newStatus } : t
        ));
        toast.success(`Tenant ${newStatus === 'active' ? 'diaktifkan' : 'dinonaktifkan'}`);
      }
    } catch (error) {
      console.error('Failed to update tenant status:', error);
      toast.error('Gagal mengubah status tenant');
    }
  };

  const handleAddTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_name.trim()) {
      toast.error('Nama perusahaan harus diisi');
      return;
    }
    if (!formData.admin_name.trim() || !formData.admin_email.trim() || !formData.admin_password.trim()) {
      toast.error('Data Admin Agent harus lengkap');
      return;
    }
    if (formData.admin_password.trim().length < 6) {
      toast.error('Password minimal 6 karakter');
      return;
    }
    if (!formData.session_id.trim()) {
      toast.error('Session WA harus diisi');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post('/admin/tenants', {
        company_name: formData.company_name,
        admin_name: formData.admin_name,
        admin_email: formData.admin_email,
        admin_password: formData.admin_password,
        session_id: formData.session_id
      });
      if (res.data.success) {
        setTenants([res.data.tenant, ...tenants]);
        setIsModalOpen(false);
        toast.success('Tenant berhasil dibuat!');
        setFormData({
          company_name: '',
          admin_name: '',
          admin_email: '',
          admin_password: '',
          session_id: ''
        });
      }
    } catch (error: any) {
      console.error('Failed to create tenant:', error);
      toast.error(error.response?.data?.error || 'Gagal membuat tenant');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchWebhooks = async (tenantId: number) => {
    setIsWebhookLoading(true);
    try {
      const res = await api.get(`/admin/tenants/${tenantId}/webhooks`);
      if (res.data.success) {
        setWebhooks(res.data.webhooks || []);
      }
    } catch (error) {
      console.error('Failed to fetch webhooks:', error);
      toast.error('Gagal memuat webhook');
    } finally {
      setIsWebhookLoading(false);
    }
  };

  const openWebhookModal = (tenant: Tenant) => {
    setActiveDropdown(null);
    setWebhookTenant(tenant);
    setIsWebhookModalOpen(true);
    setWebhooks([]);
    setWebhookUrl('');
    setDeletingWebhookId(null);
    void fetchWebhooks(tenant.id);
  };

  const closeWebhookModal = () => {
    setIsWebhookModalOpen(false);
    setWebhookTenant(null);
    setWebhooks([]);
    setWebhookUrl('');
    setDeletingWebhookId(null);
  };

  const handleAddWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookTenant) return;
    const url = webhookUrl.trim();
    if (!url) {
      toast.error('URL webhook harus diisi');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      toast.error('URL harus diawali http:// atau https://');
      return;
    }

    setIsWebhookSubmitting(true);
    try {
      const res = await api.post(`/admin/tenants/${webhookTenant.id}/webhooks`, { url });
      if (res.data.success) {
        setWebhooks((prev) => [res.data.webhook, ...prev]);
        setWebhookUrl('');
        toast.success('Webhook berhasil ditambahkan');
      }
    } catch (error: any) {
      console.error('Failed to create webhook:', error);
      toast.error(error.response?.data?.error || 'Gagal menambahkan webhook');
    } finally {
      setIsWebhookSubmitting(false);
    }
  };

  const handleDeleteWebhook = async (webhook: TenantWebhook) => {
    if (!webhookTenant) return;
    if (!confirm('Hapus webhook ini?')) return;

    setDeletingWebhookId(webhook.id);
    try {
      await api.delete(`/admin/tenants/${webhookTenant.id}/webhooks/${webhook.id}`);
      setWebhooks((prev) => prev.filter((item) => item.id !== webhook.id));
      toast.success('Webhook berhasil dihapus');
    } catch (error) {
      console.error('Failed to delete webhook:', error);
      toast.error('Gagal menghapus webhook');
    } finally {
      setDeletingWebhookId(null);
    }
  };

  const openSessionModal = (tenant: Tenant) => {
    setActiveDropdown(null);
    setSessionTenant(tenant);
    setSessionIdInput(tenant.session_id || '');
    setIsSessionModalOpen(true);
  };

  const closeSessionModal = () => {
    setIsSessionModalOpen(false);
    setSessionTenant(null);
    setSessionIdInput('');
  };

  const handleSaveSessionId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionTenant) return;

    setIsSessionSaving(true);
    try {
      const res = await api.patch(`/admin/tenants/${sessionTenant.id}/session`, {
        session_id: sessionIdInput.trim()
      });
      if (res.data.success) {
        setTenants((prev) => prev.map((t) => (
          t.id === sessionTenant.id ? { ...t, session_id: res.data.tenant.session_id } : t
        )));
        setSessionTenant((prev) => prev ? { ...prev, session_id: res.data.tenant.session_id } : prev);
        toast.success('Session WA tersimpan');
        setIsSessionModalOpen(false);
      }
    } catch (error: any) {
      console.error('Failed to update tenant session:', error);
      toast.error(error.response?.data?.error || 'Gagal menyimpan session');
    } finally {
      setIsSessionSaving(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter uppercase">Manajemen Tenant</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 font-medium">Pusat kendali seluruh entitas bisnis pelanggan SaaS.</p>
        </div>
        <div className="flex space-x-3">
          <button onClick={fetchTenants} className="p-3.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-all">
            <RefreshCw size={18} className={`text-gray-600 dark:text-gray-300 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3.5 rounded-2xl transition-all shadow-xl shadow-blue-100 dark:shadow-blue-900/30 font-black uppercase tracking-widest text-xs active:scale-95">
            <Plus size={18} />
            <span>Tambah Tenant</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden flex flex-col min-h-[600px]">
        <div className="p-6 border-b border-gray-50 dark:border-slate-700 flex items-center bg-gray-50/30 dark:bg-slate-800/60">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Cari tenant..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="pl-12 pr-4 py-3.5 w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all"
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : (
          <>
            {/* DESKTOP TABLE */}
            <div className="hidden md:block overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/50 dark:bg-slate-800/70 border-b border-gray-100 dark:border-slate-700 text-gray-400 dark:text-gray-500 text-[10px] font-black uppercase tracking-[0.2em]">
                  <tr>
                    <th className="px-8 py-5">Nama Perusahaan</th>
                    <th className="px-8 py-5">Session WA</th>
                    <th className="px-8 py-5">Jumlah User</th>
                    <th className="px-8 py-5">Tanggal Dibuat</th>
                    <th className="px-8 py-5">Status</th>
                    <th className="px-8 py-5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                  {currentData.length > 0 ? currentData.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-blue-50/30 dark:hover:bg-slate-700/40 transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-inner">
                            <Building2 size={20} />
                          </div>
                          <span className="font-black text-gray-900 dark:text-white text-sm tracking-tight">{tenant.company_name}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-xs font-mono text-gray-600 dark:text-gray-300">
                        {tenant.session_id || '-'}
                      </td>
                      <td className="px-8 py-6 text-sm font-black text-gray-700 dark:text-gray-200">{tenant.user_count} Users</td>
                      <td className="px-8 py-6 text-sm text-gray-500 dark:text-gray-400 font-medium">
                        {new Date(tenant.created_at).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-8 py-6">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          tenant.status === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        }`}>
                          {tenant.status === 'active' ? 'Aktif' : 'Ditangguhkan'}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-right relative">
                        <button onClick={() => toggleDropdown(tenant.id)} className="text-gray-300 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-2.5 rounded-xl transition-all">
                          <MoreVertical size={20} />
                        </button>
                        {activeDropdown === tenant.id && (
                          <div className="absolute right-12 top-16 w-56 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700 z-50 overflow-hidden text-left ring-1 ring-black/5">
                            <button onClick={() => openWebhookModal(tenant)} className="w-full px-5 py-3 text-xs text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-bold uppercase tracking-wider block">
                              Kelola Webhook
                            </button>
                            <button onClick={() => openSessionModal(tenant)} className="w-full px-5 py-3 text-xs text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 font-bold uppercase tracking-wider block">
                              Atur Session WA
                            </button>
                            <button onClick={() => handleStatusToggle(tenant)} className="w-full px-5 py-3 text-xs text-orange-600 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20 font-bold uppercase tracking-wider block">
                              {tenant.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="px-8 py-16 text-center text-gray-400 dark:text-gray-500">
                        {searchTerm ? 'Tidak ada tenant yang cocok dengan pencarian.' : 'Belum ada tenant. Klik "Tambah Tenant" untuk membuat.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARDS */}
            <div className="md:hidden flex-1">
               {currentData.length > 0 ? currentData.map((tenant) => (
                  <div key={tenant.id} className="p-6 border-b border-gray-50 dark:border-slate-700 last:border-0">
                     <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center space-x-4">
                           <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center"><Building2 size={24} /></div>
                           <div>
                              <h4 className="font-black text-gray-900 dark:text-white uppercase tracking-tight">{tenant.company_name}</h4>
                              <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${
                                tenant.status === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                              }`}>{tenant.status === 'active' ? 'Aktif' : 'Ditangguhkan'}</span>
                           </div>
                        </div>
                        <button onClick={() => toggleDropdown(tenant.id)} className="p-2 text-gray-400 dark:text-gray-500"><MoreVertical size={20}/></button>
                     </div>
                     <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">{tenant.user_count} Users</div>
                     <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-mono">Session WA: {tenant.session_id || '-'}</div>
                     {activeDropdown === tenant.id && (
                        <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-2 mb-4 animate-in fade-in zoom-in-95">
                           <button onClick={() => openWebhookModal(tenant)} className="w-full p-3 text-center text-xs font-bold text-blue-600 dark:text-blue-300 bg-white dark:bg-slate-900 rounded-lg shadow-sm mb-2">
                             Kelola Webhook
                           </button>
                           <button onClick={() => openSessionModal(tenant)} className="w-full p-3 text-center text-xs font-bold text-emerald-600 dark:text-emerald-300 bg-white dark:bg-slate-900 rounded-lg shadow-sm mb-2">
                             Atur Session WA
                           </button>
                           <button onClick={() => handleStatusToggle(tenant)} className="w-full p-3 text-center text-xs font-bold text-orange-600 dark:text-orange-300 bg-white dark:bg-slate-900 rounded-lg shadow-sm">
                             {tenant.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                           </button>
                        </div>
                     )}
                  </div>
               )) : (
                 <div className="p-8 text-center text-gray-400 dark:text-gray-500">
                   Belum ada tenant.
                 </div>
               )}
            </div>

            {/* PAGINATION */}
            {filteredTenants.length > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                totalItems={filteredTenants.length}
                itemsPerPage={itemsPerPage}
                colorTheme="blue"
              />
            )}
          </>
        )}
      </div>

      {/* MODAL: Add Tenant */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl p-8">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white">Tambah Tenant</h2>
                <button onClick={() => setIsModalOpen(false)}><X className="text-gray-400 dark:text-gray-500" /></button>
             </div>
             <form onSubmit={handleAddTenant} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Nama Perusahaan</label>
                  <input
                    required
                    placeholder="Contoh: Toko Maju Jaya"
                    value={formData.company_name}
                    className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    onChange={(e) => setFormData({...formData, company_name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Nama Admin Agent</label>
                  <input
                    required
                    placeholder="Contoh: Admin Toko"
                    value={formData.admin_name}
                    className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    onChange={(e) => setFormData({...formData, admin_name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Email Admin Agent (Username)</label>
                  <input
                    required
                    type="email"
                    placeholder="admin@tokomaju.com"
                    value={formData.admin_email}
                    className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    onChange={(e) => setFormData({...formData, admin_email: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Password Admin Agent</label>
                  <input
                    required
                    type="password"
                    placeholder="Minimal 6 karakter"
                    value={formData.admin_password}
                    className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    onChange={(e) => setFormData({...formData, admin_password: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Session WA (Nomor)</label>
                  <input
                    required
                    placeholder="Contoh: 628123456789"
                    value={formData.session_id}
                    className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    onChange={(e) => setFormData({...formData, session_id: e.target.value})}
                  />
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Admin Agent dibuat otomatis. Login menggunakan email sebagai username.
                </p>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center space-x-2 transition-all"
                >
                  {isSubmitting && <Loader2 className="animate-spin" size={16} />}
                  <span>{isSubmitting ? 'Menyimpan...' : 'Simpan'}</span>
                </button>
             </form>
          </div>
        </div>
      )}

      {/* MODAL: Tenant Webhooks */}
      {isWebhookModalOpen && webhookTenant && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white">Webhook Tenant</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{webhookTenant.company_name}</p>
              </div>
              <button onClick={closeWebhookModal}><X className="text-gray-400 dark:text-gray-500" /></button>
            </div>

            <form onSubmit={handleAddWebhook} className="space-y-3">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tambah Webhook</label>
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  required
                  placeholder="https://example.com/webhook"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="flex-1 p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={isWebhookSubmitting}
                  className="px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center space-x-2 transition-all"
                >
                  {isWebhookSubmitting && <Loader2 className="animate-spin" size={16} />}
                  <span>{isWebhookSubmitting ? 'Menyimpan...' : 'Tambah'}</span>
                </button>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">Satu tenant bisa punya banyak webhook.</p>
            </form>

            <div className="mt-6">
              <h3 className="text-sm font-black text-gray-900 dark:text-white mb-3">Daftar Webhook</h3>
              {isWebhookLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="animate-spin text-blue-600" size={24} />
                </div>
              ) : (
                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {webhooks.length > 0 ? webhooks.map((webhook) => (
                    <div key={webhook.id} className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700">
                      <div className="text-xs font-mono text-gray-800 dark:text-gray-200 break-all">{webhook.url}</div>
                      <button
                        onClick={() => handleDeleteWebhook(webhook)}
                        disabled={deletingWebhookId === webhook.id}
                        className="text-gray-400 hover:text-rose-600 dark:text-gray-500 dark:hover:text-rose-400 transition-colors"
                        title="Hapus webhook"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )) : (
                    <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                      Belum ada webhook.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Tenant Session */}
      {isSessionModalOpen && sessionTenant && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white">Session WA Tenant</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sessionTenant.company_name}</p>
              </div>
              <button onClick={closeSessionModal}><X className="text-gray-400 dark:text-gray-500" /></button>
            </div>

            <form onSubmit={handleSaveSessionId} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Session ID / Nomor WA</label>
                <input
                  placeholder="Contoh: 628123456789"
                  value={sessionIdInput}
                  onChange={(e) => setSessionIdInput(e.target.value)}
                  className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Kosongkan untuk melepas session dari tenant ini.
              </p>
              <button
                type="submit"
                disabled={isSessionSaving}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center space-x-2 transition-all"
              >
                {isSessionSaving && <Loader2 className="animate-spin" size={16} />}
                <span>{isSessionSaving ? 'Menyimpan...' : 'Simpan'}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantManagement;
