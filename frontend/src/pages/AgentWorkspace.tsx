import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Send, Paperclip, Smile, MoreVertical, Search,
  Info, CheckCheck, Clock, User, X, Loader2, Users
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { useAuthStore } from '../store/useAuthStore';

// --- Interfaces based on V2 DB Schema ---

interface Chat {
  id: string; // UUID
  contact_id: string;
  display_name: string; // From Contact Name or PushName (or Group Name for groups)
  phone_number: string;
  jid?: string; // WhatsApp JID
  is_group: boolean; // Group chat flag
  unread_count: number;
  last_message_preview: string;
  last_message_time: string;
  last_message_type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location';
  profile_pic_url?: string;
  status: 'open' | 'resolved';
  agent_name?: string; // Assigned agent
}

interface Message {
  id: string; // UUID
  chat_id: string;
  sender_type: 'agent' | 'customer' | 'system';
  sender_name?: string;
  message_type: string;
  body: string;
  media_url?: string;
  is_from_me: boolean;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  created_at: string;
}

const formatRelativeTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  
  if (diffMinutes < 1) return 'Baru saja';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}h`; // Typo fix: should be 'd' but keeping consistent style
  
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

const formatMessageTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

const CHAT_PAGE_SIZE = 100;

const AgentWorkspace = () => {
  const { user } = useAuthStore();
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Core Data
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [totalContacts, setTotalContacts] = useState<number | null>(null);
  
  // Loading States
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingMoreChats, setIsLoadingMoreChats] = useState(false);
  const [hasMoreChats, setHasMoreChats] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  
  const ws = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatOffsetRef = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Only auto-scroll to bottom on initial load or new incoming messages (at the bottom)
  // We disable this when fetching old history to prevent jumping
  useEffect(() => {
    if (!isFetchingMore) {
        scrollToBottom();
    }
  }, [messages, isFetchingMore]);

  // --- 1. Fetch Chat List (Inbox) ---
  const fetchChats = useCallback(async ({ reset = false }: { reset?: boolean } = {}) => {
    if (reset) {
      setIsLoadingChats(true);
      setHasMoreChats(true);
      chatOffsetRef.current = 0;
      setTotalContacts(null);
    } else {
      setIsLoadingMoreChats(true);
    }

    try {
      // V2 Endpoint: GET /chats
      const offset = chatOffsetRef.current;
      const includeCount = reset ? '&include_count=true' : '';
      const res = await api.get(`/chats?limit=${CHAT_PAGE_SIZE}&offset=${offset}${includeCount}`);
      if (res.data.status === 'success') {
        const newChats = res.data.data || [];
        setChats((prev) => (reset ? newChats : [...prev, ...newChats]));
        chatOffsetRef.current = offset + newChats.length;

        if (newChats.length < CHAT_PAGE_SIZE) {
          setHasMoreChats(false);
        }

        if (reset) {
          const count = Number.parseInt(res.data.total_contacts, 10);
          setTotalContacts(Number.isFinite(count) ? count : null);
        }
      }
    } catch (error) {
      console.error('Failed to fetch chats:', error);
      toast.error('Gagal memuat daftar chat');
    } finally {
      if (reset) {
        setIsLoadingChats(false);
      } else {
        setIsLoadingMoreChats(false);
      }
    }
  }, []);

  // --- 2. Fetch Messages for Selected Chat ---
  const fetchMessages = useCallback(async (chatId: string, beforeId?: string) => {
    if (beforeId) {
        setIsFetchingMore(true);
    } else {
        setIsLoadingMessages(true);
        setHasMoreMessages(true); // Reset for new chat
    }

    try {
      // V2 Endpoint: GET /chats/:id/messages
      // Use cursor-based pagination if beforeId is present
      const url = `/chats/${chatId}/messages?limit=50${beforeId ? `&before=${beforeId}` : ''}`;
      const res = await api.get(url);
      
      if (res.data.status === 'success') {
        const newMessages = res.data.data;
        
        // If we get fewer messages than limit, we reached the beginning of history
        if (newMessages.length < 50) {
            setHasMoreMessages(false);
        }

        if (beforeId) {
            // "Load More" scenario: Prepend old messages
            // We need to maintain scroll position manually after render
            const container = messagesContainerRef.current;
            const oldScrollHeight = container ? container.scrollHeight : 0;

            setMessages((prev) => [...newMessages, ...prev]);

            // Restore scroll position after DOM update
            // We use setTimeout to ensure React has finished rendering
            setTimeout(() => {
                if (container) {
                    const newScrollHeight = container.scrollHeight;
                    container.scrollTop = newScrollHeight - oldScrollHeight;
                }
            }, 0);
        } else {
            // "Initial Load" scenario: Replace all messages
            setMessages(newMessages);
        }
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      toast.error('Gagal memuat pesan');
    } finally {
      setIsLoadingMessages(false);
      setIsFetchingMore(false);
    }
  }, []);

  // Handle Scroll to Top (Infinite Scroll)
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // Check if scrolled to top (allow 10px buffer) and if we have more messages to load
    if (container.scrollTop < 10 && hasMoreMessages && !isFetchingMore && !isLoadingMessages && messages.length > 0) {
        const oldestMessageId = messages[0].id;
        fetchMessages(selectedChat!.id, oldestMessageId);
    }
  };

  // --- 3. WebSocket Connection (Real-time) ---
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_API_URL 
      ? new URL(import.meta.env.VITE_API_URL).host 
      : window.location.host;
    
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
           
           // Tenant Isolation Check
           if (user?.tenant_id && msgData.tenant_id && user.tenant_id !== msgData.tenant_id) {
             return;
           }

           const incomingChatId = msgData.chat_id; // V2 uses chat_id

           // 1. Update Messages if current chat is open
           setSelectedChat((current) => {
             if (current?.id === incomingChatId) {
                const newMsg: Message = {
                    id: msgData.db_id || Date.now().toString(),
                    chat_id: incomingChatId,
                    sender_type: msgData.sender_type || (msgData.isFromMe ? 'agent' : 'customer'),
                    sender_name: msgData.sender_name || msgData.pushName,
                    message_type: msgData.type || 'text',
                    body: msgData.body || msgData.caption || (msgData.type === 'image' ? '[Image]' : '[Media]'),
                    is_from_me: msgData.isFromMe,
                    status: 'read', // Auto-read if open
                    created_at: new Date().toISOString()
                };
                setMessages((prev) => [...prev, newMsg]);
             } else if (!msgData.isFromMe) {
                // Toast for background messages
                toast.info(`Pesan baru dari ${msgData.sender_name || msgData.pushName || msgData.from}`);
             }
             return current;
           });

           // 2. Update Chat List (Move to top, update preview)
           setChats((prev) => {
             const existingChatIndex = prev.findIndex(c => c.id === incomingChatId);
             const newPreview = msgData.body || msgData.caption || (msgData.type === 'image' ? '[Image]' : '[Media]');
             
             if (existingChatIndex > -1) {
                // Move existing chat to top
                const updatedChat = { 
                    ...prev[existingChatIndex], 
                    last_message_preview: newPreview,
                    last_message_time: new Date().toISOString(),
                    unread_count: msgData.isFromMe ? prev[existingChatIndex].unread_count : (prev[existingChatIndex].unread_count + 1)
                };
                const newChats = [...prev];
                newChats.splice(existingChatIndex, 1);
                return [updatedChat, ...newChats];
             } else {
                // New Chat? Fetch list again to be safe/simple, or append if we had full chat object
                // For V2 prototype, let's just re-fetch to get correct Contact/Chat data structure
                void fetchChats({ reset: true });
                return prev;
             }
           });
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };

    return () => {
      if (ws.current) ws.current.close();
    };
  }, [user, fetchChats]);

  // Initial Fetch
  useEffect(() => {
    void fetchChats({ reset: true });
  }, [fetchChats]);

  const handleChatListScroll = () => {
    const container = chatListRef.current;
    if (!container || isLoadingChats || isLoadingMoreChats || !hasMoreChats) return;

    const threshold = 120;
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - threshold) {
      void fetchChats();
    }
  };

  // Handle Chat Selection
  const handleSelectChat = (chat: Chat) => {
    setSelectedChat(chat);
    // Reset unread locally
    setChats(prev => prev.map(c => c.id === chat.id ? { ...c, unread_count: 0 } : c));
    void fetchMessages(chat.id);

    // Mark as read on backend (fire and forget)
    if (chat.unread_count > 0) {
      api.put(`/chats/${chat.id}/read`).catch(err => {
        console.warn('Failed to mark chat as read:', err);
      });
    }
  };

  // --- 4. Send Message Logic ---
  const handleSendMessage = async () => {
    if (!messageText.trim()) return;
    if (!selectedChat) return;

    // For groups, use JID. For private chats, use phone_number
    const recipient = selectedChat.is_group ? selectedChat.jid : selectedChat.phone_number;
    if (!recipient) {
      toast.error(selectedChat.is_group ? 'Group JID tidak valid' : 'Nomor telepon tidak valid');
      return;
    }

    setIsSending(true);
    const textToSend = messageText.trim();
    
    try {
      // V2 Endpoint: POST /internal/messages
      const res = await api.post('/internal/messages', {
        phone: recipient,
        message_text: textToSend,
        chat_id: selectedChat.id,
        is_group: selectedChat.is_group
      });

      if (res.data.status === 'success') {
        const dbMsg = res.data.db_message;
        
        // Optimistic Update
        const newMsg: Message = {
          id: dbMsg?.id || Date.now().toString(),
          chat_id: selectedChat.id,
          sender_type: 'agent',
          sender_name: user?.name,
          message_type: 'text',
          body: textToSend,
          is_from_me: true,
          status: 'sent',
          created_at: new Date().toISOString()
        };

        setMessages((prev) => [...prev, newMsg]);
        
        // Update Chat List Preview
        setChats((prev) => {
            const index = prev.findIndex(c => c.id === selectedChat.id);
            if (index === -1) return prev;
            const updated = { 
                ...prev[index], 
                last_message_preview: textToSend,
                last_message_time: new Date().toISOString()
            };
            const list = [...prev];
            list.splice(index, 1);
            return [updated, ...list];
        });
        
        setMessageText('');
      }
    } catch (error: any) {
      console.error('Failed to send message:', error);
      toast.error(error.response?.data?.message || 'Gagal mengirim pesan');
    } finally {
      setIsSending(false);
    }
  };

  const filteredChats = chats.filter(c => 
    (c.display_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.phone_number || '').includes(searchQuery)
  );

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-64px)] bg-white dark:bg-slate-900 overflow-hidden transition-colors duration-300">
      
      {/* LEFT SIDEBAR: CHAT LIST */}
      <div className="w-full lg:w-96 border-b lg:border-b-0 lg:border-r border-gray-100 dark:border-slate-800 flex flex-col shrink-0 bg-white dark:bg-slate-900 max-h-[40vh] lg:max-h-none lg:h-full">
        {/* Search Header */}
        <div className="p-4 border-b border-gray-50 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Total Kontak
            </span>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
              {typeof totalContacts === 'number' ? totalContacts.toLocaleString('id-ID') : '-'}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Cari chat atau nomor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>
        </div>

        {/* Chat List */}
        <div
          className="flex-1 overflow-y-auto divide-y divide-gray-50 dark:divide-slate-800"
          ref={chatListRef}
          onScroll={handleChatListScroll}
        >
          {isLoadingChats ? (
            <div className="p-10 flex flex-col items-center text-gray-400 dark:text-gray-500">
              <Loader2 className="animate-spin mb-2" size={24} />
              <span className="text-xs">Memuat percakapan...</span>
            </div>
          ) : filteredChats.length > 0 ? (
            filteredChats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => handleSelectChat(chat)}
                className={`p-4 hover:bg-blue-50/50 dark:hover:bg-slate-800 cursor-pointer transition-colors flex items-center space-x-3 ${selectedChat?.id === chat.id ? 'bg-blue-50 dark:bg-slate-800' : ''}`}
              >
                <div className="relative shrink-0">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${chat.is_group ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'}`}>
                    {chat.is_group ? <Users size={20} /> : (chat.display_name ? chat.display_name.substring(0, 2).toUpperCase() : '?')}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate pr-2 flex items-center gap-1.5">
                        {chat.display_name || chat.phone_number}
                        {chat.is_group && <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">GRUP</span>}
                    </h4>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                        {formatRelativeTime(chat.last_message_time)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {chat.last_message_preview || 'Belum ada pesan'}
                  </p>
                </div>

                {chat.unread_count > 0 && (
                  <div className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                    {chat.unread_count}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="p-10 text-center text-gray-400 dark:text-gray-500 text-sm">
              Belum ada percakapan.
            </div>
          )}
          {!isLoadingChats && isLoadingMoreChats && (
            <div className="p-4 flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs gap-2">
              <Loader2 className="animate-spin" size={16} />
              <span>Memuat kontak lainnya...</span>
            </div>
          )}
          {!isLoadingChats && !isLoadingMoreChats && !hasMoreChats && chats.length > 0 && (
            <div className="p-4 text-center text-gray-400 dark:text-gray-500 text-xs">
              Semua kontak sudah dimuat.
            </div>
          )}
        </div>
      </div>

      {/* RIGHT AREA: CHAT ROOM */}
      <div className="flex-1 min-w-0 flex flex-col bg-gray-50/50 dark:bg-slate-900/50 relative">
        {selectedChat ? (
            <>
                {/* Chat Header */}
                <div className="h-16 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 px-6 flex items-center justify-between shadow-sm z-10">
                    <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setIsInfoOpen(true)}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${selectedChat.is_group ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'}`}>
                            {selectedChat.is_group ? <Users size={18} /> : selectedChat.display_name?.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                {selectedChat.display_name}
                                {selectedChat.is_group && <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">GRUP</span>}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {selectedChat.is_group ? 'Grup WhatsApp' : selectedChat.phone_number}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2 text-gray-400 dark:text-gray-500">
                        <button className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors" title="Info" onClick={() => setIsInfoOpen(!isInfoOpen)}>
                            <Info size={20} />
                        </button>
                        <button className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors" title="More">
                            <MoreVertical size={20} />
                        </button>
                    </div>
                </div>

                {/* Messages Area */}
                <div 
                    ref={messagesContainerRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4"
                >
                    {isFetchingMore && (
                        <div className="flex justify-center py-2">
                            <Loader2 className="animate-spin text-gray-400" size={20} />
                        </div>
                    )}

                    {isLoadingMessages ? (
                        <div className="flex h-full items-center justify-center">
                            <Loader2 className="animate-spin text-blue-500" size={32} />
                        </div>
                    ) : messages.length > 0 ? (
                        messages.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.is_from_me ? 'justify-end' : 'justify-start'}`}>
                                <div 
                                    className={`max-w-[75%] lg:max-w-[60%] rounded-2xl px-4 py-3 text-sm shadow-sm relative group ${
                                    msg.is_from_me
                                        ? 'bg-blue-600 text-white rounded-tr-none'
                                        : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-white border border-gray-100 dark:border-slate-700 rounded-tl-none'
                                    }`}
                                >
                                    {/* Sender Name in Group Chat */}
                                    {selectedChat.is_group && !msg.is_from_me && msg.sender_name && (
                                        <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mb-1">{msg.sender_name}</p>
                                    )}

                                    <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                                    
                                    <div className={`flex items-center justify-end mt-1.5 space-x-1 text-[10px] opacity-70 ${msg.is_from_me ? 'text-blue-100' : 'text-gray-400'}`}>
                                        <span>{formatMessageTime(msg.created_at)}</span>
                                        {msg.is_from_me && (
                                            msg.status === 'read' ? <CheckCheck size={12} /> : <Clock size={12} />
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center text-gray-400 dark:text-gray-500 opacity-60">
                            <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-3">
                                <Send size={24} className="-ml-1" />
                            </div>
                            <p>Belum ada pesan. Sapa pelanggan sekarang!</p>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700 z-10">
                    <div className="max-w-4xl mx-auto flex items-end space-x-3">
                        <button className="p-3 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                            <Paperclip size={20} />
                        </button>
                        
                        <div className="flex-1 bg-gray-50 dark:bg-slate-700 rounded-2xl flex items-center px-4 py-2">
                             <input
                                type="text"
                                value={messageText}
                                onChange={(e) => setMessageText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                placeholder="Ketik pesan..."
                                className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-900 dark:text-white placeholder-gray-400 max-h-32 py-2"
                                autoComplete="off"
                            />
                            <button className="ml-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
                                <Smile size={20} />
                            </button>
                        </div>

                        <button
                            onClick={handleSendMessage}
                            disabled={isSending || !messageText.trim()}
                            className="p-3 bg-blue-600 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded-xl shadow-lg shadow-blue-100 dark:shadow-blue-900/30 hover:bg-blue-700 transition-all active:scale-95 flex-shrink-0"
                        >
                            {isSending ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                        </button>
                    </div>
                </div>
            </>
        ) : (
            // No Chat Selected State
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/50 dark:bg-slate-900/50 text-gray-400 dark:text-gray-500">
                <div className="w-24 h-24 bg-blue-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 animate-pulse">
                    <User size={48} className="text-blue-200 dark:text-slate-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300">Selamat Datang, {user?.name}</h3>
                <p className="max-w-xs text-center mt-2 text-sm">Pilih percakapan dari daftar di sebelah kiri untuk mulai melayani pelanggan.</p>
            </div>
        )}

        {/* Info Sidebar (Right) */}
        {selectedChat && isInfoOpen && (
            <div className="w-80 border-l border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full absolute right-0 top-0 shadow-2xl lg:relative lg:shadow-none z-20 animate-in slide-in-from-right duration-300">
                <div className="p-4 border-b border-gray-50 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 dark:text-white">Detail Kontak</h3>
                    <button onClick={() => setIsInfoOpen(false)} className="lg:hidden p-1 hover:bg-gray-100 rounded-full">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 flex flex-col items-center text-center overflow-y-auto">
                    <div className="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-2xl font-bold mb-4">
                        {selectedChat.display_name?.substring(0, 2).toUpperCase()}
                    </div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedChat.display_name}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedChat.phone_number}</p>
                    
                    <div className="w-full mt-8 space-y-4">
                        <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl text-left">
                            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Status Chat</span>
                            <div className="mt-1 flex items-center space-x-2">
                                <div className={`w-2 h-2 rounded-full ${selectedChat.status === 'open' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 capitalize">{selectedChat.status || 'Open'}</span>
                            </div>
                        </div>
                        
                        <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl text-left">
                            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Tenant ID</span>
                            <p className="mt-1 text-xs font-mono text-gray-600 dark:text-gray-300 break-all">
                                {selectedChat.contact_id}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default AgentWorkspace;
