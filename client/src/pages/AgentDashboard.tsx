import { useState } from 'react';
import { MessageCircle, Clock, Star, ThumbsUp, TrendingUp, ArrowRight, Smartphone, QrCode, Wifi, WifiOff, X, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { toast } from 'sonner';

const AgentDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
  // State untuk status WA (Simulasi)
  const [waStatus, setWaStatus] = useState<'connected' | 'disconnected'>('connected');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrState, setQrState] = useState<'generating' | 'ready' | 'scanned'>('generating');
  const [qrUrl, setQrUrl] = useState('');

  const openQrModal = () => {
    setIsQrModalOpen(true);
    generateNewQr();
  };

  const generateNewQr = () => {
    setQrState('generating');
    // Simulasi delay generate QR dari server
    setTimeout(() => {
      // Generate QR unik setiap kali berdasarkan timestamp
      const sessionId = `WA-SESSION-${Date.now()}`;
      setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${sessionId}`);
      setQrState('ready');
    }, 1500);
  };

  const handleSimulateScan = () => {
    setQrState('scanned');
    setTimeout(() => {
      setWaStatus('connected');
      setIsQrModalOpen(false);
      toast.success('WhatsApp Gateway reconnected successfully!');
    }, 2000); 
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance Dashboard</h1>
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
        {/* WIDGET WA STATUS (Khusus Admin Agent) */}
        {user?.role === 'admin_agent' && (
          <div className="lg:col-span-3">
             <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center space-x-4">
                   <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${waStatus === 'connected' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      <Smartphone size={28} />
                   </div>
                   <div>
                      <h3 className="font-bold text-gray-900 text-lg">WhatsApp Gateway</h3>
                      <div className="flex items-center space-x-2 mt-1">
                         {waStatus === 'connected' ? (
                           <>
                             <div className="flex items-center space-x-1 bg-green-50 px-2 py-0.5 rounded-md border border-green-100">
                                <Wifi size={12} className="text-green-600" />
                                <span className="text-xs font-bold text-green-700 uppercase tracking-wide">Connected</span>
                             </div>
                             <span className="text-xs text-gray-400 font-mono">+62 812-XXXX-XXXX</span>
                           </>
                         ) : (
                           <div className="flex items-center space-x-1 bg-red-50 px-2 py-0.5 rounded-md border border-red-100">
                                <WifiOff size={12} className="text-red-600" />
                                <span className="text-xs font-bold text-red-700 uppercase tracking-wide">Disconnected</span>
                           </div>
                         )}
                      </div>
                   </div>
                </div>

                <div className="flex items-center space-x-3 w-full md:w-auto">
                   {waStatus === 'connected' ? (
                      <button 
                        onClick={() => { setWaStatus('disconnected'); toast.warning('Gateway disconnected (Simulation)'); }}
                        className="w-full md:w-auto px-4 py-2 bg-gray-50 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl text-sm font-bold transition-colors border border-gray-200 hover:border-red-100"
                      >
                        Disconnect (Test)
                      </button>
                   ) : (
                      <button 
                        onClick={openQrModal}
                        className="w-full md:w-auto flex items-center justify-center space-x-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-green-100 animate-pulse"
                      >
                        <QrCode size={18} />
                        <span>Scan QR to Reconnect</span>
                      </button>
                   )}
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

      {/* ... (Chart Section removed for brevity, keeps existing) ... */}
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

      {/* QR Code Modal for Reconnection (REALISTIC) */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 relative animate-in zoom-in-95 duration-200 text-center">
              <button onClick={() => setIsQrModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={24} /></button>
              
              <div className="mb-6">
                 <h2 className="text-xl font-bold text-gray-900">Scan QR Code</h2>
                 <p className="text-gray-500 text-xs mt-2">Open WhatsApp {'>'} Linked Devices {'>'} Link a Device</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center mb-6 relative min-h-[250px]">
                 {qrState === 'generating' ? (
                    <div className="flex flex-col items-center py-8">
                       <RefreshCw className="animate-spin text-indigo-600 mb-3" size={32} />
                       <p className="text-xs font-bold text-indigo-600 animate-pulse">Generating Secure QR...</p>
                    </div>
                 ) : qrState === 'scanned' ? (
                    <div className="flex flex-col items-center py-8 animate-in zoom-in duration-300">
                       <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-4">
                         <ThumbsUp size={32} />
                       </div>
                       <p className="text-sm font-bold text-gray-900">Device Connected!</p>
                       <p className="text-xs text-gray-500">Redirecting...</p>
                    </div>
                 ) : (
                    <div className="relative group cursor-pointer" onClick={generateNewQr} title="Click to refresh QR">
                       <img src={qrUrl} alt="Scan Me" className="w-56 h-56 rounded-lg mix-blend-multiply" />
                       <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-56 h-1 bg-green-500/50 absolute top-0 animate-[scan_2.5s_ease-in-out_infinite]" />
                       </div>
                       <p className="mt-2 text-[10px] text-gray-400">Click QR to refresh code</p>
                    </div>
                 )}
              </div>

              {qrState === 'ready' && (
                <button 
                  onClick={handleSimulateScan}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-100 transition-all active:scale-95"
                >
                  Simulate Scan Success
                </button>
              )}
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
      {subtitle.includes('+') ? (
        <span className="text-green-600 bg-green-50 px-2 py-1 rounded-lg text-xs font-bold">{subtitle}</span>
      ) : subtitle.includes('-') ? (
         <span className="text-green-600 bg-green-50 px-2 py-1 rounded-lg text-xs font-bold">{subtitle}</span>
      ) : (
         <span className="text-gray-500 bg-gray-50 px-2 py-1 rounded-lg text-xs font-bold">{subtitle}</span>
      )}
    </div>
    <h3 className="text-3xl font-bold text-gray-900 mb-1">{value}</h3>
    <p className="text-gray-500 text-sm font-medium">{title}</p>
  </div>
);

export default AgentDashboard;