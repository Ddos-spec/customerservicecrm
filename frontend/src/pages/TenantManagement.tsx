import { useState, useEffect } from 'react';
import { Plus, Search, MoreVertical, Building2, X, Loader2, RefreshCw, Trash2, Copy } from 'lucide-react';
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
}

interface TenantWebhook {
  id: number;
  url: string;
  created_at: string;
}

interface AdminUser {
  id: number;
  name: string;
  email: string;
  phone_number?: string;
  role: string;
}

const TenantManagement = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;
  const apiUrl = import.meta.env.VITE_API_URL || window.location.origin + '/api/v1';
  const RAW_PREVIEW_LIMIT = 200;

  const getRawJid = (item: any) => item?.JID || item?.jid || item?.their_jid || '';
  const getRawContactName = (item: any) =>
    item?.FullName ||
    item?.full_name ||
    item?.FirstName ||
    item?.first_name ||
    item?.PushName ||
    item?.push_name ||
    item?.BusinessName ||
    item?.business_name ||
    getRawJid(item);
  const getRawGroupName = (item: any) =>
    item?.Subject || item?.subject || item?.Name || item?.name || getRawJid(item);

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
  const [waProvider, setWaProvider] = useState<'whatsmeow' | 'meta'>('whatsmeow');
  const [sessionIdInput, setSessionIdInput] = useState('');
  const [gatewayUrlInput, setGatewayUrlInput] = useState('');
  const [metaPhoneId, setMetaPhoneId] = useState('');
  const [metaWabaId, setMetaWabaId] = useState('');
  const [metaToken, setMetaToken] = useState('');
  const [isSessionSaving, setIsSessionSaving] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionTokenSessionId, setSessionTokenSessionId] = useState('');
  const [isSessionTokenLoading, setIsSessionTokenLoading] = useState(false);
  const [isSessionTokenRegenerating, setIsSessionTokenRegenerating] = useState(false);
  const [showSessionToken, setShowSessionToken] = useState(false);
  const [tenantApiKey, setTenantApiKey] = useState<string | null>(null);
  const [showTenantApiKey, setShowTenantApiKey] = useState(false);
  const [isTenantApiKeyRegenerating, setIsTenantApiKeyRegenerating] = useState(false);
  const [sessionWebhookUrl, setSessionWebhookUrl] = useState('');
  const [isSessionWebhookLoading, setIsSessionWebhookLoading] = useState(false);
  const [isSessionWebhookSaving, setIsSessionWebhookSaving] = useState(false);
  const [isSessionWebhookDeleting, setIsSessionWebhookDeleting] = useState(false);
  const [isSessionWebhookTesting, setIsSessionWebhookTesting] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isFixingContacts, setIsFixingContacts] = useState(false);

  const [isRawModalOpen, setIsRawModalOpen] = useState(false);
  const [rawTenant, setRawTenant] = useState<Tenant | null>(null);
  const [rawContacts, setRawContacts] = useState<any[]>([]);
  const [rawGroups, setRawGroups] = useState<any[]>([]);
  const [rawSearch, setRawSearch] = useState('');
  const [isRawLoadingContacts, setIsRawLoadingContacts] = useState(false);
  const [isRawLoadingGroups, setIsRawLoadingGroups] = useState(false);

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
    gateway_url: ''
  });
  const [showAdminPassword, setShowAdminPassword] = useState(false);

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
        gateway_url: formData.gateway_url.trim()
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
          gateway_url: ''
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

  const fetchSessionToken = async (sessionId: string, options: { silent?: boolean } = {}) => {
    const trimmed = sessionId.trim();
    if (!trimmed) return;
    setIsSessionTokenLoading(true);
    try {
      const res = await api.get(`/sessions/${encodeURIComponent(trimmed)}/token`);
      if (res.data?.status === 'success') {
        setSessionToken(res.data.token || null);
        setSessionTokenSessionId(trimmed);
        if (!res.data.token && !options.silent) {
          toast.info('Token belum dibuat. Klik Generate untuk membuat.');
        }
      }
    } catch (error) {
      console.error('Failed to fetch session token:', error);
      if (!options.silent) {
        toast.error('Gagal memuat token session');
      }
    } finally {
      setIsSessionTokenLoading(false);
    }
  };

  const handleRegenerateSessionToken = async () => {
    const trimmed = sessionIdInput.trim();
    if (!trimmed) {
      toast.error('Session ID harus diisi dulu');
      return;
    }
    if (!confirm('Regenerate token? Token lama akan tidak berlaku.')) return;
    setIsSessionTokenRegenerating(true);
    try {
      const res = await api.post(`/sessions/${encodeURIComponent(trimmed)}/token`, { regenerate: true });
      if (res.data?.status === 'success') {
        setSessionToken(res.data.token || null);
        setSessionTokenSessionId(trimmed);
        setShowSessionToken(true);
        toast.success('Token berhasil diperbarui');
      }
    } catch (error: any) {
      console.error('Failed to regenerate session token:', error);
      toast.error(error.response?.data?.message || 'Gagal regenerate token');
    } finally {
      setIsSessionTokenRegenerating(false);
    }
  };

  const handleCopySessionToken = async () => {
    if (!sessionToken) return;
    await navigator.clipboard.writeText(sessionToken);
    toast.success('Token disalin');
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

  const getSessionAuthConfig = () => {
    if (!sessionToken) {
      toast.error('Token belum ada. Load/Generate dulu.');
      return null;
    }
    return { headers: { apikey: sessionToken } };
  };

  const fetchSessionWebhook = async () => {
    const trimmed = sessionIdInput.trim();
    if (!trimmed) {
      toast.error('Session ID harus diisi dulu');
      return;
    }
    const config = getSessionAuthConfig();
    if (!config) return;
    setIsSessionWebhookLoading(true);
    try {
      const res = await api.get('/sessions/webhook', {
        ...config,
        params: { sessionId: trimmed }
      });
      if (res.data?.status === 'success') {
        setSessionWebhookUrl(res.data.url || '');
        toast.success(res.data.url ? 'Webhook loaded' : 'Webhook belum diset');
      }
    } catch (error: any) {
      console.error('Failed to fetch session webhook:', error);
      toast.error(error.response?.data?.message || 'Gagal memuat webhook session');
    } finally {
      setIsSessionWebhookLoading(false);
    }
  };

  const handleSaveSessionWebhook = async () => {
    const trimmed = sessionIdInput.trim();
    const url = sessionWebhookUrl.trim();
    if (!trimmed) {
      toast.error('Session ID harus diisi dulu');
      return;
    }
    if (!url) {
      toast.error('URL webhook wajib diisi');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      toast.error('Webhook URL harus diawali http:// atau https://');
      return;
    }
    const config = getSessionAuthConfig();
    if (!config) return;
    setIsSessionWebhookSaving(true);
    try {
      const res = await api.post('/sessions/webhook', { url, sessionId: trimmed }, config);
      if (res.data?.status === 'success') {
        toast.success('Webhook session tersimpan');
      }
    } catch (error: any) {
      console.error('Failed to save session webhook:', error);
      toast.error(error.response?.data?.message || 'Gagal menyimpan webhook session');
    } finally {
      setIsSessionWebhookSaving(false);
    }
  };

  const handleDeleteSessionWebhook = async () => {
    const trimmed = sessionIdInput.trim();
    if (!trimmed) {
      toast.error('Session ID harus diisi dulu');
      return;
    }
    if (!confirm('Hapus webhook session ini?')) return;
    const config = getSessionAuthConfig();
    if (!config) return;
    setIsSessionWebhookDeleting(true);
    try {
      const res = await api.delete('/sessions/webhook', {
        ...config,
        data: { sessionId: trimmed }
      });
      if (res.data?.status === 'success') {
        setSessionWebhookUrl('');
        toast.success('Webhook session dihapus');
      }
    } catch (error: any) {
      console.error('Failed to delete session webhook:', error);
      toast.error(error.response?.data?.message || 'Gagal menghapus webhook session');
    } finally {
      setIsSessionWebhookDeleting(false);
    }
  };

  const handleTestSessionWebhook = async () => {
    const trimmed = sessionIdInput.trim();
    if (!trimmed) {
      toast.error('Session ID harus diisi dulu');
      return;
    }
    setIsSessionWebhookTesting(true);
    try {
      const res = await api.post(`/admin/sessions/${encodeURIComponent(trimmed)}/webhook-test`);
      if (res.data?.success) {
        toast.success('Test webhook terkirim');
      }
    } catch (error: any) {
      console.error('Failed to test session webhook:', error);
      toast.error(error.response?.data?.error || 'Gagal test webhook');
    } finally {
      setIsSessionWebhookTesting(false);
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

  const openRawModal = (tenant: Tenant) => {
    setActiveDropdown(null);
    setRawTenant(tenant);
    setIsRawModalOpen(true);
    setRawContacts([]);
    setRawGroups([]);
    setRawSearch('');
  };

  const closeRawModal = () => {
    setIsRawModalOpen(false);
    setRawTenant(null);
    setRawContacts([]);
    setRawGroups([]);
    setRawSearch('');
  };

  const loadRawContacts = async () => {
    if (!rawTenant?.session_id) {
      toast.error('Session ID belum diatur');
      return;
    }
    setIsRawLoadingContacts(true);
    try {
      const res = await api.get('/admin/wa/contacts', {
        params: { session_id: rawTenant.session_id }
      });
      if (res.data?.success) {
        setRawContacts(res.data.contacts || []);
        toast.success('Kontak raw dimuat');
      }
    } catch (error: any) {
      console.error('Failed to fetch raw contacts:', error);
      toast.error(error.response?.data?.error || 'Gagal memuat kontak raw');
    } finally {
      setIsRawLoadingContacts(false);
    }
  };

  const loadRawGroups = async () => {
    if (!rawTenant?.session_id) {
      toast.error('Session ID belum diatur');
      return;
    }
    setIsRawLoadingGroups(true);
    try {
      const res = await api.get('/admin/wa/groups', {
        params: { session_id: rawTenant.session_id }
      });
      if (res.data?.success) {
        setRawGroups(res.data.groups || []);
        toast.success('Grup raw dimuat');
      }
    } catch (error: any) {
      console.error('Failed to fetch raw groups:', error);
      toast.error(error.response?.data?.error || 'Gagal memuat grup raw');
    } finally {
      setIsRawLoadingGroups(false);
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
    
    setSessionToken(null);
    setSessionTokenSessionId('');
    setShowSessionToken(false);
    setTenantApiKey(tenant.api_key || null);
    setShowTenantApiKey(false);
    setSessionWebhookUrl('');
    setIsSessionModalOpen(true);
    if (tenant.session_id && (!tenant.wa_provider || tenant.wa_provider === 'whatsmeow')) {
      void fetchSessionToken(tenant.session_id, { silent: true });
    }
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
    
    setSessionToken(null);
    setSessionTokenSessionId('');
    setShowSessionToken(false);
    setTenantApiKey(null);
    setShowTenantApiKey(false);
    setSessionWebhookUrl('');
  };

  useEffect(() => {
    const trimmed = sessionIdInput.trim();
    if (sessionTokenSessionId && trimmed && trimmed !== sessionTokenSessionId) {
      setSessionToken(null);
      setSessionTokenSessionId('');
      setShowSessionToken(false);
    }
  }, [sessionIdInput, sessionTokenSessionId]);

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

    setIsSessionSaving(true);
    try {
      const payload: any = {
        wa_provider: waProvider
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
              api_key: updated.api_key
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

  const rawQuery = rawSearch.trim().toLowerCase();
  const matchRaw = (item: any, nameGetter: (value: any) => string) => {
    if (!rawQuery) return true;
    const jid = getRawJid(item).toLowerCase();
    const name = (nameGetter(item) || '').toLowerCase();
    return jid.includes(rawQuery) || name.includes(rawQuery);
  };
  const filteredContacts = rawContacts.filter((item) => matchRaw(item, getRawContactName));
  const filteredGroups = rawGroups.filter((item) => matchRaw(item, getRawGroupName));
  const displayedContacts = filteredContacts.slice(0, RAW_PREVIEW_LIMIT);
  const displayedGroups = filteredGroups.slice(0, RAW_PREVIEW_LIMIT);

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
                            <button onClick={() => openWebhookModal(tenant)} className="w-full px-5 py-3 text-xs text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 font-bold uppercase tracking-wider block">
                              Kelola Webhook
                            </button>
                            <button onClick={() => openAdminModal(tenant)} className="w-full px-5 py-3 text-xs text-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 font-bold uppercase tracking-wider block">
                              Kelola Owner
                            </button>
                            <button onClick={() => handleImpersonate(tenant)} className="w-full px-5 py-3 text-xs text-amber-600 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 font-bold uppercase tracking-wider block">
                              Masuk Dashboard
                            </button>
                            <button onClick={() => openSessionModal(tenant)} className="w-full px-5 py-3 text-xs text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 font-bold uppercase tracking-wider block">
                              Atur Session WA
                            </button>
                            <button onClick={() => openRawModal(tenant)} className="w-full px-5 py-3 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/30 font-bold uppercase tracking-wider block">
                              Raw Kontak/Grup
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
                           <button onClick={() => openWebhookModal(tenant)} className="w-full p-3 text-center text-xs font-bold text-emerald-600 dark:text-emerald-300 bg-white dark:bg-slate-900 rounded-lg shadow-sm mb-2">
                             Kelola Webhook
                           </button>
                           <button onClick={() => openAdminModal(tenant)} className="w-full p-3 text-center text-xs font-bold text-purple-600 dark:text-purple-300 bg-white dark:bg-slate-900 rounded-lg shadow-sm mb-2">
                             Kelola Owner
                           </button>
                           <button onClick={() => handleImpersonate(tenant)} className="w-full p-3 text-center text-xs font-bold text-amber-600 dark:text-amber-300 bg-white dark:bg-slate-900 rounded-lg shadow-sm mb-2">
                             Masuk Dashboard
                           </button>
                           <button onClick={() => openSessionModal(tenant)} className="w-full p-3 text-center text-xs font-bold text-emerald-600 dark:text-emerald-300 bg-white dark:bg-slate-900 rounded-lg shadow-sm mb-2">
                             Atur Session WA
                           </button>
                           <button onClick={() => openRawModal(tenant)} className="w-full p-3 text-center text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 rounded-lg shadow-sm mb-2">
                             Raw Kontak/Grup
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

      {/* MODAL: Tenant Webhooks */}
      {isWebhookModalOpen && webhookTenant && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
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
                  className="flex-1 p-4 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={isWebhookSubmitting}
                  className="px-6 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center space-x-2 transition-all"
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
                  <Loader2 className="animate-spin text-emerald-600" size={24} />
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
              <div className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 space-y-3">
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
                    readOnly
                    value={tenantApiKey ? (showTenantApiKey ? tenantApiKey : '********') : '-'}
                    className="flex-1 p-3 bg-gray-50 dark:bg-slate-800 rounded-xl font-mono text-xs text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTenantApiKey((prev) => !prev)}
                    disabled={!tenantApiKey}
                    className="px-3 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:border-amber-400 transition-colors disabled:opacity-60"
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
{`curl -X POST "${apiUrl}/messages/external" \\
  -H "Content-Type: application/json" \\
  -H "X-Tenant-Key: ${tenantApiKey || 'TENANT_API_KEY'}" \\
  -d '{ "phone": "628123456789", "message": "Halo!" }'`}
                  </pre>
                </div>
              </div>
              <div className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest">API Token</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">Token ini dipakai buat header <span className="font-bold">apikey</span>.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isSessionTokenLoading}
                      onClick={() => fetchSessionToken(sessionIdInput)}
                      className="px-3 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:border-emerald-400 transition-colors disabled:opacity-60"
                    >
                      {isSessionTokenLoading ? 'Loading...' : 'Load'}
                    </button>
                    <button
                      type="button"
                      disabled={isSessionTokenRegenerating}
                      onClick={handleRegenerateSessionToken}
                      className="px-3 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-400 transition-colors"
                    >
                      {isSessionTokenRegenerating ? 'Generating...' : 'Generate'}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={sessionToken ? (showSessionToken ? sessionToken : '********') : '-'}
                    className="flex-1 p-3 bg-white dark:bg-slate-900 rounded-xl font-mono text-xs text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSessionToken((prev) => !prev)}
                    disabled={!sessionToken}
                    className="px-3 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:border-emerald-400 transition-colors disabled:opacity-60"
                  >
                    {showSessionToken ? 'Hide' : 'Show'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopySessionToken}
                    disabled={!sessionToken}
                    className="p-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                    title="Copy token"
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">Contoh cURL (langsung kirim pesan):</p>
                  <pre className="bg-slate-900 text-slate-300 p-4 rounded-xl overflow-x-auto font-mono text-[11px] leading-relaxed border border-slate-800">
{`curl -X POST "${apiUrl}/messages" \\
  -H "Content-Type: application/json" \\
  -H "apikey: ${sessionToken || 'SESSION_TOKEN'}" \\
  -d '{ "sessionId": "${sessionIdInput.trim() || '628123456789'}", "to": "628123456789", "type": "text", "text": { "body": "Halo!" } }'`}
                  </pre>
                </div>
              </div>
              <div className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black text-gray-800 dark:text-gray-100 uppercase tracking-widest">Session Webhook</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">Dipicu saat ada pesan masuk. Pakai token session.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={fetchSessionWebhook}
                      disabled={isSessionWebhookLoading || !sessionToken}
                      className="px-3 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:border-emerald-400 transition-colors disabled:opacity-60"
                    >
                      {isSessionWebhookLoading ? 'Loading...' : 'Load'}
                    </button>
                    <button
                      type="button"
                      onClick={handleTestSessionWebhook}
                      disabled={isSessionWebhookTesting}
                      className="px-3 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {isSessionWebhookTesting ? 'Testing...' : 'Test'}
                    </button>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    placeholder="https://example.com/webhook"
                    value={sessionWebhookUrl}
                    onChange={(e) => setSessionWebhookUrl(e.target.value)}
                    className="flex-1 p-3 bg-gray-50 dark:bg-slate-800 rounded-xl font-mono text-xs text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-slate-700"
                  />
                  <button
                    type="button"
                    onClick={handleSaveSessionWebhook}
                    disabled={isSessionWebhookSaving || !sessionToken}
                    className="px-4 py-3 text-[11px] font-black uppercase tracking-widest rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-400 transition-colors"
                  >
                    {isSessionWebhookSaving ? 'Saving...' : 'Simpan'}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDeleteSessionWebhook}
                    disabled={isSessionWebhookDeleting || !sessionToken}
                    className="px-3 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-700 text-rose-600 dark:text-rose-300 hover:border-rose-400 transition-colors disabled:opacity-60"
                  >
                    {isSessionWebhookDeleting ? 'Deleting...' : 'Hapus'}
                  </button>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">Wajib Load/Generate token dulu.</p>
                </div>
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
                <span>{isSessionSaving ? 'Menyimpan...' : 'Simpan'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Raw WA Data (Super Admin Only) */}
      {isRawModalOpen && rawTenant && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-3xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white">Raw Kontak & Grup</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {rawTenant.company_name} • Session: {rawTenant.session_id || '-'}
                </p>
              </div>
              <button onClick={closeRawModal}><X className="text-gray-400 dark:text-gray-500" /></button>
            </div>

            <div className="flex flex-col lg:flex-row gap-3 mb-6">
              <input
                placeholder="Cari nama atau JID..."
                value={rawSearch}
                onChange={(e) => setRawSearch(e.target.value)}
                className="flex-1 p-3 bg-gray-50 dark:bg-slate-800 rounded-xl font-bold text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={loadRawContacts}
                  disabled={isRawLoadingContacts}
                  className="px-4 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-400 transition-colors"
                >
                  {isRawLoadingContacts ? 'Loading...' : 'Load Kontak'}
                </button>
                <button
                  type="button"
                  onClick={loadRawGroups}
                  disabled={isRawLoadingGroups}
                  className="px-4 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 transition-colors"
                >
                  {isRawLoadingGroups ? 'Loading...' : 'Load Grup'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-gray-700 dark:text-gray-200">Kontak</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      {filteredContacts.length} total{filteredContacts.length > RAW_PREVIEW_LIMIT ? ` (showing ${RAW_PREVIEW_LIMIT})` : ''}
                    </p>
                  </div>
                </div>
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {displayedContacts.length > 0 ? displayedContacts.map((item, idx) => {
                    const jid = getRawJid(item) || '-';
                    const name = getRawContactName(item) || '-';
                    return (
                      <div key={`${jid}-${idx}`} className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800">
                        <div className="text-xs font-black text-gray-900 dark:text-white">{name}</div>
                        <div className="text-[11px] font-mono text-gray-500 dark:text-gray-400">{jid}</div>
                      </div>
                    );
                  }) : (
                    <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                      {rawContacts.length === 0 ? 'Belum ada data kontak.' : 'Tidak ada hasil.'}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-gray-700 dark:text-gray-200">Grup</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      {filteredGroups.length} total{filteredGroups.length > RAW_PREVIEW_LIMIT ? ` (showing ${RAW_PREVIEW_LIMIT})` : ''}
                    </p>
                  </div>
                </div>
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {displayedGroups.length > 0 ? displayedGroups.map((item, idx) => {
                    const jid = getRawJid(item) || '-';
                    const name = getRawGroupName(item) || '-';
                    return (
                      <div key={`${jid}-${idx}`} className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">GRUP</span>
                          <span className="text-xs font-black text-gray-900 dark:text-white">{name}</span>
                        </div>
                        <div className="text-[11px] font-mono text-gray-500 dark:text-gray-400">{jid}</div>
                      </div>
                    );
                  }) : (
                    <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                      {rawGroups.length === 0 ? 'Belum ada data grup.' : 'Tidak ada hasil.'}
                    </div>
                  )}
                </div>
              </div>
            </div>
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
    </div>
  );
};

export default TenantManagement;
