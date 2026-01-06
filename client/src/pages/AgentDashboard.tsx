import { useState } from 'react';
import { MessageCircle, Clock, Star, ThumbsUp, ArrowRight, Smartphone, QrCode, Wifi, X, RefreshCw, Activity, ShieldCheck, Link2 } from 'lucide-react';
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
      toast.success('WhatsApp Gateway connected successfully!');
    }, 2000); 
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 text-shadow-sm">Performance Dashboard</h1>
          <p className="text-gray-500">Your activity summary for today.</p>
        </div>
        <button 
          onClick={() => navigate('chat')}
          className="flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl transition-all shadow-lg shadow-indigo-100 transform active:scale-95"
        >
          <MessageCircle size={20} />
          <span className="font-bold">Open Chat Workspace</span>
          <ArrowRight size={18} className="opacity-70" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {/* GATEWAY STATUS WIDGET (Simplified for Admin Agent) */}
        {user?.role === 'admin_agent' && (
          <div className="lg:col-span-3">
             <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
                {/* Header Control Center */}
                <div className="bg-slate-900 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                   <div className="flex items-center space-x-5 text-white">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${waStatus === 'connected' ? 'bg-green-500/20 text-green-400' : waStatus === 'connecting' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'} border border-white/10 backdrop-blur-md`}>
                         {waStatus === 'connected' ? <ShieldCheck size={32} /> : <Activity size={32} className={waStatus === 'connecting' ? 'animate-pulse' : ''} />}
                      </div>
                      <div>
                         <h3 className="font-black text-xl tracking-tight">WhatsApp Connection</h3>
                         <div className="flex items-center space-x-3 mt-1.5 text-sm">
                            <span className={`flex items-center space-x-1.5 ${waStatus === 'connected' ? 'text-green-400' : waStatus === 'connecting' ? 'text-yellow-400' : 'text-red-400'}`}>
                               <Wifi size={14} className={waStatus === 'connected' ? 'animate-pulse' : ''} />
                               <span className="font-bold uppercase tracking-widest text-[10px]">{waStatus}</span>
                            </span>
                            <span className="text-slate-500">•</span>
                            <span className="text-slate-400 font-mono text-xs">+62 812-XXXX-XXXX</span>
                         </div>
                      </div>
                   </div>

                   <div className="flex items-center space-x-3">
                      {waStatus === 'connected' ? (
                         <button 
                           onClick={() => { setWaStatus('disconnected'); toast.warning('Gateway disconnected'); }}
                           className="px-5 py-2.5 bg-red-500/10 text-red-400 hover:bg-red-50 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-red-500/20"
                         >
                           Disconnect
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
                              <span>Pairing Code</span>
                            </button>
                         </div>
                      )}
                   </div>
                </div>

                {/* Status Content Only (No Tabs) */}
                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100/50">
                            <h4 className="font-bold text-gray-900 mb-4 flex items-center space-x-2">
                              <Activity size={18} className="text-indigo-600" />
                              <span>Connection Health</span>
                            </h4>
                            <div className="space-y-4">
                              <HealthMetric label="Service Status" status={waStatus === 'connected' ? 'Operational' : 'Action Required'} value={waStatus === 'connected' ? '100%' : '0%'} />
                              <HealthMetric label="Last Sync" status="Just now" value="OK" />
                            </div>
                        </div>
                      </div>
                      <div className="bg-slate-50 rounded-2xl p-6 border border-gray-100 flex flex-col justify-center items-center text-center">
                        {waStatus === 'connected' ? (
                            <>
                              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-4 border-4 border-white shadow-xl">
                                  <ShieldCheck size={40} />
                              </div>
                              <h4 className="font-black text-gray-900 text-lg">Connected & Secure</h4>
                              <p className="text-gray-500 text-sm max-w-[240px] mt-2">Your WhatsApp number is paired and ready to receive messages.</p>
                            </>
                        ) : (
                            <>
                              <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center text-slate-400 mb-4 border-4 border-white shadow-xl italic font-black text-2xl">?</div>
                              <h4 className="font-black text-gray-400 text-lg">No Active Connection</h4>
                              <p className="text-gray-400 text-sm max-w-[240px] mt-2 italic text-balance">Please scan the QR code to reconnect your WhatsApp number.</p>
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

        <StatCard 
          title="Total Chats" 
          value="24" 
          subtitle="Today"
          icon={<MessageCircle className="text-blue-600" />} 
          color="bg-blue-100"
        />
        <StatCard 
          title="Avg. Response Time" 
          value="1m 30s" 
          subtitle="-15s vs yesterday"
          icon={<Clock className="text-purple-600" />} 
          color="bg-purple-100"
        />
        <StatCard 
          title="Customer Satisfaction" 
          value="4.8/5" 
          subtitle="Excellent"
          icon={<Star className="text-yellow-600" />} 
          color="bg-yellow-100"
        />
        <StatCard 
          title="Issues Resolved" 
          value="92%" 
          subtitle="Success Rate"
          icon={<ThumbsUp className="text-green-600" />} 
          color="bg-green-100"
        />
      </div>

      {/* Charts & Shortcuts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
           {/* Placeholder for chart to match existing structure */}
           <div className="h-64 flex items-center justify-center text-gray-400">Chart Visualization Area</div>
        </div>
         <div className="space-y-6">
           {/* Placeholder for sidebar widgets */}
           <div className="bg-white p-6 rounded-2xl h-full border border-gray-100">Shortcuts & Tips</div>
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
                    {pairingMethod === 'qr' ? 'Scan QR Code' : 'Pairing Code'}
                 </h2>
                 <p className="text-gray-500 text-sm mt-2 px-4 leading-relaxed">
                    {pairingMethod === 'qr' 
                      ? 'Open WhatsApp > Settings > Linked Devices > Link a Device'
                      : 'Open WhatsApp > Settings > Linked Devices > Link with Phone Number'}
                 </p>
              </div>

              <div className="bg-gray-50 p-6 rounded-[2rem] border-2 border-dashed border-gray-200 flex items-center justify-center mb-8 relative min-h-[280px] shadow-inner">
                 {qrState === 'generating' ? (
                    <div className="flex flex-col items-center py-8">
                       <RefreshCw className="animate-spin text-indigo-600 mb-4" size={40} />
                       <p className="text-sm font-black text-indigo-600 animate-pulse uppercase tracking-widest">Handshaking...</p>
                    </div>
                 ) : qrState === 'scanned' ? (
                    <div className="flex flex-col items-center py-8 animate-in zoom-in duration-500">
                       <div className="w-20 h-20 bg-green-500 text-white rounded-full flex items-center justify-center mb-4 shadow-xl shadow-green-200">
                         <ShieldCheck size={40} />
                       </div>
                       <p className="text-lg font-black text-gray-900 uppercase">Authenticated</p>
                       <p className="text-xs text-gray-500 mt-1">Establishing secure tunnel...</p>
                    </div>
                 ) : pairingMethod === 'qr' ? (
                    <div className="relative group cursor-pointer bg-white p-4 rounded-3xl shadow-sm" onClick={generateNewQr}>
                       <img src={qrUrl} alt="Scan Me" className="w-56 h-56 rounded-lg mix-blend-multiply" />
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
                       <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Enter this code on your phone</p>
                    </div>
                 )}
              </div>

              {qrState === 'ready' && (
                <div className="space-y-3">
                   <button 
                     onClick={handleSimulateScan}
                     className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl shadow-slate-200 transition-all active:scale-95"
                   >
                     Simulate Connection
                   </button>
                   <button 
                     onClick={pairingMethod === 'qr' ? generateNewQr : generatePairingCode}
                     className="text-gray-400 text-[10px] font-bold uppercase tracking-widest hover:text-indigo-600 transition-colors"
                   >
                     Regenerate Code
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