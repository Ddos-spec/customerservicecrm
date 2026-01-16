const AdminDashboard = () => {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Owner Dashboard</h1>
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">n8n Integration Status</h2>
        <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
          <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
          <span className="font-medium">Connected</span>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
