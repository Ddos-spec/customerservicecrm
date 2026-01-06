import { useState } from 'react';
import { 
  Send, Paperclip, Smile, MoreVertical, Search, 
  Phone, Video, Info, CheckCheck, Clock, User
} from 'lucide-react';

const AgentWorkspace = () => {
  const [message, setMessage] = useState('');
  
  const contacts = [
    { id: 1, name: 'Budi Santoso', lastMsg: 'Tanya stok batik kencana...', time: '2m ago', unread: 2, online: true },
    { id: 2, name: 'Siti Aminah', lastMsg: 'Terima kasih barang sudah...', time: '15m ago', unread: 0, online: false },
    { id: 3, name: 'Dewi Lestari', lastMsg: 'Bisa minta list harga?', time: '1h ago', unread: 0, online: true },
    { id: 4, name: 'Agus Prayogo', lastMsg: 'Pesanan saya belum dikirim', time: '3h ago', unread: 1, online: false },
  ];

  const messages = [
    { id: 1, sender: 'customer', text: 'Halo, apakah produk Batik Kencana masih ada?', time: '10:00 AM' },
    { id: 2, sender: 'agent', text: 'Halo Pak Budi! Masih ada kak, mau ukuran apa ya?', time: '10:02 AM', status: 'read' },
    { id: 3, sender: 'customer', text: 'Ukuran XL warna biru dong kak.', time: '10:05 AM' },
    { id: 4, sender: 'agent', text: 'Baik, stok XL Biru tersedia. Mau langsung diproses?', time: '10:06 AM', status: 'sent' },
  ];

  return (
    <div className="flex h-[calc(100vh-64px)] bg-white overflow-hidden">
      {/* Left Sidebar - Chat List */}
      <div className="w-80 border-r border-gray-100 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Cari chat..." 
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {contacts.map((contact) => (
            <div key={contact.id} className="p-4 hover:bg-blue-50/50 cursor-pointer transition-colors flex items-center space-x-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                  {contact.name.split(' ').map(n => n[0]).join('')}
                </div>
                {contact.online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between">
                  <h4 className="text-xs font-bold text-gray-900 truncate">{contact.name}</h4>
                  <span className="text-[10px] text-gray-400">{contact.time}</span>
                </div>
                <p className="text-[10px] text-gray-500 truncate mt-0.5">{contact.lastMsg}</p>
              </div>
              {contact.unread > 0 && (
                <div className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {contact.unread}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-50/50">
        {/* Chat Header */}
        <div className="h-16 bg-white border-b border-gray-100 px-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">BS</div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Budi Santoso</h3>
              <p className="text-[10px] text-emerald-500 font-medium">Online • Typing...</p>
            </div>
          </div>
          <div className="flex items-center space-x-4 text-gray-400">
            <button className="hover:text-blue-600"><Phone size={18} /></button>
            <button className="hover:text-blue-600"><Video size={18} /></button>
            <button className="hover:text-blue-600"><Info size={18} /></button>
            <button className="hover:text-blue-600"><MoreVertical size={18} /></button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex justify-center mb-6">
            <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full uppercase tracking-wider">Today</span>
          </div>
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'agent' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                msg.sender === 'agent' 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
              }`}>
                <p>{msg.text}</p>
                <div className={`flex items-center justify-end mt-1 space-x-1 text-[9px] ${msg.sender === 'agent' ? 'text-blue-100' : 'text-gray-400'}`}>
                  <span>{msg.time}</span>
                  {msg.sender === 'agent' && (
                    msg.status === 'read' ? <CheckCheck size={10} /> : <Clock size={10} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-gray-100">
          <div className="max-w-4xl mx-auto flex items-center space-x-4">
            <button className="text-gray-400 hover:text-blue-600 transition-colors"><Paperclip size={20} /></button>
            <div className="flex-1 relative">
              <input 
                type="text" 
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ketik pesan balasan..." 
                className="w-full pl-4 pr-12 py-3 bg-gray-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600"><Smile size={20} /></button>
            </div>
            <button className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95">
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Contact Info (Optional/Hidden for now) */}
      <div className="hidden xl:flex w-64 border-l border-gray-100 flex-col p-6 bg-white">
          <h3 className="font-bold text-gray-900 mb-6">Customer Info</h3>
          <div className="space-y-6">
              <div className="text-center">
                  <div className="w-20 h-20 rounded-2xl bg-blue-50 text-blue-600 mx-auto flex items-center justify-center mb-3">
                      <User size={40} />
                  </div>
                  <h4 className="font-bold text-gray-900">Budi Santoso</h4>
                  <p className="text-xs text-gray-400">+62 812-3456-7890</p>
              </div>
              <div className="space-y-4">
                  <div className="p-3 bg-gray-50 rounded-xl">
                      <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Status Pelanggan</p>
                      <p className="text-xs font-bold text-emerald-600">Premium Member</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl">
                      <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Total Belanja</p>
                      <p className="text-xs font-bold text-gray-900">Rp 12.500.000</p>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default AgentWorkspace;
