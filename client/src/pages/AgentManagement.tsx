import { useState } from 'react';
import { UserPlus, Mail, Shield, Trash2, Edit2, X, Lock } from 'lucide-react';
import { toast } from 'sonner';

const AgentManagement = () => {
  const [agents] = useState([
    { id: 1, name: 'Budi Santoso', email: 'budi@tokomaju.com', status: 'Online', role: 'Support Shift Pagi' },
    { id: 2, name: 'Siti Aminah', email: 'siti@tokomaju.com', status: 'Offline', role: 'Support Shift Siang' },
    { id: 3, name: 'Rudi Hermawan', email: 'rudi@tokomaju.com', status: 'Offline', role: 'Support Shift Malam' },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const maxAgents = 3;

  const handleAddAgent = (e: any) => {
    e.preventDefault();
    if (agents.length >= maxAgents) {
      toast.error('You have reached the maximum limit of 3 agents.');
      return;
    }
    toast.success('Agent invited successfully!');
    setIsModalOpen(false);
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>
          <p className="text-gray-500 text-sm">Organize your support staff and their roles.</p>
        </div>
        
        <button 
          onClick={() => setIsModalOpen(true)}
          disabled={agents.length >= maxAgents}
          className="flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
        >
          <UserPlus size={18} />
          <span className="font-bold text-sm">Add New Agent</span>
        </button>
      </div>

      <div className="mb-8 bg-indigo-50 border border-indigo-100 rounded-2xl p-6 flex items-center justify-between overflow-hidden relative">
        <div className="relative z-10">
          <div className="flex items-center space-x-3 text-indigo-700 mb-1">
            <Shield size={20} />
            <span className="font-bold">Subscription Quota</span>
          </div>
          <p className="text-indigo-600/70 text-sm">You are using {agents.length} of {maxAgents} agent slots available.</p>
        </div>
        <div className="relative z-10 text-3xl font-black text-indigo-700">
          {agents.length} / {maxAgents}
        </div>
        <div className="absolute -right-4 -bottom-4 text-indigo-100 opacity-50"><Shield size={120} /></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agents.map((agent) => (
          <div key={agent.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center text-xl font-bold text-indigo-600 border border-gray-100">
                {agent.name.charAt(0)}
              </div>
              <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                agent.status === 'Online' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
              }`}>
                {agent.status}
              </div>
            </div>
            
            <h3 className="font-bold text-gray-900 text-lg leading-tight">{agent.name}</h3>
            <p className="text-xs text-indigo-600 font-semibold mb-3">{agent.role}</p>
            
            <div className="flex items-center space-x-2 text-gray-500 text-xs mb-6 bg-gray-50 p-2 rounded-lg">
              <Mail size={14} />
              <span className="truncate">{agent.email}</span>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 rounded-xl border border-gray-100 transition-all">
                <Edit2 size={14} />
                <span>Edit</span>
              </button>
              <button className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl border border-transparent transition-all">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL (Final UI) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 relative animate-in zoom-in-95 duration-200">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600"><X size={24} /></button>
            
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Add Team Member</h2>
              <p className="text-gray-500 text-sm mt-1">Create a new agent account for your team.</p>
            </div>

            <form onSubmit={handleAddAgent} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Full Name</label>
                <input required type="text" placeholder="e.g. Budi Santoso" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Email Address</label>
                <input required type="email" placeholder="agent@tokomaju.com" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm" />
              </div>
              <div className="relative">
                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Initial Password</label>
                <Lock className="absolute right-4 top-[38px] text-gray-300" size={18} />
                <input required type="password" placeholder="••••••••" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm" />
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-xl transition-colors">Cancel</button>
                <button type="submit" className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 transition-all transform active:scale-95">Create Account</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentManagement;