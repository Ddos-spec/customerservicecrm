import { useState, useEffect } from 'react';
import api from '../lib/api';

const DebugAnalytics = () => {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/debug/messages')
      .then(res => setData(res.data))
      .catch(err => setError(err.message));
  }, []);

  if (error) return <div className="p-10 text-red-500">Error: {error}</div>;
  if (!data) return <div className="p-10">Loading Data Diagnosa...</div>;

  return (
    <div className="p-10 space-y-6 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold">Diagnosa Data Pesan</h1>
      
      {/* 1. Ringkasan Statistik */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4 text-blue-600">1. Ringkasan Statistik Pesan</h2>
        <p className="text-sm text-gray-500 mb-4">
          Ini adalah jumlah pesan yang ada di database Anda saat ini, dikelompokkan berdasarkan Pengirim (sender_type) dan Tipe Pesan.
        </p>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="p-3">Sender Type</th>
              <th className="p-3">Message Type</th>
              <th className="p-3 text-right">Jumlah Pesan</th>
              <th className="p-3 text-center">Status Analisis</th>
            </tr>
          </thead>
          <tbody>
            {data.debug_info.summary_stats.map((stat: any, idx: number) => {
                // Logika Filter Analitik Kita
                const isAnalyzed = stat.sender_type === 'contact'
                  && ['text', 'conversation', 'extendedTextMessage'].includes(stat.message_type);
                
                return (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-mono text-blue-600">{stat.sender_type}</td>
                      <td className="p-3 font-mono">{stat.message_type}</td>
                      <td className="p-3 text-right font-bold">{stat.count}</td>
                      <td className="p-3 text-center">
                        {isAnalyzed ? (
                            <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-bold">TERHITUNG ✅</span>
                        ) : (
                            <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-bold">DIABAIKAN ❌</span>
                        )}
                      </td>
                    </tr>
                );
            })}
          </tbody>
        </table>
        
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            <strong>Analisa Masalah:</strong><br/>
            Jika kolom "Status Analisis" semuanya ❌, maka itulah penyebab grafik Anda kosong.<br/>
            Fitur Analitik menghitung baris <strong>sender_type='contact'</strong> dengan tipe
            <strong> text/conversation/extendedTextMessage</strong>.
        </div>
      </div>

      {/* 2. Sampel Data Mentah */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4 text-purple-600">2. Sampel 50 Pesan Terakhir</h2>
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-3">ID</th>
                  <th className="p-3">Waktu</th>
                  <th className="p-3">Sender</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Isi Pesan (Body)</th>
                </tr>
              </thead>
              <tbody>
                {data.debug_info.raw_samples.map((msg: any) => (
                    <tr key={msg.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-mono text-gray-400">{msg.id.substring(0,8)}...</td>
                      <td className="p-3 text-gray-500">{new Date(msg.created_at).toLocaleString()}</td>
                      <td className={`p-3 font-bold ${msg.sender_type === 'contact' ? 'text-green-600' : 'text-blue-600'}`}>
                        {msg.sender_type}
                      </td>
                      <td className="p-3">{msg.message_type}</td>
                      <td className="p-3 font-mono bg-gray-50 text-gray-700">{msg.body}</td>
                    </tr>
                ))}
              </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default DebugAnalytics;
