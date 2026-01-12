import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Send, Paperclip, Smile, MoreVertical, Search,
  Phone, Video, Info, CheckCheck, Clock, User, X, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { useAuthStore } from '../store/useAuthStore';

interface Contact {
  id: number;
  name: string;
  lastMsg: string;
  time: string;
  unread: number;
  online: boolean;
  phone?: string;
  status?: string;
  totalMessages?: number;
}

interface Message {
  id: number;
  sender: 'customer' | 'agent';
  text: string;
  time: string;
  status?: 'sent' | 'read';
}

const formatRelativeTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return 'baru saja';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

const formatMessageTime = (value?: string) => {
  if (!value) return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

const AgentWorkspace = () => {
  const { user } = useAuthStore();
  const location = useLocation();
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  
  const ws = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const contacts: Contact[] = useMemo(() => (
    tickets.map((ticket) => {
      const name = ticket.customer_name || ticket.customer_contact || `Customer #${ticket.id}`;
      return {
        id: ticket.id,
        name,
        lastMsg: ticket.last_message || 'Belum ada pesan',
        time: formatRelativeTime(ticket.last_message_at || ticket.updated_at || ticket.created_at),
        unread: ticket.last_sender_type === 'customer' ? 1 : 0, // Simplifikasi unread
        online: false,
        phone: ticket.customer_contact,
        status: ticket.status,
        totalMessages: ticket.message_count
      };
    })
  ), [tickets]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchTickets = useCallback(async () => {
    setIsLoadingTickets(true);
    try {
      const res = await api.get('/admin/tickets?limit=200');
      if (res.data.success) {
        setTickets(res.data.tickets || []);
      }
    } catch (error) {
      console.error('Failed to fetch tickets:', error);
      toast.error('Gagal memuat chat');
    } finally {
      setIsLoadingTickets(false);
    }
  }, []);

  const fetchMessages = useCallback(async (ticketId: number) => {
    setIsLoadingMessages(true);
    try {
      const res = await api.get(`/admin/tickets/${ticketId}/messages`);
      if (res.data.success) {
        const mapped = (res.data.messages || []).map((msg: any) => ({
          id: msg.id,
          sender: msg.sender_type === 'customer' ? 'customer' : 'agent',
          text: msg.message_text || '',
          time: formatMessageTime(msg.created_at),
          status: msg.sender_type === 'agent' ? 'sent' : undefined
        }));
        setMessages(mapped);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      toast.error('Gagal memuat pesan');
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // WebSocket Connection
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_API_URL 
      ? new URL(import.meta.env.VITE_API_URL).host 
      : window.location.host;
    
    // Fallback logic jika development dan beda port
    const wsUrl = `${protocol}//${host}`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('WebSocket Connected');
    };

    ws.current.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        
        // Handle incoming message
        if (payload.type === 'message') {
           const msgData = payload.data;
           
           // Filter tenant (Basic security)
           if (user?.tenant_id && msgData.tenant_id && user.tenant_id !== msgData.tenant_id) {
             return;
           }

           const incomingTicketId = msgData.ticket_id;
           const newMessage: Message = {
             id: msgData.db_id || Date.now(),
             sender: 'customer',
             text: msgData.body || msgData.caption || '[Media]',
             time: formatMessageTime(new Date().toISOString()),
             status: 'read'
           };

           // 1. Update Messages list if chat is open
           // Note: Kita pake functional update state biar dapet value terbaru selectedContact tanpa dependency
           setSelectedContact((currentSelected) => {
             if (currentSelected?.id === incomingTicketId) {
                setMessages((prev) => [...prev, newMessage]);
                // Mark as read (optional API call here)
             } else {
                toast.info(`Pesan baru dari ${msgData.pushName || msgData.from}`);
             }
             return currentSelected;
           });

           // 2. Update Tickets List (Last message info)
           setTickets((prev) => {
             const existingTicket = prev.find(t => t.id === incomingTicketId);
             
             if (existingTicket) {
               // Update existing ticket
               return prev.map(t => t.id === incomingTicketId ? {
                 ...t,
                 last_message: newMessage.text,
                 last_sender_type: 'customer',
                 last_message_at: new Date().toISOString(),
                 message_count: (parseInt(t.message_count || '0') + 1).toString()
               } : t).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
             } else {
               // New ticket logic (need full ticket data, maybe fetchTickets again or append simple obj)
               // For simplicity, fetch all again to get fresh order
               void fetchTickets();
               return prev;
             }
           });
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket Error:', error);
    };

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [user, fetchTickets]);

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    if (contacts.length === 0) {
      setSelectedContact(null);
      setMessages([]);
      return;
    }
    const selectedFromState = location.state?.selectedChat?.id;
    if (selectedFromState && !selectedContact) {
         const target = contacts.find((c) => c.id === selectedFromState);
         if (target) {
            setSelectedContact(target);
            void fetchMessages(target.id);
         }
    } else if (!selectedContact && contacts.length > 0) {
        // Auto select first? Maybe no
        // setSelectedContact(contacts[0]);
        // void fetchMessages(contacts[0].id);
    }
  }, [contacts, location.state, fetchMessages, selectedContact]);

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    void fetchMessages(contact.id);
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;
    if (!selectedContact) return;
    if (!selectedContact.phone) {
      toast.error('Nomor pelanggan tidak tersedia');
      return;
    }

    setIsSending(true);
    const messageText = message.trim();
    try {
      await api.post('/internal/messages', {
        phone: selectedContact.phone,
        message_text: messageText,
        ticket_id: selectedContact.id
      });
    } catch (error: any) {
      console.error('Failed to send WhatsApp message:', error);
      toast.error(error.response?.data?.message || 'Gagal mengirim pesan');
      setIsSending(false);
      return;
    }

    try {
      const res = await api.post(`/admin/tickets/${selectedContact.id}/messages`, {
        message_text: messageText
      });
      if (res.data.success) {
        const newMsg: Message = {
          id: res.data.message.id,
          sender: 'agent',
          text: res.data.message.message_text,
          time: formatMessageTime(res.data.message.created_at),
          status: 'sent'
        };
        setMessages((prev) => [...prev, newMsg]);
        setTickets((prev) => prev.map((ticket) => (
          ticket.id === selectedContact.id
            ? { ...ticket, last_message: res.data.message.message_text, last_sender_type: 'agent', last_message_at: res.data.message.created_at }
            : ticket
        )));
        // toast.success('Pesan terkirim'); // Gak usah toast biar clean ala WA
        setMessage('');
      }
    } catch (error: any) {
      console.error('Failed to log message:', error);
      const fallbackTime = new Date().toISOString();
      const newMsg: Message = {
        id: Date.now(),
        sender: 'agent',
        text: messageText,
        time: formatMessageTime(fallbackTime),
        status: 'sent'
      };
      setMessages((prev) => [...prev, newMsg]);
      setTickets((prev) => prev.map((ticket) => (
        ticket.id === selectedContact.id
          ? { ...ticket, last_message: messageText, last_sender_type: 'agent', last_message_at: fallbackTime }
          : ticket
      )));
      setMessage('');
      toast.error(error.response?.data?.error || 'Pesan terkirim, tapi gagal disimpan');
    } finally {
      setIsSending(false);
    }
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
          {isLoadingTickets ? (
            <div className="p-6 text-center text-gray-400 dark:text-gray-500">
              <Loader2 className="animate-spin mx-auto mb-2" size={18} />
              Memuat chat...
            </div>
          ) : filteredContacts.length > 0 ? (
            filteredContacts.map((contact) => (
              <div
                key={contact.id}
                onClick={() => handleSelectContact(contact)}
                className={`p-4 hover:bg-blue-50/50 dark:hover:bg-slate-800 cursor-pointer transition-colors flex items-center space-x-3 ${selectedContact?.id === contact.id ? 'bg-blue-50 dark:bg-slate-800' : ''}`}
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 font-bold text-xs">
                    {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
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
            ))
          ) : (
            <div className="p-6 text-center text-gray-400 dark:text-gray-500">Belum ada chat.</div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-50/50 dark:bg-slate-900/50">
        {/* Chat Header */}
        <div className="h-16 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 px-6 flex items-center justify-between">
          {selectedContact ? (
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 font-bold text-xs">
                {selectedContact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">{selectedContact.name}</h3>
                <p className={`text-[10px] font-medium ${selectedContact.online ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
                  {selectedContact.online ? 'Online - Typing...' : 'Offline'}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400 dark:text-gray-500">Pilih chat untuk mulai</div>
          )}
          <div className="flex items-center space-x-4 text-gray-400 dark:text-gray-500">
            <button onClick={() => toast.info('Fitur telepon akan segera hadir')} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Phone size={18} /></button>
            <button onClick={() => toast.info('Fitur video call akan segera hadir')} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Video size={18} /></button>
            <button onClick={() => setIsInfoOpen(true)} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Info size={18} /></button>
            <button onClick={() => toast.info('Menu lainnya')} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><MoreVertical size={18} /></button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoadingMessages ? (
            <div className="flex justify-center py-10 text-gray-400 dark:text-gray-500">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : messages.length > 0 ? (
            <>
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
            </>
          ) : (
            <div className="text-center text-gray-400 dark:text-gray-500">Belum ada pesan.</div>
          )}
                  {messages.length > 0 && <div ref={messagesEndRef} />}

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
            <button
              onClick={handleSendMessage}
              disabled={isSending || !selectedContact}
              className="p-3 bg-blue-600 disabled:bg-blue-400 text-white rounded-2xl shadow-lg shadow-blue-100 dark:shadow-blue-900/30 hover:bg-blue-700 transition-all active:scale-95"
            >
              {isSending ? <Loader2 className="animate-spin" size={18} /> : <Send size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Contact Info */}
      <div className="hidden xl:flex w-64 border-l border-gray-100 dark:border-slate-800 flex-col p-6 bg-white dark:bg-slate-900">
          <h3 className="font-bold text-gray-900 dark:text-white mb-6">Info Pelanggan</h3>
          {selectedContact ? (
            <div className="space-y-6">
                <div className="text-center">
                    <div className="w-20 h-20 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center mb-3">
                        <User size={40} />
                    </div>
                    <h4 className="font-bold text-gray-900 dark:text-white">{selectedContact.name}</h4>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{selectedContact.phone || '-'}</p>
                </div>
                <div className="space-y-4">
                    <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Status Tiket</p>
                        <p className="text-xs font-bold text-gray-600 dark:text-gray-300">
                          {selectedContact.status || '-'}
                        </p>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Total Pesan</p>
                        <p className="text-xs font-bold text-gray-900 dark:text-white">{selectedContact.totalMessages ?? 0}</p>
                    </div>
                </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400 dark:text-gray-500">Tidak ada chat terpilih.</div>
          )}
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
                <h4 className="font-bold text-gray-900 dark:text-white text-lg">{selectedContact?.name || '-'}</h4>
                <p className="text-sm text-gray-400 dark:text-gray-500">{selectedContact?.phone || '-'}</p>
                <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold ${selectedContact?.online ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400'}`}>
                  {selectedContact?.online ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="space-y-3">
                <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Status Tiket</p>
                  <p className="text-sm font-bold text-gray-600 dark:text-gray-300">
                    {selectedContact?.status || '-'}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Total Pesan</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{selectedContact?.totalMessages ?? 0}</p>
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
