import { Fragment, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  Send, Paperclip, Smile, MoreVertical, Search,
  Info, Check, CheckCheck, Clock, User, X, Loader2, Users, Image as ImageIcon, Video, Mic, FileText,
  Wifi, WifiOff, AlertTriangle, Bot
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
  status: 'open' | 'resolved' | 'escalated' | 'closed';
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
  wa_message_id?: string;
  is_from_me: boolean;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  delivery_status?: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
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

const formatChatListTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((today - messageDay) / 86400000);

  if (diffDays === 0) return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Kemarin';
  if (diffDays < 7) return date.toLocaleDateString('id-ID', { weekday: 'short' });
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const formatDateDivider = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((today - messageDay) / 86400000);

  if (diffDays === 0) return 'Hari Ini';
  if (diffDays === 1) return 'Kemarin';
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

const isSameCalendarDay = (left?: string, right?: string) => {
  if (!left || !right) return false;
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return false;
  return leftDate.getFullYear() === rightDate.getFullYear()
    && leftDate.getMonth() === rightDate.getMonth()
    && leftDate.getDate() === rightDate.getDate();
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

const normalizeOutboundStatus = (value?: string): Message['status'] => {
  const normalized = (value || '').toLowerCase();
  if (['queued', 'processing'].includes(normalized)) return 'queued';
  if (normalized === 'sending') return 'sending';
  if (normalized === 'delivered') return 'delivered';
  if (normalized === 'read') return 'read';
  if (normalized === 'failed') return 'failed';
  if (normalized === 'received') return 'received';
  return 'sent';
};

const getReceiptStatus = (receiptType?: string): Message['status'] => {
  const normalized = (receiptType || '').toLowerCase();
  if (normalized.includes('read')) return 'read';
  if (normalized.includes('delivered') || normalized.includes('delivery') || normalized.includes('server')) return 'delivered';
  if (normalized.includes('failed') || normalized.includes('error')) return 'failed';
  return 'sent';
};

const getMessageStatusIcon = (status?: Message['status']) => {
  if (status === 'queued' || status === 'sending') return <Clock size={12} />;
  if (status === 'sent') return <Check size={12} />;
  if (status === 'delivered') return <CheckCheck size={12} />;
  if (status === 'read') return <CheckCheck size={12} className="text-sky-200 dark:text-sky-300" />;
  if (status === 'failed') return <AlertTriangle size={12} className="text-red-200 dark:text-red-300" />;
  return <Clock size={12} />;
};

const tokenRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?62[\d\s().-]{7,20}|08[\d\s().-]{7,20})/gi;

const splitTrailingPunctuation = (token: string) => {
  let core = token;
  let trailing = '';
  while (core.length > 1 && /[.,!?;:)]$/.test(core)) {
    trailing = `${core.slice(-1)}${trailing}`;
    core = core.slice(0, -1);
  }
  return { core, trailing };
};

const normalizePhoneForWhatsApp = (value: string) => {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  if (digits.startsWith('8')) digits = `62${digits}`;
  if (!digits.startsWith('62')) return null;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
};

const renderInteractiveText = (text: string, isFromMe: boolean): ReactNode => {
  if (!text) return null;

  const linkClass = isFromMe
    ? 'font-semibold text-[#9ee9ff] underline decoration-[#9ee9ff]/60 underline-offset-2 hover:text-white'
    : 'font-semibold text-[#53bdeb] underline decoration-[#53bdeb]/50 underline-offset-2 hover:text-[#8fd8ff]';
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  text.replace(tokenRegex, (rawToken, _match, offset: number) => {
    if (offset > lastIndex) {
      nodes.push(text.slice(lastIndex, offset));
    }

    const { core, trailing } = splitTrailingPunctuation(rawToken);
    const lower = core.toLowerCase();

    if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('www.')) {
      const href = lower.startsWith('www.') ? `https://${core}` : core;
      nodes.push(
        <a
          key={`${core}-${offset}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          className={linkClass}
          onClick={(event) => event.stopPropagation()}
        >
          {core}
        </a>
      );
    } else if (core.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(core)) {
      nodes.push(
        <a
          key={`${core}-${offset}`}
          href={`mailto:${core}`}
          className={linkClass}
          onClick={(event) => event.stopPropagation()}
        >
          {core}
        </a>
      );
    } else {
      const phone = normalizePhoneForWhatsApp(core);
      if (phone) {
        nodes.push(
          <a
            key={`${core}-${offset}`}
            href={`https://wa.me/${phone}`}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
            title={`Buka nomor ${phone}`}
            onClick={(event) => event.stopPropagation()}
          >
            {core}
          </a>
        );
      } else {
        nodes.push(core);
      }
    }

    if (trailing) nodes.push(trailing);
    lastIndex = offset + rawToken.length;
    return rawToken;
  });

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
};

const buildWhatsAppNumberHref = (phone?: string) => {
  const normalized = normalizePhoneForWhatsApp(phone || '');
  return normalized ? `https://wa.me/${normalized}` : undefined;
};

const CHAT_PAGE_SIZE = 100;

const AgentWorkspace = () => {
  const { user } = useAuthStore();
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [realtimeState, setRealtimeState] = useState<'connecting' | 'connected' | 'reconnecting' | 'offline'>('connecting');
  const [lastRealtimeAt, setLastRealtimeAt] = useState<number>(Date.now());
  const [lastSessionUpdateAt, setLastSessionUpdateAt] = useState<number>(0);
  const [timeTick, setTimeTick] = useState(Date.now());

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
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatOffsetRef = useRef(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
    });
  }, []);

  // Opened chats must land on latest message. Only preserve position when loading old history.
  useEffect(() => {
    if (!isFetchingMore && !isLoadingMessages) {
      scrollToBottom('auto');
    }
  }, [selectedChat?.id, messages.length, isFetchingMore, isLoadingMessages, scrollToBottom]);

  useEffect(() => {
    const timer = window.setInterval(() => setTimeTick(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

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
        const newMessages = (res.data.data || []).map((message: Message) => ({
          ...message,
          status: normalizeOutboundStatus(message.delivery_status || message.status),
        }));

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
    if (!container || !selectedChat) return;

    // Check if scrolled to top (allow 10px buffer) and if we have more messages to load
    if (container.scrollTop < 10 && hasMoreMessages && !isFetchingMore && !isLoadingMessages && messages.length > 0) {
        const oldestMessageId = messages[0].id;
        fetchMessages(selectedChat!.id, oldestMessageId);
    }
  };

  // --- 3. WebSocket Connection (Real-time) ---
  useEffect(() => {
    let isUnmounted = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_API_URL
      ? new URL(import.meta.env.VITE_API_URL).host
      : window.location.host;
    const wsUrl = `${protocol}//${host}`;

    const connect = () => {
      if (isUnmounted) return;

      if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) {
        return;
      }

      setRealtimeState(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        reconnectAttemptRef.current = 0;
        setRealtimeState('connected');
        setLastRealtimeAt(Date.now());
      };

      ws.current.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          setLastRealtimeAt(Date.now());

          if (payload.type === 'session-update') {
            setLastSessionUpdateAt(Date.now());
          }

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
                      media_url: msgData.mediaUrl || msgData.media_url || msgData.ephemeralMediaUrl,
                      wa_message_id: msgData.id || msgData.wa_message_id,
                      is_from_me: msgData.isFromMe,
                      status: msgData.isFromMe ? normalizeOutboundStatus(msgData.delivery_status || msgData.status) : 'read',
                      delivery_status: normalizeOutboundStatus(msgData.delivery_status || msgData.status),
                      created_at: new Date().toISOString()
                  };
                  setMessages((prev) => {
                    if (newMsg.wa_message_id && prev.some((msg) => msg.wa_message_id === newMsg.wa_message_id)) {
                      return prev;
                    }
                    if (prev.some((msg) => msg.id === newMsg.id)) {
                      return prev;
                    }
                    return [...prev, newMsg];
                  });
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

          if (payload.type === 'receipt') {
            const receiptStatus = getReceiptStatus(payload.data?.receiptType);
            const receiptMessageIds = Array.isArray(payload.data?.messageId)
              ? payload.data.messageId.map((id: unknown) => String(id))
              : [payload.data?.messageId].filter(Boolean).map((id: unknown) => String(id));
            const receiptDbIds = Array.isArray(payload.data?.messages)
              ? payload.data.messages.map((msg: any) => msg.db_id).filter(Boolean)
              : [];

            setMessages((prev) => prev.map((msg) => {
              const matched = receiptDbIds.includes(msg.id)
                || (msg.wa_message_id && receiptMessageIds.includes(msg.wa_message_id));
              if (!matched) return msg;
              return {
                ...msg,
                status: receiptStatus,
                delivery_status: receiptStatus,
              };
            }));
          }

          if (payload.type === 'message-status') {
            const statusData = payload.data;
            const nextStatus = normalizeOutboundStatus(statusData?.delivery_status || statusData?.status);
            setMessages((prev) => prev.map((msg) => {
              const matched = msg.id === statusData?.db_id
                || msg.id === statusData?.id
                || (msg.wa_message_id && msg.wa_message_id === statusData?.wa_message_id);
              if (!matched) return msg;
              return {
                ...msg,
                wa_message_id: statusData?.wa_message_id || msg.wa_message_id,
                status: nextStatus,
                delivery_status: nextStatus,
              };
            }));
          }
        } catch (err) {
          console.error('WebSocket message error:', err);
        }
      };

      ws.current.onerror = () => {
        setRealtimeState('offline');
      };

      ws.current.onclose = () => {
        if (isUnmounted) return;
        reconnectAttemptRef.current += 1;
        setRealtimeState('reconnecting');
        const delay = Math.min(15000, 1000 * Math.pow(1.8, reconnectAttemptRef.current));
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
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

  const [isReopeningAi, setIsReopeningAi] = useState(false);
  const handleReopenToAi = async (chatId: string) => {
    setIsReopeningAi(true);
    try {
      const res = await api.put(`/chats/${chatId}/reopen-ai`);
      const updated = res.data?.data;
      if (updated) {
        setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, status: updated.status } : c)));
        setSelectedChat((prev) => (prev && prev.id === chatId ? { ...prev, status: updated.status } : prev));
        toast.success('Chat dikembalikan ke AI Agent');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal mengembalikan chat ke AI');
    } finally {
      setIsReopeningAi(false);
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

      if (res.data.status === 'success' || res.data.status === 'queued') {
        const dbMsg = res.data.db_message;

        // Optimistic Update
        const newMsg: Message = {
          id: dbMsg?.id || Date.now().toString(),
          chat_id: selectedChat.id,
          sender_type: 'agent',
          sender_name: user?.name,
          message_type: 'text',
          body: textToSend,
          wa_message_id: dbMsg?.wa_message_id || res.data.messageId,
          is_from_me: true,
          status: normalizeOutboundStatus(dbMsg?.delivery_status || dbMsg?.status || 'sent'),
          delivery_status: normalizeOutboundStatus(dbMsg?.delivery_status || dbMsg?.status || 'sent'),
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
        if (res.data.status === 'queued') {
          toast.info('Gateway belum siap. Pesan masuk antrian dan akan dikirim otomatis.');
        }
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
  const isRealtimeStale = realtimeState === 'connected' && timeTick - lastRealtimeAt > 120000;
  const isSessionStale = realtimeState === 'connected'
    && lastSessionUpdateAt > 0
    && timeTick - lastSessionUpdateAt > 5 * 60000;
  const shouldShowRealtimeWarning = realtimeState !== 'connected' || isRealtimeStale || isSessionStale;
  const realtimeLabel = realtimeState === 'connected'
    ? isRealtimeStale || isSessionStale ? 'Realtime perlu dicek' : 'Realtime aktif'
    : realtimeState === 'reconnecting'
      ? 'Menyambung ulang'
      : realtimeState === 'offline'
        ? 'Realtime terputus'
        : 'Menghubungkan realtime';

  return (
    <div className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden border border-[#d1d7db] bg-white text-[#111b21] transition-colors duration-300 dark:border-[#2a3942] dark:bg-[#111b21] dark:text-[#e9edef] lg:flex-row">

      {/* LEFT SIDEBAR: CHAT LIST */}
      <div className="flex max-h-[42svh] w-full min-h-0 shrink-0 flex-col border-b border-[#d1d7db] bg-white dark:border-[#2a3942] dark:bg-[#111b21] lg:h-full lg:w-[28.5rem] lg:max-h-none lg:border-b-0 lg:border-r">
        {/* Search Header */}
        <div className="border-b border-[#e9edef] bg-white px-4 py-4 dark:border-[#2a3942] dark:bg-[#111b21]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[22px] font-semibold tracking-tight text-[#111b21] dark:text-[#e9edef]">Chat</h2>
            <div className="flex items-center gap-1 text-[#54656f] dark:text-[#aebac1]">
              <button className="p-2 transition-colors hover:bg-[#f0f2f5] dark:hover:bg-[#202c33]" title="Status realtime">
                {realtimeState === 'connected' ? <Wifi size={19} /> : <WifiOff size={19} />}
              </button>
              <button className="p-2 transition-colors hover:bg-[#f0f2f5] dark:hover:bg-[#202c33]" title="Menu">
                <MoreVertical size={20} />
              </button>
            </div>
          </div>

          <div className="relative mt-5">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#667781] dark:text-[#8696a0]" size={17} />
            <input
              type="text"
              placeholder="Cari atau mulai obrolan baru"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border-0 bg-[#f0f2f5] py-2.5 pl-11 pr-4 text-sm text-[#111b21] outline-none placeholder:text-[#667781] focus:bg-[#e9edef] dark:bg-[#202c33] dark:text-[#e9edef] dark:placeholder:text-[#8696a0] dark:focus:bg-[#26343d]"
            />
          </div>

          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 text-[13px] font-semibold">
            <span className="shrink-0 rounded-full bg-[#0a5c46] px-4 py-2 text-[#d9fdd3]">Semua</span>
            <span className="shrink-0 rounded-full border border-[#d1d7db] px-4 py-2 text-[#54656f] dark:border-[#2a3942] dark:text-[#aebac1]">Belum dibaca {unreadChatsCount || ''}</span>
            <span className="shrink-0 rounded-full border border-[#d1d7db] px-4 py-2 text-[#54656f] dark:border-[#2a3942] dark:text-[#aebac1]">Grup</span>
            <span className="shrink-0 rounded-full border border-[#d1d7db] px-4 py-2 text-[#54656f] dark:border-[#2a3942] dark:text-[#aebac1]">Open {openChatsCount}</span>
            <span className="shrink-0 rounded-full border border-[#d1d7db] px-4 py-2 text-[#54656f] dark:border-[#2a3942] dark:text-[#aebac1]">Kontak {typeof totalContacts === 'number' ? totalContacts.toLocaleString('id-ID') : '-'}</span>
          </div>
        </div>

        {/* Chat List */}
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          ref={chatListRef}
          onScroll={handleChatListScroll}
        >
          {isLoadingChats ? (
            <div className="flex flex-col items-center p-10 text-[#667781] dark:text-[#8696a0]">
              <Loader2 className="animate-spin mb-2" size={24} />
              <span className="text-xs">Memuat percakapan...</span>
            </div>
          ) : filteredChats.length > 0 ? (
            filteredChats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => handleSelectChat(chat)}
                className={`cursor-pointer border-b border-[#e9edef] px-3 py-3 transition-colors duration-150 dark:border-[#222e35] ${
                  selectedChat?.id === chat.id
                    ? 'bg-[#f0f2f5] dark:bg-[#2a3942]'
                    : 'hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold ${chat.is_group ? 'bg-[#0a5c46] text-[#d9fdd3]' : 'bg-[#dfe5e7] text-[#54656f] dark:bg-[#2a3942] dark:text-[#d1d7db]'}`}>
                      {chat.is_group ? <Users size={20} /> : getDisplayInitials(chat.display_name || chat.phone_number)}
                    </div>
                    {chat.status === 'open' && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#00a884] dark:border-[#111b21]" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <h4 className="flex items-center gap-1.5 truncate pr-2 text-[15px] font-semibold text-[#111b21] dark:text-[#e9edef]">
                        {chat.display_name || chat.phone_number}
                        {chat.is_group && <span className="bg-[#0a5c46] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#d9fdd3]">GRUP</span>}
                        {chat.status === 'escalated' && (
                          <span className="flex items-center gap-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white" title="AI Agent berhenti, butuh agent manusia">
                            <AlertTriangle size={9} /> Perlu Agent
                          </span>
                        )}
                      </h4>
                      <span className="shrink-0 text-xs text-[#667781] dark:text-[#8696a0]">
                        {formatChatListTime(chat.last_message_time)}
                      </span>
                    </div>
                    <p className="truncate text-[13px] text-[#667781] dark:text-[#8696a0]">
                      {chat.last_message_preview || 'Belum ada pesan'}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      {!chat.is_group && (
                        <span className="truncate text-[11px] text-[#667781] dark:text-[#8696a0]">
                          {chat.phone_number}
                        </span>
                      )}
                    </div>
                  </div>

                  {chat.unread_count > 0 && (
                    <div className="shrink-0 rounded-full bg-[#00a884] px-2.5 py-1 text-[10px] font-bold text-[#111b21]">
                      {chat.unread_count}
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-10 text-center text-sm text-[#667781] dark:text-[#8696a0]">
              Belum ada percakapan yang cocok.
            </div>
          )}
          {!isLoadingChats && isLoadingMoreChats && (
            <div className="flex items-center justify-center gap-2 p-4 text-xs text-[#667781] dark:text-[#8696a0]">
              <Loader2 className="animate-spin" size={16} />
              <span>Memuat kontak lainnya...</span>
            </div>
          )}
          {!isLoadingChats && !isLoadingMoreChats && !hasMoreChats && chats.length > 0 && (
            <div className="p-4 text-center text-xs text-[#667781] dark:text-[#8696a0]">
              Semua kontak sudah dimuat.
            </div>
          )}
        </div>
      </div>

      {/* RIGHT AREA: CHAT ROOM */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#efeae2] dark:bg-[#0b141a]">
        {selectedChat ? (
            <div className="flex h-full min-h-0 flex-1 overflow-hidden">
              <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
                {/* Chat Header */}
                <div className="sticky top-0 z-10 shrink-0 border-b border-[#d1d7db] bg-[#f0f2f5] px-4 py-3 dark:border-[#2a3942] dark:bg-[#202c33] sm:px-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex cursor-pointer items-center space-x-3" onClick={() => setIsInfoOpen(true)}>
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ${selectedChat.is_group ? 'bg-[#0a5c46] text-[#d9fdd3]' : 'bg-[#dfe5e7] text-[#54656f]'}`}>
                            {selectedChat.is_group ? <Users size={18} /> : getDisplayInitials(selectedChat.display_name, selectedChat.phone_number?.slice(-2) || '?')}
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="flex items-center gap-2 text-base font-semibold text-[#111b21] dark:text-[#e9edef]">
                                {selectedChat.display_name}
                              </h3>
                            </div>
                            <p className="mt-0.5 text-xs text-[#667781] dark:text-[#8696a0]">
                                {selectedChat.is_group ? 'Grup' : (
                                  buildWhatsAppNumberHref(selectedChat.phone_number) ? (
                                    <a
                                      href={buildWhatsAppNumberHref(selectedChat.phone_number)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="hover:text-[#53bdeb] hover:underline"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      {selectedChat.phone_number}
                                    </a>
                                  ) : selectedChat.phone_number
                                )}
                                {selectedChat.last_message_time ? ` • Aktif ${formatRelativeTime(selectedChat.last_message_time)}` : ''}
                            </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 text-[#54656f] dark:text-[#aebac1]">
                        <button className="p-2 transition-colors hover:bg-[#e9edef] dark:hover:bg-[#2a3942]" title="Cari pesan">
                            <Search size={20} />
                        </button>
                        <button className="p-2 transition-colors hover:bg-[#e9edef] dark:hover:bg-[#2a3942]" title="Info" onClick={() => setIsInfoOpen(!isInfoOpen)}>
                            <Info size={20} />
                        </button>
                        <button className="p-2 transition-colors hover:bg-[#e9edef] dark:hover:bg-[#2a3942]" title="More">
                            <MoreVertical size={20} />
                        </button>
                      </div>
                    </div>
                </div>

                {selectedChat.status === 'escalated' && (
                  <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-[#3b4a54] dark:bg-[#182229] dark:text-[#f8e6a0] sm:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 text-xs font-semibold">
                        <AlertTriangle size={16} />
                        <div className="min-w-0 flex-1">
                          <p className="font-black">AI Agent berhenti di chat ini</p>
                          <p className="mt-0.5 font-medium opacity-80">
                            Sudah dialihkan ke agent manusia — AI tidak akan membalas pesan customer di sini sampai dikembalikan.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleReopenToAi(selectedChat.id)}
                        disabled={isReopeningAi}
                        className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
                      >
                        {isReopeningAi ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />}
                        Kembalikan ke AI
                      </button>
                    </div>
                  </div>
                )}

                {shouldShowRealtimeWarning && (
                  <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-[#3b4a54] dark:bg-[#182229] dark:text-[#f8e6a0] sm:px-5">
                    <div className="flex items-center gap-3 text-xs font-semibold">
                      {realtimeState === 'connected' ? <Wifi size={16} /> : <WifiOff size={16} />}
                      <div className="min-w-0 flex-1">
                        <p className="font-black">{realtimeLabel}</p>
                        <p className="mt-0.5 font-medium opacity-80">
                          {realtimeState === 'connected'
                            ? 'Koneksi hidup, tapi event status sudah lama tidak masuk. Kalau chat terasa telat, refresh halaman atau cek gateway.'
                            : 'UI sedang reconnect otomatis. Pesan yang sudah terkirim tetap diamankan oleh outbound queue.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Messages Area */}
                <div
                    ref={messagesContainerRef}
                    onScroll={handleScroll}
                    className="min-h-0 flex-1 overflow-y-auto bg-[#efeae2] bg-repeat px-6 py-4 dark:bg-[#0b141a] sm:px-8 lg:px-14"
                    style={{
                      backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')",
                    }}
                >
                    {isFetchingMore && (
                        <div className="flex justify-center py-2">
                            <Loader2 className="animate-spin text-[#667781] dark:text-[#8696a0]" size={20} />
                        </div>
                    )}

                    {isLoadingMessages ? (
                        <div className="flex h-full items-center justify-center">
                            <Loader2 className="animate-spin text-[#00a884]" size={32} />
                        </div>
                    ) : messages.length > 0 ? (
                        messages.map((msg, index) => {
                          const showDateDivider = index === 0 || !isSameCalendarDay(messages[index - 1]?.created_at, msg.created_at);

                          return (
                            <Fragment key={msg.id}>
                              {showDateDivider && (
                                <div className="sticky top-2 z-[1] my-3 flex justify-center">
                                  <span className="bg-white px-3 py-1.5 text-xs font-medium text-[#667781] shadow-sm dark:bg-[#182229] dark:text-[#8696a0]">
                                    {formatDateDivider(msg.created_at)}
                                  </span>
                                </div>
                              )}
                              <div className={`mb-1.5 flex ${msg.is_from_me ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`group relative max-w-[84%] px-2.5 py-1.5 text-[14.2px] leading-[19px] shadow-sm lg:max-w-[64%] ${
                                    msg.is_from_me
                                        ? 'rounded-lg rounded-tr-sm bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]'
                                        : 'rounded-lg rounded-tl-sm bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]'
                                    }`}
                                >
                                    {/* Sender Name in Group Chat */}
                                    {selectedChat.is_group && !msg.is_from_me && msg.sender_name && (
                                        <p className="mb-1 text-[11px] font-bold text-[#06cf9c]">{msg.sender_name}</p>
                                    )}

                                    {msg.message_type === 'image' ? (
                                      <div className="space-y-2">
                                        {msg.media_url ? (
                                          <a href={msg.media_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-white/10 bg-black/15">
                                            <img
                                              src={msg.media_url}
                                              alt={msg.body && !isMediaPlaceholder(msg.body) ? msg.body : 'Gambar pelanggan'}
                                              className="max-h-72 w-full object-cover"
                                              loading="lazy"
                                            />
                                          </a>
                                        ) : (
                                          <div className={`flex items-center gap-2 rounded-md px-3 py-2 ${msg.is_from_me ? 'bg-black/5 text-[#54656f] dark:bg-white/10 dark:text-[#d9fdd3]' : 'bg-black/5 text-[#54656f] dark:bg-black/15 dark:text-[#aebac1]'}`}>
                                            <ImageIcon size={16} />
                                            <span>Gambar diterima</span>
                                          </div>
                                        )}
                                        {!isMediaPlaceholder(msg.body) && (
                                          <div className="whitespace-pre-wrap break-words">{renderInteractiveText(msg.body, msg.is_from_me)}</div>
                                        )}
                                      </div>
                                    ) : getMessageTypeMeta(msg.message_type) ? (
                                      <div className="space-y-2">
                                        <a
                                          href={msg.media_url || undefined}
                                          target="_blank"
                                          rel="noreferrer"
                                          className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-[12px] font-semibold ${msg.is_from_me ? 'bg-black/5 text-[#54656f] dark:bg-white/10 dark:text-[#d9fdd3]' : 'bg-black/5 text-[#54656f] dark:bg-black/15 dark:text-[#aebac1]'} ${msg.media_url ? 'hover:underline' : 'pointer-events-none'}`}
                                        >
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
                                        </a>
                                        {!isMediaPlaceholder(msg.body) && (
                                          <div className="whitespace-pre-wrap break-words">{renderInteractiveText(msg.body, msg.is_from_me)}</div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="whitespace-pre-wrap break-words">{renderInteractiveText(msg.body, msg.is_from_me)}</div>
                                    )}

                                    <div className={`float-right ml-2 mt-1 flex items-center justify-end space-x-1 text-[11px] leading-none ${msg.is_from_me ? 'text-[#667781] dark:text-[#b6d6cd]' : 'text-[#667781] dark:text-[#8696a0]'}`}>
                                        <span>{formatMessageTime(msg.created_at)}</span>
                                        {msg.is_from_me && getMessageStatusIcon(msg.delivery_status || msg.status)}
                                    </div>
                                </div>
                              </div>
                            </Fragment>
                          );
                        })
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center text-[#667781] dark:text-[#8696a0]">
                            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white dark:bg-[#202c33]">
                                <Send size={24} className="-ml-1" />
                            </div>
                            <p className="font-semibold text-[#54656f] dark:text-[#d1d7db]">Belum ada pesan.</p>
                            <p className="mt-1 text-sm">Sapa pelanggan sekarang untuk mulai percakapan.</p>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="z-10 shrink-0 border-t border-[#d1d7db] bg-[#f0f2f5] px-3 py-2.5 dark:border-[#2a3942] dark:bg-[#202c33] sm:px-4">
                    <div className="flex w-full items-center gap-2">
                        <button className="p-2.5 text-[#54656f] transition-colors hover:bg-[#e9edef] hover:text-[#111b21] dark:text-[#aebac1] dark:hover:bg-[#2a3942] dark:hover:text-[#e9edef]" title="Lampiran">
                            <Paperclip size={20} />
                        </button>

                        <button className="p-2.5 text-[#54656f] transition-colors hover:bg-[#e9edef] hover:text-[#111b21] dark:text-[#aebac1] dark:hover:bg-[#2a3942] dark:hover:text-[#e9edef]" title="Emoji">
                          <Smile size={20} />
                        </button>

                        <div className="flex min-w-0 flex-1 items-center rounded-lg bg-white px-4 py-2 dark:bg-[#2a3942]">
                             <input
                                type="text"
                                value={messageText}
                                onChange={(e) => setMessageText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                placeholder="Ketik pesan"
                                className="min-w-0 flex-1 border-none bg-transparent py-1.5 text-[15px] text-[#111b21] outline-none placeholder:text-[#667781] focus:ring-0 dark:text-[#e9edef] dark:placeholder:text-[#8696a0]"
                                autoComplete="off"
                            />
                        </div>

                        <button
                            onClick={handleSendMessage}
                            disabled={isSending || !messageText.trim()}
                            className="flex-shrink-0 p-3 text-[#54656f] transition-all hover:bg-[#e9edef] hover:text-[#111b21] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#aebac1] dark:hover:bg-[#2a3942] dark:hover:text-[#e9edef]"
                        >
                            {isSending ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                        </button>
                    </div>
                </div>
              </div>

              {/* Info Sidebar (Right) */}
              {isInfoOpen && (
                  <div className="absolute right-0 top-0 z-20 flex h-full w-80 flex-col border-l border-[#d1d7db] bg-white shadow-2xl animate-in slide-in-from-right duration-300 dark:border-[#2a3942] dark:bg-[#111b21] lg:relative lg:shrink-0 lg:shadow-none">
                      <div className="flex items-center justify-between border-b border-[#e9edef] px-5 py-4 dark:border-[#2a3942]">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#00a884]">Profil Chat</p>
                            <h3 className="mt-1 font-bold text-[#111b21] dark:text-[#e9edef]">Detail Kontak</h3>
                          </div>
                          <button onClick={() => setIsInfoOpen(false)} className="p-1 text-[#54656f] transition-colors hover:bg-[#f0f2f5] dark:text-[#aebac1] dark:hover:bg-[#202c33] lg:hidden">
                              <X size={20} />
                          </button>
                      </div>
                      <div className="flex flex-1 flex-col overflow-y-auto p-6 text-center">
                          <div className="mb-4 flex h-24 w-24 items-center justify-center self-center rounded-full bg-[#dfe5e7] text-2xl font-bold text-[#54656f]">
                              {getDisplayInitials(selectedChat.display_name, selectedChat.phone_number?.slice(-2) || '?')}
                          </div>
                          <h2 className="text-lg font-bold text-[#111b21] dark:text-[#e9edef]">{selectedChat.display_name}</h2>
                          {buildWhatsAppNumberHref(selectedChat.phone_number) ? (
                            <a href={buildWhatsAppNumberHref(selectedChat.phone_number)} target="_blank" rel="noreferrer" className="mt-1 text-sm text-[#53bdeb] hover:underline">
                              {selectedChat.phone_number}
                            </a>
                          ) : (
                            <p className="mt-1 text-sm text-[#667781] dark:text-[#8696a0]">{selectedChat.phone_number}</p>
                          )}

                          <div className="mt-8 w-full space-y-4 text-left">
                              <div className="border border-[#e9edef] bg-[#f0f2f5] p-4 dark:border-[#2a3942] dark:bg-[#202c33]">
                                  <span className="text-[10px] uppercase font-bold text-[#667781] tracking-wider dark:text-[#8696a0]">Status Chat</span>
                                  <div className="mt-2 flex items-center space-x-2">
                                      <div className={`w-2 h-2 rounded-full ${selectedChat.status === 'open' ? 'bg-[#00a884]' : 'bg-[#8696a0]'}`} />
                                      <span className="text-sm font-medium text-[#111b21] capitalize dark:text-[#d1d7db]">{selectedChat.status || 'Open'}</span>
                                  </div>
                              </div>

                              <div className="border border-[#e9edef] bg-[#f0f2f5] p-4 dark:border-[#2a3942] dark:bg-[#202c33]">
                                  <span className="text-[10px] uppercase font-bold text-[#667781] tracking-wider dark:text-[#8696a0]">Contact ID</span>
                                  <p className="mt-1 text-xs font-mono text-[#111b21] break-all dark:text-[#d1d7db]">
                                      {selectedChat.contact_id}
                                  </p>
                              </div>

                              <div className="border border-[#e9edef] bg-[#f0f2f5] p-4 dark:border-[#2a3942] dark:bg-[#202c33]">
                                  <span className="text-[10px] uppercase font-bold text-[#667781] tracking-wider dark:text-[#8696a0]">Tipe Percakapan</span>
                                  <p className="mt-1 text-sm font-medium text-[#111b21] dark:text-[#d1d7db]">
                                    {selectedChat.is_group ? 'Grup' : 'Chat pribadi'}
                                  </p>
                              </div>

                              {selectedChat.agent_name && (
                                <div className="border border-[#e9edef] bg-[#f0f2f5] p-4 dark:border-[#2a3942] dark:bg-[#202c33]">
                                    <span className="text-[10px] uppercase font-bold text-[#667781] tracking-wider dark:text-[#8696a0]">Ditangani Oleh</span>
                                    <p className="mt-1 text-sm font-medium text-[#111b21] dark:text-[#d1d7db]">
                                      {selectedChat.agent_name}
                                    </p>
                                </div>
                              )}

                              {selectedChat.last_message_time && (
                                <div className="border border-[#e9edef] bg-[#f0f2f5] p-4 dark:border-[#2a3942] dark:bg-[#202c33]">
                                    <span className="text-[10px] uppercase font-bold text-[#667781] tracking-wider dark:text-[#8696a0]">Aktivitas Terakhir</span>
                                    <p className="mt-1 text-sm font-medium text-[#111b21] dark:text-[#d1d7db]">
                                      {formatFullDateTime(selectedChat.last_message_time)}
                                    </p>
                                </div>
                              )}
                          </div>
                      </div>
                  </div>
              )}
            </div>
        ) : (
            // No Chat Selected State
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-[#667781] dark:text-[#8696a0]">
                <div className="flex w-full max-w-xl flex-col items-center border-t border-[#d1d7db] bg-white px-8 py-12 text-center dark:border-[#2a3942] dark:bg-[#111b21]">
                  <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-[#f0f2f5] dark:bg-[#202c33]">
                    <User size={48} className="text-[#d1d7db] dark:text-[#3b4a54]" />
                  </div>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#00a884]">
                    Customer Service Hub
                  </p>
                  <h3 className="mt-3 text-2xl font-black tracking-tight text-[#111b21] dark:text-[#e9edef]">Selamat Datang, {user?.name}</h3>
                  <p className="mt-3 max-w-md text-sm leading-6">Pilih percakapan dari daftar di sebelah kiri untuk mulai melayani pelanggan. Semua chat, status, dan respons tim akan terpusat di sini.</p>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default AgentWorkspace;
