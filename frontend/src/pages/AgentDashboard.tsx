import { useState, useEffect } from 'react';
import {
  Clock, Star, QrCode, Wifi, X, RefreshCw, Activity, Settings,
  CheckCircle2, MessageSquare, Bell, Moon, Globe, Shield, LogOut, Send, MessageCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';
import api from '../lib/api';
import { toast } from 'sonner';

const AgentDashboard = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { isDarkMode, toggleDarkMode } = useThemeStore();

  // Real State for WA Connection - Default to 'connected' for demo mode
  const [, setSessionData] = useState<any>(null);
  const [waStatus, setWaStatus] = useState<'connected' | 'disconnected' | 'connecting'>(user?.isDemo ? 'connected' : 'disconnected');
  const [qrUrl, setQrUrl] = useState('');

  // UI States
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  // Settings States
  const [notifications, setNotifications] = useState(true);
  const [language, setLanguage] = useState('id');

  // Help Form States
  const [helpForm, setHelpForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    category: 'teknis',
    message: ''
  });

  // --- MOCK DATA FOR DEMO 1:1 ---
  const stats = [
    { label: 'Total Chat Hari Ini', value: '142', icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Waktu Respon Rata-rata', value: '1.5 mnt', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Kepuasan Pelanggan', value: '4.9/5', icon: Star, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Chat Terselesaikan', value: '128', icon: CheckCircle2, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  const recentChats = [
    { id: 1, name: 'Budi Santoso', message: 'Tanya stok batik kencana ungu kak...', time: '2 menit lalu', status: 'unread', avatar: 'BS' },
    { id: 2, name: 'Siti Aminah', message: 'Terima kasih barang sudah sampai!', time: '15 menit lalu', status: 'read', avatar: 'SA' },
    { id: 3, name: 'Dewi Lestari', message: 'Bisa minta list harga terupdate?', time: '1 jam lalu', status: 'read', avatar: 'DL' },
    { id: 4, name: 'Agus Prayogo', message: 'Pesanan saya dengan kode #123 kok belum dikirim?', time: '3 jam lalu', status: 'unread', avatar: 'AP' },
  ];

  const teamActivity = [
    { user: 'Siti Aminah', action: 'Membalas chat dari Andi', time: 'Just now' },
    { user: 'Budi Santoso', action: 'Mengubah status pesanan #992', time: '5m ago' },
    { user: 'System AI', action: 'Menjawab otomatis tanya jam operasional', time: '12m ago' },
  ];

  // Fetch Session Data (skip for demo mode)
  const fetchSessionStatus = async () => {
    if (user?.isDemo) return; // Skip API calls for demo mode

    try {
        const { data } = await api.get('/api/v1/sessions');
        const mySession = data[0];
        if (mySession) {
            setSessionData(mySession);
            setWaStatus(mySession.status === 'CONNECTED' ? 'connected' : mySession.status === 'CONNECTING' ? 'connecting' : 'disconnected');
            if (mySession.qr) {
                setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(mySession.qr)}`);
            }
        }
    } catch (error) {
        console.error('Failed to fetch session:', error);
    }
  };

  useEffect(() => {
      if (user?.isDemo) return; // Skip for demo mode

      fetchSessionStatus();
      const interval = setInterval(fetchSessionStatus, 5000);
      return () => clearInterval(interval);
  }, [user?.isDemo]);

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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Selamat Datang, {user?.name || 'Agen'}!</h1>
          <p className="text-gray-500 dark:text-gray-400">Pantau performa pelayanan pelanggan Anda hari ini.</p>
        </div>

        <div className="flex items-center space-x-3">
          <div className={`flex items-center space-x-2 px-4 py-2 rounded-full border ${
            waStatus === 'connected' ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400' :
            waStatus === 'connecting' ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 animate-pulse' :
            'bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400'
          }`}>
            <Wifi size={16} />
            <span className="text-sm font-bold capitalize">WhatsApp: {waStatus}</span>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((item, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${item.bg} dark:bg-opacity-20 ${item.color}`}>
                <item.icon size={24} />
              </div>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-full">+12%</span>
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
              Chat Terbaru
            </h3>
            <button onClick={() => navigate(user?.role === 'admin_agent' ? '/admin/chat' : '/agent/chat')} className="text-blue-600 dark:text-blue-400 text-sm font-bold hover:underline">Lihat Semua</button>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-slate-700">
            {recentChats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => navigate(user?.role === 'admin_agent' ? '/admin/chat' : '/agent/chat', { state: { selectedChat: chat } })}
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
                {chat.status === 'unread' && <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full"></div>}
              </div>
            ))}
          </div>
        </div>

        {/* Right Sidebar - Team Activity */}
        <div className="space-y-8">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
            <h3 className="font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <Activity size={18} className="mr-2 text-emerald-600 dark:text-emerald-400" />
              Aktivitas Tim
            </h3>
            <div className="space-y-6">
              {teamActivity.map((act, i) => (
                <div key={i} className="flex space-x-3">
                  <div className="w-1 h-10 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden shrink-0">
                    <div className={`w-full h-1/2 ${i === 0 ? 'bg-blue-500' : 'bg-emerald-500'}`}></div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-900 dark:text-white font-bold">{act.user}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">{act.action}</p>
                    <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-1">{act.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

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
                    </div>
                  </div>
                  <button
                    onClick={() => { setIsSettingsOpen(false); setIsQrModalOpen(true); }}
                    className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    {waStatus === 'connected' ? 'Reconnect' : 'Connect'}
                  </button>
                </div>
              </div>

              {/* Notifications */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-2xl">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl">
                    <Bell size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white text-sm">Notifikasi</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Terima pemberitahuan chat baru</p>
                  </div>
                </div>
                <button
                  onClick={() => setNotifications(!notifications)}
                  className={`w-12 h-6 rounded-full transition-colors ${notifications ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${notifications ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
                </button>
              </div>

              {/* Dark Mode */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-2xl">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl">
                    <Moon size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white text-sm">Mode Gelap</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Tampilan lebih nyaman di malam hari</p>
                  </div>
                </div>
                <button
                  onClick={toggleDarkMode}
                  className={`w-12 h-6 rounded-full transition-colors ${isDarkMode ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${isDarkMode ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
                </button>
              </div>

              {/* Language */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-2xl">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
                    <Globe size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white text-sm">Bahasa</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Pilih bahasa tampilan</p>
                  </div>
                </div>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="px-3 py-2 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-sm font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="id">Indonesia</option>
                  <option value="en">English</option>
                </select>
              </div>

              {/* Account Info */}
              <div className="p-4 bg-gray-50 dark:bg-slate-700/50 rounded-2xl">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
                    <Shield size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white text-sm">Informasi Akun</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Detail akun yang sedang login</p>
                  </div>
                </div>
                <div className="space-y-2 ml-11">
                  <p className="text-xs"><span className="text-gray-500 dark:text-gray-400">Nama:</span> <span className="font-medium text-gray-900 dark:text-white">{user?.name}</span></p>
                  <p className="text-xs"><span className="text-gray-500 dark:text-gray-400">Email:</span> <span className="font-medium text-gray-900 dark:text-white">{user?.email}</span></p>
                  <p className="text-xs"><span className="text-gray-500 dark:text-gray-400">Role:</span> <span className="font-medium text-gray-900 dark:text-white capitalize">{user?.role?.replace('_', ' ')}</span></p>
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

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Kategori Bantuan</label>
                <select
                  value={helpForm.category}
                  onChange={(e) => setHelpForm({...helpForm, category: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="teknis">Bantuan Teknis</option>
                  <option value="billing">Pertanyaan Billing</option>
                  <option value="fitur">Request Fitur Baru</option>
                  <option value="lainnya">Lainnya</option>
                </select>
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

              <p className="text-[10px] text-center text-gray-400 dark:text-gray-500">
                Pesan akan dikirim ke WhatsApp tim support kami
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentDashboard;
