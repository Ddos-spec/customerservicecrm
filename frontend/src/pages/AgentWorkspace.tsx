import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Send, Paperclip, Smile, MoreVertical, Search,
  Phone, Video, Info, CheckCheck, Clock, User, X
} from 'lucide-react';
import { toast } from 'sonner';

interface Contact {
  id: number;
  name: string;
  lastMsg: string;
  time: string;
  unread: number;
  online: boolean;
  phone?: string;
  status?: string;
  totalSpend?: string;
}

interface Message {
  id: number;
  sender: 'customer' | 'agent';
  text: string;
  time: string;
  status?: 'sent' | 'read';
}

const AgentWorkspace = () => {
  const location = useLocation();
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const contacts: Contact[] = [
    { id: 1, name: 'Budi Santoso', lastMsg: 'Tanya stok batik kencana...', time: '2m ago', unread: 2, online: true, phone: '+62 812-3456-7890', status: 'Premium Member', totalSpend: 'Rp 12.500.000' },
    { id: 2, name: 'Siti Aminah', lastMsg: 'Terima kasih barang sudah...', time: '15m ago', unread: 0, online: false, phone: '+62 813-2345-6789', status: 'Regular', totalSpend: 'Rp 2.350.000' },
    { id: 3, name: 'Dewi Lestari', lastMsg: 'Bisa minta list harga?', time: '1h ago', unread: 0, online: true, phone: '+62 857-1234-5678', status: 'New Customer', totalSpend: 'Rp 450.000' },
    { id: 4, name: 'Agus Prayogo', lastMsg: 'Pesanan saya belum dikirim', time: '3h ago', unread: 1, online: false, phone: '+62 878-8765-4321', status: 'Regular', totalSpend: 'Rp 5.200.000' },
  ];

  // Chat messages per contact
  const allMessages: Record<number, Message[]> = {
    1: [
      { id: 1, sender: 'customer', text: 'Halo, apakah produk Batik Kencana masih ada?', time: '10:00 AM' },
      { id: 2, sender: 'agent', text: 'Halo Pak Budi! Masih ada kak, mau ukuran apa ya?', time: '10:02 AM', status: 'read' },
      { id: 3, sender: 'customer', text: 'Ukuran XL warna biru dong kak.', time: '10:05 AM' },
      { id: 4, sender: 'agent', text: 'Baik, stok XL Biru tersedia. Mau langsung diproses?', time: '10:06 AM', status: 'sent' },
    ],
    2: [
      { id: 1, sender: 'customer', text: 'Kak, barang sudah sampai!', time: '09:30 AM' },
      { id: 2, sender: 'agent', text: 'Alhamdulillah kak, terima kasih sudah belanja di toko kami!', time: '09:32 AM', status: 'read' },
      { id: 3, sender: 'customer', text: 'Terima kasih barang sudah sampai dengan selamat', time: '09:35 AM' },
    ],
    3: [
      { id: 1, sender: 'customer', text: 'Selamat siang kak', time: '12:00 PM' },
      { id: 2, sender: 'agent', text: 'Siang kak Dewi, ada yang bisa dibantu?', time: '12:01 PM', status: 'read' },
      { id: 3, sender: 'customer', text: 'Bisa minta list harga terbaru kak?', time: '12:03 PM' },
    ],
    4: [
      { id: 1, sender: 'customer', text: 'Halo min, pesanan saya dengan kode #123 kok belum dikirim?', time: '08:00 AM' },
      { id: 2, sender: 'agent', text: 'Selamat pagi Pak Agus, mohon maaf atas keterlambatannya. Saya cek dulu ya pak.', time: '08:15 AM', status: 'read' },
      { id: 3, sender: 'agent', text: 'Pak Agus, pesanan sudah kami kirim tadi pagi. Ini nomor resinya: JNE123456789', time: '08:20 AM', status: 'sent' },
      { id: 4, sender: 'customer', text: 'Pesanan saya belum dikirim, tolong segera ya', time: '11:00 AM' },
    ],
  };

  const getInitialContact = () => {
    const selectedName = location.state?.selectedChat?.name;
    return contacts.find(c => c.name === selectedName) ?? contacts[0];
  };

  const [selectedContact, setSelectedContact] = useState<Contact>(getInitialContact);
  const [messages, setMessages] = useState<Message[]>(() => {
    const initialContact = getInitialContact();
    return allMessages[initialContact.id] || [];
  });

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setMessages(allMessages[contact.id] || []);
  };

  const handleSendMessage = () => {
    if (!message.trim()) return;

    const newMsg: Message = {
      id: messages.length + 1,
      sender: 'agent',
      text: message,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      status: 'sent'
    };

    setMessages([...messages, newMsg]);
    setMessage('');
    toast.success('Pesan terkirim');
  };

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-64px)] bg-white dark:bg-slate-900 overflow-hidden transition-colors duration-300">
      {/* Left Sidebar - Chat List */}
      <div className="w-80 border-r border-gray-100 dark:border-slate-800 flex flex-col shrink-0 bg-white dark:bg-slate-900">
        <div className="p-4 border-b border-gray-50 dark:border-slate-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Cari chat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50 dark:divide-slate-800">
          {filteredContacts.map((contact) => (
            <div
              key={contact.id}
              onClick={() => handleSelectContact(contact)}
              className={`p-4 hover:bg-blue-50/50 dark:hover:bg-slate-800 cursor-pointer transition-colors flex items-center space-x-3 ${selectedContact.id === contact.id ? 'bg-blue-50 dark:bg-slate-800' : ''}`}
            >
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 font-bold text-xs">
                  {contact.name.split(' ').map(n => n[0]).join('')}
                </div>
                {contact.online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between">
                  <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate">{contact.name}</h4>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{contact.time}</span>
                </div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{contact.lastMsg}</p>
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
      <div className="flex-1 flex flex-col bg-gray-50/50 dark:bg-slate-900/50">
        {/* Chat Header */}
        <div className="h-16 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 px-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 font-bold text-xs">
              {selectedContact.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">{selectedContact.name}</h3>
              <p className={`text-[10px] font-medium ${selectedContact.online ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
                {selectedContact.online ? 'Online • Typing...' : 'Offline'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4 text-gray-400 dark:text-gray-500">
            <button onClick={() => toast.info('Fitur telepon akan segera hadir')} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Phone size={18} /></button>
            <button onClick={() => toast.info('Fitur video call akan segera hadir')} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Video size={18} /></button>
            <button onClick={() => setIsInfoOpen(true)} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Info size={18} /></button>
            <button onClick={() => toast.info('Menu lainnya')} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><MoreVertical size={18} /></button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex justify-center mb-6">
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-slate-800 px-3 py-1 rounded-full uppercase tracking-wider">Today</span>
          </div>
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'agent' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                msg.sender === 'agent'
                  ? 'bg-blue-600 text-white rounded-tr-none'
                  : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-white border border-gray-100 dark:border-slate-700 rounded-tl-none'
              }`}>
                <p>{msg.text}</p>
                <div className={`flex items-center justify-end mt-1 space-x-1 text-[9px] ${msg.sender === 'agent' ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}>
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
        <div className="p-4 bg-white dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700">
          <div className="max-w-4xl mx-auto flex items-center space-x-4">
            <button onClick={() => toast.info('Fitur lampiran akan segera hadir')} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Paperclip size={20} /></button>
            <div className="flex-1 relative">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ketik pesan balasan..."
                className="w-full pl-4 pr-12 py-3 bg-gray-50 dark:bg-slate-700 border-none rounded-2xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
              <button onClick={() => toast.info('Emoji picker akan segera hadir')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"><Smile size={20} /></button>
            </div>
            <button onClick={handleSendMessage} className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100 dark:shadow-blue-900/30 hover:bg-blue-700 transition-all active:scale-95">
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Contact Info */}
      <div className="hidden xl:flex w-64 border-l border-gray-100 dark:border-slate-800 flex-col p-6 bg-white dark:bg-slate-900">
          <h3 className="font-bold text-gray-900 dark:text-white mb-6">Customer Info</h3>
          <div className="space-y-6">
              <div className="text-center">
                  <div className="w-20 h-20 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center mb-3">
                      <User size={40} />
                  </div>
                  <h4 className="font-bold text-gray-900 dark:text-white">{selectedContact.name}</h4>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{selectedContact.phone}</p>
              </div>
              <div className="space-y-4">
                  <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Status Pelanggan</p>
                      <p className={`text-xs font-bold ${selectedContact.status === 'Premium Member' ? 'text-emerald-600 dark:text-emerald-400' : selectedContact.status === 'New Customer' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'}`}>
                        {selectedContact.status}
                      </p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Total Belanja</p>
                      <p className="text-xs font-bold text-gray-900 dark:text-white">{selectedContact.totalSpend}</p>
                  </div>
              </div>
          </div>
      </div>

      {/* Customer Info Modal (for mobile/tablet) */}
      {isInfoOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm xl:hidden">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 flex justify-between items-center border-b border-gray-100 dark:border-slate-700">
              <h3 className="font-bold text-gray-900 dark:text-white">Info Pelanggan</h3>
              <button onClick={() => setIsInfoOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                <X size={20} className="text-gray-400 dark:text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="text-center">
                <div className="w-20 h-20 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center mb-3">
                  <User size={40} />
                </div>
                <h4 className="font-bold text-gray-900 dark:text-white text-lg">{selectedContact.name}</h4>
                <p className="text-sm text-gray-400 dark:text-gray-500">{selectedContact.phone}</p>
                <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold ${selectedContact.online ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400'}`}>
                  {selectedContact.online ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="space-y-3">
                <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Status Pelanggan</p>
                  <p className={`text-sm font-bold ${selectedContact.status === 'Premium Member' ? 'text-emerald-600 dark:text-emerald-400' : selectedContact.status === 'New Customer' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'}`}>
                    {selectedContact.status}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Total Belanja</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{selectedContact.totalSpend}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentWorkspace;
