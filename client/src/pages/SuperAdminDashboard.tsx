import { useState, useMemo } from 'react';
import { TrendingUp, Users, Server, Activity, DollarSign, ArrowRight, Smartphone, Terminal, Settings, Trash2, RefreshCw, ShieldCheck, QrCode, ArrowLeft, Globe, WifiOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Pagination from '../components/Pagination';

const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'sessions' | 'logs' | 'config'>('sessions');
  const [selectedSession, setSelectedSession] = useState<any>(null);

  // Mock Sessions Data (100 Items)
  const allSessions = useMemo(() => Array.from({ length: 100 }, (_, i) => ({
    id: i === 0 ? 'TokoMaju_Main' : `Session_Bot_${i}`,
    status: Math.random() > 0.2 ? 'connected' : 'disconnected',
    phone: `+62 812-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
    uptime: `${Math.floor(Math.random() * 7)}d ${Math.floor(Math.random() * 24)}h`,
    apiKey: `wa_live_${Math.random().toString(36).substring(7)}...`
  })), []);

  // Mock Logs Data (200 Items)
  const allLogs = useMemo(() => Array.from({ length: 200 }, (_, i) => {
    const types = ['INFO', 'WARN', 'SYS', 'ERR'];
    const type = types[Math.floor(Math.random() * types.length)];
    return {
      id: i,
      time: new Date(Date.now() - i * 60000).toLocaleTimeString(),
      type,
      msg: type === 'INFO' ? `Pesan baru diterima dari +628...` : type === 'WARN' ? 'Rate limit warning' : 'System webhook event'
    };
  }), []);

  // Pagination State
  const [sessionPage, setSessionPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const sessionsPerPage = 9;
  const logsPerPage = 15;

  const currentSessions = allSessions.slice((sessionPage - 1) * sessionsPerPage, sessionPage * sessionsPerPage);
  const currentLogs = allLogs.slice((logPage - 1) * logsPerPage, logPage * logsPerPage);

  const handleBack = () => setSelectedSession(null);

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
          <StatCard title="Total Pendapatan" value="Rp 185.450.000" trend="+12%" icon={<DollarSign className="text-emerald-600" />} color="bg-emerald-50" />
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
                    {selectedSession ? `Sesi: ${selectedSession.id}` : 'Mesin WhatsApp Gateway'}
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
                          <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-4 border-4 border-white shadow-xl ${selectedSession.status === 'connected' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                             {selectedSession.status === 'connected' ? <ShieldCheck size={48} /> : <WifiOff size={48} />}
                          </div>
                          <h4 className="font-black text-gray-900 text-xl uppercase tracking-tighter">{selectedSession.status === 'connected' ? 'TERHUBUNG' : 'TERPUTUS'}</h4>
                          <p className="text-gray-500 text-sm mt-1 font-mono">{selectedSession.phone}</p>
                          <div className="mt-8 grid grid-cols-2 gap-3">
                             <button className="flex items-center justify-center space-x-2 py-3 bg-green-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-green-700 transition-all">
                                <RefreshCw size={14} /><span>Restart</span>
                             </button>
                             <button className="flex items-center justify-center space-x-2 py-3 bg-white text-red-500 border border-red-100 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-50 transition-all">
                                <Trash2 size={14} /><span>Hapus</span>
                             </button>
                          </div>
                       </div>
                    </div>
                    {/* ... (Configuration Part - Simplified for brevity) ... */}
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
                      <h4 className="font-black text-gray-900 text-lg tracking-tight uppercase">Armada Sesi Aktif ({allSessions.length})</h4>
                      <button className="text-[10px] font-black uppercase tracking-widest text-green-600 hover:bg-green-50 px-4 py-2 rounded-xl transition-all flex items-center space-x-2 border border-green-100 shadow-sm">
                         <RefreshCw size={14} className="animate-spin-slow" />
                         <span>Sinkronisasi</span>
                      </button>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                      <div className="border-2 border-dashed border-gray-200 rounded-[2.5rem] p-8 flex flex-col items-center justify-center text-center hover:border-green-400 hover:bg-green-50/30 transition-all cursor-pointer group shadow-sm">
                         <div className="w-16 h-16 bg-green-50 text-green-600 rounded-3xl flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-12 transition-all shadow-lg shadow-green-100/50">
                            <QrCode size={32} />
                         </div>
                         <h5 className="font-black text-gray-900 text-lg uppercase tracking-tight">Buat Instance Baru</h5>
                      </div>

                      {currentSessions.map((session) => (
                         <div key={session.id} className="bg-white border border-gray-100 rounded-[2.5rem] p-6 hover:shadow-2xl hover:shadow-green-100/50 transition-all relative group">
                            <div className={`absolute top-6 right-6 flex items-center space-x-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${session.status === 'connected' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                               <div className={`w-1.5 h-1.5 rounded-full ${session.status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                               <span>{session.status === 'connected' ? 'TERHUBUNG' : 'TERPUTUS'}</span>
                            </div>
                            
                            <div className="flex items-center space-x-4 mb-6">
                               <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 ${session.status === 'connected' ? 'bg-green-600 text-white shadow-green-200' : 'bg-slate-100 text-slate-400'}`}>
                                  <Smartphone size={28} />
                               </div>
                               <div>
                                  <h5 className="font-black text-gray-900 text-lg tracking-tighter leading-none">{session.id}</h5>
                                  <p className="text-xs text-gray-400 font-mono mt-1.5">{session.phone}</p>
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
                      totalPages={Math.ceil(allSessions.length / sessionsPerPage)} 
                      onPageChange={setSessionPage} 
                      totalItems={allSessions.length}
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
                 </div>
                 <div className="bg-slate-950 rounded-3xl p-6 font-mono text-[11px] h-[450px] overflow-y-auto shadow-2xl border border-slate-800 custom-scrollbar mb-4">
                    {currentLogs.map((log) => (
                       <div key={log.id} className="mb-2 flex space-x-4 hover:bg-white/5 p-1 rounded-lg px-3 transition-colors">
                          <span className="text-slate-600 select-none">[{log.time}]</span>
                          <span className={`font-black w-12 text-center rounded px-1.5 ${log.type === 'INFO' ? 'bg-blue-500/10 text-blue-400' : log.type === 'WARN' ? 'bg-yellow-500/10 text-yellow-400' : log.type === 'SYS' ? 'bg-purple-500/10 text-purple-400' : 'text-slate-300'}`}>
                             {log.type}
                          </span>
                          <span className="text-slate-300 flex-1">{log.msg}</span>
                       </div>
                    ))}
                 </div>
                 <Pagination 
                    currentPage={logPage} 
                    totalPages={Math.ceil(allLogs.length / logsPerPage)} 
                    onPageChange={setLogPage} 
                    totalItems={allLogs.length}
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