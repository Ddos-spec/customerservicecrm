import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Search, RefreshCw, Shield, User, Building2,
  Mail, Phone, Calendar, Filter
} from 'lucide-react';
import api from '../lib/api';

interface UserItem {
  id: string;
  tenant_id: string | null;
  tenant_name?: string;
  name: string;
  email: string;
  role: string;
  status: string;
  phone_number?: string;
  created_at: string;
}

const SuperAdminUsers = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [tenantsRes] = await Promise.all([
        api.get('/admin/tenants')
      ]);

      if (tenantsRes.data.success) {
        const tenantsList = tenantsRes.data.tenants || [];
        setTenants(tenantsList);

        // Get all users from all tenants
        const allUsersPromises = tenantsList.map((tenant: any) =>
          api.get(`/admin/users?tenant_id=${tenant.id}`).catch(() => ({ data: { users: [] } }))
        );

        // Also get super admins (no tenant)
        allUsersPromises.push(
          api.get('/admin/users?role=super_admin').catch(() => ({ data: { users: [] } }))
        );

        const usersResponses = await Promise.allSettled(allUsersPromises);

        const allUsers: UserItem[] = [];
        usersResponses.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.data.success) {
            const users = result.value.data.users || [];
            users.forEach((user: any) => {
              allUsers.push({
                ...user,
                tenant_name: index < tenantsList.length ? tenantsList[index].company_name : null
              });
            });
          }
        });

        setUsers(allUsers);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredUsers = users.filter(user => {
    if (roleFilter !== 'all' && user.role !== roleFilter) return false;
    if (statusFilter !== 'all' && user.status !== statusFilter) return false;

    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.name?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query) ||
      user.tenant_name?.toLowerCase().includes(query)
    );
  });

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'super_admin': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
      case 'admin_agent': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case 'agent': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
      default: return 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'super_admin': return <Shield size={14} />;
      case 'admin_agent': return <User size={14} />;
      default: return <User size={14} />;
    }
  };

  const stats = [
    { label: 'Total Users', count: users.length, filter: 'all' },
    { label: 'Super Admin', count: users.filter(u => u.role === 'super_admin').length, filter: 'super_admin' },
    { label: 'Admin Agent', count: users.filter(u => u.role === 'admin_agent').length, filter: 'admin_agent' },
    { label: 'Agent', count: users.filter(u => u.role === 'agent').length, filter: 'agent' },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">All Users</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Semua users dari seluruh sistem
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={isLoading}
          className="p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
        >
          <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <button
            key={stat.filter}
            onClick={() => setRoleFilter(stat.filter)}
            className={`p-4 rounded-xl border transition-all text-left ${
              roleFilter === stat.filter
                ? 'bg-purple-50 border-purple-200 dark:bg-purple-900/30 dark:border-purple-700'
                : 'bg-white border-gray-200 dark:bg-slate-800 dark:border-slate-700 hover:border-purple-200 dark:hover:border-purple-700'
            }`}
          >
            <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stat.count}</p>
          </button>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Cari nama, email, atau tenant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Users List */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">
            <RefreshCw className="animate-spin mx-auto mb-3" size={32} />
            <p>Loading users...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Users className="mx-auto mb-3 opacity-30" size={48} />
            <p>Tidak ada user</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Tenant
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {user.name}
                        </p>
                        <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mt-1">
                          <Mail size={12} />
                          {user.email}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        {user.tenant_name ? (
                          <>
                            <Building2 size={14} />
                            {user.tenant_name}
                          </>
                        ) : (
                          <span className="text-gray-400 italic">System</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${getRoleColor(user.role)}`}>
                        {getRoleIcon(user.role)}
                        {user.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                        user.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300'
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {user.phone_number ? (
                        <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
                          <Phone size={12} />
                          {user.phone_number}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                        <Calendar size={12} />
                        {new Date(user.created_at).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SuperAdminUsers;
