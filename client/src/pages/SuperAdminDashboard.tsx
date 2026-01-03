import { TrendingUp, Users, Server, Activity, DollarSign, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SuperAdminDashboard = () => {
  const navigate = useNavigate();

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
          <p className="text-gray-500">Welcome back, Super Admin. Here's what's happening today.</p>
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

      {/* Stats Grid */}
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
          title="Total Messages (AI)" 
          value="854k" 
          trend="+24%" 
          icon={<Server className="text-purple-600" />} 
          color="bg-purple-100"
        />
        <StatCard 
          title="System Uptime" 
          value="99.9%" 
          trend="Stable" 
          icon={<Activity className="text-orange-600" />} 
          color="bg-orange-100"
        />
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