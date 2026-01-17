import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Wifi, Settings, MessageSquare, Smartphone, Activity,
  Users, RefreshCw, X, LogOut, Send, MessageCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import api from '../lib/api';
import { toast } from 'sonner';

const formatRelativeTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return 'Baru saja';
  if (diffMinutes < 60) return `${diffMinutes}m lalu`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}j lalu`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}h lalu`;
};

const asDataUrl = (qr: string) => {
  if (!qr) return '';
  return qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
};

const AgentDashboard = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const canManageSession = user?.role === 'admin_agent';
  const getRoleLabel = (role?: string | null) => {
    switch (role) {
      case 'super_admin':
        return 'Super Admin';
      case 'admin_agent':
        return 'Owner';
      case 'agent':
        return 'Staff';
      default:
        return role || '';
    }
  };
  const roleLabel = getRoleLabel(user?.role);
  const sessionId = user?.session_id || '';

  // Data States
  const [stats, setStats] = useState<any>(null);
  const [recentChats, setRecentChats] = useState<any[]>([]);
  const [waStatus, setWaStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [qrUrl, setQrUrl] = useState('');
  const [connectedNumber, setConnectedNumber] = useState<string>('');
  const [adminContact, setAdminContact] = useState<{ name: string; email: string } | null>(null);

  // UI States
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  
  const ws = useRef<WebSocket | null>(null);

  // Help Form States
  const [helpForm, setHelpForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    category: 'teknis',
    message: ''
  });

  // 1. Fetch Stats (V2)
  const fetchDashboardStats = useCallback(async () => {
    try {
      const res = await api.get('/admin/stats');
      if (res.data.success) {
        setStats(res.data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  // 2. Fetch Recent Chats (Inbox)
  const fetchRecentChats = useCallback(async () => {
    try {
      // Use the Chat API V2
      const res = await api.get('/chats?limit=5');
      if (res.data.status === 'success') {
        setRecentChats(res.data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch recent chats:', error);
    }
  }, []);

  const fetchAdminContact = useCallback(async () => {
    try {
      const res = await api.get('/admin/tenant-admin');
      if (res.data.success && res.data.admin) {
        setAdminContact({ name: res.data.admin.name, email: res.data.admin.email });
      }
    } catch (error) {
      console.error('Failed to fetch admin contact:', error);
    }
  }, []);

  const fetchSessionStatus = useCallback(async () => {
    if (!sessionId) {
      setWaStatus('disconnected');
      setQrUrl('');
      setConnectedNumber('');
      return;
    }

    try {
      const { data } = await api.get('/sessions');
      if (Array.isArray(data)) {
        const mySession = data.find((s: any) => s.sessionId === sessionId);
        if (mySession) {
          setWaStatus(mySession.status === 'CONNECTED' ? 'connected' : mySession.status === 'CONNECTING' ? 'connecting' : 'disconnected');
          if (mySession.qr) {
            setQrUrl(asDataUrl(mySession.qr));
          } else {
            setQrUrl('');
          }
          setConnectedNumber(mySession.connectedNumber || '');
        } else {
          setWaStatus('disconnected');
          setQrUrl('');
          setConnectedNumber('');
        }
      }
    } catch (error) {
      console.error('Failed to fetch session:', error);
    }
  }, [sessionId]);

  // WebSocket Connection
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_API_URL 
      ? new URL(import.meta.env.VITE_API_URL).host 
      : window.location.host;
    
    const wsUrl = `${protocol}//${host}`;
    
    ws.current = new WebSocket(wsUrl);

    ws.current.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        
        // Update Session
        if (payload.type === 'session-update') {
            const mySession = payload.data.find((s: any) => s.sessionId === sessionId);
            if (mySession) {
                setWaStatus(mySession.status === 'CONNECTED' ? 'connected' : mySession.status === 'CONNECTING' ? 'connecting' : 'disconnected');
                if (mySession.qr) {
                    setQrUrl(asDataUrl(mySession.qr));
                } else {
                    setQrUrl('');
                }
                setConnectedNumber(mySession.connectedNumber || '');

                if (mySession.status === 'CONNECTED') {
                    toast.success('WhatsApp Terhubung!');
                    setIsQrModalOpen(false);
                }
            }
        }
        
        // Update Stats/Chats on new message
        if (payload.type === 'message') {
            const msgData = payload.data;
            if (user?.tenant_id && msgData.tenant_id && user.tenant_id === msgData.tenant_id) {
                void fetchDashboardStats();
                void fetchRecentChats();
            }
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [sessionId, user, fetchDashboardStats, fetchRecentChats]);

  const handleRequestQr = async () => {
    if (!canManageSession) {
      toast.error('Hanya Owner yang bisa menghubungkan nomor');
      return;
    }
    if (!sessionId) {
      toast.error('Session WA belum diatur oleh Super Admin');
      return;
    }
    try {
      await api.get(`/sessions/${sessionId}/qr`);
      setIsSettingsOpen(false);
      setIsQrModalOpen(true);
    } catch (error) {
      console.error('Failed to request QR:', error);
      toast.error('Gagal meminta QR. Coba lagi.');
    }
  };

  const handleNotifyAdmin = () => {
    if (!adminContact?.email) {
      toast.error('Kontak owner belum tersedia');
      return;
    }
    const subject = encodeURIComponent('Koneksi WhatsApp Offline');
    const body = encodeURIComponent(`Halo ${adminContact.name || ''},

Status WhatsApp saat ini: ${waStatus}.
Mohon cek dan scan QR jika diperlukan.

Terima kasih.`);
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(adminContact.email)}&su=${subject}&body=${body}`, '_blank');
  };

  useEffect(() => {
    const loadInitialData = async () => {
      await Promise.all([
        fetchDashboardStats(),
        fetchRecentChats(),
        fetchAdminContact(),
        fetchSessionStatus()
      ]);
    };
    void loadInitialData();
  }, [fetchDashboardStats, fetchRecentChats, fetchAdminContact, fetchSessionStatus]);

  // Parse Stats V2
  const totalChats = parseInt(stats?.chats?.total_chats || '0');
  const totalUnread = parseInt(stats?.chats?.total_unread || '0');
  const totalUsers = parseInt(stats?.users?.total_users || '0');

  const statCards = useMemo(() => ([
      { 
        label: 'Total Percakapan', 
        value: String(totalChats), 
        icon: MessageSquare, 
        color: 'text-blue-600', 
        bg: 'bg-blue-50', 
        trend: 'All Time' 
      },
      { 
        label: 'Pesan Belum Dibaca', 
        value: String(totalUnread), 
        icon: MessageCircle, 
        color: 'text-amber-600', 
        bg: 'bg-amber-50', 
        trend: 'Needs Action' 
      },
      { 
        label: 'Anggota Tim', 
        value: String(totalUsers), 
        icon: Users, 
        color: 'text-purple-600', 
        bg: 'bg-purple-50', 
        trend: 'Active Users' 
      },
      // Placeholder for future metrics like 'Messages Today' if backend supports it
      { 
        label: 'Status Sistem', 
        value: 'Normal', 
        icon: Activity, 
        color: 'text-emerald-600', 
        bg: 'bg-emerald-50', 
        trend: '100% Uptime' 
      },
    ]
  ), [totalChats, totalUnread, totalUsers]);

  // Prepare Recent Chats for Display
  const displayChats = useMemo(() => (
    recentChats.map((c: any) => ({
        id: c.id,
        name: c.display_name || c.phone_number || 'Unknown',
        message: c.last_message_preview || 'Media/Lampiran',
        time: formatRelativeTime(c.last_message_time),
        unread: parseInt(c.unread_count || '0') > 0,
        avatar: (c.display_name || c.phone_number || '?').substring(0, 2).toUpperCase()
    }))
  ), [recentChats]);

  // Handle help form submit
  const handleHelpSubmit = () => {
    if (!helpForm.message.trim()) {
      toast.error('Mohon isi pesan bantuan');
      return;
    }
    const categoryText = helpForm.category === 'teknis' ? 'Bantuan Teknis' :
                        helpForm.category === 'billing' ? 'Pertanyaan Billing' :
                        helpForm.category === 'fitur' ? 'Request Fitur' : 'Lainnya';

    const waMessage = `*Permintaan Bantuan CRM SaaS*%0A%0A` +
      `*Nama:* ${helpForm.name}%0A` +
      `*Email:* ${helpForm.email}%0A` +
      `*Kategori:* ${categoryText}%0A%0A` +
      `*Pesan:*%0A${helpForm.message}`;

    window.open(`https://wa.me/6285771518231?text=${waMessage}`, '_blank');
    setIsHelpModalOpen(false);
    toast.success('Mengarahkan ke WhatsApp...');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Selamat Datang, {user?.name || 'Staff'}!</h1>
          <p className="text-gray-500 dark:text-gray-400">Pantau aktivitas percakapan pelanggan Anda.</p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex flex-col items-end gap-2">
            <div className={`flex items-center space-x-2 px-4 py-2 rounded-full border ${ 
              waStatus === 'connected' ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400' :
              waStatus === 'connecting' ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 animate-pulse' :
              'bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400'
            }`}>
              <Wifi size={16} />
              <span className="text-sm font-bold capitalize">WhatsApp: {waStatus}</span>
            </div>
            {waStatus === 'connected' && connectedNumber && (
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                <Smartphone className="text-emerald-600 dark:text-emerald-400" size={14} />
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  {connectedNumber}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      {!canManageSession && waStatus !== 'connected' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-amber-700 dark:text-amber-300">Koneksi WhatsApp sedang offline.</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">Beritahu Owner untuk scan QR.</p>
          </div>
          <button
            onClick={handleNotifyAdmin}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl"
          >
            Hubungi Owner
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((item, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${item.bg} dark:bg-opacity-20 ${item.color}`}>
                <item.icon size={24} />
              </div>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-full">{item.trend}</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{item.label}</p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{item.value}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Chats Section */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
          <div className="p-6 border-b border-gray-50 dark:border-slate-700 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center">
              <MessageSquare size={18} className="mr-2 text-blue-600 dark:text-blue-400" />
              Percakapan Terbaru
            </h3>
            <button onClick={() => navigate(user?.role === 'admin_agent' ? '/admin/chat' : '/agent/chat')} className="text-blue-600 dark:text-blue-400 text-sm font-bold hover:underline">Lihat Semua</button>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-slate-700">
            {displayChats.length > 0 ? displayChats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => navigate(user?.role === 'admin_agent' ? '/admin/chat' : '/agent/chat', { state: { selectedChat: { id: chat.id } } })}
                className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer flex items-center space-x-4"
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 font-bold shrink-0">
                  {chat.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">{chat.name}</h4>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{chat.time}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">{chat.message}</p>
                </div>
                {chat.unread && <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full"></div>}
              </div>
            )) : (
              <div className="p-8 text-center text-gray-400 dark:text-gray-500">Belum ada percakapan terbaru.</div>
            )}
          </div>
        </div>

        {/* Right Sidebar - Support/Activity */}
        <div className="space-y-8">
          
          {/* Quick Action Card */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 p-6 rounded-2xl text-white shadow-lg shadow-blue-200 dark:shadow-blue-900/30 relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform">
              <MessageCircle size={120} />
            </div>
            <h4 className="font-bold mb-2">Punya Kendala?</h4>
            <p className="text-xs text-blue-100 mb-4 leading-relaxed">Hubungi tim support kami untuk bantuan teknis.</p>
            <button
              onClick={() => setIsHelpModalOpen(true)}
              className="inline-block bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Pusat Bantuan
            </button>
          </div>
          
           {/* Placeholder for Team Activity (Not yet implemented in V2 Backend) */}
           <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 opacity-60">
             <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center">
               <Activity size={18} className="mr-2 text-gray-400" />
               Aktivitas Tim
             </h3>
             <p className="text-xs text-gray-500 italic">Fitur log aktivitas akan segera hadir.</p>
           </div>
        </div>
      </div>

      {/* QR MODAL */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 flex justify-between items-center border-b border-gray-100 dark:border-slate-700">
              <h3 className="font-bold text-gray-900 dark:text-white">Koneksi WhatsApp</h3>
              <button onClick={() => setIsQrModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="p-10 text-center">
              {qrUrl ? (
                <div className="space-y-6">
                  <div className="inline-block p-4 bg-white dark:bg-slate-900 border-2 border-dashed border-gray-200 dark:border-slate-600 rounded-2xl">
                    <img src={qrUrl} alt="QR Code" className="w-64 h-64" />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Buka WhatsApp &gt; Perangkat Tertaut &gt; Tautkan Perangkat</p>
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center">
                  <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center animate-pulse mb-4">
                    <RefreshCw size={32} />
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 font-medium">Menghubungkan ke Gateway...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 flex justify-between items-center border-b border-gray-100 dark:border-slate-700">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center">
                <Settings size={20} className="mr-2 text-blue-600 dark:text-blue-400" />
                Pengaturan
              </h3>
              <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* WhatsApp Connection */}
              <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-2xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl">
                      <Wifi size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-white text-sm">Koneksi WhatsApp</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Status: <span className={waStatus === 'connected' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>{waStatus}</span></p>
                      {waStatus === 'connected' && connectedNumber && (
                        <div className="flex items-center gap-2 mt-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg inline-flex">
                          <Smartphone className="text-emerald-600 dark:text-emerald-400" size={14} />
                          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            {connectedNumber}
                          </span>
                        </div>
                      )}
                      {!sessionId && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Session belum diatur oleh Super Admin.</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={handleRequestQr}
                    disabled={!canManageSession || !sessionId}
                    className="px-4 py-2 bg-blue-600 disabled:bg-gray-200 disabled:text-gray-500 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    {canManageSession ? (waStatus === 'connected' ? 'Reconnect' : 'Connect') : 'Hanya Owner'}
                  </button>
                </div>
              </div>

              {/* Account Info */}
              <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-2xl">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
                    <Users size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white text-sm">Informasi Akun</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Detail akun yang sedang login</p>
                  </div>
                </div>
                <div className="space-y-2 ml-11">
                  <p className="text-xs"><span className="text-gray-500 dark:text-gray-400">Nama:</span> <span className="font-medium text-gray-900 dark:text-white">{user?.name}</span></p>
                  <p className="text-xs"><span className="text-gray-500 dark:text-gray-400">Email:</span> <span className="font-medium text-gray-900 dark:text-white">{user?.email}</span></p>
                  <p className="text-xs"><span className="text-gray-500 dark:text-gray-400">Role:</span> <span className="font-medium text-gray-900 dark:text-white">{roleLabel}</span></p>
                </div>
              </div>

              {/* Logout */}
              <button
                onClick={() => { logout(); navigate('/login'); }}
                className="w-full flex items-center justify-center space-x-2 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
              >
                <LogOut size={20} />
                <span className="font-bold text-sm">Keluar dari Akun</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HELP/SUPPORT MODAL */}
      {isHelpModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 flex justify-between items-center border-b border-gray-100 dark:border-slate-700">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center">
                <MessageCircle size={20} className="mr-2 text-blue-600 dark:text-blue-400" />
                Pusat Bantuan
              </h3>
              <button onClick={() => setIsHelpModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Isi form di bawah ini dan kami akan menghubungi Anda melalui WhatsApp.
              </p>

              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Nama Lengkap</label>
                <input
                  type="text"
                  value={helpForm.name}
                  onChange={(e) => setHelpForm({...helpForm, name: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Masukkan nama Anda"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Email</label>
                <input
                  type="email"
                  value={helpForm.email}
                  onChange={(e) => setHelpForm({...helpForm, email: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="email@contoh.com"
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Pesan</label>
                <textarea
                  value={helpForm.message}
                  onChange={(e) => setHelpForm({...helpForm, message: e.target.value})}
                  rows={4}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Jelaskan kendala atau pertanyaan Anda..."
                />
              </div>

              {/* Submit Button */}
              <button
                onClick={handleHelpSubmit}
                className="w-full flex items-center justify-center space-x-2 p-4 bg-green-600 hover:bg-green-700 text-white rounded-2xl transition-colors font-bold text-sm"
              >
                <Send size={18} />
                <span>Kirim via WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentDashboard;
