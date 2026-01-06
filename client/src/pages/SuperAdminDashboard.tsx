import { useState } from 'react';
import { TrendingUp, Users, Server, Activity, DollarSign, ArrowRight, Smartphone, Terminal, Settings, Trash2, RefreshCw, ShieldCheck, QrCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'sessions' | 'logs' | 'config'>('sessions');

  // Mock Sessions Data
  const [sessions, setSessions] = useState([
    { id: 'TokoMaju_Main', status: 'connected', phone: '+62 812-3456-7890', uptime: '3d 12h' },
    { id: 'CS_Support_1', status: 'disconnected', phone: '-', uptime: '-' },
    { id: 'Sales_Bot_Auto', status: 'connected', phone: '+62 899-1122-3344', uptime: '12h 45m' },
  ]);

  // Mock Logs Data
  const [logs] = useState([
    { time: '10:45:22', type: 'INFO', msg: 'New message received from +62812345...' },
    { time: '10:45:20', type: 'SYS', msg: 'Webhook delivery successful (200 OK)' },
    { time: '10:42:15', type: 'WARN', msg: 'Rate limit warning: 45 msgs/min' },
    { time: '10:40:01', type: 'INFO', msg: 'Session "TokoMaju_Main" refreshed keys' },
  ]);

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
          <p className="text-gray-500">Welcome back, Super Admin. System status is healthy.</p>
        </div>
        <button 
          onClick={() => navigate('/super-admin/tenants')}
          className="flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-100"
        >
          <Users size={20} />
          <span className="font-bold text-sm">Manage Tenants</span>
          <ArrowRight size={16} className="opacity-70" />
        </button>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard 
          title="Total Revenue" 
          value="$12,450" 
          trend="+12%" 
          icon={<DollarSign className="text-green-600" />} 
          color="bg-green-100"
        />
        <StatCard 
          title="Active Tenants" 
          value="45" 
          trend="+3" 
          icon={<Users className="text-blue-600" />} 
          color="bg-blue-100"
        />
        <StatCard 
          title="Total Messages (WA)" 
          value="854k" 
          trend="+24%" 
          icon={<Server className="text-purple-600" />} 
          color="bg-purple-100"
        />
        <StatCard 
          title="Gateway Uptime" 
          value="99.9%" 
          trend="Stable" 
          icon={<Activity className="text-orange-600" />} 
          color="bg-orange-100"
        />
      </div>

      {/* GATEWAY CONTROL CENTER */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-8">
        <div className="bg-slate-900 p-4 px-6 flex items-center justify-between">
           <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-500/20 rounded-lg text-green-400">
                 <ShieldCheck size={20} />
              </div>
              <div>
                 <h3 className="text-white font-bold">WhatsApp Gateway Engine</h3>
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
           <div className="flex bg-slate-800 p-1 rounded-lg">
              <TabButton active={activeTab === 'sessions'} onClick={() => setActiveTab('sessions')} icon={<Smartphone size={14} />} label="Sessions" />
              <TabButton active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} icon={<Terminal size={14} />} label="System Logs" />
              <TabButton active={activeTab === 'config'} onClick={() => setActiveTab('config')} icon={<Settings size={14} />} label="Global Config" />
           </div>
        </div>

        <div className="p-6">
           {/* SESSIONS TAB */}
           {activeTab === 'sessions' && (
              <div className="space-y-4">
                 <div className="flex justify-between items-center mb-2">
                    <h4 className="font-bold text-gray-700">Active Sessions Management</h4>
                    <button className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1">
                       <RefreshCw size={12} />
                       <span>Refresh List</span>
                    </button>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Add New Session Card */}
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer group">
                       <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                          <QrCode size={24} />
                       </div>
                       <h5 className="font-bold text-gray-900">New Session</h5>
                       <p className="text-xs text-gray-500 mt-1">Scan QR or use Pairing Code</p>
                    </div>

                    {/* Session Cards */}
                    {sessions.map((session) => (
                       <div key={session.id} className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow relative overflow-hidden">
                          <div className={`absolute top-0 right-0 p-1.5 rounded-bl-xl text-[10px] font-bold uppercase tracking-wider ${session.status === 'connected' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                             {session.status}
                          </div>
                          
                          <div className="flex items-center space-x-3 mb-4">
                             <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${session.status === 'connected' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                                <Smartphone size={20} />
                             </div>
                             <div>
                                <h5 className="font-bold text-gray-900 text-sm">{session.id}</h5>
                                <p className="text-xs text-gray-500 font-mono">{session.phone}</p>
                             </div>
                          </div>

                          <div className="space-y-2 text-xs text-gray-600 mb-4">
                             <div className="flex justify-between">
                                <span>Uptime:</span>
                                <span className="font-medium">{session.uptime}</span>
                             </div>
                             <div className="flex justify-between">
                                <span>Memory:</span>
                                <span className="font-medium">45 MB</span>
                             </div>
                          </div>

                          <div className="flex space-x-2">
                             <button className="flex-1 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-700 transition-colors">
                                Details
                             </button>
                             <button 
                               onClick={() => {
                                  if(confirm('Delete this session?')) {
                                     setSessions(sessions.filter(s => s.id !== session.id));
                                     toast.success('Session deleted');
                                  }
                               }}
                               className="p-2 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                             >
                                <Trash2 size={16} />
                             </button>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
           )}

           {/* LOGS TAB */}
           {activeTab === 'logs' && (
              <div className="bg-slate-950 rounded-xl p-4 font-mono text-xs h-[400px] overflow-y-auto shadow-inner border border-slate-800">
                 {logs.map((log, idx) => (
                    <div key={idx} className="mb-1.5 flex space-x-3 hover:bg-white/5 p-0.5 rounded px-2">
                       <span className="text-slate-500 select-none">[{log.time}]</span>
                       <span className={`font-bold w-10 ${log.type === 'INFO' ? 'text-blue-400' : log.type === 'WARN' ? 'text-yellow-400' : log.type === 'SYS' ? 'text-purple-400' : 'text-slate-300'}`}>
                          {log.type}
                       </span>
                       <span className="text-slate-300">{log.msg}</span>
                    </div>
                 ))}
                 <div className="mt-2 text-green-500 animate-pulse">_ listening for events...</div>
              </div>
           )}

           {/* CONFIG TAB */}
           {activeTab === 'config' && (
              <div className="max-w-3xl">
                 <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-6 flex items-start space-x-3">
                    <div className="p-1.5 bg-orange-100 rounded-lg text-orange-600 mt-0.5">
                       <Settings size={16} />
                    </div>
                    <div>
                       <h5 className="text-sm font-bold text-orange-800">Global Configuration</h5>
                       <p className="text-xs text-orange-700/80 mt-1">Changes here will affect all tenants using the default gateway settings. Proceed with caution.</p>
                    </div>
                 </div>

                 <div className="space-y-6">
                    <div>
                       <label className="block text-sm font-bold text-gray-700 mb-2">Master Webhook URL</label>
                       <div className="flex space-x-2">
                          <input type="text" defaultValue="https://api.customerservice.com/webhooks/whatsapp" className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono text-gray-600 focus:outline-none focus:border-indigo-500" />
                          <button className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100">Save</button>
                       </div>
                       <p className="text-xs text-gray-400 mt-2">All incoming messages will be forwarded to this URL unless a session has a specific override.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div>
                          <label className="block text-sm font-bold text-gray-700 mb-2">Max Session Limit</label>
                          <input type="number" defaultValue={50} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
                       </div>
                       <div>
                          <label className="block text-sm font-bold text-gray-700 mb-2">Reconnect Interval (ms)</label>
                          <input type="number" defaultValue={5000} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
                       </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                       <h5 className="text-sm font-bold text-gray-900 mb-4">Feature Flags</h5>
                       <div className="space-y-3">
                          <ToggleItem label="Enable Auto-Reject Calls" desc="Automatically reject incoming voice/video calls to prevent disruptions." active={true} />
                          <ToggleItem label="Enable Message Archive" desc="Store all messages in local database for compliance." active={false} />
                          <ToggleItem label="Allow Legacy API" desc="Enable backward compatibility for v1 API endpoints." active={true} />
                       </div>
                    </div>
                 </div>
              </div>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity Feed */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-gray-900">Recent Tenant Registrations</h3>
            <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">View All</button>
          </div>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors border border-gray-50">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold">
                    T{i}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Toko Baru {i}</h4>
                    <p className="text-xs text-gray-500">Active Tenant • 3 Agents</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="block text-sm font-medium text-green-600">Active</span>
                  <span className="text-xs text-gray-400">2 mins ago</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Server Status */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-6">System Health</h3>
          <div className="space-y-6">
            <HealthItem label="Database (PostgreSQL)" status="Healthy" />
            <HealthItem label="AI Engine (n8n)" status="Processing" />
            <HealthItem label="API Gateway" status="Healthy" />
            <HealthItem label="Redis Cache" status="Healthy" />
          </div>
          
          <div className="mt-8 pt-6 border-t border-gray-100">
             <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-xs text-blue-700 font-medium mb-1">💡 Pro Tip</p>
                <p className="text-xs text-blue-600">Monitor n8n webhook latency during peak hours to ensure smooth agent handovers.</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }: any) => (
  <button 
    onClick={onClick}
    className={`flex items-center space-x-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${active ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const ToggleItem = ({ label, desc, active }: any) => (
  <div className="flex items-center justify-between">
     <div>
        <p className="text-sm font-bold text-gray-700">{label}</p>
        <p className="text-xs text-gray-500">{desc}</p>
     </div>
     <div className={`w-10 h-6 rounded-full relative transition-colors cursor-pointer ${active ? 'bg-indigo-600' : 'bg-gray-300'}`}>
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${active ? 'left-5' : 'left-1'}`} />
     </div>
  </div>
);

const StatCard = ({ title, value, trend, icon, color }: any) => (
  <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex items-start justify-between">
    <div>
      <p className="text-gray-500 text-sm font-medium mb-1">{title}</p>
      <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
      <div className="flex items-center mt-2 text-green-600 text-xs font-medium">
        <TrendingUp size={14} className="mr-1" />
        <span>{trend}</span>
      </div>
    </div>
    <div className={`p-3 rounded-lg ${color}`}>
      {icon}
    </div>
  </div>
);

const HealthItem = ({ label, status }: any) => (
  <div className="flex items-center justify-between">
    <span className="text-gray-600 text-sm font-medium">{label}</span>
    <div className="flex items-center space-x-2">
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
      </span>
      <span className="text-xs font-medium text-green-700">{status}</span>
    </div>
  </div>
);

export default SuperAdminDashboard;