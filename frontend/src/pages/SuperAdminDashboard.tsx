import { useState, useEffect } from 'react';
import { TrendingUp, Users, Server, Activity, ArrowRight, Smartphone, Terminal, Settings, Trash2, RefreshCw, ShieldCheck, QrCode, ArrowLeft, Globe, WifiOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Pagination from '../components/Pagination';
import api from '../lib/api';
import { toast } from 'sonner';

const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'sessions' | 'logs' | 'config'>('sessions');
  const [selectedSession, setSelectedSession] = useState<any>(null);

  // Real Data State
  const [sessions, setSessions] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Pagination State
  const [sessionPage, setSessionPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const sessionsPerPage = 9;
  const logsPerPage = 15;

  // --- API FETCH FUNCTIONS ---

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/api/v1/sessions');
      // Backend returns array of session objects
      setSessions(data || []); 
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
      toast.error('Gagal memuat daftar sesi.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLogs = async () => {
    // Backend endpoint for logs
    try {
      const { data } = await api.get('/admin/test-logs');
      if (data && data.logs) {
        setLogs(data.logs.reverse()); // Show newest first
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  const handleCreateSession = async () => {
    const sessionId = `Session_${Date.now().toString().slice(-4)}`; // Simple ID Gen
    if(!confirm(`Buat sesi baru dengan ID: ${sessionId}?`)) return;

    try {
      await api.post('/api/v1/sessions', { sessionId });
      toast.success(`Sesi ${sessionId} berhasil dibuat!`);
      fetchSessions(); // Refresh list
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Gagal membuat sesi.');
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if(!confirm(`Yakin hapus sesi ${sessionId}? Ini akan memutuskan koneksi WA.`)) return;

    try {
      await api.delete(`/api/v1/sessions/${sessionId}`);
      toast.success('Sesi berhasil dihapus.');
      if(selectedSession?.sessionId === sessionId) setSelectedSession(null);
      fetchSessions();
    } catch (error: any) {
        toast.error('Gagal menghapus sesi.');
    }
  };

  // --- EFFECTS ---

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (activeTab === 'logs') {
        fetchLogs();
    }
  }, [activeTab]);


  // --- PAGINATION LOGIC ---
  const currentSessions = sessions.slice((sessionPage - 1) * sessionsPerPage, sessionPage * sessionsPerPage);
  const currentLogs = logs.slice((logPage - 1) * logsPerPage, logPage * logsPerPage);

  const handleBack = () => setSelectedSession(null);

  // Helper to format uptime (since backend doesn't give precise duration, we mock or use created time if available)
  // Backend returns: { sessionId, status, detail, qr, token, owner }
  
  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ringkasan Platform</h1>
          <p className="text-gray-500">Selamat datang kembali, Super Admin. Sistem berjalan normal.</p>
        </div>
        {!selectedSession && (
          <button 
            onClick={() => navigate('/super-admin/tenants')}
            className="flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-green-100"
          >
            <Users size={20} />
            <span className="font-bold text-sm">Kelola Tenant</span>
            <ArrowRight size={16} className="opacity-70" />
          </button>
        )}
      </div>

      {/* Main Stats Grid */}
      {!selectedSession && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title="Total Sesi" value={sessions.length.toString()} trend="Live" icon={<Smartphone className="text-emerald-600" />} color="bg-emerald-50" />
          <StatCard title="Tenant Aktif" value="45" trend="+3" icon={<Users className="text-green-600" />} color="bg-green-50" />
          <StatCard title="Total Pesan (WA)" value="854rb" trend="+24%" icon={<Server className="text-teal-600" />} color="bg-teal-50" />
          <StatCard title="Uptime Gateway" value="99.9%" trend="Stabil" icon={<Activity className="text-lime-600" />} color="bg-lime-50" />
        </div>
      )}

      {/* GATEWAY CONTROL CENTER */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mb-8">
        <div className="bg-emerald-900 p-5 px-8 flex items-center justify-between">
           <div className="flex items-center space-x-4">
              {selectedSession ? (
                <button onClick={handleBack} className="p-2 bg-emerald-800 text-white rounded-xl hover:bg-emerald-700 transition-colors">
                   <ArrowLeft size={20} />
                </button>
              ) : (
                <div className="p-2 bg-white/10 rounded-lg text-white">
                   <ShieldCheck size={24} />
                </div>
              )}
              <div>
                 <h3 className="text-white font-black tracking-tight text-lg">
                    {selectedSession ? `Sesi: ${selectedSession.sessionId}` : 'Mesin WhatsApp Gateway'}
                 </h3>
                 <div className="flex items-center space-x-2 text-xs text-emerald-200/80">
                    <span className="flex items-center space-x-1">
                       <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                       <span>Inti: Online</span>
                    </span>
                    <span>•</span>
                    <span>Redis: Terhubung</span>
                 </div>
              </div>
           </div>
           
           {!selectedSession && (
             <div className="flex bg-emerald-800 p-1 rounded-xl">
                <TabButton active={activeTab === 'sessions'} onClick={() => setActiveTab('sessions')} icon={<Smartphone size={14} />} label="Sesi" />
                <TabButton active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} icon={<Terminal size={14} />} label="Log Sistem" />
                <TabButton active={activeTab === 'config'} onClick={() => setActiveTab('config')} icon={<Settings size={14} />} label="Konfigurasi" />
             </div>
           )}
        </div>

        <div className="p-8">
           {/* DETAIL SESSION VIEW */}
           {selectedSession ? (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="space-y-6">
                       <div className="bg-slate-50 border border-gray-100 rounded-[2rem] p-8 text-center">
                          <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-4 border-4 border-white shadow-xl ${selectedSession.status === 'CONNECTED' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                             {selectedSession.status === 'CONNECTED' ? <ShieldCheck size={48} /> : <WifiOff size={48} />}
                          </div>
                          <h4 className="font-black text-gray-900 text-xl uppercase tracking-tighter">{selectedSession.status}</h4>
                          <p className="text-gray-500 text-sm mt-1 font-mono">{selectedSession.detail}</p>
                          <div className="mt-8 grid grid-cols-2 gap-3">
                             <button className="flex items-center justify-center space-x-2 py-3 bg-green-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-green-700 transition-all">
                                <RefreshCw size={14} /><span>Restart</span>
                             </button>
                             <button 
                                onClick={() => handleDeleteSession(selectedSession.sessionId)}
                                className="flex items-center justify-center space-x-2 py-3 bg-white text-red-500 border border-red-100 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-50 transition-all"
                             >
                                <Trash2 size={14} /><span>Hapus</span>
                             </button>
                          </div>
                       </div>
                    </div>
                    {/* ... (Configuration Part) ... */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm">
                            <h5 className="font-black text-gray-900 mb-6 flex items-center space-x-2 uppercase tracking-tight">
                                <Globe size={20} className="text-green-600" />
                                <span>Konfigurasi Sesi</span>
                            </h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <ToggleItem label="Chat Pribadi" desc="Teruskan pesan pribadi" active={true} />
                                <ToggleItem label="Grup Chat" desc="Teruskan pesan grup" active={false} />
                            </div>
                        </div>
                    </div>
                 </div>
              </div>
           ) : (
              /* SESSIONS LIST TAB */
              activeTab === 'sessions' && (
                <div className="space-y-4 animate-in fade-in duration-500">
                   <div className="flex justify-between items-center mb-2">
                      <h4 className="font-black text-gray-900 text-lg tracking-tight uppercase">Armada Sesi Aktif ({sessions.length})</h4>
                      <button 
                        onClick={fetchSessions}
                        disabled={isLoading}
                        className="text-[10px] font-black uppercase tracking-widest text-green-600 hover:bg-green-50 px-4 py-2 rounded-xl transition-all flex items-center space-x-2 border border-green-100 shadow-sm disabled:opacity-50"
                      >
                         <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                         <span>Sinkronisasi</span>
                      </button>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                      <div 
                        onClick={handleCreateSession}
                        className="border-2 border-dashed border-gray-200 rounded-[2.5rem] p-8 flex flex-col items-center justify-center text-center hover:border-green-400 hover:bg-green-50/30 transition-all cursor-pointer group shadow-sm"
                      >
                         <div className="w-16 h-16 bg-green-50 text-green-600 rounded-3xl flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-12 transition-all shadow-lg shadow-green-100/50">
                            <QrCode size={32} />
                         </div>
                         <h5 className="font-black text-gray-900 text-lg uppercase tracking-tight">Buat Instance Baru</h5>
                      </div>

                      {currentSessions.map((session) => (
                         <div key={session.sessionId} className="bg-white border border-gray-100 rounded-[2.5rem] p-6 hover:shadow-2xl hover:shadow-green-100/50 transition-all relative group">
                            <div className={`absolute top-6 right-6 flex items-center space-x-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${session.status === 'CONNECTED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                               <div className={`w-1.5 h-1.5 rounded-full ${session.status === 'CONNECTED' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                               <span>{session.status}</span>
                            </div>
                            
                            <div className="flex items-center space-x-4 mb-6">
                               <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 ${session.status === 'CONNECTED' ? 'bg-green-600 text-white shadow-green-200' : 'bg-slate-100 text-slate-400'}`}>
                                  <Smartphone size={28} />
                               </div>
                               <div>
                                  <h5 className="font-black text-gray-900 text-lg tracking-tighter leading-none">{session.sessionId}</h5>
                                  <p className="text-xs text-gray-400 font-mono mt-1.5 truncate max-w-[120px]">{session.detail}</p>
                               </div>
                            </div>

                            <div className="flex space-x-3">
                               <button onClick={() => setSelectedSession(session)} className="flex-1 py-3.5 bg-emerald-900 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-emerald-800 transition-all shadow-lg shadow-emerald-100">
                                  Lihat Detail
                               </button>
                            </div>
                         </div>
                      ))}
                   </div>

                   <Pagination 
                      currentPage={sessionPage} 
                      totalPages={Math.ceil(sessions.length / sessionsPerPage)} 
                      onPageChange={setSessionPage} 
                      totalItems={sessions.length}
                      itemsPerPage={sessionsPerPage}
                      colorTheme="green"
                   />
                </div>
              )
           )}

           {/* LOGS TAB */}
           {!selectedSession && activeTab === 'logs' && (
              <div className="animate-in fade-in duration-500 flex flex-col h-full">
                 <div className="flex justify-between items-center mb-4">
                    <h4 className="font-black text-gray-900 uppercase tracking-tight">Log Infrastruktur Global</h4>
                    <button onClick={fetchLogs} className="text-xs font-bold text-green-600 hover:text-green-800">Refresh</button>
                 </div>
                 <div className="bg-slate-950 rounded-3xl p-6 font-mono text-[11px] h-[450px] overflow-y-auto shadow-2xl border border-slate-800 custom-scrollbar mb-4">
                    {currentLogs.length > 0 ? currentLogs.map((log, idx) => (
                       <div key={idx} className="mb-2 flex space-x-4 hover:bg-white/5 p-1 rounded-lg px-3 transition-colors">
                          <span className="text-slate-600 select-none">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                          <span className={`font-black w-16 text-center rounded px-1.5 bg-blue-500/10 text-blue-400`}>
                             LOG
                          </span>
                          <span className="text-slate-300 flex-1">{log.message}</span>
                       </div>
                    )) : (
                        <p className="text-slate-500 text-center italic mt-10">Tidak ada log tersedia.</p>
                    )}
                 </div>
                 <Pagination 
                    currentPage={logPage} 
                    totalPages={Math.ceil(logs.length / logsPerPage)} 
                    onPageChange={setLogPage} 
                    totalItems={logs.length}
                    itemsPerPage={logsPerPage}
                    colorTheme="green"
                 />
              </div>
           )}

           {/* CONFIG TAB */}
           {!selectedSession && activeTab === 'config' && (
              <div className="max-w-3xl animate-in fade-in duration-500">
                 {/* ... (Global Config Content - No pagination needed here) ... */}
                 <div className="bg-orange-50 border border-orange-100 rounded-3xl p-6 mb-8 flex items-start space-x-4 shadow-sm shadow-orange-100/50">
                    <div className="p-3 bg-orange-100 rounded-2xl text-orange-600 shadow-inner"><Settings size={24} /></div>
                    <div>
                       <h5 className="text-lg font-black text-orange-900 uppercase tracking-tight">Konfigurasi Infrastruktur</h5>
                       <p className="text-sm text-orange-800/70 mt-1">Parameter global yang mengontrol seluruh instance.</p>
                    </div>
                 </div>
                 <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <ToggleItem label="Pemulihan Sesi Stateless" desc="Pulihkan state socket dari Redis." active={true} />
                        <ToggleItem label="Interseptor Panggilan Global" desc="Blokir otomatis panggilan WhatsApp." active={true} />
                    </div>
                 </div>
              </div>
           )}
        </div>
      </div>
    </div>
  );
};

// Reusable Components
const TabButton = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${active ? 'bg-emerald-700 text-white shadow-lg' : 'text-emerald-200 hover:text-white hover:bg-emerald-700/50'}`}>
    {icon} <span>{label}</span>
  </button>
);

const ToggleItem = ({ label, desc, active }: any) => (
  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 group hover:border-green-100 transition-all">
     <div>
        <p className="text-xs font-black text-gray-700 uppercase tracking-tight group-hover:text-green-600 transition-colors">{label}</p>
        <p className="text-[10px] text-gray-500 font-medium mt-0.5">{desc}</p>
     </div>
     <div className={`w-10 h-6 rounded-full relative transition-colors cursor-pointer ${active ? 'bg-green-600' : 'bg-gray-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${active ? 'left-5' : 'left-1'}`} /></div>
  </div>
);

const StatCard = ({ title, value, trend, icon, color }: any) => (
  <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-start justify-between group hover:shadow-xl transition-all">
    <div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 group-hover:text-green-600 transition-colors">{title}</p>
      <h3 className="text-3xl font-black text-gray-900 tracking-tighter leading-none">{value}</h3>
      <div className="flex items-center mt-3 text-green-600 text-[10px] font-black uppercase tracking-widest"><TrendingUp size={12} className="mr-1" /><span>{trend}</span></div>
    </div>
    <div className={`p-4 rounded-2xl shadow-sm ${color}`}>{icon}</div>
  </div>
);

export default SuperAdminDashboard;