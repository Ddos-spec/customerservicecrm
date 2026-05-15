import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Send, Paperclip, Smile, MoreVertical, Search,
  Info, CheckCheck, Clock, User, X, Loader2, Users, Image as ImageIcon, Video, Mic, FileText
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
  if (diffDays < 7) return `${diffDays}d`;
  
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

const formatMessageTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

const formatFullDateTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getDisplayInitials = (value?: string, fallback = '?') => {
  if (!value?.trim()) return fallback;
  const parts = value.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0)).join('').toUpperCase();
};

const isMediaPlaceholder = (body?: string) => {
  if (!body) return false;
  return /^\[[A-Z_]+\]$/i.test(body.trim());
};

const getMessageTypeMeta = (messageType?: string) => {
  switch (messageType) {
    case 'image':
      return { label: 'Gambar', icon: ImageIcon };
    case 'video':
      return { label: 'Video', icon: Video };
    case 'audio':
      return { label: 'Audio', icon: Mic };
    case 'document':
      return { label: 'Dokumen', icon: FileText };
    default:
      return null;
  }
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
  const openChatsCount = chats.filter((chat) => chat.status === 'open').length;
  const unreadChatsCount = chats.filter((chat) => chat.unread_count > 0).length;
  const totalUnreadMessages = chats.reduce((total, chat) => total + (chat.unread_count || 0), 0);

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col overflow-hidden rounded-[32px] border border-gray-200/80 bg-white shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] transition-colors duration-300 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none lg:h-[calc(100dvh-7rem)] lg:flex-row">
      
      {/* LEFT SIDEBAR: CHAT LIST */}
      <div className="w-full shrink-0 border-b border-gray-200/80 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950 lg:h-full lg:w-[25rem] lg:max-h-none lg:border-b-0 lg:border-r xl:w-[26rem] max-h-[42svh]">
        {/* Search Header */}
        <div className="border-b border-gray-100 dark:border-slate-800 bg-white/90 px-5 py-5 dark:bg-slate-950/90">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-600 dark:text-blue-400">
                Workspace
              </p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-gray-900 dark:text-white">
                Inbox Aktif
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Pantau percakapan, balas cepat, dan jaga SLA tim.
              </p>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2 text-right dark:border-blue-900/50 dark:bg-blue-950/30">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-500 dark:text-blue-300">
                Total Kontak
              </p>
              <p className="mt-1 text-lg font-black text-blue-700 dark:text-blue-200">
                {typeof totalContacts === 'number' ? totalContacts.toLocaleString('id-ID') : '-'}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                Open
              </p>
              <p className="mt-1 text-lg font-black text-gray-900 dark:text-white">{openChatsCount}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                Unread
              </p>
              <p className="mt-1 text-lg font-black text-gray-900 dark:text-white">{unreadChatsCount}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                Pesan
              </p>
              <p className="mt-1 text-lg font-black text-gray-900 dark:text-white">{totalUnreadMessages}</p>
            </div>
          </div>

          <div className="relative mt-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Cari nama pelanggan atau nomor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 pl-11 pr-4 py-3 text-sm text-gray-900 placeholder-gray-400 shadow-sm outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-blue-500/50 dark:focus:bg-slate-950"
            />
          </div>
        </div>

        {/* Chat List */}
        <div
          className="flex-1 overflow-y-auto px-3 py-3"
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
                className={`mb-2 cursor-pointer rounded-3xl border px-4 py-4 transition-all duration-200 ${
                  selectedChat?.id === chat.id
                    ? 'border-blue-200 bg-blue-50 shadow-[0_12px_30px_-20px_rgba(37,99,235,0.8)] dark:border-blue-900/50 dark:bg-blue-950/20'
                    : 'border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-slate-800 dark:hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl font-bold text-sm shadow-sm ${chat.is_group ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}`}>
                      {chat.is_group ? <Users size={20} /> : getDisplayInitials(chat.display_name || chat.phone_number)}
                    </div>
                    {chat.status === 'open' && (
                      <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-950" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <h4 className="flex items-center gap-1.5 truncate pr-2 text-sm font-bold text-gray-900 dark:text-white">
                        {chat.display_name || chat.phone_number}
                        {chat.is_group && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">GRUP</span>}
                      </h4>
                      <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                        {formatRelativeTime(chat.last_message_time)}
                      </span>
                    </div>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {chat.last_message_preview || 'Belum ada pesan'}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                        chat.status === 'open'
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-gray-400'
                      }`}>
                        {chat.status === 'open' ? 'Aktif' : 'Selesai'}
                      </span>
                      {!chat.is_group && (
                        <span className="truncate text-[11px] text-gray-400 dark:text-gray-500">
                          {chat.phone_number}
                        </span>
                      )}
                    </div>
                  </div>

                  {chat.unread_count > 0 && (
                    <div className="shrink-0 rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm shadow-blue-500/30">
                      {chat.unread_count}
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-sm text-gray-400 dark:border-slate-800 dark:bg-slate-900 dark:text-gray-500">
              Belum ada percakapan yang cocok.
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
      <div className="relative flex min-w-0 flex-1 flex-col bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_35%),linear-gradient(to_bottom,_rgba(248,250,252,0.9),_rgba(248,250,252,0.98))] dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_30%),linear-gradient(to_bottom,_rgba(2,6,23,0.92),_rgba(2,6,23,1))]">
        {selectedChat ? (
            <>
                {/* Chat Header */}
                <div className="sticky top-0 z-10 border-b border-white/60 bg-white/85 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex cursor-pointer items-center space-x-3" onClick={() => setIsInfoOpen(true)}>
                        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl font-bold text-xs shadow-sm ${selectedChat.is_group ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}`}>
                            {selectedChat.is_group ? <Users size={18} /> : getDisplayInitials(selectedChat.display_name, selectedChat.phone_number?.slice(-2) || '?')}
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                {selectedChat.display_name}
                              </h3>
                              {selectedChat.is_group && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">Grup</span>}
                              <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                                selectedChat.status === 'open'
                                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                                  : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-gray-400'
                              }`}>
                                {selectedChat.status === 'open' ? 'Sedang ditangani' : 'Selesai'}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {selectedChat.is_group ? 'Grup WhatsApp' : selectedChat.phone_number}
                                {selectedChat.last_message_time ? ` • Aktif ${formatRelativeTime(selectedChat.last_message_time)}` : ''}
                            </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 text-gray-400 dark:text-gray-500">
                        <button className="rounded-2xl border border-gray-200 bg-white p-2.5 shadow-sm transition-colors hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800" title="Info" onClick={() => setIsInfoOpen(!isInfoOpen)}>
                            <Info size={20} />
                        </button>
                        <button className="rounded-2xl border border-gray-200 bg-white p-2.5 shadow-sm transition-colors hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800" title="More">
                            <MoreVertical size={20} />
                        </button>
                      </div>
                    </div>
                </div>

                {/* Messages Area */}
                <div 
                    ref={messagesContainerRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6"
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
                            <div key={msg.id} className={`mb-4 flex ${msg.is_from_me ? 'justify-end' : 'justify-start'}`}>
                                <div 
                                    className={`group relative max-w-[82%] rounded-[24px] px-4 py-3 text-sm shadow-sm lg:max-w-[62%] ${
                                    msg.is_from_me
                                        ? 'rounded-tr-md bg-blue-600 text-white shadow-blue-500/15'
                                        : 'rounded-tl-md border border-white/70 bg-white/90 text-gray-800 shadow-[0_18px_35px_-28px_rgba(15,23,42,0.6)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 dark:text-white dark:shadow-none'
                                    }`}
                                >
                                    {/* Sender Name in Group Chat */}
                                    {selectedChat.is_group && !msg.is_from_me && msg.sender_name && (
                                        <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mb-1">{msg.sender_name}</p>
                                    )}

                                    {msg.message_type === 'image' ? (
                                      <div className="space-y-3">
                                        {msg.media_url ? (
                                          <a href={msg.media_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-white/20 bg-white/10">
                                            <img
                                              src={msg.media_url}
                                              alt={msg.body && !isMediaPlaceholder(msg.body) ? msg.body : 'Gambar pelanggan'}
                                              className="max-h-72 w-full object-cover"
                                              loading="lazy"
                                            />
                                          </a>
                                        ) : (
                                          <div className={`flex items-center gap-2 rounded-2xl px-3 py-2 ${msg.is_from_me ? 'bg-blue-500/60 text-blue-50' : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-300'}`}>
                                            <ImageIcon size={16} />
                                            <span>Gambar diterima</span>
                                          </div>
                                        )}
                                        {!isMediaPlaceholder(msg.body) && (
                                          <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                                        )}
                                      </div>
                                    ) : getMessageTypeMeta(msg.message_type) ? (
                                      <div className="space-y-2">
                                        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${msg.is_from_me ? 'bg-blue-500/60 text-blue-50' : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-gray-300'}`}>
                                          {(() => {
                                            const meta = getMessageTypeMeta(msg.message_type);
                                            const Icon = meta!.icon;
                                            return (
                                              <>
                                                <Icon size={14} />
                                                <span>{meta!.label}</span>
                                              </>
                                            );
                                          })()}
                                        </div>
                                        {!isMediaPlaceholder(msg.body) && (
                                          <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                                        )}
                                      </div>
                                    ) : (
                                      <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                                    )}
                                    
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
                        <div className="flex h-full flex-col items-center justify-center rounded-[28px] border border-dashed border-gray-200 bg-white/70 text-gray-400 dark:border-slate-800 dark:bg-slate-900/60 dark:text-gray-500">
                            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-800">
                                <Send size={24} className="-ml-1" />
                            </div>
                            <p className="font-semibold text-gray-600 dark:text-gray-300">Belum ada pesan.</p>
                            <p className="mt-1 text-sm">Sapa pelanggan sekarang untuk mulai percakapan.</p>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="border-t border-white/70 bg-white/85 p-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 z-10">
                    <div className="mx-auto flex max-w-4xl items-end gap-3 rounded-[28px] border border-gray-200 bg-white/90 p-3 shadow-[0_24px_40px_-32px_rgba(15,23,42,0.7)] dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
                        <button className="rounded-2xl p-3 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400">
                            <Paperclip size={20} />
                        </button>
                        
                        <div className="flex-1 rounded-2xl bg-gray-50 px-4 py-2 dark:bg-slate-800">
                             <input
                                type="text"
                                value={messageText}
                                onChange={(e) => setMessageText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                placeholder="Ketik pesan..."
                                className="flex-1 max-h-32 w-full border-none bg-transparent py-2 text-sm text-gray-900 placeholder-gray-400 focus:ring-0 dark:text-white"
                                autoComplete="off"
                            />
                            <div className="mt-1 flex items-center justify-between">
                              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                Balas cepat akan langsung masuk ke percakapan aktif.
                              </p>
                              <button className="ml-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
                                <Smile size={20} />
                              </button>
                            </div>
                        </div>

                        <button
                            onClick={handleSendMessage}
                            disabled={isSending || !messageText.trim()}
                            className="flex-shrink-0 rounded-2xl bg-blue-600 p-3 text-white shadow-lg shadow-blue-100 transition-all active:scale-95 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400 dark:shadow-blue-900/30"
                        >
                            {isSending ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                        </button>
                    </div>
                </div>
            </>
        ) : (
            // No Chat Selected State
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-gray-400 dark:text-gray-500">
                <div className="flex w-full max-w-xl flex-col items-center rounded-[32px] border border-gray-200/80 bg-white/85 px-8 py-12 text-center shadow-[0_24px_80px_-48px_rgba(15,23,42,0.6)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none">
                  <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-blue-50 dark:bg-slate-800 animate-pulse">
                    <User size={48} className="text-blue-200 dark:text-slate-600" />
                  </div>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-600 dark:text-blue-400">
                    Customer Service Hub
                  </p>
                  <h3 className="mt-3 text-2xl font-black tracking-tight text-gray-800 dark:text-gray-100">Selamat Datang, {user?.name}</h3>
                  <p className="mt-3 max-w-md text-sm leading-6">Pilih percakapan dari daftar di sebelah kiri untuk mulai melayani pelanggan. Semua chat, status, dan respons tim akan terpusat di sini.</p>
                </div>
            </div>
        )}

        {/* Info Sidebar (Right) */}
        {selectedChat && isInfoOpen && (
            <div className="absolute right-0 top-0 z-20 flex h-full w-80 flex-col border-l border-gray-200 bg-white/95 shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:relative lg:shadow-none animate-in slide-in-from-right duration-300">
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-slate-800">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600 dark:text-blue-400">Profil Chat</p>
                      <h3 className="mt-1 font-bold text-gray-900 dark:text-white">Detail Kontak</h3>
                    </div>
                    <button onClick={() => setIsInfoOpen(false)} className="rounded-full p-1 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800 lg:hidden">
                        <X size={20} />
                    </button>
                </div>
                <div className="flex flex-1 flex-col overflow-y-auto p-6 text-center">
                    <div className="mb-4 flex h-24 w-24 self-center rounded-[28px] bg-blue-100 text-2xl font-bold text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 items-center justify-center">
                        {getDisplayInitials(selectedChat.display_name, selectedChat.phone_number?.slice(-2) || '?')}
                    </div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedChat.display_name}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedChat.phone_number}</p>
                    
                    <div className="mt-8 w-full space-y-4 text-left">
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Status Chat</span>
                            <div className="mt-2 flex items-center space-x-2">
                                <div className={`w-2 h-2 rounded-full ${selectedChat.status === 'open' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 capitalize">{selectedChat.status || 'Open'}</span>
                            </div>
                        </div>
                        
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Contact ID</span>
                            <p className="mt-1 text-xs font-mono text-gray-600 dark:text-gray-300 break-all">
                                {selectedChat.contact_id}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Tipe Percakapan</span>
                            <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-200">
                              {selectedChat.is_group ? 'Grup WhatsApp' : 'Chat pribadi'}
                            </p>
                        </div>

                        {selectedChat.agent_name && (
                          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Ditangani Oleh</span>
                              <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-200">
                                {selectedChat.agent_name}
                              </p>
                          </div>
                        )}

                        {selectedChat.last_message_time && (
                          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Aktivitas Terakhir</span>
                              <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-200">
                                {formatFullDateTime(selectedChat.last_message_time)}
                              </p>
                          </div>
                        )}
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default AgentWorkspace;
