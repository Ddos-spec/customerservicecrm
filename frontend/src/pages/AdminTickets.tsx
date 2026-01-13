import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MessageSquare, Search, Filter, RefreshCw,
  AlertCircle, CheckCircle2, Clock, User, X
} from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/useAuthStore';

interface Ticket {
  id: string;
  tenant_id: string;
  customer_name: string;
  customer_contact: string;
  status: string;
  assigned_agent_id?: string;
  agent_name?: string;
  last_message?: string;
  last_sender_type?: string;
  last_message_at?: string;
  message_count: string;
  created_at: string;
  updated_at: string;
}

const AdminTickets = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');

  const fetchTickets = async () => {
    setIsLoading(true);
    try {
      const params: any = {};
      if (statusFilter !== 'all') params.status = statusFilter;

      const res = await api.get('/admin/tickets', { params });
      if (res.data.success) {
        setTickets(res.data.tickets || []);
      }
    } catch (error) {
      console.error('Failed to fetch tickets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [statusFilter]);

  const filteredTickets = tickets.filter(ticket => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      ticket.customer_name?.toLowerCase().includes(query) ||
      ticket.customer_contact?.toLowerCase().includes(query) ||
      ticket.agent_name?.toLowerCase().includes(query)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
      case 'pending': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
      case 'closed': return 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300';
      case 'escalated': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
      default: return 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <AlertCircle size={14} />;
      case 'closed': return <CheckCircle2 size={14} />;
      case 'pending': return <Clock size={14} />;
      default: return <MessageSquare size={14} />;
    }
  };

  const stats = [
    { label: 'Total', count: tickets.length, status: 'all' },
    { label: 'Open', count: tickets.filter(t => t.status === 'open').length, status: 'open' },
    { label: 'Pending', count: tickets.filter(t => t.status === 'pending').length, status: 'pending' },
    { label: 'Closed', count: tickets.filter(t => t.status === 'closed').length, status: 'closed' },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Tickets</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Kelola semua ticket customer untuk{' '}
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {user?.tenant_name}
            </span>
          </p>
        </div>
        <button
          onClick={fetchTickets}
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
            key={stat.status}
            onClick={() => setStatusFilter(stat.status)}
            className={`p-4 rounded-xl border transition-all text-left ${
              statusFilter === stat.status
                ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/30 dark:border-blue-700'
                : 'bg-white border-gray-200 dark:bg-slate-800 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700'
            }`}
          >
            <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stat.count}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Cari customer, contact, atau agent..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
          />
        </div>
        {statusFilter !== 'all' && (
          <button
            onClick={() => setStatusFilter('all')}
            className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
          >
            <X size={16} />
            Clear Filter
          </button>
        )}
      </div>

      {/* Tickets List */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">
            <RefreshCw className="animate-spin mx-auto mb-3" size={32} />
            <p>Loading tickets...</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <MessageSquare className="mx-auto mb-3 opacity-30" size={48} />
            <p>Tidak ada ticket</p>
            {statusFilter !== 'all' && (
              <button
                onClick={() => setStatusFilter('all')}
                className="mt-4 text-blue-600 dark:text-blue-400 hover:underline"
              >
                Lihat semua ticket
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Agent
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Messages
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Last Update
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {filteredTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => navigate(`/admin/chat?ticket=${ticket.id}`)}
                    className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {ticket.customer_name}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {ticket.customer_contact}
                        </p>
                        {ticket.last_message && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate max-w-xs">
                            {ticket.last_message}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(ticket.status)}`}>
                        {getStatusIcon(ticket.status)}
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        {ticket.agent_name ? (
                          <>
                            <User size={14} />
                            {ticket.agent_name}
                          </>
                        ) : (
                          <span className="text-gray-400">Unassigned</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {ticket.message_count}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {ticket.updated_at
                          ? new Date(ticket.updated_at).toLocaleString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : '-'}
                      </span>
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

export default AdminTickets;
