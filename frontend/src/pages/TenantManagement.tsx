import { useState, useEffect } from 'react';
import { Plus, Search, MoreVertical, Building2, X, Loader2, RefreshCw, Copy } from 'lucide-react';
import { toast } from 'sonner';
import Pagination from '../components/Pagination';
import api from '../lib/api';
import { useAuthStore } from '../store/useAuthStore';

interface Tenant {
  id: number;
  company_name: string;
  status: string;
  user_count: string;
  created_at: string;
  session_id?: string | null;
  gateway_url?: string | null;
  api_key?: string | null;
  wa_provider?: 'whatsmeow' | 'meta' | null;
  meta_phone_id?: string | null;
  meta_waba_id?: string | null;
  meta_token?: string | null;
  analysis_webhook_url?: string | null;
  business_category?: string | null;
  webhook_events?: {
    groups: boolean;
    private: boolean;
    self: boolean;
  } | null;
}

interface AdminUser {
  id: number;
  name: string;
  email: string;
  phone_number?: string;
  role: string;
}

interface TenantWebhook {
  id: string;
  url: string;
  created_at?: string;
}

const TenantManagement = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;
  const apiUrl = import.meta.env.VITE_API_URL || window.location.origin + '/api/v1';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Session & Integration State
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [sessionTenant, setSessionTenant] = useState<Tenant | null>(null);
  const [waProvider, setWaProvider] = useState<'whatsmeow' | 'meta'>('whatsmeow');
  const [sessionIdInput, setSessionIdInput] = useState('');
  const [gatewayUrlInput, setGatewayUrlInput] = useState('');
  const [metaPhoneId, setMetaPhoneId] = useState('');
  const [metaWabaId, setMetaWabaId] = useState('');
  const [metaToken, setMetaToken] = useState('');
  const [businessCategory, setBusinessCategory] = useState('general');
  const [webhookEvents, setWebhookEvents] = useState({
    groups: true,
    private: true,
    self: false
  });
  const [isSessionSaving, setIsSessionSaving] = useState(false);
  
  // Advanced Tools State
  const [tenantApiKey, setTenantApiKey] = useState<string | null>(null);
  const [showTenantApiKey, setShowTenantApiKey] = useState(false);
  const [isTenantApiKeyRegenerating, setIsTenantApiKeyRegenerating] = useState(false);
  const [tenantWebhookUrl, setTenantWebhookUrl] = useState('');
  const [tenantWebhooks, setTenantWebhooks] = useState<TenantWebhook[]>([]);
  const [isTenantWebhookLoading, setIsTenantWebhookLoading] = useState(false);
  const [isTenantWebhookSaving, setIsTenantWebhookSaving] = useState(false);
  const [tenantWebhookDeletingId, setTenantWebhookDeletingId] = useState<string | null>(null);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isFixingContacts, setIsFixingContacts] = useState(false);
  const [analysisWebhookUrl, setAnalysisWebhookUrl] = useState('');
  const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);
  const [isAnalysisResultOpen, setIsAnalysisResultOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<unknown>(null);
  const [analysisError, setAnalysisError] = useState('');
  
  // Admin Management State
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [adminFormData, setAdminFormData] = useState({
      name: '',
      email: '',
      password: '',
      phone_number: ''
  });
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [isAdminSubmitting, setIsAdminSubmitting] = useState(false);
  const [showEditAdminPassword, setShowEditAdminPassword] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    company_name: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
    admin_phone_number: '',
    session_id: '',
    gateway_url: '',
    business_category: 'general'
  });
  const [showAdminPassword, setShowAdminPassword] = useState(false);

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

  const handleDeleteTenant = async (tenant: Tenant) => {
    setActiveDropdown(null);
    if (!confirm(`Yakin ingin menghapus tenant "${tenant.company_name}"? Semua data user dan chat akan hilang permanen.`)) {
        return;
    }

    try {
        const res = await api.delete(`/admin/tenants/${tenant.id}`);
        if (res.data.success) {
            setTenants(tenants.filter(t => t.id !== tenant.id));
            toast.success('Tenant berhasil dihapus');
        }
    } catch (error: any) {
        console.error('Failed to delete tenant:', error);
        toast.error(error.response?.data?.error || 'Gagal menghapus tenant');
    }
  };

  const handleAddTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_name.trim()) {
      toast.error('Nama perusahaan harus diisi');
      return;
    }
    if (!formData.admin_name.trim() || !formData.admin_email.trim() || !formData.admin_password.trim()) {
      toast.error('Data Owner harus lengkap');
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
    if (formData.gateway_url.trim() && !/^https?:\/\//i.test(formData.gateway_url.trim())) {
      toast.error('Gateway URL harus diawali http:// atau https://');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post('/admin/tenants', {
        company_name: formData.company_name,
        admin_name: formData.admin_name,
        admin_email: formData.admin_email,
        admin_password: formData.admin_password,
        admin_phone_number: formData.admin_phone_number,
        session_id: formData.session_id,
        gateway_url: formData.gateway_url.trim(),
        business_category: formData.business_category
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
          admin_phone_number: '',
          session_id: '',
          gateway_url: '',
          business_category: 'general'
        });
      }
    } catch (error: any) {
      console.error('Failed to create tenant:', error);
      toast.error(error.response?.data?.error || 'Gagal membuat tenant');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyTenantApiKey = async () => {
    if (!tenantApiKey) return;
    await navigator.clipboard.writeText(tenantApiKey);
    toast.success('API key disalin');
  };

  const handleRegenerateTenantApiKey = async () => {
    if (!sessionTenant) return;
    if (!confirm(`Regenerate API key untuk ${sessionTenant.company_name}?`)) return;

    setIsTenantApiKeyRegenerating(true);
    try {
      const res = await api.post(`/admin/tenants/${sessionTenant.id}/regenerate-key`);
      if (res.data?.success) {
        setTenantApiKey(res.data.api_key || null);
        setShowTenantApiKey(true);
        setTenants((prev) => prev.map((t) => (
          t.id === sessionTenant.id ? { ...t, api_key: res.data.api_key } : t
        )));
        setSessionTenant((prev) => prev ? { ...prev, api_key: res.data.api_key } : prev);
        toast.success('API key diperbarui');
      }
    } catch (error: any) {
      console.error('Failed to regenerate API key:', error);
      toast.error(error.response?.data?.error || 'Gagal regenerate API key');
    } finally {
      setIsTenantApiKeyRegenerating(false);
    }
  };

  const fetchTenantWebhooks = async (tenantId: number) => {
    setIsTenantWebhookLoading(true);
    try {
      const res = await api.get(`/admin/tenants/${tenantId}/webhooks`);
      if (res.data?.success) {
        setTenantWebhooks(res.data.webhooks || []);
      }
    } catch (error: any) {
      console.error('Failed to fetch tenant webhooks:', error);
      toast.error(error.response?.data?.error || 'Gagal memuat webhook tenant');
    } finally {
      setIsTenantWebhookLoading(false);
    }
  };

  const handleAddTenantWebhook = async () => {
    if (!sessionTenant) return;
    const url = tenantWebhookUrl.trim();
    if (!url) {
      toast.error('URL webhook wajib diisi');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      toast.error('Webhook URL harus diawali http:// atau https://');
      return;
    }
    setIsTenantWebhookSaving(true);
    try {
      const res = await api.post(`/admin/tenants/${sessionTenant.id}/webhooks`, { url });
      if (res.data?.success) {
        setTenantWebhooks((prev) => [res.data.webhook, ...prev]);
        setTenantWebhookUrl('');
        toast.success('Webhook tenant tersimpan');
      }
    } catch (error: any) {
      console.error('Failed to save tenant webhook:', error);
      toast.error(error.response?.data?.error || 'Gagal menyimpan webhook tenant');
    } finally {
      setIsTenantWebhookSaving(false);
    }
  };

  const handleDeleteTenantWebhook = async (webhookId: string) => {
    if (!sessionTenant) return;
    if (!confirm('Hapus webhook tenant ini?')) return;
    setTenantWebhookDeletingId(webhookId);
    try {
      const res = await api.delete(`/admin/tenants/${sessionTenant.id}/webhooks/${webhookId}`);
      if (res.data?.success) {
        setTenantWebhooks((prev) => prev.filter((wh) => wh.id !== webhookId));
        toast.success('Webhook tenant dihapus');
      }
    } catch (error: any) {
      console.error('Failed to delete tenant webhook:', error);
      toast.error(error.response?.data?.error || 'Gagal menghapus webhook tenant');
    } finally {
      setTenantWebhookDeletingId(null);
    }
  };

  const handleManualSync = async () => {
    if (!sessionTenant) return;
    setIsManualSyncing(true);
    try {
      const res = await api.post('/sync/contacts', { tenant_id: sessionTenant.id });
      if (res.data?.status === 'success') {
        const details = res.data.details;
        const note = details ? ` (${details.contacts} kontak, ${details.groups} grup)` : '';
        toast.success(`Sync selesai${note}`);
      }
    } catch (error: any) {
      console.error('Failed to sync contacts:', error);
      toast.error(error.response?.data?.message || 'Gagal sync kontak');
    } finally {
      setIsManualSyncing(false);
    }
  };

  const handleFixContacts = async () => {
    if (!confirm('Jalankan fix-contacts global?')) return;
    setIsFixingContacts(true);
    try {
      const res = await api.post('/admin/fix-contacts');
      if (res.data?.success) {
        toast.success(res.data.message || 'Fix contacts selesai');
      }
    } catch (error: any) {
      console.error('Failed to fix contacts:', error);
      toast.error(error.response?.data?.error || 'Gagal fix contacts');
    } finally {
      setIsFixingContacts(false);
    }
  };

  const openSessionModal = (tenant: Tenant) => {
    setActiveDropdown(null);
    setSessionTenant(tenant);
    setWaProvider(tenant.wa_provider || 'whatsmeow');
    setSessionIdInput(tenant.session_id || '');
    setGatewayUrlInput(tenant.gateway_url || '');
    setMetaPhoneId(tenant.meta_phone_id || '');
    setMetaWabaId(tenant.meta_waba_id || '');
    setMetaToken(tenant.meta_token || '');
    setBusinessCategory(tenant.business_category || 'general');
    setAnalysisWebhookUrl(tenant.analysis_webhook_url || '');
    setWebhookEvents(tenant.webhook_events || {
        groups: true,
        private: true,
        self: false
    });
    
    setTenantApiKey(tenant.api_key || null);
    setShowTenantApiKey(false);
    setTenantWebhookUrl('');
    setTenantWebhooks([]);
    setIsTenantWebhookLoading(false);
    setIsTenantWebhookSaving(false);
    setTenantWebhookDeletingId(null);
    setIsAnalysisRunning(false);
    setIsAnalysisResultOpen(false);
    setAnalysisResult(null);
    setAnalysisError('');
    setIsSessionModalOpen(true);
    void fetchTenantWebhooks(tenant.id);
  };

  const closeSessionModal = () => {
    setIsSessionModalOpen(false);
    setSessionTenant(null);
    setWaProvider('whatsmeow');
    setSessionIdInput('');
    setGatewayUrlInput('');
    setMetaPhoneId('');
    setMetaWabaId('');
    setMetaToken('');
    setAnalysisWebhookUrl('');
    
    setTenantApiKey(null);
    setShowTenantApiKey(false);
    setTenantWebhookUrl('');
    setTenantWebhooks([]);
    setIsTenantWebhookLoading(false);
    setIsTenantWebhookSaving(false);
    setTenantWebhookDeletingId(null);
    setIsAnalysisRunning(false);
    setIsAnalysisResultOpen(false);
    setAnalysisResult(null);
    setAnalysisError('');
  };

  const handleSaveSessionId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionTenant) return;

    if (waProvider === 'whatsmeow') {
        if (gatewayUrlInput.trim() && !/^https?:\/\//i.test(gatewayUrlInput.trim())) {
            toast.error('Gateway URL harus diawali http:// atau https://');
            return;
        }
    } else {
        if (!metaPhoneId.trim() || !metaToken.trim()) {
            toast.error('Phone ID dan Token wajib diisi untuk Meta API');
            return;
        }
    }

    const webhookUrlTrimmed = analysisWebhookUrl.trim();
    if (webhookUrlTrimmed && !/^https?:\/\//i.test(webhookUrlTrimmed)) {
      toast.error('Webhook analisis harus diawali http:// atau https://');
      return;
    }

    setIsSessionSaving(true);
    try {
      const payload: any = {
        wa_provider: waProvider,
        business_category: businessCategory,
        webhook_events: webhookEvents,
        api_key: tenantApiKey ? tenantApiKey.trim() : undefined,
        analysis_webhook_url: webhookUrlTrimmed || null
      };

      if (waProvider === 'whatsmeow') {
          payload.session_id = sessionIdInput.trim();
          payload.gateway_url = gatewayUrlInput.trim();
      } else {
          payload.meta_phone_id = metaPhoneId.trim();
          payload.meta_waba_id = metaWabaId.trim();
          payload.meta_token = metaToken.trim();
      }

      const res = await api.patch(`/admin/tenants/${sessionTenant.id}/session`, payload);
      
      if (res.data.success) {
        const updated = res.data.tenant;
        setTenants((prev) => prev.map((t) => (
          t.id === sessionTenant.id ? { 
              ...t, 
              session_id: updated.session_id, 
              gateway_url: updated.gateway_url,
              wa_provider: updated.wa_provider,
              meta_phone_id: updated.meta_phone_id,
              meta_waba_id: updated.meta_waba_id,
              meta_token: updated.meta_token,
              api_key: updated.api_key,
              business_category: updated.business_category,
              analysis_webhook_url: updated.analysis_webhook_url,
              webhook_events: updated.webhook_events
          } : t
        )));
        toast.success('Konfigurasi WA tersimpan');
        setIsSessionModalOpen(false);
      }
    } catch (error: any) {
      console.error('Failed to update tenant session:', error);
      toast.error(error.response?.data?.error || 'Gagal menyimpan session');
    } finally {
      setIsSessionSaving(false);
    }
  };

  const handleRunTenantAnalysis = async () => {
    if (!sessionTenant) return;

    const persistedWebhook = (sessionTenant.analysis_webhook_url || '').trim();
    const currentWebhook = analysisWebhookUrl.trim();

    if (!persistedWebhook) {
      toast.error('Webhook analisis belum disimpan untuk tenant ini');
      return;
    }

    if (currentWebhook !== persistedWebhook) {
      toast.error('Simpan konfigurasi dulu sebelum menjalankan analisis');
      return;
    }

    setIsAnalysisRunning(true);
    setAnalysisResult(null);
    setAnalysisError('');

    try {
      const res = await api.post(
        `/admin/tenants/${sessionTenant.id}/analyze`,
        {},
        { timeout: 65000 }
      );

      if (res.data?.success) {
        setAnalysisResult(res.data.data ?? null);
        setAnalysisError('');
        setIsAnalysisResultOpen(true);
        toast.success('Analisis tenant berhasil dijalankan');
      } else {
        const message = res.data?.error || 'Gagal menjalankan analisis tenant';
        setAnalysisError(message);
        setIsAnalysisResultOpen(true);
        toast.error(message);
      }
    } catch (error: any) {
      const message = error.response?.data?.error || 'Gagal menjalankan analisis tenant';
      console.error('Failed to run tenant analysis:', error);
      setAnalysisError(message);
      setIsAnalysisResultOpen(true);
      toast.error(message);
    } finally {
      setIsAnalysisRunning(false);
    }
  };

  const openAdminModal = async (tenant: Tenant) => {
    setActiveDropdown(null);
    setIsAdminLoading(true);
    setIsAdminModalOpen(true);
    setAdminUser(null);
    setAdminFormData({ name: '', email: '', password: '', phone_number: '' });
    
    try {
        const res = await api.get(`/admin/tenant-admin?tenant_id=${tenant.id}`);
        if (res.data.success && res.data.admin) {
            const admin = res.data.admin;
            setAdminUser(admin);
            setAdminFormData({
                name: admin.name,
                email: admin.email,
                password: '',
                phone_number: admin.phone_number || ''
            });
        } else {
             toast.error('Owner tidak ditemukan');
             setIsAdminModalOpen(false);
        }
    } catch (error) {
        console.error('Failed to fetch admin:', error);
        toast.error('Gagal memuat data admin');
        setIsAdminModalOpen(false);
    } finally {
        setIsAdminLoading(false);
    }
  };

  const handleUpdateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser) return;

    if (!adminFormData.name.trim() || !adminFormData.email.trim()) {
        toast.error('Nama dan Email harus diisi');
        return;
    }

    if (adminFormData.password && adminFormData.password.length < 6) {
        toast.error('Password minimal 6 karakter');
        return;
    }

    const payload: Record<string, any> = {
        name: adminFormData.name,
        email: adminFormData.email,
        phone_number: adminFormData.phone_number
    };
    if (adminFormData.password) {
        payload.password = adminFormData.password;
    }

    setIsAdminSubmitting(true);
    try {
        const res = await api.patch(`/admin/users/${adminUser.id}`, payload);

        if (res.data.success) {
            toast.success('Data Owner berhasil diperbarui');
            setIsAdminModalOpen(false);
        }
    } catch (error: any) {
        console.error('Failed to update admin:', error);
        toast.error(error.response?.data?.error || 'Gagal memperbarui admin');
    } finally {
        setIsAdminSubmitting(false);
    }
  };

  const handleImpersonate = async (tenant: Tenant) => {
    setActiveDropdown(null);
    if (!confirm(`Masuk sebagai Admin "${tenant.company_name}"?`)) return;

    try {
        const res = await api.post(`/admin/impersonate/${tenant.id}`);
        if (res.data.success) {
            // Update auth store manually since we are bypassing login form
            useAuthStore.setState({
                user: res.data.user,
                isAuthenticated: true
            });
            toast.success(`Berhasil masuk ke ${tenant.company_name}`);
            window.location.href = '/admin';
        }
    } catch (error: any) {
        console.error('Impersonate failed:', error);
        toast.error(error.response?.data?.error || 'Gagal masuk ke tenant');
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
          <button onClick={() => setIsModalOpen(true)} className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3.5 rounded-2xl transition-all shadow-xl shadow-emerald-100 dark:shadow-emerald-900/30 font-black uppercase tracking-widest text-xs active:scale-95">
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
              className="pl-12 pr-4 py-3.5 w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all"
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-emerald-600" size={32} />
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
                    <tr key={tenant.id} className="hover:bg-emerald-50/30 dark:hover:bg-slate-700/40 transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
                            <Building2 size={20} />
                          </div>
                          <span className="font-black text-gray-900 dark:text-white text-sm tracking-tight">{tenant.company_name}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-xs font-mono text-gray-600 dark:text-gray-300">
                        <div>{tenant.session_id || '-'}</div>
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 font-sans mt-1">
                          Gateway: {tenant.gateway_url || '-'}
                        </div>
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
                            <button onClick={() => openAdminModal(tenant)} className="w-full px-5 py-3 text-xs text-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 font-bold uppercase tracking-wider block border-b border-gray-50 dark:border-slate-700">
                              Kelola Owner
                            </button>
                            <button onClick={() => handleImpersonate(tenant)} className="w-full px-5 py-3 text-xs text-amber-600 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 font-bold uppercase tracking-wider block">
                              Masuk Dashboard
                            </button>
                            <button onClick={() => openSessionModal(tenant)} className="w-full px-5 py-3 text-xs text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 font-bold uppercase tracking-wider block">
                              Atur Session WA & Integrasi
                            </button>
                            <button onClick={() => handleStatusToggle(tenant)} className="w-full px-5 py-3 text-xs text-orange-600 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20 font-bold uppercase tracking-wider block">
                              {tenant.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                            <button onClick={() => handleDeleteTenant(tenant)} className="w-full px-5 py-3 text-xs text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 font-bold uppercase tracking-wider block border-t border-gray-50 dark:border-slate-700">
                              Hapus Tenant
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
                           <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"><Building2 size={24} /></div>
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
                     <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-2 break-all">Gateway: {tenant.gateway_url || '-'}</div>
                     {activeDropdown === tenant.id && (
                        <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-2 mb-4 animate-in fade-in zoom-in-95">
                           <button onClick={() => openAdminModal(tenant)} className="w-full p-3 text-center text-xs font-bold text-purple-600 dark:text-purple-300 bg-white dark:bg-slate-900 rounded-lg shadow-sm mb-2">
                             Kelola Owner
                           </button>
                           <button onClick={() => handleImpersonate(tenant)} className="w-full p-3 text-center text-xs font-bold text-amber-600 dark:text-amber-300 bg-white dark:bg-slate-900 rounded-lg shadow-sm mb-2">
                             Masuk Dashboard
                           </button>
                           <button onClick={() => openSessionModal(tenant)} className="w-full p-3 text-center text-xs font-bold text-emerald-600 dark:text-emerald-300 bg-white dark:bg-slate-900 rounded-lg shadow-sm mb-2">
                             Atur Session WA & Integrasi
                           </button>
                           <button onClick={() => handleStatusToggle(tenant)} className="w-full p-3 text-center text-xs font-bold text-orange-600 dark:text-orange-300 bg-white dark:bg-slate-900 rounded-lg shadow-sm mb-2">
                             {tenant.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                           </button>
                           <button onClick={() => handleDeleteTenant(tenant)} className="w-full p-3 text-center text-xs font-bold text-rose-600 dark:text-rose-300 bg-white dark:bg-slate-900 rounded-lg shadow-sm">
                             Hapus Tenant
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
                colorTheme="green"
              />
            )}
          </>
        )}
      </div>

      {/* MODAL: Add Tenant */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white">Tambah Tenant</h2>
                <button onClick={() => setIsModalOpen(false)}><X className="text-gray-400 dark:text-gray-500" /></button>
             </div>
             <form onSubmit={handleAddTenant} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Kategori Bisnis</label>
                  <select
                    value={formData.business_category}
                    onChange={(e) => setFormData({...formData, business_category: e.target.value})}
                    className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="general">Umum / Lainnya</option>
                    <option value="fnb">Kuliner (F&B)</option>
                    <option value="retail">Retail / Toko Online</option>
                    <option value="health">Kesehatan / Klinik</option>
                    <option value="services">Jasa / Service</option>
                    <option value="property">Properti</option>
                    <option value="automotive">Otomotif</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Nama Perusahaan</label>
                  <input
                    required
                    placeholder="Contoh: Toko Maju Jaya"
                    value={formData.company_name}
                    className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    onChange={(e) => setFormData({...formData, company_name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Nama Owner</label>
                  <input
                    required
                    placeholder="Contoh: Owner Toko"
                    value={formData.admin_name}
                    className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    onChange={(e) => setFormData({...formData, admin_name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Email Owner (Username)</label>
                  <input
                    required
                    type="email"
                    placeholder="owner@tokomaju.com"
                    value={formData.admin_email}
                    className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    onChange={(e) => setFormData({...formData, admin_email: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Password Owner</label>
                  <div className="relative">
                    <input
                      required
                      type={showAdminPassword ? 'text' : 'password'}
                      placeholder="Minimal 6 karakter"
                      value={formData.admin_password}
                      className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 pr-16"
                      onChange={(e) => setFormData({...formData, admin_password: e.target.value})}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword(!showAdminPassword)}
                      className="absolute inset-y-0 right-3 flex items-center text-[11px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      {showAdminPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">No. WhatsApp Owner (opsional)</label>
                  <input
                    type="tel"
                    placeholder="62xxxxxxxxxx"
                    value={formData.admin_phone_number}
                    className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    onChange={(e) => setFormData({...formData, admin_phone_number: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Session WA (Nomor)</label>
                  <input
                    required
                    placeholder="Contoh: 628123456789"
                    value={formData.session_id}
                    className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    onChange={(e) => setFormData({...formData, session_id: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Gateway URL (Opsional)</label>
                  <input
                    placeholder="https://host/api/v1/whatsapp"
                    value={formData.gateway_url}
                    className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    onChange={(e) => setFormData({...formData, gateway_url: e.target.value})}
                  />
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                    Kosongkan untuk pakai gateway default.
                  </p>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Owner dibuat otomatis. Login menggunakan email sebagai username.
                </p>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center space-x-2 transition-all"
                >
                  {isSubmitting && <Loader2 className="animate-spin" size={16} />}
                  <span>{isSubmitting ? 'Menyimpan...' : 'Simpan'}</span>
                </button>
             </form>
          </div>
        </div>
      )}

      {/* MODAL: Tenant Session */}
      {isSessionModalOpen && sessionTenant && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white">Session WA Tenant</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sessionTenant.company_name}</p>
              </div>
              <button onClick={closeSessionModal}><X className="text-gray-400 dark:text-gray-500" /></button>
            </div>

            <form onSubmit={handleSaveSessionId} className="space-y-4">
              
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Tipe Koneksi</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setWaProvider('whatsmeow')}
                    className={`p-3 rounded-xl border text-sm font-bold transition-all flex flex-col items-center gap-1 ${ 
                        waProvider === 'whatsmeow' 
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-500 text-emerald-700 dark:text-emerald-400' 
                        : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>📱 Unofficial (QR)</span>
                    <span className="text-[10px] font-normal opacity-70">Scan QR Code</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWaProvider('meta')}
                    className={`p-3 rounded-xl border text-sm font-bold transition-all flex flex-col items-center gap-1 ${ 
                        waProvider === 'meta' 
                        ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-400' 
                        : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>☁️ Official (Meta)</span>
                    <span className="text-[10px] font-normal opacity-70">Cloud API</span>
                  </button>
                </div>
              </div>

              {waProvider === 'whatsmeow' ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Session ID / Nomor WA</label>
                <input
                  placeholder="Contoh: 628123456789"
                  value={sessionIdInput}
                  onChange={(e) => setSessionIdInput(e.target.value)}
                  className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Gateway URL (Opsional)</label>
                <input
                  placeholder="https://host/api/v1/whatsapp"
                  value={gatewayUrlInput}
                  onChange={(e) => setGatewayUrlInput(e.target.value)}
                  className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                  Kosongkan untuk pakai gateway default.
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest">Tenant API Key</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">Dipakai untuk integrasi n8n/AI per tenant.</p>
                  </div>
                  <button
                    type="button"
                    disabled={isTenantApiKeyRegenerating}
                    onClick={handleRegenerateTenantApiKey}
                    className="px-3 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:bg-amber-400 transition-colors"
                  >
                    {isTenantApiKeyRegenerating ? 'Generating...' : 'Regenerate'}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={tenantApiKey || ''}
                    onChange={(e) => setTenantApiKey(e.target.value)}
                    type={showTenantApiKey ? 'text' : 'password'}
                    placeholder="Masukkan API Key Custom..."
                    className="flex-1 p-3 bg-white dark:bg-slate-900 rounded-xl font-mono text-xs text-gray-800 dark:text-gray-200 border border-amber-200 dark:border-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTenantApiKey((prev) => !prev)}
                    className="px-3 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:border-amber-400 transition-colors"
                  >
                    {showTenantApiKey ? 'Hide' : 'Show'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyTenantApiKey}
                    disabled={!tenantApiKey}
                    className="p-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                    title="Copy API key"
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">Contoh cURL (kirim pesan via tenant key):</p>
                  <pre className="bg-slate-900 text-slate-300 p-4 rounded-xl overflow-x-auto font-mono text-[11px] leading-relaxed border border-slate-800">
{`curl -X POST "${apiUrl}/messages/external" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Key: ${tenantApiKey || 'TENANT_API_KEY'}" \
  -d '{ "phone": "628123456789", "message": "Halo!" }'`}
                  </pre>
                </div>
              </div>
              <div className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest">Webhook Tenant (Incoming)</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">Forward pesan masuk ke n8n/AI. Bisa lebih dari satu URL.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => sessionTenant && fetchTenantWebhooks(sessionTenant.id)}
                      disabled={isTenantWebhookLoading || !sessionTenant}
                      className="px-3 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:border-emerald-400 transition-colors disabled:opacity-60"
                    >
                      {isTenantWebhookLoading ? 'Loading...' : 'Reload'}
                    </button>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    placeholder="https://example.com/webhook"
                    value={tenantWebhookUrl}
                    onChange={(e) => setTenantWebhookUrl(e.target.value)}
                    className="flex-1 p-3 bg-gray-50 dark:bg-slate-800 rounded-xl font-mono text-xs text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-slate-700"
                  />
                  <button
                    type="button"
                    onClick={handleAddTenantWebhook}
                    disabled={isTenantWebhookSaving || !sessionTenant}
                    className="px-4 py-3 text-[11px] font-black uppercase tracking-widest rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-400 transition-colors"
                  >
                    {isTenantWebhookSaving ? 'Saving...' : 'Tambah'}
                  </button>
                </div>
                {tenantWebhooks.length > 0 ? (
                  <div className="space-y-2">
                    {tenantWebhooks.map((wh) => (
                      <div key={wh.id} className="flex items-center gap-2 bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2">
                        <div className="flex-1 text-[11px] font-mono break-all text-gray-700 dark:text-gray-200">{wh.url}</div>
                        <button
                          type="button"
                          onClick={() => handleDeleteTenantWebhook(wh.id)}
                          disabled={tenantWebhookDeletingId === wh.id}
                          className="px-2 py-1 text-[10px] font-black uppercase tracking-widest rounded-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-700 text-rose-600 dark:text-rose-300 hover:border-rose-400 transition-colors disabled:opacity-60"
                        >
                          {tenantWebhookDeletingId === wh.id ? 'Deleting...' : 'Hapus'}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">Belum ada webhook tenant.</p>
                )}
              </div>

              <div className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 space-y-3">
                <div>
                  <p className="text-xs font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest">Event Webhook</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">Pilih jenis pesan yang diforward ke webhook.</p>
                </div>
                <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={webhookEvents.private}
                            onChange={(e) => setWebhookEvents({ ...webhookEvents, private: e.target.checked })}
                            className="rounded border-gray-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Pesan Pribadi (Direct Message)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={webhookEvents.groups}
                            onChange={(e) => setWebhookEvents({ ...webhookEvents, groups: e.target.checked })}
                            className="rounded border-gray-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Pesan Grup (Group Message)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={webhookEvents.self}
                            onChange={(e) => setWebhookEvents({ ...webhookEvents, self: e.target.checked })}
                            className="rounded border-gray-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Pesan Saya (Outgoing/Sync)</span>
                    </label>
                </div>
              </div>

              <div className="rounded-2xl border border-blue-100 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-900/20 p-4 space-y-3">
                <div>
                  <p className="text-xs font-black text-blue-800 dark:text-blue-100 uppercase tracking-widest">Konfigurasi Analisis Tenant (AI)</p>
                  <p className="text-[11px] text-blue-600 dark:text-blue-300">Hubungkan dengan n8n untuk analisis performa tenant.</p>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Analysis Webhook URL</label>
                    <input
                        type="url"
                        placeholder="https://n8n.example.com/webhook/tenant-analysis"
                        value={analysisWebhookUrl}
                        onChange={(e) => setAnalysisWebhookUrl(e.target.value)}
                        className="w-full p-3 bg-white dark:bg-slate-900 rounded-xl font-mono text-xs text-gray-800 dark:text-gray-200 border border-blue-200 dark:border-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    <p className="text-[11px] text-blue-600 dark:text-blue-300 mt-2">
                      Simpan konfigurasi dulu sebelum menekan tombol analisis.
                    </p>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Kategori Bisnis</label>
                    <select
                        value={businessCategory}
                        onChange={(e) => setBusinessCategory(e.target.value)}
                        className="w-full p-3 bg-white dark:bg-slate-900 rounded-xl font-bold text-xs text-gray-800 dark:text-gray-200 border border-blue-200 dark:border-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                        <option value="general">Umum / Lainnya</option>
                        <option value="fnb">Kuliner (F&B)</option>
                        <option value="retail">Retail / Toko Online</option>
                        <option value="health">Kesehatan / Klinik</option>
                        <option value="services">Jasa / Service</option>
                        <option value="property">Properti</option>
                        <option value="automotive">Otomotif</option>
                    </select>
                </div>
                <button
                  type="button"
                  onClick={handleRunTenantAnalysis}
                  disabled={isAnalysisRunning}
                  className="w-full py-3 text-[11px] font-black uppercase tracking-widest rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
                >
                  {isAnalysisRunning ? 'Running Analysis...' : 'Jalankan Analisis AI'}
                </button>
              </div>

              <div className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/40 p-4 space-y-3">
                <div>
                  <p className="text-xs font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest">Maintenance</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">Tools admin untuk sync & perbaikan raw.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleManualSync}
                    disabled={isManualSyncing}
                    className="px-4 py-3 text-[11px] font-black uppercase tracking-widest rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-400 transition-colors"
                  >
                    {isManualSyncing ? 'Syncing...' : 'Force Sync'}
                  </button>
                  <button
                    type="button"
                    onClick={handleFixContacts}
                    disabled={isFixingContacts}
                    className="px-4 py-3 text-[11px] font-black uppercase tracking-widest rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:border-emerald-400 transition-colors disabled:opacity-60"
                  >
                    {isFixingContacts ? 'Fixing...' : 'Fix Contacts'}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">Fix contacts berlaku global (semua tenant).</p>
              </div>
                </>
              ) : (
                <div className="space-y-4 pt-2">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Phone Number ID</label>
                        <input
                        required
                        placeholder="Contoh: 100609346..."
                        value={metaPhoneId}
                        onChange={(e) => setMetaPhoneId(e.target.value)}
                        className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">WABA ID</label>
                        <input
                        required
                        placeholder="Contoh: 100609346..."
                        value={metaWabaId}
                        onChange={(e) => setMetaWabaId(e.target.value)}
                        className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Permanent Access Token</label>
                        <input
                        required
                        type="password"
                        placeholder="EAAG..."
                        value={metaToken}
                        onChange={(e) => setMetaToken(e.target.value)}
                        className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                    </div>
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                        <p className="text-xs text-blue-700 dark:text-blue-300 font-bold mb-1">ℹ️ Info Setup Meta</p>
                        <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-relaxed">
                            Pastikan Anda sudah membuat App di Meta Developer. 
                            Webhook URL Anda: <br/>
                            <code className="font-mono bg-white/50 px-1 py-0.5 rounded text-blue-800 dark:text-blue-200 select-all">{apiUrl.replace('/api/v1', '')}/api/v1/webhook/meta</code>
                        </p>
                    </div>
                </div>
              )}

              <p className="text-xs text-gray-400 dark:text-gray-500">
                Kosongkan untuk melepas session dari tenant ini.
              </p>
              <button
                type="submit"
                disabled={isSessionSaving}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center space-x-2 transition-all"
              >
                {isSessionSaving && <Loader2 className="animate-spin" size={16} />}
                <span>{isSessionSaving ? 'Menyimpan...' : 'Simpan Konfigurasi'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Manage Owner */}
      {isAdminModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white">Kelola Owner</h2>
                {adminUser && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">ID: {adminUser.id}</p>}
              </div>
              <button onClick={() => setIsAdminModalOpen(false)}><X className="text-gray-400 dark:text-gray-500" /></button>
            </div>

            {isAdminLoading ? (
               <div className="flex justify-center py-10">
                   <Loader2 className="animate-spin text-emerald-600" size={32} />
               </div>
            ) : (
                <form onSubmit={handleUpdateAdmin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Nama Owner</label>
                    <input
                      required
                      value={adminFormData.name}
                      onChange={(e) => setAdminFormData({...adminFormData, name: e.target.value})}
                      className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Email (Username)</label>
                    <input
                      required
                      type="email"
                      value={adminFormData.email}
                      onChange={(e) => setAdminFormData({...adminFormData, email: e.target.value})}
                      className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">No. WhatsApp (Opsional)</label>
                    <input
                      type="tel"
                      value={adminFormData.phone_number}
                      onChange={(e) => setAdminFormData({...adminFormData, phone_number: e.target.value})}
                      className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                    />
                  </div>
                  
                  <div className="pt-2">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Reset Password</label>
                    <div className="relative">
                        <input
                        type={showEditAdminPassword ? 'text' : 'password'}
                        placeholder="Isi untuk mereset password"
                        value={adminFormData.password}
                        onChange={(e) => setAdminFormData({...adminFormData, password: e.target.value})}
                        className="w-full p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 pr-16"
                        />
                        <button
                        type="button"
                        onClick={() => setShowEditAdminPassword(!showEditAdminPassword)}
                        className="absolute inset-y-0 right-3 flex items-center text-[11px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        >
                        {showEditAdminPassword ? 'Hide' : 'Show'}
                        </button>
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                        Biarkan kosong jika tidak ingin mengganti password.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isAdminSubmitting}
                    className="w-full py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center space-x-2 transition-all mt-4"
                  >
                    {isAdminSubmitting && <Loader2 className="animate-spin" size={16} />}
                    <span>{isAdminSubmitting ? 'Simpan Perubahan' : 'Simpan Perubahan'}</span>
                  </button>
                </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Analysis Result */}
      {isAnalysisResultOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-3xl shadow-2xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-black text-gray-900 dark:text-white">Hasil Analisis Tenant</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {sessionTenant?.company_name || '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAnalysisResultOpen(false)}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                <X className="text-gray-400 dark:text-gray-500" />
              </button>
            </div>

            {analysisError ? (
              <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 p-4 text-sm font-semibold">
                {analysisError}
              </div>
            ) : (
              <pre className="bg-slate-900 text-slate-200 p-4 rounded-xl overflow-x-auto text-xs leading-relaxed border border-slate-800">
{JSON.stringify(analysisResult, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantManagement;
