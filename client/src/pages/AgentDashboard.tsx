import { useState, useMemo, useEffect } from 'react';
import { MessageCircle, Clock, Star, ThumbsUp, ArrowRight, Smartphone, QrCode, Wifi, X, RefreshCw, Activity, ShieldCheck, Link2, CheckCircle2, User, Clock3, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { toast } from 'sonner';
import Pagination from '../components/Pagination';
import api from '../lib/api';

const AgentDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
  // Real State
  const [sessionData, setSessionData] = useState<any>(null);
  const [waStatus, setWaStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [qrUrl, setQrUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Settings State
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [pairingMethod, setPairingMethod] = useState<'qr' | 'code'>('qr');
  const [pairingCode, setPairingCode] = useState('');
  const [autoReject, setAutoReject] = useState(true);
  const [autoReplyMessage, setAutoReplyMessage] = useState('');

  // Fetch Session Data
  const fetchSessionStatus = async () => {
    setIsLoading(true);
    try {
        const { data } = await api.get('/api/v1/sessions');
        // Admin Agent should only see their own session. Take the first one.
        const mySession = data[0]; 
        
        if (mySession) {
            setSessionData(mySession);
            if (mySession.status === 'CONNECTED') {
                setWaStatus('connected');
            } else if (mySession.status === 'CONNECTING') {
                setWaStatus('connecting');
            } else {
                setWaStatus('disconnected');
            }

            // QR Code Handling
            if (mySession.qr) {
                // Use a QR code API to render the string from backend
                setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(mySession.qr)}`);
            }
        }
    } catch (error) {
        console.error('Failed to fetch session:', error);
    } finally {
        setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
      if(!sessionData?.sessionId) return;
      if(!confirm('Putuskan koneksi WA?')) return;
      try {
          await api.delete(`/api/v1/sessions/${sessionData.sessionId}`);
          toast.success('Koneksi diputuskan.');
          fetchSessionStatus();
      } catch (e) {
          toast.error('Gagal memutuskan koneksi.');
      }
  };

  const handleCreateSession = async () => {
      // Create a session for this user if none exists
      const sessionId = user?.id || `user_${Date.now()}`;
      try {
          await api.post('/api/v1/sessions', { sessionId });
          toast.success('Sesi inisialisasi dibuat. Silakan scan.');
          fetchSessionStatus();
          openQrModal('qr');
      } catch (e: any) {
          toast.error(e.response?.data?.error || 'Gagal membuat sesi.');
      }
  };

  // --- Effects ---
  useEffect(() => {
      fetchSessionStatus();
      // Poll status every 5 seconds
      const interval = setInterval(fetchSessionStatus, 5000);
      return () => clearInterval(interval);
  }, []);


  // --- MOCK DATA FOR CHATS (Placeholder) ---
  const allRecentChats = useMemo(() => Array.from({ length: 5 }, (_, i) => ({
    id: i + 1,
    name: `Pelanggan Demo ${i + 1}`,
    message: 'Chat history belum terhubung ke database.',
    time: 'N/A',
    status: 'read',
    avatar: 'bg-gray-100 text-gray-600'
  })), []);

  const [chatPage, setChatPage] = useState(1);
  const chatsPerPage = 5;
  const totalChatPages = Math.ceil(allRecentChats.length / chatsPerPage);
  const currentChats = allRecentChats; // Mock small list

  const openQrModal = (method: 'qr' | 'code' = 'qr') => {
    setPairingMethod(method);
    setIsQrModalOpen(true);
    if (!sessionData) handleCreateSession();
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 text-shadow-sm">Dashboard Performa</h1>
          <p className="text-gray-500">Ringkasan aktivitas Anda hari ini.</p>
        </div>
        <button 
          onClick={() => navigate('chat')}
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl transition-all shadow-lg shadow-blue-100 transform active:scale-95"
        >
          <MessageCircle size={20} />
          <span className="font-bold">Buka Workspace Chat</span>
          <ArrowRight size={18} className="opacity-70" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {/* GATEWAY STATUS WIDGET */}
        {user?.role === 'admin_agent' && (
          <div className="lg:col-span-3">
             <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
                <div className="bg-slate-900 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                   <div className="flex items-center space-x-5 text-white">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${waStatus === 'connected' ? 'bg-green-500/20 text-green-400' : waStatus === 'connecting' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'} border border-white/10 backdrop-blur-md`}>
                         {waStatus === 'connected' ? <ShieldCheck size={32} /> : <Activity size={32} className={waStatus === 'connecting' ? 'animate-pulse' : ''} />}
                      </div>
                      <div>
                         <h3 className="font-black text-xl tracking-tight">Koneksi WhatsApp</h3>
                         <div className="flex items-center space-x-3 mt-1.5 text-sm">
                            <span className={`flex items-center space-x-1.5 ${waStatus === 'connected' ? 'text-green-400' : waStatus === 'connecting' ? 'text-yellow-400' : 'text-red-400'}`}>
                               <Wifi size={14} className={waStatus === 'connected' ? 'animate-pulse' : ''} />
                               <span className="font-bold uppercase tracking-widest text-[10px]">{waStatus === 'connected' ? 'TERHUBUNG' : waStatus === 'connecting' ? 'MENGHUBUNGKAN' : 'TERPUTUS'}</span>
                            </span>
                            <span className="text-slate-500">•</span>
                            <span className="text-slate-400 font-mono text-xs">{sessionData?.sessionId || 'Belum ada sesi'}</span>
                         </div>
                      </div>
                   </div>

                   <div className="flex items-center space-x-3">
                      {waStatus === 'connected' && (
                        <button 
                          onClick={() => setIsSettingsModalOpen(true)}
                          className="p-3 bg-white/10 text-white hover:bg-white/20 rounded-2xl transition-all border border-white/10 active:scale-90"
                          title="Pengaturan Balasan"
                        >
                          <Settings size={20} />
                        </button>
                      )}
                      
                      {waStatus === 'connected' ? (
                         <button 
                           onClick={handleDisconnect}
                           className="px-5 py-2.5 bg-red-500/10 text-red-400 hover:bg-red-50 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-red-500/20"
                         >
                           Putuskan
                         </button>
                      ) : (
                         <div className="flex space-x-2">
                            <button 
                              onClick={() => openQrModal('qr')}
                              className="flex items-center space-x-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-green-900/20"
                            >
                              <QrCode size={16} />
                              <span>Scan QR</span>
                            </button>
                         </div>
                      )}
                   </div>
                </div>

                {/* Status Content */}
                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100/50">
                            <h4 className="font-bold text-gray-900 mb-4 flex items-center space-x-2">
                              <Activity size={18} className="text-blue-600" />
                              <span>Kesehatan Koneksi</span>
                            </h4>
                            <div className="space-y-4">
                              <div className="flex justify-between border-b border-blue-100/30 pb-2">
                                <span className="text-xs font-bold text-gray-500">Status</span>
                                <span className="text-xs font-bold text-blue-600">{sessionData?.detail || 'Menunggu inisialisasi...'}</span>
                              </div>
                            </div>
                        </div>
                      </div>
                      <div className="bg-slate-50 rounded-2xl p-6 border border-gray-100 flex flex-col justify-center items-center text-center">
                        {waStatus === 'connected' ? (
                            <>
                              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-4 border-4 border-white shadow-xl">
                                  <ShieldCheck size={40} />
                              </div>
                              <h4 className="font-black text-gray-900 text-lg">Terhubung & Aman</h4>
                            </>
                        ) : (
                            <>
                              <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center text-slate-400 mb-4 border-4 border-white shadow-xl italic font-black text-2xl">?</div>
                              <h4 className="font-black text-gray-400 text-lg">Siap Hubungkan</h4>
                              <p className="text-gray-400 text-sm max-w-[240px] mt-2 italic text-balance">Klik Scan QR untuk memulai.</p>
                            </>
                        )}
                      </div>
                  </div>
                </div>
             </div>
          </div>
        )}
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard title="Total Chat" value="0" subtitle="Hari Ini" icon={<MessageCircle className="text-blue-600" />} color="bg-blue-100" />
        <StatCard title="Rata-rata Respon" value="-" subtitle="Belum ada data" icon={<Clock className="text-purple-600" />} color="bg-purple-100" />
        <StatCard title="Kepuasan Pelanggan" value="-" subtitle="Belum ada data" icon={<Star className="text-yellow-600" />} color="bg-yellow-100" />
        <StatCard title="Masalah Terselesaikan" value="-" subtitle="Belum ada data" icon={<ThumbsUp className="text-green-600" />} color="bg-green-100" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* RECENT CHATS - MOCK ONLY FOR NOW */}
        <div className="lg:col-span-2 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col h-full">
           <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-gray-900 text-lg">Chat Terbaru</h3>
              <span className="text-xs text-orange-500 font-bold bg-orange-50 px-2 py-1 rounded">Simulasi Data</span>
           </div>
           
           <div className="space-y-4 flex-1">
              {currentChats.map((chat) => (
                <div key={chat.id} className="flex items-center p-4 hover:bg-gray-50 rounded-2xl border border-gray-50 transition-colors cursor-pointer group">
                   <div className={`w-12 h-12 rounded-full flex items-center justify-center ${chat.avatar} font-bold text-lg mr-4`}>
                      {chat.name.charAt(0)}
                   </div>
                   <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                         <h4 className="font-bold text-gray-900 text-sm group-hover:text-blue-600 transition-colors">{chat.name}</h4>
                         <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{chat.time}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{chat.message}</p>
                   </div>
                </div>
              ))}
           </div>
        </div>

         {/* QUEUE STATUS */}
         <div className="space-y-6">
           <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm h-full flex items-center justify-center text-center">
              <p className="text-gray-400 text-sm">Menunggu integrasi modul Chat History...</p>
           </div>
         </div>
      </div>

      {/* MODAL: Pengaturan Balasan Otomatis */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-10 relative animate-in zoom-in-95 duration-200 border border-white/20">
              <button onClick={() => setIsSettingsModalOpen(false)} className="absolute top-8 right-8 text-gray-400 hover:text-gray-600 transition-transform active:scale-90"><X size={28} /></button>
              
              <div className="mb-10">
                 <div className="inline-flex p-3 bg-blue-50 text-blue-600 rounded-2xl mb-4">
                    <Settings size={32} />
                 </div>
                 <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase leading-none">Fitur Balas Panggilan</h2>
                 <p className="text-gray-500 text-sm mt-2 font-medium leading-relaxed">
                    Atur kebijakan otomatis saat ada panggilan WhatsApp masuk ke nomor Anda.
                 </p>
              </div>

              <div className="space-y-8">
                 {/* Toggle Reject */}
                 <div className="flex items-center justify-between p-6 bg-gray-50 rounded-[2rem] border border-gray-100 group hover:border-blue-100 transition-all">
                    <div>
                       <p className="text-sm font-black text-gray-900 uppercase tracking-tight group-hover:text-blue-600 transition-colors">Tolak Otomatis</p>
                       <p className="text-[10px] text-gray-500 font-medium mt-0.5">Segera matikan telepon masuk</p>
                    </div>
                    <button 
                      onClick={() => setAutoReject(!autoReject)}
                      className={`w-12 h-7 rounded-full relative transition-colors ${autoReject ? 'bg-blue-600' : 'bg-gray-300'}`}
                    >
                       <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-all ${autoReject ? 'left-6' : 'left-1'}`} />
                    </button>
                 </div>

                 {/* Message Input */}
                 <div className="group">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Pesan Balasan Teks</label>
                    <textarea 
                      value={autoReplyMessage}
                      onChange={(e) => setAutoReplyMessage(e.target.value)}
                      placeholder="Tulis pesan balasan di sini..."
                      rows={4}
                      className="w-full p-6 bg-gray-50 border-2 border-gray-100 rounded-[2rem] focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-medium leading-relaxed transition-all shadow-inner resize-none"
                    />
                    <p className="text-[10px] text-gray-400 mt-3 italic">* Pesan ini akan otomatis terkirim setelah panggilan ditolak.</p>
                 </div>

                 <button 
                   onClick={() => {
                      toast.success('Pengaturan balasan berhasil disimpan! (Simulasi)');
                      setIsSettingsModalOpen(false);
                   }}
                   className="w-full py-4 bg-slate-900 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl shadow-slate-200 hover:bg-blue-600 transition-all active:scale-95"
                 >
                   Simpan Perubahan
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* QR Code Modal - Connected to Real Backend Data */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-10 relative animate-in zoom-in-95 duration-200 text-center border border-white/20">
              <button onClick={() => setIsQrModalOpen(false)} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 transition-transform active:scale-90"><X size={28} /></button>
              
              <div className="mb-8">
                 <div className="inline-flex p-3 bg-indigo-50 text-indigo-600 rounded-2xl mb-4">
                    {pairingMethod === 'qr' ? <QrCode size={32} /> : <Smartphone size={32} />}
                 </div>
                 <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                    Scan Kode QR
                 </h2>
                 <p className="text-gray-500 text-sm mt-2 px-4 leading-relaxed">
                    Buka WhatsApp {'>'} Perangkat Tertaut {'>'} Tautkan Perangkat
                 </p>
              </div>

              <div className="bg-gray-50 p-6 rounded-[2rem] border-2 border-dashed border-gray-200 flex items-center justify-center mb-8 relative min-h-[280px] shadow-inner">
                 {qrUrl ? (
                    <div className="relative group cursor-pointer bg-white p-4 rounded-3xl shadow-sm">
                       <img src={qrUrl} alt="Scan Saya" className="w-56 h-56 rounded-lg mix-blend-multiply" />
                       <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-52 h-1 bg-indigo-500/40 absolute top-0 animate-[scan_3s_ease-in-out_infinite]" />
                       </div>
                    </div>
                 ) : (
                    <div className="flex flex-col items-center py-8">
                       <RefreshCw className="animate-spin text-indigo-600 mb-4" size={40} />
                       <p className="text-sm font-black text-indigo-600 animate-pulse uppercase tracking-widest">Menunggu QR dari Server...</p>
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const StatCard = ({ title, value, subtitle, icon, color }: any) => (
  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl ${color}`}>
        {icon}
      </div>
      <span className="text-gray-500 bg-gray-50 px-2 py-1 rounded-lg text-xs font-bold">{subtitle}</span>
    </div>
    <h3 className="text-3xl font-bold text-gray-900 mb-1 leading-tight tracking-tighter">{value}</h3>
    <p className="text-gray-500 text-sm font-medium">{title}</p>
  </div>
);

export default AgentDashboard;