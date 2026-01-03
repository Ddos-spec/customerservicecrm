const AdminDashboard = () => {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Agent Dashboard</h1>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
        <h2 className="text-lg font-semibold mb-4">n8n Integration Status</h2>
        <div className="flex items-center space-x-2 text-green-600">
          <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
          <span className="font-medium">Connected</span>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
