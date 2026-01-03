import { useState, useRef } from 'react';
import { Send, Bot, ArrowLeft, ShieldAlert, Phone, Mail, MapPin, Info, CheckCircle2, Paperclip, FileText } from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'sonner';

const AgentWorkspace = () => {
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [isAiActive, setIsAiActive] = useState(true);
  const [message, setMessage] = useState('');
  const [showDetails, setShowDetails] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data Chat List (Sidebar)
  const chats = [
    { id: 1, name: 'Budi Santoso', lastMsg: 'Tanya stok barang...', time: '10:30', status: 'escalated', phone: '+62 812-3456-7890', email: 'budi@gmail.com' },
    { id: 2, name: 'Siti Aminah', lastMsg: 'Terima kasih bantuannya', time: '09:15', status: 'handled_by_ai', phone: '+62 857-1122-3344', email: 'siti@outlook.com' },
    { id: 3, name: 'Andi Wijaya', lastMsg: 'Barang saya belum sampai', time: 'Yesterday', status: 'escalated', phone: '+62 899-8877-6655', email: 'andi@yahoo.com' },
  ];

  // Data Pesan (Chat Area)
  const [messages, setMessages] = useState([
    { id: 1, sender: 'customer', text: 'Halo, saya mau tanya stok sepatu ukuran 42 ada?', time: '10:25 AM' },
    { id: 2, sender: 'ai', text: 'Halo! Mohon tunggu sebentar, saya cek stoknya dulu ya.', time: '10:25 AM' },
    { id: 3, sender: 'system', text: 'Customer requested urgent help • AI Escalated', time: '10:27 AM' },
  ]);

  const handleTakeOver = () => {
    setIsAiActive(false);
    toast.success('You have taken over this chat. AI is now paused.');
  };

  const handleSendMessage = () => {
    if (!message) return;
    
    const newMsg = {
      id: Date.now(),
      sender: 'agent',
      text: message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages([...messages, newMsg]);
    setMessage('');
    toast.success('Message sent');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const newMsg = {
      id: Date.now(),
      sender: 'agent',
      text: file.name,
      type: 'file', // Tanda bahwa ini file
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages([...messages, newMsg]);
    toast.success(`File sent: ${file.name}`);
    e.target.value = ''; // Reset input
  };

  return (
    <div className="h-[calc(100vh-6rem)] md:h-[calc(100vh-4rem)] flex overflow-hidden -m-4 md:-m-8 bg-white">
      {/* 1. Chat List Sidebar */}
      <div className={clsx(
        "w-full md:w-80 lg:w-96 border-r border-gray-100 flex flex-col bg-gray-50/50",
        selectedChat && "hidden md:flex"
      )}>
        <div className="p-5 border-b border-gray-100 bg-white">
          <h1 className="text-xl font-bold text-gray-900">Inbox</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.map((chat) => (
            <div 
              key={chat.id}
              onClick={() => { setSelectedChat(chat); setIsAiActive(chat.status === 'handled_by_ai'); }}
              className={clsx(
                "p-4 border-b border-gray-100 cursor-pointer transition-all flex items-center space-x-3",
                selectedChat?.id === chat.id ? "bg-white shadow-sm ring-1 ring-black/5 z-10" : "hover:bg-gray-100/50"
              )}
            >
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                  {chat.name.charAt(0)}
                </div>
                {chat.status === 'escalated' && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <h3 className="font-semibold text-gray-900 truncate text-sm">{chat.name}</h3>
                  <span className="text-[10px] text-gray-400 font-medium">{chat.time}</span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">{chat.lastMsg}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Main Chat Area */}
      <div className={clsx(
        "flex-1 flex flex-col bg-white",
        !selectedChat && "hidden md:flex items-center justify-center text-gray-400"
      )}>
        {selectedChat ? (
          <>
            <div className="h-16 px-4 border-b border-gray-100 flex items-center justify-between bg-white z-10">
              <div className="flex items-center space-x-3">
                <button onClick={() => setSelectedChat(null)} className="md:hidden p-1 hover:bg-gray-50 rounded-lg"><ArrowLeft size={20} /></button>
                <div>
                  <h2 className="font-bold text-gray-900 text-sm leading-tight">{selectedChat.name}</h2>
                  <div className="flex items-center space-x-1"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span><span className="text-[10px] text-gray-400 font-bold tracking-wider uppercase">Active</span></div>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="hidden lg:flex items-center space-x-2 bg-gray-50 border border-gray-100 rounded-full px-3 py-1.5">
                  <Bot size={14} className={isAiActive ? "text-indigo-600" : "text-gray-400"} />
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight">AI Assistance</span>
                  <button 
                    onClick={() => isAiActive ? handleTakeOver() : setIsAiActive(true)}
                    className={clsx(
                      "relative inline-flex h-4 w-8 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      isAiActive ? "bg-indigo-600" : "bg-gray-300"
                    )}
                  >
                    <span className={clsx("pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition duration-200 ease-in-out", isAiActive ? "translate-x-4" : "translate-x-0")} />
                  </button>
                </div>
                <button onClick={() => setShowDetails(!showDetails)} className={clsx("p-2 rounded-lg transition-colors", showDetails ? "bg-indigo-50 text-indigo-600" : "text-gray-400 hover:bg-gray-50")}><Info size={20} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/30">
              {messages.map((msg: any) => (
                <div key={msg.id} className={clsx(
                  "flex flex-col",
                  msg.sender === 'customer' ? "items-start" : msg.sender === 'system' ? "items-center" : "items-end"
                )}>
                  {msg.sender === 'system' ? (
                    <div className="bg-red-50 text-red-600 text-[10px] font-bold px-4 py-1.5 rounded-full border border-red-100 flex items-center space-x-2 tracking-wide uppercase">
                      <ShieldAlert size={12} />
                      <span>{msg.text}</span>
                    </div>
                  ) : (
                    <div className={clsx(
                      "max-w-[80%] p-3 rounded-2xl shadow-sm text-sm",
                      msg.sender === 'customer' 
                        ? "bg-white text-gray-800 rounded-tl-none border border-gray-100" 
                        : msg.sender === 'ai'
                        ? "bg-indigo-600 text-white rounded-tr-none flex items-start space-x-2"
                        : "bg-purple-600 text-white rounded-tr-none" // Agent color
                    )}>
                      {msg.sender === 'ai' && <Bot size={14} className="mt-0.5 flex-shrink-0" />}
                      
                      {/* Cek apakah ini File atau Teks biasa */}
                      {msg.type === 'file' ? (
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-white/20 rounded-lg">
                            <FileText size={20} />
                          </div>
                          <div>
                            <p className="font-bold underline truncate max-w-[150px]">{msg.text}</p>
                            <p className="text-[10px] opacity-80 uppercase">Attachment</p>
                          </div>
                        </div>
                      ) : (
                        <span>{msg.text}</span>
                      )}

                    </div>
                  )}
                  <span className="text-[10px] text-gray-400 mt-2 mx-1">
                    {msg.time} {msg.sender === 'ai' && '• AI Response'} {msg.sender === 'agent' && '• You'}
                  </span>
                </div>
              ))}
            </div>

            <div className="p-4 bg-white border-t border-gray-100">
              <div className="flex items-center space-x-2">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileUpload} 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAiActive}
                  className="p-3 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Attach File"
                >
                  <Paperclip size={20} />
                </button>
                
                <input 
                  type="text" 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={isAiActive ? "AI is replying... Toggle off to reply manually" : "Type your manual reply..."}
                  disabled={isAiActive}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all disabled:opacity-50"
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={isAiActive || !message}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl disabled:opacity-30 transition-all shadow-lg shadow-indigo-100"
                ><Send size={20} /></button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4"><Bot size={32} className="text-gray-300" /></div>
            <h2 className="text-lg font-bold text-gray-900">Welcome to Workspace</h2>
            <p className="text-gray-500 text-sm">Select a ticket to start responding.</p>
          </div>
        )}
      </div>

      {/* 3. Customer Info Sidebar */}
      {selectedChat && showDetails && (
        <div className="hidden lg:flex w-72 lg:w-80 border-l border-gray-100 flex-col bg-white animate-in slide-in-from-right duration-300">
          <div className="p-5 border-b border-gray-100 font-bold text-gray-900 text-sm uppercase tracking-wider">Customer Profile</div>
          <div className="p-6 flex flex-col items-center border-b border-gray-50">
             <div className="w-20 h-20 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 text-2xl font-bold mb-4">{selectedChat.name.charAt(0)}</div>
             <h3 className="font-bold text-gray-900 text-lg">{selectedChat.name}</h3>
             <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold uppercase mt-1">Returning Customer</span>
          </div>
          <div className="p-6 space-y-6 flex-1 overflow-y-auto">
             <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gray-50 rounded-lg text-gray-400"><Phone size={16} /></div>
                  <div><p className="text-[10px] text-gray-400 font-bold uppercase">Phone</p><p className="text-xs font-medium text-gray-900">{selectedChat.phone}</p></div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gray-50 rounded-lg text-gray-400"><Mail size={16} /></div>
                  <div><p className="text-[10px] text-gray-400 font-bold uppercase">Email</p><p className="text-xs font-medium text-gray-900">{selectedChat.email}</p></div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gray-50 rounded-lg text-gray-400"><MapPin size={16} /></div>
                  <div><p className="text-[10px] text-gray-400 font-bold uppercase">Location</p><p className="text-xs font-medium text-gray-900">Jakarta, Indonesia</p></div>
                </div>
             </div>
             
             <div className="pt-6 border-t border-gray-50">
                <h4 className="text-[10px] text-gray-400 font-bold uppercase mb-3">Internal Notes</h4>
                <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                   <p className="text-[11px] text-yellow-800 leading-relaxed italic">"Pelanggan ini sering bertanya stok diskon. Berikan info promo jika ada."</p>
                </div>
             </div>
          </div>
          <div className="p-4 border-t border-gray-100">
             <button className="w-full py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center space-x-2">
                <CheckCircle2 size={14} />
                <span>Resolve Conversation</span>
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentWorkspace;