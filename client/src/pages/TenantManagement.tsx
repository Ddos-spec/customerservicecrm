import { useState } from 'react';
import { Plus, Search, MoreVertical, Building2, X, Lock, Mail } from 'lucide-react';
import { toast } from 'sonner';

const TenantManagement = () => {
  const [tenants, setTenants] = useState([
    { id: 1, name: 'Toko Maju Jaya', adminEmail: 'admin@majujaya.com', agents: 3, status: 'Active' },
    { id: 2, name: 'Batik Sejahtera', adminEmail: 'contact@batik.id', agents: 1, status: 'Active' },
    { id: 3, name: 'Coffee Shop ABC', adminEmail: 'owner@coffeeabc.com', agents: 2, status: 'Suspended' },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });

  const toggleDropdown = (id: number) => {
    if (activeDropdown === id) setActiveDropdown(null);
    else setActiveDropdown(id);
  };

  const handleAction = (action: string, tenant: any) => {
    setActiveDropdown(null);
    if (action === 'suspend') {
      const updatedTenants = tenants.map(t => 
        t.id === tenant.id ? { ...t, status: t.status === 'Active' ? 'Suspended' : 'Active' } : t
      );
      setTenants(updatedTenants);
      toast.success(`Tenant ${tenant.name} has been ${tenant.status === 'Active' ? 'suspended' : 'activated'}.`);
    } else if (action === 'delete') {
      if (confirm(`Are you sure you want to delete ${tenant.name}?`)) {
        setTenants(tenants.filter(t => t.id !== tenant.id));
        toast.success('Tenant deleted successfully.');
      }
    } else {
      toast.info(`${action} action triggered for ${tenant.name}`);
    }
  };

  const handleAddTenant = (e: any) => {
    e.preventDefault();
    
    // Simulasi tambah data ke database
    const newTenant = {
      id: tenants.length + 1,
      name: formData.name,
      adminEmail: formData.email,
      agents: 0,
      status: 'Active'
    };

    setTenants([newTenant, ...tenants]); // Add to top
    setIsModalOpen(false);
    toast.success('New Tenant (Admin Agent) created successfully!');
    
    // Reset form
    setFormData({ name: '', email: '', password: '' });
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenant Management</h1>
          <p className="text-gray-500 text-sm">Manage your SaaS customers (Admin Agents).</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-100"
        >
          <Plus size={20} />
          <span className="font-bold text-sm">Add New Tenant</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center bg-gray-50/50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search tenants..." 
              className="pl-10 pr-4 py-2.5 w-full md:max-w-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-semibold">Company Name</th>
                <th className="px-6 py-4 font-semibold">Admin Email</th>
                <th className="px-6 py-4 font-semibold">Agents Used</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <Building2 size={18} />
                      </div>
                      <span className="font-bold text-gray-900 text-sm">{tenant.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{tenant.adminEmail}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 font-medium">{tenant.agents} / 3</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                      tenant.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {tenant.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right relative">
                    <button 
                      onClick={() => toggleDropdown(tenant.id)}
                      className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <MoreVertical size={18} />
                    </button>

                    {/* Dropdown Menu */}
                    {activeDropdown === tenant.id && (
                      <div className="absolute right-8 top-12 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-50 animate-in fade-in zoom-in-95 duration-200 overflow-hidden text-left">
                        <div className="py-1">
                          <button 
                            onClick={() => handleAction('edit', tenant)}
                            className="w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-indigo-600 flex items-center space-x-2 font-medium"
                          >
                            <span>Edit Details</span>
                          </button>
                          <button 
                            onClick={() => handleAction('reset', tenant)}
                            className="w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-indigo-600 flex items-center space-x-2 font-medium"
                          >
                            <span>Reset Password</span>
                          </button>
                          <button 
                            onClick={() => handleAction('suspend', tenant)}
                            className="w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-orange-600 flex items-center space-x-2 font-medium border-t border-gray-50"
                          >
                            <span>{tenant.status === 'Active' ? 'Suspend Account' : 'Activate Account'}</span>
                          </button>
                          <button 
                            onClick={() => handleAction('delete', tenant)}
                            className="w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2 font-medium"
                          >
                            <span>Delete Tenant</span>
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* Overlay to close dropdown when clicking outside */}
                    {activeDropdown === tenant.id && (
                      <div className="fixed inset-0 z-40" onClick={() => setActiveDropdown(null)}></div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Add New Tenant */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 relative animate-in zoom-in-95 duration-200 border border-white/20">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 transition-colors"><X size={24} /></button>
            
            <div className="mb-8 pr-8">
              <h2 className="text-2xl font-bold text-gray-900">Register New Tenant</h2>
              <p className="text-gray-500 text-sm mt-1">Create an account for a new company/client (Admin Agent).</p>
            </div>

            <form onSubmit={handleAddTenant} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                 <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Company Name</label>
                    <div className="relative">
                      <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        required 
                        type="text" 
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        placeholder="e.g. Toko Sukses Abadi" 
                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm transition-all" 
                      />
                    </div>
                 </div>

                 <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Admin Email</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        required 
                        type="email" 
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        placeholder="owner@company.com" 
                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm transition-all" 
                      />
                    </div>
                 </div>

                 <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        required 
                        type="password" 
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                        placeholder="••••••••" 
                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm transition-all" 
                      />
                    </div>
                 </div>
              </div>

              <div className="pt-6 flex gap-3 border-t border-gray-50 mt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-xl transition-colors">Cancel</button>
                <button type="submit" className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 transition-all transform active:scale-95">Create Tenant</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantManagement;