import { useState } from 'react';
import { TrendingUp, Users, Server, Activity, DollarSign, ArrowRight, Smartphone, Terminal, Settings, Trash2, RefreshCw, ShieldCheck, QrCode, ArrowLeft, Key, Globe, Eye, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'sessions' | 'logs' | 'config'>('sessions');
  const [selectedSession, setSelectedSession] = useState<any>(null);

  // Mock Sessions Data
  const [sessions, setSessions] = useState([
    { id: 'TokoMaju_Main', status: 'connected', phone: '+62 812-3456-7890', uptime: '3d 12h', apiKey: 'wa_live_8k2m9s1n0x...' },
    { id: 'CS_Support_1', status: 'disconnected', phone: '-', uptime: '-', apiKey: 'wa_live_p9q2r3s4t5...' },
    { id: 'Sales_Bot_Auto', status: 'connected', phone: '+62 899-1122-3344', uptime: '12h 45m', apiKey: 'wa_live_a1b2c3d4e5...' },
  ]);

  // Mock Logs Data
  const [logs] = useState([
    { time: '10:45:22', type: 'INFO', msg: 'New message received from +62812345...' },
    { time: '10:45:20', type: 'SYS', msg: 'Webhook delivery successful (200 OK)' },
    { time: '10:42:15', type: 'WARN', msg: 'Rate limit warning: 45 msgs/min' },
    { time: '10:40:01', type: 'INFO', msg: 'Session "TokoMaju_Main" refreshed keys' },
  ]);

  const handleBack = () => setSelectedSession(null);

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
          <p className="text-gray-500">Welcome back, Super Admin. System status is healthy.</p>
        </div>
        {!selectedSession && (
          <button 
            onClick={() => navigate('/super-admin/tenants')}
            className="flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-100"
          >
            <Users size={20} />
            <span className="font-bold text-sm">Manage Tenants</span>
            <ArrowRight size={16} className="opacity-70" />
          </button>
        )}
      </div>

      {/* Main Stats Grid - Hidden when viewing session details to focus */}
      {!selectedSession && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title="Total Revenue" value="$12,450" trend="+12%" icon={<DollarSign className="text-green-600" />} color="bg-green-100" />
          <StatCard title="Active Tenants" value="45" trend="+3" icon={<Users className="text-blue-600" />} color="bg-blue-100" />
          <StatCard title="Total Messages (WA)" value="854k" trend="+24%" icon={<Server className="text-purple-600" />} color="bg-purple-100" />
          <StatCard title="Gateway Uptime" value="99.9%" trend="Stable" icon={<Activity className="text-orange-600" />} color="bg-orange-100" />
        </div>
      )}

      {/* GATEWAY CONTROL CENTER */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mb-8">
        {/* Header Control Center */}
        <div className="bg-slate-900 p-5 px-8 flex items-center justify-between">
           <div className="flex items-center space-x-4">
              {selectedSession ? (
                <button onClick={handleBack} className="p-2 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-colors">
                   <ArrowLeft size={20} />
                </button>
              ) : (
                <div className="p-2 bg-green-500/20 rounded-lg text-green-400">
                   <ShieldCheck size={24} />
                </div>
              )}
              <div>
                 <h3 className="text-white font-black tracking-tight text-lg">
                    {selectedSession ? `Session: ${selectedSession.id}` : 'WhatsApp Gateway Engine'}
                 </h3>
                 <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <span className="flex items-center space-x-1">
                       <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                       <span>Core: Online</span>
                    </span>
                    <span>•</span>
                    <span>Redis: Connected</span>
                    <span>•</span>
                    <span>Ver: 3.0.4</span>
                 </div>
              </div>
           </div>
           
           {!selectedSession && (
             <div className="flex bg-slate-800 p-1 rounded-xl">
                <TabButton active={activeTab === 'sessions'} onClick={() => setActiveTab('sessions')} icon={<Smartphone size={14} />} label="Sessions" />
                <TabButton active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} icon={<Terminal size={14} />} label="Logs" />
                <TabButton active={activeTab === 'config'} onClick={() => setActiveTab('config')} icon={<Settings size={14} />} label="Config" />
             </div>
           )}
        </div>

        <div className="p-8">
           {/* DETAIL SESSION VIEW (PORTED FROM detailsesi.html) */}
           {selectedSession ? (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Status & Connection */}
                    <div className="space-y-6">
                       <div className="bg-slate-50 border border-gray-100 rounded-[2rem] p-8 text-center">
                          <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-4 border-4 border-white shadow-xl ${selectedSession.status === 'connected' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                             {selectedSession.status === 'connected' ? <ShieldCheck size={48} /> : <WifiOff size={48} />}
                          </div>
                          <h4 className="font-black text-gray-900 text-xl uppercase tracking-tighter">{selectedSession.status}</h4>
                          <p className="text-gray-500 text-sm mt-1 font-mono">{selectedSession.phone}</p>
                          
                          <div className="mt-8 grid grid-cols-2 gap-3">
                             <button className="flex items-center justify-center space-x-2 py-3 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
                                <RefreshCw size={14} />
                                <span>Restart</span>
                             </button>
                             <button className="flex items-center justify-center space-x-2 py-3 bg-white text-red-500 border border-red-100 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-50 transition-all">
                                <Trash2 size={14} />
                                <span>Delete</span>
                             </button>
                          </div>
                       </div>

                       <div className="bg-indigo-50/50 border border-indigo-100/50 rounded-3xl p-6">
                          <h5 className="font-bold text-gray-900 mb-4 flex items-center space-x-2">
                             <Key size={18} className="text-indigo-600" />
                             <span>API Authentication</span>
                          </h5>
                          <div className="space-y-4">
                             <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">Private API Key</label>
                                <div className="flex space-x-2">
                                   <input type="password" readOnly value={selectedSession.apiKey} className="flex-1 bg-white border border-indigo-100 rounded-xl px-4 py-2.5 text-xs font-mono text-indigo-600" />
                                   <button className="p-2.5 bg-white border border-indigo-100 text-indigo-600 rounded-xl hover:bg-indigo-50"><Eye size={16} /></button>
                                </div>
                             </div>
                             <button className="w-full py-2.5 bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-200 transition-colors">Regenerate Token</button>
                          </div>
                       </div>
                    </div>

                    {/* Middle Column: Configuration */}
                    <div className="lg:col-span-2 space-y-6">
                       <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm">
                          <h5 className="font-black text-gray-900 mb-6 flex items-center space-x-2 uppercase tracking-tight">
                             <Globe size={20} className="text-indigo-600" />
                             <span>Webhook & Filter Engine</span>
                          </h5>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                             <div className="space-y-4">
                                <h6 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Routing Rules</h6>
                                <ToggleItem label="Individual Chat" desc="Forward private messages" active={true} />
                                <ToggleItem label="Group Chat" desc="Forward group messages" active={false} />
                                <ToggleItem label="Status Updates" desc="Track story/status views" active={false} />
                                <ToggleItem label="From Me" desc="Track outgoing messages" active={true} />
                             </div>
                             
                             <div className="space-y-4">
                                <h6 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Media Storage</h6>
                                <ToggleItem label="Store Images" desc="Auto-upload to server" active={true} />
                                <ToggleItem label="Store Documents" desc="Keep PDF/Doc files" active={true} />
                                <ToggleItem label="Store Audio" desc="Keep voice notes" active={false} />
                                <ToggleItem label="Store Stickers" desc="Save incoming stickers" active={false} />
                             </div>
                          </div>

                          <div className="mt-10 pt-8 border-t border-gray-50">
                             <div className="flex items-center justify-between mb-4">
                                <h6 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Webhook Destination URLs</h6>
                                <button className="text-[10px] font-black text-indigo-600 flex items-center space-x-1 hover:underline">
                                   <Plus size={12} />
                                   <span>Add URL</span>
                                </button>
                             </div>
                             <div className="space-y-3">
                                <div className="flex space-x-2">
                                   <input type="text" defaultValue="https://main-crm.com/api/wa-hook" className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 text-sm font-medium text-gray-700 focus:outline-none focus:border-indigo-500" />
                                   <button className="p-3 text-red-400 hover:bg-red-50 rounded-2xl transition-colors"><Trash2 size={18} /></button>
                                </div>
                                <div className="flex space-x-2">
                                   <input type="text" defaultValue="https://n8n.workflow.io/webhook/123-abc" className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 text-sm font-medium text-gray-700 focus:outline-none focus:border-indigo-500" />
                                   <button className="p-3 text-red-400 hover:bg-red-50 rounded-2xl transition-colors"><Trash2 size={18} /></button>
                                </div>
                             </div>
                             <button className="mt-6 w-full py-4 bg-slate-900 text-white font-black uppercase tracking-widest text-xs rounded-[1.5rem] shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95">Save Engine Configuration</button>
                          </div>
                       </div>

                       {/* Mini Log for this session */}
                       <div className="bg-slate-950 rounded-3xl p-6 font-mono text-[10px] border border-slate-800 shadow-2xl">
                          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                             <span className="text-slate-400 font-bold uppercase tracking-widest">Real-time Instance Logs</span>
                             <span className="flex items-center space-x-1.5 text-green-500">
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                                <span>Streaming</span>
                             </span>
                          </div>
                          <div className="space-y-1.5 h-32 overflow-y-auto custom-scrollbar">
                             <p className="text-blue-400">[10:50:01] <span className="text-white">Socket: Connected to WA servers</span></p>
                             <p className="text-purple-400">[10:50:05] <span className="text-white">Auth: Token verified via Redis</span></p>
                             <p className="text-green-400">[10:52:10] <span className="text-white">Webhook: Forwarded message ID 3EB0...</span></p>
                             <p className="text-slate-500">[10:55:00] <span className="text-white">System: Keep-alive heartbeat sent</span></p>
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
                      <h4 className="font-black text-gray-900 text-lg tracking-tight uppercase">Active Session Fleet</h4>
                      <button className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-xl transition-all flex items-center space-x-2 border border-indigo-100 shadow-sm">
                         <RefreshCw size={14} className="animate-spin-slow" />
                         <span>Sync Infrastructure</span>
                      </button>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {/* Add New Session Card */}
                      <div className="border-2 border-dashed border-gray-200 rounded-[2.5rem] p-8 flex flex-col items-center justify-center text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition-all cursor-pointer group shadow-sm">
                         <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-3xl flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-12 transition-all shadow-lg shadow-indigo-100/50">
                            <QrCode size={32} />
                         </div>
                         <h5 className="font-black text-gray-900 text-lg uppercase tracking-tight">Provision New Instance</h5>
                         <p className="text-xs text-gray-500 mt-2 font-medium px-4 leading-relaxed">Instantly spawn a new WhatsApp gateway session.</p>
                      </div>

                      {/* Session Cards */}
                      {sessions.map((session) => (
                         <div key={session.id} className="bg-white border border-gray-100 rounded-[2.5rem] p-6 hover:shadow-2xl hover:shadow-indigo-100/50 transition-all relative group">
                            <div className={`absolute top-6 right-6 flex items-center space-x-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${session.status === 'connected' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                               <div className={`w-1.5 h-1.5 rounded-full ${session.status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                               <span>{session.status}</span>
                            </div>
                            
                            <div className="flex items-center space-x-4 mb-6">
                               <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 ${session.status === 'connected' ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-slate-100 text-slate-400'}`}>
                                  <Smartphone size={28} />
                               </div>
                               <div>
                                  <h5 className="font-black text-gray-900 text-lg tracking-tighter leading-none">{session.id}</h5>
                                  <p className="text-xs text-gray-400 font-mono mt-1.5">{session.phone}</p>
                               </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-8">
                               <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100">
                                  <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Uptime</p>
                                  <p className="text-xs font-bold text-gray-700">{session.uptime}</p>
                               </div>
                               <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100">
                                  <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Load</p>
                                  <p className="text-xs font-bold text-gray-700">Light</p>
                               </div>
                            </div>

                            <div className="flex space-x-3">
                               <button 
                                 onClick={() => setSelectedSession(session)}
                                 className="flex-1 py-3.5 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-indigo-600 transition-all shadow-lg shadow-slate-200"
                               >
                                  Inspect Details
                               </button>
                               <button 
                                 onClick={() => {
                                    if(confirm('Delete this session?')) {
                                       setSessions(sessions.filter(s => s.id !== session.id));
                                       toast.success('Session terminated');
                                    }
                                 }}
                                 className="p-3.5 bg-white border border-red-100 text-red-500 rounded-2xl hover:bg-red-50 transition-all"
                               >
                                  <Trash2 size={18} />
                               </button>
                            </div>
                         </div>
                      ))}
                   </div>
                </div>
              )
           )}

           {/* LOGS TAB */}
           {!selectedSession && activeTab === 'logs' && (
              <div className="animate-in fade-in duration-500">
                 <div className="flex justify-between items-center mb-4">
                    <h4 className="font-black text-gray-900 uppercase tracking-tight">Global Infrastructure Logs</h4>
                    <div className="flex space-x-2">
                       <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black border border-blue-100">FILTER: ALL SESSION</span>
                       <button className="text-[10px] font-black text-gray-400 hover:text-gray-600">CLEAR</button>
                    </div>
                 </div>
                 <div className="bg-slate-950 rounded-3xl p-6 font-mono text-[11px] h-[450px] overflow-y-auto shadow-2xl border border-slate-800 custom-scrollbar">
                    {logs.map((log, idx) => (
                       <div key={idx} className="mb-2 flex space-x-4 hover:bg-white/5 p-1 rounded-lg px-3 transition-colors">
                          <span className="text-slate-600 select-none">[{log.time}]</span>
                          <span className={`font-black w-12 text-center rounded px-1.5 ${log.type === 'INFO' ? 'bg-blue-500/10 text-blue-400' : log.type === 'WARN' ? 'bg-yellow-500/10 text-yellow-400' : log.type === 'SYS' ? 'bg-purple-500/10 text-purple-400' : 'text-slate-300'}`}>
                             {log.type}
                          </span>
                          <span className="text-slate-300 flex-1">{log.msg}</span>
                       </div>
                    ))}
                    <div className="mt-4 text-indigo-500/50 animate-pulse flex items-center space-x-2">
                       <div className="w-1.5 h-4 bg-indigo-500 animate-pulse"></div>
                       <span>listening for cross-tenant gateway events...</span>
                    </div>
                 </div>
              </div>
           )}

           {/* CONFIG TAB */}
           {!selectedSession && activeTab === 'config' && (
              <div className="max-w-3xl animate-in fade-in duration-500">
                 <div className="bg-orange-50 border border-orange-100 rounded-3xl p-6 mb-8 flex items-start space-x-4 shadow-sm shadow-orange-100/50">
                    <div className="p-3 bg-orange-100 rounded-2xl text-orange-600 shadow-inner">
                       <Settings size={24} />
                    </div>
                    <div>
                       <h5 className="text-lg font-black text-orange-900 uppercase tracking-tight">Core Infrastructure Configuration</h5>
                       <p className="text-sm text-orange-800/70 mt-1 leading-relaxed">Global parameters controlling Redis persistence, socket pooling, and master webhook relays. Changes propagate across all instances.</p>
                    </div>
                 </div>

                 <div className="space-y-8">
                    <div className="group">
                       <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Master Webhook Relay Endpoint</label>
                       <div className="flex space-x-3">
                          <input type="text" defaultValue="https://api.customerservice.com/webhooks/whatsapp" className="flex-1 bg-gray-50 border-2 border-gray-100 rounded-2xl px-6 py-4 text-sm font-mono text-indigo-600 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-inner" />
                          <button className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all active:scale-95">Update Core</button>
                       </div>
                       <p className="text-[10px] text-gray-400 mt-3 italic">* This endpoint receives a unified stream of all tenant events for central monitoring.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 group hover:border-indigo-100 transition-all">
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 group-hover:text-indigo-600">Max Concurrency Limit</label>
                          <div className="flex items-center space-x-4">
                             <input type="number" defaultValue={50} className="w-24 bg-white border border-gray-200 rounded-xl px-4 py-2.5 font-bold text-gray-700 focus:outline-none focus:border-indigo-500" />
                             <span className="text-xs text-gray-500 font-medium">Parallel instances</span>
                          </div>
                       </div>
                       <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 group hover:border-indigo-100 transition-all">
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 group-hover:text-indigo-600">Redis TTL Policy (Days)</label>
                          <div className="flex items-center space-x-4">
                             <input type="number" defaultValue={30} className="w-24 bg-white border border-gray-200 rounded-xl px-4 py-2.5 font-bold text-gray-700 focus:outline-none focus:border-indigo-500" />
                             <span className="text-xs text-gray-500 font-medium">Auth persistence duration</span>
                          </div>
                       </div>
                    </div>

                    <div className="pt-8 border-t border-gray-100">
                       <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">Hardware & Security Flags</h5>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <ToggleItem label="Stateless Session Recovery" desc="Restore socket state from Redis after restart." active={true} />
                          <ToggleItem label="Global Call Interceptor" desc="Automatically block incoming WhatsApp calls." active={true} />
                          <ToggleItem label="Encrypted Auth Export" desc="AES-256 encryption for session exports." active={true} />
                          <ToggleItem label="Legacy v1 Protocol" desc="Maintain compatibility for old API nodes." active={false} />
                       </div>
                    </div>
                 </div>
              </div>
           )}
        </div>
      </div>

      {!selectedSession && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Activity Feed */}
          <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <div className="flex justify-between items-center mb-8">
              <h3 className="font-black text-gray-900 text-xl tracking-tight uppercase">Recent Tenant Registrations</h3>
              <button className="text-xs font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700">Explore Audit Trail</button>
            </div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between p-5 hover:bg-gray-50 rounded-[1.5rem] transition-all border border-gray-50 group">
                  <div className="flex items-center space-x-5">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-lg group-hover:scale-110 transition-transform">
                      T{i}
                    </div>
                    <div>
                      <h4 className="font-black text-gray-900 text-md">Toko Baru {i}</h4>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">Active Tenant • 3 Agents Configured</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="flex items-center justify-end space-x-1.5 text-xs font-black text-green-600 uppercase">
                       <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                       <span>Verified</span>
                    </span>
                    <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mt-1 block">2 mins ago</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Server Status */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="font-black text-gray-900 text-xl tracking-tight uppercase mb-8">Global Pulse</h3>
              <div className="space-y-8">
                <HealthItem label="Database Cluster" status="Optimal" />
                <HealthItem label="n8n Engine Pool" status="Scaling" />
                <HealthItem label="API Edge Gateway" status="Healthy" />
                <HealthItem label="Redis Session Cache" status="Healthy" />
              </div>
            </div>
            
            <div className="mt-12">
               <div className="bg-indigo-600 rounded-[2rem] p-6 text-white shadow-xl shadow-indigo-100">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70 mb-2">Infrastructure Insight</p>
                  <p className="text-sm font-bold leading-relaxed italic">"Gateway latency is currently 15% lower than average. Redis cache hits are at 98% efficiency."</p>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }: any) => (
  <button 
    onClick={onClick}
    className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${active ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const ToggleItem = ({ label, desc, active }: any) => (
  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 group hover:border-indigo-100 transition-all">
     <div>
        <p className="text-xs font-black text-gray-700 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">{label}</p>
        <p className="text-[10px] text-gray-500 font-medium mt-0.5">{desc}</p>
     </div>
     <div className={`w-10 h-6 rounded-full relative transition-colors cursor-pointer ${active ? 'bg-indigo-600' : 'bg-gray-300'}`}>
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${active ? 'left-5' : 'left-1'}`} />
     </div>
  </div>
);

const StatCard = ({ title, value, trend, icon, color }: any) => (
  <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-start justify-between group hover:shadow-xl transition-all">
    <div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 group-hover:text-indigo-600 transition-colors">{title}</p>
      <h3 className="text-3xl font-black text-gray-900 tracking-tighter leading-none">{value}</h3>
      <div className="flex items-center mt-3 text-green-600 text-[10px] font-black uppercase tracking-widest">
        <TrendingUp size={12} className="mr-1" />
        <span>{trend}</span>
      </div>
    </div>
    <div className={`p-4 rounded-2xl shadow-sm ${color}`}>
      {icon}
    </div>
  </div>
);

const HealthItem = ({ label, status }: any) => (
  <div className="flex items-center justify-between group">
    <span className="text-gray-500 text-xs font-black uppercase tracking-widest group-hover:text-indigo-600 transition-colors">{label}</span>
    <div className="flex items-center space-x-3">
      <div className="flex items-center space-x-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
        <span className="text-[10px] font-black text-green-700 uppercase tracking-widest">{status}</span>
      </div>
    </div>
  </div>
);

const WifiOff = ({ size }: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
);

export default SuperAdminDashboard;