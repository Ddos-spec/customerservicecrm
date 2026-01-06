import { useState } from 'react';
import { MessageCircle, Clock, Star, ThumbsUp, ArrowRight, Smartphone, QrCode, Wifi, X, RefreshCw, Activity, ShieldCheck, Link2, User, CheckCircle2, Clock3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { toast } from 'sonner';

const AgentDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
  // State untuk status WA (Simulasi)
  const [waStatus, setWaStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connected');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [pairingMethod, setPairingMethod] = useState<'qr' | 'code'>('qr');
  const [qrState, setQrState] = useState<'generating' | 'ready' | 'scanned'>('generating');
  const [qrUrl, setQrUrl] = useState('');
  const [pairingCode, setPairingCode] = useState('');

  // Mock Chat Terbaru
  const recentChats = [
    { id: 1, name: 'Budi Santoso', message: 'Halo gan, stok iPhone 15 masih ada?', time: 'Baru saja', status: 'unread', avatar: 'bg-blue-100 text-blue-600' },
    { id: 2, name: 'Siti Aminah', message: 'Terima kasih kak, barang sudah sampai.', time: '5 mnt lalu', status: 'read', avatar: 'bg-pink-100 text-pink-600' },
    { id: 3, name: 'Rudi Hermawan', message: 'Bisa kirim via Gojek hari ini?', time: '12 mnt lalu', status: 'replied', avatar: 'bg-green-100 text-green-600' },
    { id: 4, name: 'Dewi Lestari', message: 'Cara klaim garansinya gimana ya?', time: '30 mnt lalu', status: 'read', avatar: 'bg-purple-100 text-purple-600' },
    { id: 5, name: 'Ahmad Dani', message: 'Siap ditunggu infonya.', time: '1 jam lalu', status: 'replied', avatar: 'bg-yellow-100 text-yellow-600' },
  ];

  const openQrModal = (method: 'qr' | 'code' = 'qr') => {
    setPairingMethod(method);
    setIsQrModalOpen(true);
    if (method === 'qr') generateNewQr();
    else generatePairingCode();
  };

  const generateNewQr = () => {
    setQrState('generating');
    setTimeout(() => {
      const sessionId = `WA-SESSION-${Date.now()}`;
      setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${sessionId}`);
      setQrState('ready');
    }, 1500);
  };

  const generatePairingCode = () => {
    setQrState('generating');
    setTimeout(() => {
      const code = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      setPairingCode(code);
      setQrState('ready');
    }, 1500);
  };

  const handleSimulateScan = () => {
    setQrState('scanned');
    setTimeout(() => {
      setWaStatus('connected');
      setIsQrModalOpen(false);
      toast.success('WhatsApp Gateway berhasil terhubung!');
    }, 2000); 
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
          className="flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl transition-all shadow-lg shadow-indigo-100 transform active:scale-95"
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
                            <span className="text-slate-400 font-mono text-xs">+62 812-XXXX-XXXX</span>
                         </div>
                      </div>
                   </div>

                   <div className="flex items-center space-x-3">
                      {waStatus === 'connected' ? (
                         <button 
                           onClick={() => { setWaStatus('disconnected'); toast.warning('Gateway terputus'); }}
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
                            <button 
                              onClick={() => openQrModal('code')}
                              className="flex items-center space-x-2 px-5 py-2.5 bg-white/10 text-white hover:bg-white/20 rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-white/10"
                            >
                              <Link2 size={16} />
                              <span>Kode Pairing</span>
                            </button>
                         </div>
                      )}
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard 
          title="Total Chat" 
          value="24" 
          subtitle="Hari Ini"
          icon={<MessageCircle className="text-blue-600" />} 
          color="bg-blue-100"
        />
        <StatCard 
          title="Rata-rata Respon" 
          value="1m 30d" 
          subtitle="-15d vs kemarin"
          icon={<Clock className="text-purple-600" />} 
          color="bg-purple-100"
        />
        <StatCard 
          title="Kepuasan Pelanggan" 
          value="4.8/5" 
          subtitle="Sangat Baik"
          icon={<Star className="text-yellow-600" />} 
          color="bg-yellow-100"
        />
        <StatCard 
          title="Masalah Terselesaikan" 
          value="92%" 
          subtitle="Tingkat Sukses"
          icon={<ThumbsUp className="text-green-600" />} 
          color="bg-green-100"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* RECENT CHATS (Menggantikan Chart) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
           <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-gray-900 text-lg">Chat Terbaru</h3>
              <button 
                onClick={() => navigate('history')}
                className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1"
              >
                <span>Lihat Semua</span>
                <ArrowRight size={14} />
              </button>
           </div>
           
           <div className="space-y-4">
              {recentChats.map((chat) => (
                <div key={chat.id} className="flex items-center p-4 hover:bg-gray-50 rounded-2xl border border-gray-50 transition-colors cursor-pointer group">
                   <div className={`w-12 h-12 rounded-full flex items-center justify-center ${chat.avatar} font-bold text-lg mr-4`}>
                      {chat.name.charAt(0)}
                   </div>
                   <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                         <h4 className="font-bold text-gray-900 text-sm group-hover:text-indigo-600 transition-colors">{chat.name}</h4>
                         <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{chat.time}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{chat.message}</p>
                   </div>
                   <div className="ml-4">
                      {chat.status === 'unread' && <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></div>}
                      {chat.status === 'replied' && <CheckCircle2 size={16} className="text-green-500" />}
                   </div>
                </div>
              ))}
           </div>
        </div>

         {/* QUEUE STATUS (Menggantikan Shortcuts & Tips) */}
         <div className="space-y-6">
           <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm h-full">
              <h3 className="font-bold text-gray-900 text-lg mb-6">Status Antrian</h3>
              
              <div className="space-y-4">
                 <div className="bg-red-50 p-4 rounded-2xl border border-red-100 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                       <div className="p-2 bg-red-100 text-red-600 rounded-xl">
                          <MessageCircle size={20} />
                       </div>
                       <div>
                          <p className="text-xs font-bold text-red-800 uppercase tracking-wide">Menunggu Respon</p>
                          <p className="text-[10px] text-red-600/70">Butuh perhatian segera</p>
                       </div>
                    </div>
                    <span className="text-2xl font-black text-red-600">5</span>
                 </div>

                 <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                       <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                          <User size={20} />
                       </div>
                       <div>
                          <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">Sedang Ditangani</p>
                          <p className="text-[10px] text-blue-600/70">Chat aktif berlangsung</p>
                       </div>
                    </div>
                    <span className="text-2xl font-black text-blue-600">8</span>
                 </div>

                 <div className="bg-green-50 p-4 rounded-2xl border border-green-100 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                       <div className="p-2 bg-green-100 text-green-600 rounded-xl">
                          <CheckCircle2 size={20} />
                       </div>
                       <div>
                          <p className="text-xs font-bold text-green-800 uppercase tracking-wide">Selesai Hari Ini</p>
                          <p className="text-[10px] text-green-600/70">Tiket ditutup</p>
                       </div>
                    </div>
                    <span className="text-2xl font-black text-green-600">42</span>
                 </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-100">
                 <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                    <span>Rata-rata Waktu Tunggu</span>
                    <span className="font-bold text-gray-900">4m 12d</span>
                 </div>
                 <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-orange-400 h-2 rounded-full" style={{ width: '35%' }}></div>
                 </div>
                 <p className="text-[10px] text-orange-500 mt-2 flex items-center">
                    <Clock3 size={12} className="mr-1" /> 
                    Sedikit lebih lambat dari biasanya
                 </p>
              </div>
           </div>
         </div>
      </div>

      {/* QR Code / Pairing Modal (REALISTIC) */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-10 relative animate-in zoom-in-95 duration-200 text-center border border-white/20">
              <button onClick={() => setIsQrModalOpen(false)} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 transition-transform active:scale-90"><X size={28} /></button>
              
              <div className="mb-8">
                 <div className="inline-flex p-3 bg-indigo-50 text-indigo-600 rounded-2xl mb-4">
                    {pairingMethod === 'qr' ? <QrCode size={32} /> : <Smartphone size={32} />}
                 </div>
                 <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                    {pairingMethod === 'qr' ? 'Scan Kode QR' : 'Kode Pairing'}
                 </h2>
                 <p className="text-gray-500 text-sm mt-2 px-4 leading-relaxed">
                    {pairingMethod === 'qr' 
                      ? 'Buka WhatsApp > Setelan > Perangkat Tertaut > Tautkan Perangkat'
                      : 'Buka WhatsApp > Setelan > Perangkat Tertaut > Tautkan dengan Nomor Telepon'}
                 </p>
              </div>

              <div className="bg-gray-50 p-6 rounded-[2rem] border-2 border-dashed border-gray-200 flex items-center justify-center mb-8 relative min-h-[280px] shadow-inner">
                 {qrState === 'generating' ? (
                    <div className="flex flex-col items-center py-8">
                       <RefreshCw className="animate-spin text-indigo-600 mb-4" size={40} />
                       <p className="text-sm font-black text-indigo-600 animate-pulse uppercase tracking-widest">Menyiapkan...</p>
                    </div>
                 ) : qrState === 'scanned' ? (
                    <div className="flex flex-col items-center py-8 animate-in zoom-in duration-500">
                       <div className="w-20 h-20 bg-green-500 text-white rounded-full flex items-center justify-center mb-4 shadow-xl shadow-green-200">
                         <ShieldCheck size={40} />
                       </div>
                       <p className="text-lg font-black text-gray-900 uppercase">Terotentikasi</p>
                       <p className="text-xs text-gray-500 mt-1">Membuat jalur aman...</p>
                    </div>
                 ) : pairingMethod === 'qr' ? (
                    <div className="relative group cursor-pointer bg-white p-4 rounded-3xl shadow-sm" onClick={generateNewQr}>
                       <img src={qrUrl} alt="Scan Saya" className="w-56 h-56 rounded-lg mix-blend-multiply" />
                       <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-52 h-1 bg-indigo-500/40 absolute top-0 animate-[scan_3s_ease-in-out_infinite]" />
                       </div>
                    </div>
                 ) : (
                    <div className="flex flex-col items-center">
                       <div className="flex space-x-2 mb-4">
                          {pairingCode.split('-').map((part, idx) => (
                             <div key={idx} className="bg-white border-2 border-indigo-100 rounded-2xl px-4 py-3 text-2xl font-black text-indigo-600 shadow-sm font-mono tracking-[0.2em]">
                                {part}
                             </div>
                          ))}
                       </div>
                       <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Masukkan kode ini di ponsel Anda</p>
                    </div>
                 )}
              </div>

              {qrState === 'ready' && (
                <div className="space-y-3">
                   <button 
                     onClick={handleSimulateScan}
                     className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl shadow-slate-200 transition-all active:scale-95"
                   >
                     Simulasikan Koneksi
                   </button>
                   <button 
                     onClick={pairingMethod === 'qr' ? generateNewQr : generatePairingCode}
                     className="text-gray-400 text-[10px] font-bold uppercase tracking-widest hover:text-indigo-600 transition-colors"
                   >
                     Buat Ulang Kode
                   </button>
                </div>
              )}
           </div>
        </div>
      )}
    </div>
  );
};

const HealthMetric = ({ label, status, value }: any) => (
  <div className="flex items-center justify-between border-b border-indigo-100/30 pb-3 last:border-0 last:pb-0">
     <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
        <p className="text-sm font-bold text-gray-900">{status}</p>
     </div>
     <span className="text-xs font-mono bg-white px-2 py-1 rounded-lg border border-indigo-100 text-indigo-600 font-bold">{value}</span>
  </div>
);

const StatCard = ({ title, value, subtitle, icon, color }: any) => (
  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl ${color}`}>
        {icon}
      </div>
      {subtitle.includes('+') ? (
        <span className="text-green-600 bg-green-50 px-2 py-1 rounded-lg text-xs font-bold">{subtitle}</span>
      ) : subtitle.includes('-') ? (
         <span className="text-green-600 bg-green-50 px-2 py-1 rounded-lg text-xs font-bold">{subtitle}</span>
      ) : (
         <span className="text-gray-500 bg-gray-50 px-2 py-1 rounded-lg text-xs font-bold">{subtitle}</span>
      )}
    </div>
    <h3 className="text-3xl font-bold text-gray-900 mb-1 leading-tight tracking-tighter">{value}</h3>
    <p className="text-gray-500 text-sm font-medium">{title}</p>
  </div>
);

export default AgentDashboard;