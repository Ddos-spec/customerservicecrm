import { useState } from 'react';
import { Search, Calendar, Filter, CheckCircle, Clock, X, Bot, User, FileText } from 'lucide-react';
import { clsx } from 'clsx';

const ChatHistory = () => {
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [history] = useState([
    { 
      id: 101, 
      customer: 'Budi Santoso', 
      agent: 'Siti (Shift Siang)', 
      topic: 'Stok Barang', 
      status: 'Resolved', 
      date: '2023-10-24 14:30', 
      duration: '15m',
      transcript: [
        { sender: 'customer', text: 'Halo, sepatu bola ada?', time: '14:30' },
        { sender: 'ai', text: 'Tentu ada, mau ukuran berapa?', time: '14:30' },
        { sender: 'agent', text: 'Halo Pak Budi, untuk stok bola ready ukuran 40-44 ya.', time: '14:35' },
      ]
    },
    { 
      id: 102, 
      customer: 'Ani Wijaya', 
      agent: 'AI Bot', 
      topic: 'Jam Buka', 
      status: 'Auto-Resolved', 
      date: '2023-10-24 13:15', 
      duration: '2m',
      transcript: [
        { sender: 'customer', text: 'Toko buka jam berapa?', time: '13:15' },
        { sender: 'ai', text: 'Kami buka setiap hari pukul 09:00 - 21:00 WIB.', time: '13:16' },
      ]
    },
    { id: 103, customer: 'Rudi Hartono', agent: 'Budi (Shift Pagi)', topic: 'Komplain Pengiriman', status: 'Resolved', date: '2023-10-24 11:00', duration: '45m' },
    { id: 104, customer: 'Dewi Sartika', agent: 'Rudi (Shift Malam)', topic: 'Cara Pembayaran', status: 'Resolved', date: '2023-10-23 20:10', duration: '10m' },
  ]);

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Chat History</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Archive of all resolved conversations.</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-slate-700">
            <Calendar size={16} />
            <span>Select Date</span>
          </button>
          <button className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-slate-700">
            <Filter size={16} />
            <span>Filter</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        {/* Search Bar */}
        <div className="p-4 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/70">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} />
            <input 
              type="text" 
              placeholder="Search by customer name, topic, or agent..." 
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 dark:bg-slate-800/70 border-b border-gray-100 dark:border-slate-700 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-semibold">Customer</th>
                <th className="px-6 py-4 font-semibold">Topic</th>
                <th className="px-6 py-4 font-semibold">Handled By</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Date & Time</th>
                <th className="px-6 py-4 font-semibold">Duration</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {history.map((chat) => (
                <tr key={chat.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/40 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{chat.customer}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{chat.topic}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                      chat.agent === 'AI Bot' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200'
                    }`}>
                      {chat.agent}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                     <div className="flex items-center space-x-1.5 text-green-600 dark:text-green-400 text-sm">
                       <CheckCircle size={14} />
                       <span>{chat.status}</span>
                     </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{chat.date}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 flex items-center space-x-1">
                    <Clock size={14} />
                    <span>{chat.duration}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => setSelectedChat(chat)}
                      className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-sm font-bold flex items-center justify-end space-x-1"
                    >
                      <span>View Transcript</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="p-4 border-t border-gray-100 dark:border-slate-700 flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
           <span>Showing 1-4 of 128 results</span>
           <div className="flex space-x-2">
             <button className="px-3 py-1 border border-gray-200 dark:border-slate-700 rounded hover:bg-gray-50 dark:hover:bg-slate-700">Previous</button>
             <button className="px-3 py-1 border border-gray-200 dark:border-slate-700 rounded hover:bg-gray-50 dark:hover:bg-slate-700">Next</button>
           </div>
        </div>
      </div>

      {/* MODAL: Transcript Viewer */}
      {selectedChat && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/70">
              <div className="flex items-center space-x-4">
                 <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold">
                    {selectedChat.customer.charAt(0)}
                 </div>
                 <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{selectedChat.customer}</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Topic: {selectedChat.topic} • {selectedChat.date}</p>
                 </div>
              </div>
              <button onClick={() => setSelectedChat(null)} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={24} />
              </button>
            </div>

            {/* Modal Body: Transcript Scroll */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-white dark:bg-slate-900">
              {selectedChat.transcript ? selectedChat.transcript.map((msg: any, i: number) => (
                <div key={i} className={clsx(
                  "flex flex-col",
                  msg.sender === 'customer' ? "items-start" : "items-end"
                )}>
                  <div className={clsx(
                    "max-w-[85%] p-4 rounded-2xl text-sm shadow-sm",
                    msg.sender === 'customer' 
                      ? "bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-gray-100 rounded-tl-none" 
                      : msg.sender === 'ai'
                      ? "bg-indigo-600 text-white rounded-tr-none flex items-start space-x-2"
                      : "bg-purple-600 text-white rounded-tr-none"
                  )}>
                    {msg.sender === 'ai' && <Bot size={14} className="mt-0.5" />}
                    {msg.sender === 'agent' && <User size={14} className="mt-0.5" />}
                    <span>{msg.text}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 px-1 font-medium tracking-wide">
                    {msg.time} • {msg.sender.toUpperCase()}
                  </span>
                </div>
              )) : (
                <div className="text-center py-20">
                   <FileText size={48} className="mx-auto text-gray-200 dark:text-slate-700 mb-4" />
                   <p className="text-gray-500 dark:text-gray-400 font-medium italic">Full transcript is being archived...</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/70 flex justify-between items-center">
               <div className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                  Resolved by <span className="text-gray-900 dark:text-white font-bold">{selectedChat.agent}</span>
               </div>
               <button onClick={() => setSelectedChat(null)} className="px-6 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors shadow-sm">
                 Close Archive
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatHistory;
