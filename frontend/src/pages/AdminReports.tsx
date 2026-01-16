import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, TrendingUp, Clock, Users, MessageSquare,
  CheckCircle2, AlertCircle, Calendar, Download
} from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/useAuthStore';

interface Stats {
  chats?: {
    total_chats?: number;
    total_unread?: number;
    open_chats?: number;
    pending_chats?: number;
    escalated_chats?: number;
    closed_chats?: number;
    today_chats?: number;
  };
  users?: {
    admin_count?: number;
    agent_count?: number;
    total_users?: number;
  };
}

const AdminReports = () => {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [dateRange, setDateRange] = useState('7days');

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/admin/stats', { params: { range: dateRange } });
      if (res.data.success) {
        setStats(res.data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, [dateRange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchStats();
  }, [fetchStats]);

  const kpiCards = [
    {
      icon: MessageSquare,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      label: 'Total Chats',
      value: stats?.chats?.total_chats?.toString() || '0',
      trend: `${stats?.chats?.today_chats || 0} today`,
      trendUp: true
    },
    {
      label: 'Unread Chats',
      value: stats?.chats?.total_unread?.toString() || '0',
      icon: Clock,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      trend: `${stats?.chats?.open_chats || 0} open`,
      trendUp: false
    },
    {
      label: 'Active Staff',
      value: stats?.users?.agent_count?.toString() || '0',
      icon: Users,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      trend: `${stats?.users?.admin_count || 0} owners`,
      trendUp: true
    },
    {
      label: 'Resolution Rate',
      value: stats?.chats?.total_chats
        ? `${Math.round(
            ((stats.chats.closed_chats || 0) / stats.chats.total_chats) * 100
          )}%`
        : '0%',
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      trend: `${stats?.chats?.closed_chats || 0} closed`,
      trendUp: true
    },
  ];

  const chatBreakdown = [
    {
      label: 'Open Chats',
      count: stats?.chats?.open_chats || 0,
      percentage: stats?.chats?.total_chats
        ? Math.round(((stats?.chats?.open_chats || 0) / stats.chats.total_chats) * 100)
        : 0,
      color: 'bg-emerald-500',
      icon: AlertCircle
    },
    {
      label: 'Pending Chats',
      count: stats?.chats?.pending_chats || 0,
      percentage: stats?.chats?.total_chats
        ? Math.round(((stats?.chats?.pending_chats || 0) / stats.chats.total_chats) * 100)
        : 0,
      color: 'bg-amber-500',
      icon: Clock
    },
    {
      label: 'Closed Chats',
      count: stats?.chats?.closed_chats || 0,
      percentage: stats?.chats?.total_chats
        ? Math.round(((stats?.chats?.closed_chats || 0) / stats.chats.total_chats) * 100)
        : 0,
      color: 'bg-gray-500',
      icon: CheckCircle2
    },
    {
      label: 'Escalated',
      count: stats?.chats?.escalated_chats || 0,
      percentage: stats?.chats?.total_chats
        ? Math.round(((stats?.chats?.escalated_chats || 0) / stats.chats.total_chats) * 100)
        : 0,
      color: 'bg-rose-500',
      icon: TrendingUp
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Performance Reports</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Analisa performa dan statistik untuk{' '}
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {user?.tenant_name}
            </span>
          </p>
        </div>
        <div className="flex gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
          >
            <option value="today">Today</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="90days">Last 90 Days</option>
          </select>
          <button className="flex items-center gap-2 px-4 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all">
            <Download size={18} />
            Export
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiCards.map((kpi, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${kpi.bg} dark:bg-opacity-10 ${kpi.color}`}>
                <kpi.icon size={24} />
              </div>
              <span
                className={`text-xs font-semibold ${
                  kpi.trendUp ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {kpi.trend}
              </span>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{kpi.label}</p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{kpi.value}</h3>
          </div>
        ))}
      </div>

      {/* Chat Breakdown */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Chat Breakdown</h2>
          <BarChart3 className="text-gray-400" size={24} />
        </div>
        <div className="space-y-4">
          {chatBreakdown.map((item, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <item.icon size={16} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {item.label}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    {item.count}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-12 text-right">
                    {item.percentage}%
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full ${item.color} rounded-full transition-all duration-500`}
                  style={{ width: `${item.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-8 text-white">
          <Calendar className="mb-4 opacity-80" size={32} />
          <h3 className="text-2xl font-bold mb-2">
            {stats?.chats?.today_chats || 0} Chats
          </h3>
          <p className="text-blue-100">Created today</p>
          <div className="mt-6 pt-6 border-t border-blue-500/30">
            <p className="text-sm text-blue-100">
              Keep up the great work! Your team is responding quickly to customer inquiries.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-8">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Team Performance
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Owners</span>
              <span className="text-lg font-bold text-gray-900 dark:text-white">
                {stats?.users?.admin_count || 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Staff</span>
              <span className="text-lg font-bold text-gray-900 dark:text-white">
                {stats?.users?.agent_count || 0}
              </span>
            </div>
            <div className="pt-4 border-t border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Total Team Members
                </span>
                <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {stats?.users?.total_users || 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Coming Soon */}
      <div className="bg-gray-50 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-gray-300 dark:border-slate-700 p-12 text-center">
        <BarChart3 className="mx-auto mb-4 text-gray-400" size={48} />
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
          More Analytics Coming Soon
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Advanced charts, agent performance metrics, and export options will be available soon.
        </p>
      </div>
    </div>
  );
};

export default AdminReports;
