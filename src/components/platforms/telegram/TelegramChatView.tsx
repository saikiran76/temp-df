import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSocketConnection } from '@/hooks/useSocketConnection';
import {  FiWifiOff, FiX, FiRefreshCw } from 'react-icons/fi';
import api from '@/utils/api';
import { toast } from 'react-hot-toast';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
// import { supabase } from '@/utils/supabase';
import logger from '@/utils/logger';
// import { MessageBatchProcessor } from '@/utils/MessageBatchProcessor';
import { debounce } from 'lodash';
import { ErrorBoundary } from 'react-error-boundary';
import { initializeSocket } from '@/utils/socket';
import LavaLamp from '@/components/ui/Loader/LavaLamp';
import MessageItem from '@/components/platforms/telegram/MessageItem';
import { messageService } from '@/services/messageService';
import {
  fetchMessages,
  sendMessage,
  markMessagesAsRead,
  clearMessagesForContact, // 🚀 NEW: Contact-specific clearing
  setCurrentContact, // 🚀 NEW: Track current contact
  addOptimisticMessage, // 🚀 NEW: Optimistic updates
  confirmOptimisticMessage, // 🚀 NEW: Confirm optimistic updates
  revertOptimisticMessage, // 🚀 NEW: Revert failed optimistic updates
  addToMessageQueue,
  updateMessageStatus,
  selectMessages,
  selectMessageLoading,
  selectMessageError,
  selectHasMoreMessages,
  selectCurrentPage,
  selectMessageQueue,
  selectUnreadMessageIds,
  fetchNewMessages,
  selectNewMessagesFetching,
  selectLastKnownMessageId,
  selectNewMessagesError,
  refreshMessages,
  selectRefreshing,
  selectHasCachedMessages, // 🚀 NEW: Check if messages are cached
  selectCacheFreshness, // 🚀 NEW: Check cache freshness
  selectCachedMessageCount // 🚀 NEW: Get cached message count
} from '@/store/slices/messageSlice';
import { updateContactMembership, updateContactPriority } from '@/store/slices/contactSlice';
import { WiCloudRefresh } from "react-icons/wi";
import { RiAiGenerate } from "react-icons/ri";
import { IoArrowBack } from "react-icons/io5";
import { BotMessageSquare } from "lucide-react";
// import WhatsappChatbot from '@/components/AI/WhatsappChatbot';
import { motion } from 'framer-motion';
import ContactAvatar from './ContactAvatar';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ErrorMessage from '@/components/ui/ErrorMessage';
import { Images } from "lucide-react";
import ChatBackgroundSettings, { getChatBackground } from '@/components/ui/ChatBackgroundSettings';
import { Badge } from "@/components/ui/badge";
import type { RootState, AppDispatch } from '@/store/store';
// import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// import WhatsAppInfoPanel from './WhatsappInfoPanel';
// Import environment variables
const API_URL = import.meta.env.VITE_API_URL;

// 🚀 ENHANCED: Add proper TypeScript interfaces
interface Contact {
  id: string;
  display_name: string;
  membership?: string;
  metadata?: {
    priority?: 'low' | 'medium' | 'high';
  };
}

interface Message {
  id: string;
  message_id?: string;
  content: string;
  sender_id: string;
  timestamp: string;
  status?: string;
  type?: string;
  isOptimistic?: boolean;
}

interface SyncState {
  state: string;
  progress: number;
  details: string;
  processedMessages: number;
  totalMessages: number;
  errors?: Array<{ message: string; timestamp: number }>;
}

const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Connection lost. Retrying...',
  AUTH_ERROR: 'Authentication failed. Please try logging in again.',
  RATE_LIMIT: 'Too many requests. Waiting before retry...',
  VALIDATION_ERROR: 'Invalid data received. Please refresh the page.',
  SYNC_ERROR: 'Error syncing messages. Retrying...',
  UNKNOWN_ERROR: 'An unexpected error occurred. Retrying...'
};

// Update sync states to match database constraints
const SYNC_STATES = {
  IDLE: 'idle',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const SYNC_STATUS_MESSAGES = {
  [SYNC_STATES.PENDING]: 'Waiting for sync approval...',
  [SYNC_STATES.APPROVED]: 'Sync in progress...',
  [SYNC_STATES.REJECTED]: 'Sync request rejected'
};

const INITIAL_SYNC_STATE: SyncState = {
  state: SYNC_STATES.PENDING,
  progress: 0,
  details: SYNC_STATUS_MESSAGES[SYNC_STATES.PENDING],
  processedMessages: 0,
  totalMessages: 0,
  errors: []
};

// Array of fun facts for the loading state
const SOCIAL_MEDIA_FUN_FACTS = [
  "WhatsApp processes over 65 billion messages daily.",
  "The average person spends over 2 hours on social media every day.",
  "Facebook was originally called 'TheFacebook' when it launched in 2004.",
  "Instagram was purchased by Facebook for $1 billion in 2012.",
  "Twitter's (X's infact) original name was 'twttr' - vowels were added later.",
  "The first YouTube video was uploaded on April 23, 2005, titled 'Me at the zoo'.",
  "LinkedIn was founded in 2002, making it one of the oldest social networks.",
  "Over 500 hours of video are uploaded to YouTube every minute.",
  "WhatsApp was acquired by Facebook for $19 billion in 2014.",
  "TikTok reached 1 billion users faster than any other platform.",
  "The average time spent reading a tweet is just 1.5 seconds.",
  "Instagram's most-liked photo was of an egg, with over 55 million likes.",
  "The 'Stories' format was originally created by Snapchat before being adopted by other platforms.",
  "Discord was originally created for gamers but expanded to other communities.",
  "The first hashtag on Twitter was used in 2007."
];

// Spinning logo animation variants
const spinVariants = {
  animate: {
    rotate: 360,
    transition: {
      repeat: Infinity,
      duration: 1.5,
      ease: "linear"
    }
  }
};

// Priority Badge component
const PriorityBadge = ({ priority, onClick }: { priority: string; onClick: () => void }) => {
  if (!priority) return null;
  
  const getVariantAndClass = () => {
    switch (priority) {
      case 'high':
        return { variant: 'destructive', className: 'bg-red-500 text-white rounded' };
      case 'medium':
        return { variant: 'default', className: 'bg-yellow-500 bg-opacity-70 text-black rounded' };
      case 'low':
        return { variant: 'default', className: 'bg-green-600 text-white/80 rounded-lg' };
      default:
        return { variant: 'outline', className: 'bg-gray-400 bg-opacity-70 text-white rounded' };
    }
  };
  
  const { variant, className } = getVariantAndClass();
  const label = priority.charAt(0).toUpperCase() + priority.slice(1);
  
  return (
    <Badge 
      variant={variant as any}
      className={`text-xs font-medium py-0.5 px-2 rounded cursor-pointer ${className} hover:opacity-80`}
      onClick={onClick}
    >
      {label} Priority
    </Badge>
  );
};

const ConnectionStatusIndicator = ({ syncState, loadingState }: { syncState: SyncState; loadingState: string }) => {
  const getStatusColor = () => {
    if (syncState.state === SYNC_STATES.REJECTED) {
        return 'bg-red-500';
    } else if (syncState.state === SYNC_STATES.APPROVED) {
      return 'bg-green-500';
    } else {
        return 'bg-yellow-500';
    }
  };

  // Hide the indicator if loading is complete or sync is complete
  if (loadingState === LOADING_STATES.COMPLETE ||
      (syncState.state === SYNC_STATES.APPROVED && syncState.progress === 100)) {
    return null;
  }

  // Show appropriate connection status message
  const getMessage = () => {
    switch (loadingState) {
      case LOADING_STATES.CONNECTING:
        return 'Connecting...';
      case LOADING_STATES.FETCHING:
        return 'Loading messages...';
      case LOADING_STATES.ERROR:
        return 'Connection failed';
      default:
        return syncState.details || 'Connecting...';
    }
  };

  // Only show message count for actual sync progress, not for connection status
  const shouldShowProgress = syncState.state === SYNC_STATES.APPROVED && 
                           syncState.processedMessages > 0 && 
                           syncState.totalMessages > 0;

  return (
    <div className="absolute top-0 left-0 right-0 z-10">
      <Card className="m-4 bg-[#24283b] border-none shadow-lg">
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between text-sm text-gray-400">
            <span>{getMessage()}</span>
            {shouldShowProgress && (
              <span>{syncState.processedMessages} / {syncState.totalMessages}</span>
            )}
          </div>
          <div className="w-full bg-gray-700 rounded-full overflow-hidden">
            <Progress 
              value={syncState.progress} 
              className="h-2"
            />
          </div>
          {syncState.state === SYNC_STATES.REJECTED && syncState.errors?.length > 0 && (
            <div className="text-xs text-red-400 mt-1">
              Unable to connect. Please check your internet connection.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Socket error specific fallback
const SocketErrorFallback = ({ onRetry }: { onRetry: () => void }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-4 text-center">
      <Card className="max-w-md w-full bg-neutral-800 border-neutral-700">
        <CardHeader>
          <div className="w-16 h-16 mb-4 text-red-500 mx-auto">
            <FiWifiOff className="w-full h-full" />
          </div>
          <CardTitle className="text-xl font-semibold text-white">Socket Connection Failed</CardTitle>
          <CardDescription className="text-gray-400">
            Unable to connect to the chat server
          </CardDescription>
        </CardHeader>
        {/* <CardContent>
          <ErrorMessage message="Socket connection error. This could be due to network issues or server maintenance. Check your internet connection and try again." />
        </CardContent> */}
        <CardFooter className="flex flex-col space-y-2">
          <Button 
            onClick={onRetry} 
            variant="default"
            className="w-full"
          >
            Retry Connection
          </Button>
          <Button 
            onClick={() => window.location.reload()} 
            variant="outline"
            className="w-full"
          >
            Reload Page
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

const ErrorFallback = ({ error }: { error: Error }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-4">
      <Card className="max-w-md w-full bg-neutral-800 border-neutral-700">
        <CardHeader>
          <CardTitle className="text-red-500">Error loading chat</CardTitle>
        </CardHeader>
        <CardContent>
          {/* <ErrorMessage message={error?.message || 'An unexpected error occurred'} /> */}
          <p className="text-sm text-gray-400 mt-4">
            Please try refreshing the page or contact support if the issue persists.
          </p>
        </CardContent>
        <CardFooter>
          <Button 
            onClick={() => window.location.reload()} 
            variant="destructive"
            className="w-full"
          >
            Reload Page
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

// Constants at the top
const CONNECTION_STATUS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  ERROR: 'error'
};

// Add new loading state constant
const LOADING_STATES = {
  IDLE: 'idle',
  INITIAL: 'initial',
  CONNECTING: 'connecting',
  FETCHING: 'fetching',
  COMPLETE: 'complete',
  ERROR: 'error'
};

const LoadingChatView = ({ details }: { details: string }) => {
  // Select a random fun fact
  const randomFact = SOCIAL_MEDIA_FUN_FACTS[Math.floor(Math.random() * SOCIAL_MEDIA_FUN_FACTS.length)];

  // Transform technical details into user-friendly messages
  const getUserFriendlyMessage = (details: string) => {
    if (details.includes('cache') || details.includes('Cache')) {
      return 'Loading your chat...';
    }
    if (details.includes('sync') || details.includes('Sync')) {
      return 'Connecting to chat...';
    }
    if (details.includes('refresh') || details.includes('Refresh')) {
      return 'Updating messages...';
    }
    return details || 'Loading...';
  };

  return (
    <div className="flex flex-col h-full bg-chat">
      {/* Header Skeleton */}
      <div className="flex items-center p-3 bg-header border-b border-border">
        <Skeleton className="w-10 h-10 rounded-full bg-muted" />
        <div className="ml-3 flex-1">
          <Skeleton className="h-4 w-32 bg-muted rounded" />
          <Skeleton className="h-3 w-24 bg-muted rounded mt-1" />
        </div>
      </div>
      {/* Messages Area Skeleton */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto">
        <div className="flex justify-start">
          <Skeleton className="w-2/3 h-12 bg-chat-bubble rounded-lg" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="w-2/3 h-10 bg-chat-bubble-sent rounded-lg" />
        </div>
        <div className="flex justify-start">
          <Skeleton className="w-1/2 h-11 bg-chat-bubble rounded-lg" />
        </div>
      </div>
      {/* Loading Indicator with Fun Fact */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
        <Card className="max-w-md px-6 py-4 bg-neutral-800 border-neutral-700">
          <CardContent className="flex flex-col items-center p-0">
            <LavaLamp className="w-12 h-24 mb-3" />
            <CardTitle className="text-white font-medium text-center mb-1">
              {getUserFriendlyMessage(details)}
            </CardTitle>
            <p className="text-xs text-gray-400 italic text-center mt-2 max-w-[300px]">
              {randomFact}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const ChatView = ({ selectedContact, onContactUpdate, onClose }: { 
  selectedContact: Contact | null; 
  onContactUpdate: (contact: Contact) => void; 
  onClose: () => void; 
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const currentUser = useSelector((state: RootState) => state.auth.session?.user);
  const { socket, isConnected } = useSocketConnection('telegram');
  const isRefreshing = useSelector(selectRefreshing);

  // 🚀 ENHANCED: Redux message selectors with caching support
  const messagesState = useSelector((state: RootState) => state.messages);
  const messages = useSelector((state: RootState) => selectMessages(state, selectedContact?.id) || []);
  const loading = useSelector((state: RootState) => selectMessageLoading(state) || false);
  const error = useSelector((state: RootState) => selectMessageError(state) || null);
  const hasMoreMessages = useSelector((state: RootState) => selectHasMoreMessages(state, selectedContact?.id));
  const currentPage = useSelector((state: RootState) => selectCurrentPage(state) || 0);
  const messageQueue = useSelector((state: RootState) => selectMessageQueue(state) || []);
  const unreadMessageIds = useSelector((state: RootState) => selectUnreadMessageIds(state) || []);
  const isNewMessagesFetching = useSelector(selectNewMessagesFetching);
  const lastKnownMessageId = useSelector((state: RootState) => selectLastKnownMessageId(state, selectedContact?.id));
  const newMessagesError = useSelector(selectNewMessagesError);
  
  // 🚀 NEW: Cache-related selectors
  const hasCachedMessages = useSelector((state: RootState) => selectHasCachedMessages(state, selectedContact?.id));
  const cacheFreshness = useSelector((state: RootState) => selectCacheFreshness(state, selectedContact?.id));
  const cachedMessageCount = useSelector((state: RootState) => selectCachedMessageCount(state, selectedContact?.id));

  // Local state
  const [connectionStatus, setConnectionStatus] = useState(CONNECTION_STATUS.DISCONNECTED);
  const [priorityRetries, setPriorityRetries] = useState(0);
  const [socketState, setSocketState] = useState({
    isConnecting: false,
    retries: 0,
    lastError: null,
  });
  const [socketInitError, setSocketInitError] = useState(false);
  const [previewMedia, setPreviewMedia] = useState(null);
  const [priority, setPriority] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [initializingPriority, setInitializingPriority] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncs, setPendingSyncs] = useState(new Set());
  const [isInitialized, setIsInitialized] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [loadingState, setLoadingState] = useState(LOADING_STATES.IDLE);
  const [syncState, setSyncState] = useState<SyncState>({
    state: SYNC_STATES.IDLE,
    progress: 0,
    details: '',
    processedMessages: 0,
    totalMessages: 0,
    errors: []
  });
  const [showChatbot, setShowChatbot] = useState(false);
  const [showBackgroundSettings, setShowBackgroundSettings] = useState(false);
  const [chatBackground, setChatBackground] = useState<string>("");
  
  // 🚀 NEW: Developer debug overlay state
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);

  // Refs
  const syncAbortController = useRef<AbortController | null>(null);
  const lastSyncRequest = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messageCache = useRef(new Map());
  const isMounted = useRef(true);
  const batchProcessorRef = useRef<any>(null);
  const offlineTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<any>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Constants
  const PAGE_SIZE = 50;
  const MAX_RETRIES = 3;
  const RETRY_COOLDOWN = 5000;

  // Callbacks
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // Helper method to check socket availability and log issues
  const checkSocketAvailability = useCallback(() => {
    if (!socket) {
      logger.warn('[ChatView] Socket not available');
      return false;
    }

    if (!socket.connected) {
      logger.warn('[ChatView] Socket not connected', {
        socketId: socket.id,
        readyState: socket.readyState
      });
      return false;
    }

    return true;
  }, [socket]);

  // 🚀 ENHANCED: Smart message loading with proper user-facing status messages
  const loadMessagesIntelligently = useCallback(async (contactId: string, forceRefresh = false) => {
    if (!contactId) return;

    // 🚀 CRITICAL FIX: Prevent multiple simultaneous loads
    if (loading && !forceRefresh) {
      logger.info('[ChatView] Already loading, skipping duplicate request');
      return;
    }

    logger.info('[ChatView] 🚀 Smart message loading:', {
      contactId,
      hasCachedMessages,
      cacheFreshness,
      cachedMessageCount,
      forceRefresh
    });

    // 🚀 CRITICAL FIX: Only use cache if we have messages AND they are fresh
    if (!forceRefresh && hasCachedMessages && cacheFreshness?.isFresh && messages.length > 0) {
      logger.info('[ChatView] ✅ Using cached messages (fresh):', {
        contactId,
        messageCount: messages.length,
        cacheAge: cacheFreshness.age,
        lastFetched: new Date(cacheFreshness.lastFetched).toLocaleTimeString()
      });
      
      setLoadingState(LOADING_STATES.COMPLETE);
      setSyncState((prev) => ({
        ...prev,
        state: SYNC_STATES.APPROVED,
        progress: 100,
        details: 'Chat ready', // 🚀 FIX: User-friendly message
        processedMessages: messages.length,
        totalMessages: messages.length,
      }));
      return;
    }

    // 🚀 CRITICAL FIX: Always show fetching state when actually loading
    logger.info('[ChatView] 📥 Loading messages from server:', { contactId });
    setLoadingState(LOADING_STATES.FETCHING);
    setSyncState((prev) => ({
      ...prev,
      state: SYNC_STATES.APPROVED,
      progress: 50,
      details: 'Loading messages...', // 🚀 FIX: User-friendly message
      processedMessages: 0,
      totalMessages: 0,
    }));

    try {
      // 🚀 CRITICAL: Don't clear messages anymore - let Redux handle caching
      // dispatch(clearMessages()); // REMOVED - this was the performance killer!
      
      // Set current contact for cache management
      dispatch(setCurrentContact(contactId));

      const result = await dispatch(
        fetchMessages({
          contactId: contactId,
          page: 0,
          limit: PAGE_SIZE,
          platform: 'telegram'
        })
      ).unwrap();

      setLoadingState(LOADING_STATES.COMPLETE);
      setSyncState((prev) => ({
        ...prev,
        state: SYNC_STATES.APPROVED,
        progress: 100,
        details: 'Chat ready', // 🚀 FIX: User-friendly message
        processedMessages: result.messages.length,
        totalMessages: result.messages.length,
      }));

      logger.info('[ChatView] ✅ Messages loaded successfully:', {
        contactId,
        newMessages: result.messages.length,
        fromCache: hasCachedMessages ? 'refreshed' : 'fresh'
      });

    } catch (error: any) {
      logger.error('[ChatView] ❌ Failed to fetch messages:', {
        contactId,
        error: error.message,
      });
      setLoadingState(LOADING_STATES.ERROR);
      setSyncState((prev) => ({
        ...prev,
        state: SYNC_STATES.REJECTED,
        progress: 0,
        details: 'Connection failed', // 🚀 FIX: User-friendly message
        errors: [
          ...(prev.errors || []),
          {
            message: error.message,
            timestamp: Date.now(),
          },
        ],
      }));
      toast.error('Failed to load messages');
    }
  }, [dispatch, loading, messages.length]); // 🚀 CRITICAL FIX: Simplified dependencies

  // 🚀 ENHANCED: Smart message sending with optimistic updates
  const handleSendMessage = useCallback(async (message: { content: string; type?: string }) => {
    if (!selectedContact?.id || !message?.content?.trim()) return;

    const tempId = `optimistic_${Date.now()}`;
    
    try {
      // 🚀 Add optimistic message immediately
      dispatch(addOptimisticMessage({
        contactId: selectedContact.id,
        message: {
          content: message.content,
          sender_id: currentUser?.id,
          type: 'text'
        }
      }));

      logger.info('[ChatView] 📤 Sending message with optimistic update:', {
        contactId: selectedContact.id,
        tempId,
        content: message.content.substring(0, 50)
      });

      const result = await dispatch(sendMessage({ 
        contactId: selectedContact.id, 
        message, 
        platform: 'telegram' 
      })).unwrap();
      
      // 🚀 Confirm optimistic message with server response
      dispatch(confirmOptimisticMessage({
        contactId: selectedContact.id,
        tempId,
        serverMessage: {
          ...message,
          id: result.messageId,
          status: 'sent',
          timestamp: new Date().toISOString()
        }
      }));

      // 🚀 CRITICAL FIX: Dispatch event to update contact list with sent message
      window.dispatchEvent(new CustomEvent('telegram-message-sent', {
        detail: {
          contactId: selectedContact.id,
          message: message.content,
          timestamp: new Date().toISOString()
        }
      }));

      scrollToBottom();
      
      logger.info('[ChatView] ✅ Message sent successfully:', {
        contactId: selectedContact.id,
        messageId: result.messageId
      });

    } catch (error: any) {
      // 🚀 Revert optimistic message on failure
      dispatch(revertOptimisticMessage({
        contactId: selectedContact.id,
        tempId
      }));
      
      logger.error('[ChatView] ❌ Failed to send message:', {
        contactId: selectedContact.id,
        error: error.message
      });
      toast.error('Failed to send message');
    }
  }, [dispatch, selectedContact?.id, currentUser?.id, scrollToBottom]);

  const handleMarkAsRead = useCallback(
    debounce((messageIds: string[]) => {
      if (!selectedContact?.id || messageIds.length === 0 || !isMounted.current) return;
      dispatch(markMessagesAsRead({ contactId: selectedContact.id, messageIds, platform: 'telegram' }));
    }, 1000),
    [dispatch, selectedContact?.id]
  );

  const handleSummaryClick = async () => {
    if (!selectedContact?.id) {
      toast.error('No contact selected for summary');
      return;
    }

    if (messages.length === 0) {
      toast.error('No messages available to summarize');
      return;
    }

    try {
      setIsSummarizing(true);
      logger.info('[ChatView] Fetching summary for contact:', {
        contactId: selectedContact.id,
        messageCount: messages.length,
      });

      const response = await api.get(`/api/analysis/summary/${selectedContact.id}`);

      if (!response.data?.summary) {
        toast.success('summary: ', response?.data);
        return;
      }

      logger.info('[ChatView] Summary received:', {
        contactId: selectedContact.id,
        summary: response.data,
      });

      setSummaryData(response.data);
      setShowSummaryModal(true);
    } catch (error: any) {
      logger.error('[ChatView] Error fetching summary:', {
        error,
        contactId: selectedContact.id,
      });
      toast.error('Failed to generate chat summary. Please try again.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleFetchNewMessages = async () => {
    if (!selectedContact || isNewMessagesFetching) return;

    try {
      const lastMessage = messages[messages.length - 1];
      const lastEventId = lastMessage?.message_id || lastMessage?.id;

      if (!lastEventId) {
        toast.error('No message history available');
        return;
      }

      const validLastEventId = typeof lastEventId === 'string' ? lastEventId : String(lastEventId);

      const result = await dispatch(
        fetchNewMessages({
          contactId: selectedContact.id,
          lastEventId: validLastEventId,
          platform: 'telegram'
        })
      ).unwrap();

      if (result?.messages?.length > 0) {
        scrollToBottom();
        toast.success(`${result.messages.length} new message(s) received`);
      } else {
        toast('No new messages');
      }
    } catch (error: any) {
      logger.error('[ChatView] Error fetching new messages:', error);
      toast.error(error.message || 'Failed to fetch new messages');
    }
  };

  const handleRefresh = async () => {
    if (!selectedContact?.id || isRefreshing) return;

    try {
      await dispatch(refreshMessages({ contactId: selectedContact.id, platform: 'telegram' })).unwrap();
      toast.success('Messages refreshed successfully');
    } catch (error) {
      toast.error('Unable to refresh messages');
    }
  };

  // Effects
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // 🚀 CRITICAL FIX: Only load messages when actually needed (not when cached)
  useEffect(() => {
    if (!selectedContact?.id) return;

    // 🚀 CRITICAL FIX: Check if we already have fresh cached messages
    if (hasCachedMessages && cacheFreshness?.isFresh && messages.length > 0) {
      logger.info('[ChatView] ✅ Using existing cached messages, skipping load:', {
        contactId: selectedContact.id,
        messageCount: messages.length,
        cacheAge: cacheFreshness.age
      });
      
      // Set to complete state immediately since we have cached messages
      setLoadingState(LOADING_STATES.COMPLETE);
      setSyncState((prev) => ({
        ...prev,
        state: SYNC_STATES.APPROVED,
        progress: 100,
        details: 'Chat ready',
        processedMessages: messages.length,
        totalMessages: messages.length,
      }));
      return;
    }

    if (selectedContact?.membership === 'join') {
      setLoadingState(LOADING_STATES.CONNECTING);
      setSyncState((prev) => ({
        ...prev,
        state: SYNC_STATES.PENDING,
        progress: 0,
        details: 'Connecting to chat room...',
        processedMessages: 0,
        totalMessages: 0,
      }));

      logger.info('[ChatView] Setting up room listener for contact:', {
        contactId: selectedContact.id,
        membership: selectedContact.membership,
      });

      api.post(`/api/v1/telegram/contacts/${selectedContact.id}/listen`)
        .then((response) => {
          logger.info('[ChatView] Room listener setup successful:', {
            contactId: selectedContact.id,
            response: response.data,
          });
        })
        .catch((error) => {
          logger.warn('[ChatView] Room listener setup failed, but continuing with message fetch:', {
            contactId: selectedContact.id,
            error: error.message,
          });
          toast('Real-time updates may be delayed but you can use the "new messages" button for new updates');
        })
        .finally(() => {
          // 🚀 CRITICAL ENHANCEMENT: Use smart loading instead of aggressive clearing
          loadMessagesIntelligently(selectedContact.id);
        });
    }
  }, [dispatch, selectedContact?.id, selectedContact?.membership, loadMessagesIntelligently, hasCachedMessages, cacheFreshness, messages.length]);

  useEffect(() => {
    if (!socket || !selectedContact?.id) return;

    const handleContactUpdate = (data: any) => {
      if (data.contactId === selectedContact.id) {
        logger.info('[ChatView] Received contact update:', data);
        onContactUpdate(data.contact);
      }
    };

    const handleMembershipUpdate = (data: any) => {
      if (data.contactId === selectedContact.id) {
        logger.info('[ChatView] Received membership update:', data);
        onContactUpdate({
          ...selectedContact,
          membership: data.membership,
        });
      }
    };

    socket.on('telegram:contact:update', handleContactUpdate);
    socket.on('telegram:membership:update', handleMembershipUpdate);

    return () => {
      socket.off('telegram:contact:update', handleContactUpdate);
      socket.off('telegram:membership:update', handleMembershipUpdate);
    };
  }, [socket, selectedContact?.id, onContactUpdate, selectedContact]);

  useEffect(() => {
    if (!socket || !selectedContact?.id || !currentUser?.id) {
      logger.info('[ChatView] Socket or contact not ready:', {
        hasSocket: !!socket,
        socketId: socket?.id,
        contactId: selectedContact?.id,
        userId: currentUser?.id,
        connected: socket?.connected,
      });
      return;
    }

    logger.info('[ChatView] Setting up socket event handlers:', {
      contactId: selectedContact.id,
      socketConnected: socket.connected,
      socketId: socket.id,
      rooms: socket.rooms,
      namespace: socket.nsp,
    });

    const processedMessageIds = new Set();

    const handleNewMessage = (payload: any, ack?: Function) => {
      // Log message receipt
      logger.info('[ChatView] New message received via socket:', {
        hasAck: !!ack,
        contactId: payload?.contactId,
        messageId: payload?.message?.message_id || payload?.messageId || 'unknown',
        timestamp: payload?.message?.timestamp || payload?.timestamp,
        eventType: payload.message ? 'traditional' : 'enhanced',
        isOwnMessage: payload?.isOwnMessage,
        isOutgoing: payload?.isOutgoing
      });

      // Always acknowledge receipt, even if we don't process the message
      // This is critical for the server's guaranteed delivery system
      if (typeof ack === 'function') {
        try {
          ack({
            success: true,
            received: true,
            timestamp: Date.now()
          });
          logger.debug('[ChatView] Message acknowledged successfully');
        } catch (ackError) {
          logger.error('[ChatView] Error acknowledging message:', ackError);
        }
      }

      // Process the message if it's for the selected contact
      if (payload && payload.contactId === selectedContact?.id) {
        // Handle enhanced event listener format (telegram:message_received)
        if (payload.message && typeof payload.message === 'string') {
          // 🚀 CRITICAL FIX: Enhanced format with proper isOutgoing detection
          // Enhanced format: {contactId, message: string, sender, timestamp, roomId, isOwnMessage, isOutgoing}
          const messageData = {
            id: `received_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            message_id: `received_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            content: payload.message,
            timestamp: payload.timestamp || new Date().toISOString(),
            sender_id: payload.sender || 'unknown',
            sender_name: payload.sender || 'Unknown',
            message_type: 'text',
            // 🔥 CRITICAL FIX: Use isOutgoing flag from Enhanced Event Listener
            is_outgoing: payload.isOutgoing || payload.isOwnMessage || false,
            isOwnMessage: payload.isOwnMessage || payload.isOutgoing || false
          };

          if (!processedMessageIds.has(messageData.id)) {
            processedMessageIds.add(messageData.id);

            logger.info('[ChatView] Processing enhanced message format:', {
              messageId: messageData.id,
              content: messageData.content,
              timestamp: messageData.timestamp,
              isOwnMessage: messageData.isOwnMessage,
              isOutgoing: messageData.is_outgoing,
              messageDirection: messageData.is_outgoing ? 'OUTGOING' : 'INCOMING'
            });

            dispatch({
              type: 'messages/messageReceived',
              payload: {
                contactId: selectedContact.id,
                message: messageData,
              },
            });
            scrollToBottom();
          }
        }
        // Handle traditional format (telegram:message)
        else if (payload.message && typeof payload.message === 'object') {
          // Traditional format: {contactId, message: object}
          const messageData = {
            ...payload.message,
            // 🔥 CRITICAL FIX: Determine outgoing status for traditional format
            is_outgoing: payload.message.is_outgoing || 
                        payload.message.sender_id === currentUser?.id ||
                        false
          };

          if (!processedMessageIds.has(messageData.id || messageData.message_id)) {
            processedMessageIds.add(messageData.id || messageData.message_id);

            logger.info('[ChatView] Processing traditional message format:', {
              messageId: messageData.id || messageData.message_id,
              content: messageData.content,
              isOutgoing: messageData.is_outgoing,
              messageDirection: messageData.is_outgoing ? 'OUTGOING' : 'INCOMING'
            });

            dispatch({
              type: 'messages/messageReceived',
              payload: {
                contactId: selectedContact.id,
                message: messageData,
              },
            });
            scrollToBottom();
          }
        }
      }
    };

    const handleMessageUpdate = (updatedMessage: any) => {
      if (updatedMessage.contactId === selectedContact.id) {
        logger.info('[ChatView] Message updated:', updatedMessage);
        dispatch(
          updateMessageStatus({
            contactId: selectedContact.id,
            messageId: updatedMessage.id,
            status: updatedMessage.status,
          })
        );
      }
    };

    socket.emit('authenticate', { userId: currentUser.id });

    const userRoom = `user:${currentUser.id}`;
    socket.emit('join:room', userRoom);

    // 🚀 CRITICAL FIX: Clean up all event listeners before setting new ones
    socket.off('telegram:message');
    socket.off('telegram:message_received'); // 🚀 NEW: Enhanced event listener events
    socket.off('telegram:message:update');
    socket.off('room:joined');
    socket.off('room:error');

    // 🚀 CRITICAL FIX: Listen for both traditional and enhanced events
    socket.on('telegram:message', handleNewMessage); // Traditional events (if any)
    socket.on('telegram:message_received', handleNewMessage); // 🚀 NEW: Enhanced event listener events
    socket.on('telegram:message:update', handleMessageUpdate);

    return () => {
      socket.off('telegram:message', handleNewMessage);
      socket.off('telegram:message_received', handleNewMessage); // 🚀 NEW: Clean up enhanced events
      socket.off('telegram:message:update', handleMessageUpdate);
    };
  }, [socket, selectedContact?.id, dispatch, currentPage, scrollToBottom, currentUser?.id]);

  useEffect(() => {
    if (!socket) {
      setConnectionStatus(CONNECTION_STATUS.DISCONNECTED);
      setSocketReady(false);

      // Direct initialization when socket from useSocketConnection is not available
      // We need to import initializeSocket directly from socket.js
      // This ensures we can create a socket even when the hook hasn't provided one yet
      const initSocket = async () => {
        try {
          setSocketInitError(false); // Reset error state on attempt
          logger.info('[ChatView] Attempting to initialize socket');
          // Pass the correct platform and options to initializeSocket
          const newSocket = await initializeSocket({
            platform: 'telegram',
            onConnect: () => {
              logger.info('[ChatView] Socket connected via manual initialization');
              setConnectionStatus(CONNECTION_STATUS.CONNECTED);
              setSocketReady(true);
              setSocketInitError(false);
            },
            onDisconnect: () => {
              logger.info('[ChatView] Socket disconnected via manual initialization');
              setConnectionStatus(CONNECTION_STATUS.DISCONNECTED);
              setSocketReady(false);
            },
            onError: (error: any) => {
              logger.error('[ChatView] Socket error via manual initialization:', error);
              setConnectionStatus(CONNECTION_STATUS.ERROR);
              setSocketReady(false);
              setSocketInitError(true);
            }
          });

          if (newSocket) {
            logger.info('[ChatView] Socket initialized successfully');
            // The socket will be available through the useSocketConnection hook on next render
          }
        } catch (error) {
          logger.error('[ChatView] Failed to initialize socket:', error);
          setSocketInitError(true);
          // toast.error('Failed to connect to chat server. Please retry or refresh the page.');
        }
      };

      initSocket();
      return;
    }

    // Reset error state if we have a socket
    setSocketInitError(false);
    setConnectionStatus(socket.connected ? CONNECTION_STATUS.CONNECTED : CONNECTION_STATUS.CONNECTING);
    setSocketReady(socket.connected);

    const handleConnect = () => {
      logger.info('[ChatView] Socket connected');
      setConnectionStatus(CONNECTION_STATUS.CONNECTED);
      setSocketReady(true);

      // When socket connects, join the user room again
      if (currentUser?.id) {
        const userRoom = `user:${currentUser.id}`;
        logger.info(`[ChatView] Joining room ${userRoom}`);
        socket.emit('join:room', userRoom, (response: any) => {
          logger.info(`[ChatView] Room join response:`, response);
        });
      }
    };

    const handleDisconnect = (reason: string) => {
      logger.info('[ChatView] Socket disconnected:', reason);
      setConnectionStatus(CONNECTION_STATUS.DISCONNECTED);
      setSocketReady(false);

      // If the disconnect reason suggests we should reconnect, attempt to do so
      if (reason === 'io server disconnect' || reason === 'transport close') {
        logger.info('[ChatView] Attempting to reconnect socket');
        socket.connect();
      }
    };

    const handleConnecting = () => {
      logger.info('[ChatView] Socket connecting');
      setConnectionStatus(CONNECTION_STATUS.CONNECTING);
      setSocketReady(false);
    };

    const handleError = (error: any) => {
      logger.error('[ChatView] Socket error:', error);
      setSocketReady(false);

      // Sometimes the socket state doesn't update properly on errors,
      // check the actual connection state after a short delay
      setTimeout(() => {
        setConnectionStatus(socket.connected ? CONNECTION_STATUS.CONNECTED : CONNECTION_STATUS.DISCONNECTED);
        setSocketReady(socket.connected);
      }, 1000);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connecting', handleConnecting);
    socket.on('connect_error', handleError);
    socket.on('error', handleError);

    // Perform a health check on mount
    const checkConnection = () => {
      const isConnected = socket.connected;
      logger.info('[ChatView] Socket health check:', {
        connected: isConnected,
        readyState: socket.readyState,
        id: socket.id
      });

      if (!isConnected && connectionStatus === CONNECTION_STATUS.CONNECTED) {
        logger.warn('[ChatView] Socket reports disconnected but state is connected - correcting');
        setConnectionStatus(CONNECTION_STATUS.DISCONNECTED);
        setSocketReady(false);

        // Try to reconnect
        socket.connect();
      }
    };

    checkConnection();

    // Set up periodic health check
    const healthCheckInterval = setInterval(checkConnection, 30000); // 30 seconds

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connecting', handleConnecting);
      socket.off('connect_error', handleError);
      socket.off('error', handleError);
      clearInterval(healthCheckInterval);
    };
  }, [socket, currentUser?.id, connectionStatus]);

  useEffect(() => {
    if (loadingState === LOADING_STATES.FETCHING) {
      setSyncState((prev) => ({
        ...prev,
        state: SYNC_STATES.APPROVED,
        details: 'Getting your messages...',
        progress: 50,
      }));
    } else if (loadingState === LOADING_STATES.COMPLETE && messages.length > 0) {
      setSyncState((prev) => ({
        ...prev,
        state: SYNC_STATES.APPROVED,
        details: 'Messages loaded successfully',
        progress: 100,
        processedMessages: messages.length,
        totalMessages: messages.length,
      }));
    } else if (loadingState === LOADING_STATES.ERROR) {
      setSyncState((prev) => ({
        ...prev,
        state: SYNC_STATES.REJECTED,
        details: error || 'Failed to load messages',
        errors: [
          ...(prev.errors || []),
          { message: error || 'Failed to load messages', timestamp: Date.now() },
        ],
      }));
    }
  }, [loadingState, messages.length, error]);

  useEffect(() => {
    if (selectedContact) {
      setPriority(selectedContact.metadata?.priority || 'medium');
    }
  }, [selectedContact]);

  const handlePriorityChange = (priority: 'low' | 'medium' | 'high') => {
    if (!selectedContact) return;

    setPriority(priority);

    dispatch(updateContactPriority({
      contactId: selectedContact.id,
      priority,
    }));

    if (typeof onContactUpdate === 'function') {
      const updatedContact: Contact = {
        ...selectedContact,
        metadata: {
          ...selectedContact.metadata,
          priority,
        },
      };
      onContactUpdate(updatedContact);
    }
  };

  const renderConnectionStatus = useCallback(() => {
    switch (connectionStatus) {
      case CONNECTION_STATUS.CONNECTED:
        return <span className="text-sm text-green-500">online</span>;
      case CONNECTION_STATUS.DISCONNECTED:
        return <span className="text-sm text-muted-foreground">offline</span>;
      case CONNECTION_STATUS.CONNECTING:
        return <span className="text-sm text-muted-foreground">connecting...</span>;
      default:
        return null;
    }
  }, [connectionStatus]);

  const renderMessages = useCallback(() => {
    // 🚀 CRITICAL FIX: Show loading only when actually loading, not when we have messages
    if ((loadingState === LOADING_STATES.INITIAL || loadingState === LOADING_STATES.CONNECTING) && messages.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <LoadingChatView details={syncState.details} />
        </div>
      );
    }

    if (loadingState === LOADING_STATES.FETCHING && messages.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <LoadingChatView details={syncState.details} />
        </div>
      );
    }

    if (loadingState === LOADING_STATES.ERROR && messages.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="text-center p-4">
            <div className="text-red-500 mb-2">Unable to connect</div>
            <div className="text-sm text-muted-foreground">
              Please check your internet connection and try again
            </div>
          </div>
        </div>
      );
    }

    // 🚀 CRITICAL FIX: Only show "No messages yet" if we're not loading AND have no messages
    if (!messages.length && loadingState === LOADING_STATES.COMPLETE) {
      return <div className="text-muted-foreground text-center p-4">No messages yet</div>;
    }

    // 🚀 CRITICAL FIX: Always render messages if we have them, regardless of loading state
    if (messages.length > 0) {
      return (
        <div className="space-y-2">
          {messages.map((message: Message) => (
            <MessageItem
              key={`${message.id}_${message.message_id}_${message.timestamp}`}
              message={message}
            />
          ))}
        </div>
      );
    }

    // Fallback: show loading if we don't have messages and are in any loading state
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <LoadingChatView details={syncState.details} />
      </div>
    );
  }, [loadingState, messages, currentUser, syncState.details]);

  const renderAvatar = () => {
    return (
      <div className="w-10 h-10 rounded-full flex-shrink-0">
        <ContactAvatar contact={selectedContact} size={40} />
      </div>
    );
  };

  // Retry socket connection
  const retrySocketConnection = useCallback(() => {
    logger.info('[ChatView] Retrying socket connection');
    // Reset the socket init error state
    setSocketInitError(false);
    // Attempt to initialize a new socket connection
    initializeSocket({
      platform: 'telegram',
      onConnect: () => {
        logger.info('[ChatView] Socket connected via retry');
        setConnectionStatus(CONNECTION_STATUS.CONNECTED);
        setSocketReady(true);
        setSocketInitError(false);
      },
      onDisconnect: () => {
        logger.info('[ChatView] Socket disconnected via retry');
        setConnectionStatus(CONNECTION_STATUS.DISCONNECTED);
        setSocketReady(false);
      },
      onError: (error: any) => {
        logger.error('[ChatView] Socket error via retry:', error);
        setConnectionStatus(CONNECTION_STATUS.ERROR);
        setSocketReady(false);
        setSocketInitError(true);
      }
    }).catch(error => {
      logger.error('[ChatView] Retry socket initialization failed:', error);
      setSocketInitError(true);
      toast.error('Connection retry failed. Please try again or refresh the page.');
    });
  }, []);

  // Load the saved background when component mounts
  useEffect(() => {
    const savedBackground = getChatBackground('telegram');
    if (savedBackground) {
      setChatBackground(savedBackground);
    }
  }, []);

  // 🚀 NEW: Toggle debug overlay with Ctrl+Shift+D
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'D') {
        setShowDebugOverlay(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen for background changes from other components
  useEffect(() => {
    const handleBackgroundChange = (event: CustomEvent) => {
      if (event.detail?.platform === 'telegram') {
        setChatBackground(event.detail.backgroundUrl);
      }
    };

    window.addEventListener('chat-background-changed', handleBackgroundChange as EventListener);
    
    return () => {
      window.removeEventListener('chat-background-changed', handleBackgroundChange as EventListener);
    };
  }, []);

  // 🚀 NEW: Debug overlay component
  const DebugOverlay = () => {
    if (!showDebugOverlay) return null;

    return (
      <div className="fixed top-4 right-4 bg-black/90 text-white p-4 rounded-lg text-xs z-50 max-w-sm">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-bold">Debug Info</h3>
          <button 
            onClick={() => setShowDebugOverlay(false)}
            className="text-gray-400 hover:text-white"
          >
            ×
          </button>
        </div>
        <div className="space-y-1">
          <div><strong>Connection:</strong> {connectionStatus}</div>
          <div><strong>Loading State:</strong> {loadingState}</div>
          <div><strong>Socket Ready:</strong> {socketReady ? 'Yes' : 'No'}</div>
          <div><strong>Messages:</strong> {messages.length}</div>
          <div><strong>Has Cache:</strong> {hasCachedMessages ? 'Yes' : 'No'}</div>
          <div><strong>Cache Fresh:</strong> {cacheFreshness?.isFresh ? 'Yes' : 'No'}</div>
          <div><strong>Cache Age:</strong> {cacheFreshness?.age ? `${Math.round(cacheFreshness.age / 1000)}s` : 'N/A'}</div>
          <div><strong>Queue Size:</strong> {messageQueue.length}</div>
          <div><strong>Sync State:</strong> {syncState.state}</div>
          <div><strong>Progress:</strong> {syncState.progress}%</div>
        </div>
        <div className="mt-2 text-xs text-gray-400">
          Press Ctrl+Shift+D to toggle
        </div>
      </div>
    );
  };

  // 🚀 NEW: Global connection status banner
  const ConnectionStatusBanner = () => {
    if (connectionStatus === CONNECTION_STATUS.CONNECTED && messageQueue.length === 0) {
      return null;
    }

    const getBannerContent = () => {
      if (connectionStatus === CONNECTION_STATUS.DISCONNECTED) {
        return {
          message: 'Connecting...',
          color: 'bg-yellow-500',
          icon: '🔄'
        };
      }
      if (connectionStatus === CONNECTION_STATUS.ERROR) {
        return {
          message: 'Connection failed. Retrying...',
          color: 'bg-red-500',
          icon: '⚠️'
        };
      }
      if (messageQueue.length > 0) {
        return {
          message: `${messageQueue.length} message${messageQueue.length > 1 ? 's' : ''} waiting to send`,
          color: 'bg-blue-500',
          icon: '📤'
        };
      }
      return null;
    };

    const bannerContent = getBannerContent();
    if (!bannerContent) return null;

    return (
      <div className={`${bannerContent.color} text-white px-4 py-2 text-sm text-center`}>
        <span className="mr-2">{bannerContent.icon}</span>
        {bannerContent.message}
      </div>
    );
  };

  // Add the rendering of the header with close button
  const renderHeader = () => {
    return (
      <div className="flex items-center p-3 bg-header border-b border-border sticky top-0 z-10">
        <div className="flex items-center flex-1">
          {renderAvatar()}
          <div className="ml-3 text-header-foreground">
            <h2 className="font-medium">{selectedContact?.display_name || 'Unknown'}</h2>
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              {renderConnectionStatus()}
              {/* Priority Badge replacing dropdown */}
              <PriorityBadge 
                priority={priority || selectedContact?.metadata?.priority || 'medium'} 
                onClick={() => {
                  // Cycle through priorities: low -> medium -> high -> low
                  const currentPriority = priority || selectedContact?.metadata?.priority || 'medium';
                  const nextPriority = currentPriority === 'low' ? 'medium' : 
                                      currentPriority === 'medium' ? 'high' : 'low';
                  handlePriorityChange(nextPriority);
                }}
              />
            </div>
          </div>
        </div>
        
        <TooltipProvider>
          <div className="flex items-center space-x-2">
            {connectionStatus !== 'connected' && messageQueue.length > 0 && (
              <div className="text-xs text-white bg-red-500 px-2 py-1 rounded-full">
                {messageQueue.length}
              </div>
            )}
            
            {/* Refresh Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="text-header-foreground hover:bg-accent rounded-full"
                >
                  <FiRefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-popover text-popover-foreground" side="bottom">
                <p>Refresh messages</p>
              </TooltipContent>
            </Tooltip>
            
            {/* Background Settings Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowBackgroundSettings(true)}
                  className="text-header-foreground hover:bg-accent rounded-full"
                >
                  <Images className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-popover text-popover-foreground" side="bottom">
                <p>Change chat background</p>
              </TooltipContent>
            </Tooltip>
            
            {/* AI Chatbot Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowChatbot(!showChatbot)}
                  className="text-header-foreground hover:bg-accent rounded-full"
                >
                  <BotMessageSquare className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-popover text-popover-foreground" side="bottom">
                <p>Summarize chat</p>
              </TooltipContent>
            </Tooltip>
            
            {/* Summary Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSummaryClick}
                  disabled={isSummarizing}
                  className="text-header-foreground hover:bg-accent rounded-full"
                >
                  {isSummarizing ? (
                    <BotMessageSquare className="h-4 w-4 animate-pulse" />
                  ) : (
                    <BotMessageSquare className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-popover text-popover-foreground" side="bottom">
                <p>Summarize chat</p>
              </TooltipContent>
            </Tooltip>
            
            {/* Close Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="text-header-foreground hover:bg-accent rounded-full"
                >
                  <FiX className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-popover text-popover-foreground" side="bottom">
                <p>Close chat</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>
    );
  };

  if (!selectedContact) {
    return (
      // <div className="flex items-center justify-center h-full bg-black/25 rounded-xl">
      //   <p className="text-lg text-[#757575]">Select a contact to start chatting</p>
      // </div>
      <></>
    );
  }

  // Show socket error fallback if we have initialization errors
  if (socketInitError) {
    return <SocketErrorFallback onRetry={retrySocketConnection} />;
  }

  return (
    <div className="chat-view-container telegram-chat-view flex flex-col h-full bg-chat relative overflow-x-hidden rounded-lg w-full">
      {!selectedContact?.id ? (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-chat">
          <p>Select a contact to view the chat</p>
        </div>
      ) : loadingState === LOADING_STATES.CONNECTING || loadingState === LOADING_STATES.FETCHING ? (
        <LoadingChatView details={syncState.details} />
      ) : (
        <div className="relative flex flex-col h-full">
          <ConnectionStatusIndicator syncState={syncState} loadingState={loadingState} />
          <ConnectionStatusBanner />

          {/* Header with contact info and close button */}
          {renderHeader()}

          {/* Messages Container */}
          <div
            ref={messagesContainerRef}
            className="messages-container flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3 w-full"
            style={{
              backgroundImage: chatBackground ? `url('${chatBackground}')` : "url('https://images.unsplash.com/photo-1501975558162-0be7b8ca95ea?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              wordBreak: "break-word",
              overflowWrap: "break-word",
              maxWidth: "100%"
            }}
            onScroll={async (e) => {
              const target = e.target as HTMLDivElement;
              const { scrollTop, scrollHeight, clientHeight } = target;
              if (scrollTop === 0 && hasMoreMessages && !loading) {
                const nextPage = currentPage + 1;
                await dispatch(
                  fetchMessages({
                    contactId: selectedContact.id,
                    page: nextPage,
                    limit: PAGE_SIZE,
                    platform: 'telegram'
                  })
                );
              }
            }}
          >
            {renderMessages()}
            <div ref={messagesEndRef} />
          </div>

          {/* Summary Modal */}
          {showSummaryModal && summaryData && (
            <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-6">
              <div className="bg-popover backdrop-blur-lg bg-opacity-60 border border-border rounded-lg p-6 max-w-2xl w-full mx-4 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-medium text-popover-foreground">Chat <span className="bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">Summary</span></h3>
                  <button
                    onClick={() => setShowSummaryModal(false)}
                    className="text-muted-foreground w-auto rounded-full bg-popover hover:text-foreground"
                  >
                    <FiX className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-foreground font-medium mb-1">Main Points</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1">
                      {summaryData.summary.mainPoints.map((point: string, index: number) => (
                        <li key={index}>{point}</li>
                      ))}
                    </ul>
                  </div>
                  {summaryData.summary.actionItems.length > 0 && (
                    <div>
                      <h4 className="text-foreground font-medium mb-1">Action Items</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1">
                        {summaryData.summary.actionItems.map((item: string, index: number) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {summaryData.summary.keyDecisions.length > 0 && (
                    <div>
                      <h4 className="text-foreground font-medium mb-1">Key Decisions</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1">
                        {summaryData.summary.keyDecisions.map((decision: string, index: number) => (
                          <li key={index}>{decision}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="text-sm text-muted-foreground pt-2 border-t border-border">
                    <p>Analyzed {summaryData.messageCount} messages</p>
                    <p>From: {new Date(summaryData.timespan.start).toLocaleString()}</p>
                    <p>To: {new Date(summaryData.timespan.end).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Chat Background Settings */}
          <ChatBackgroundSettings 
            isOpen={showBackgroundSettings}
            onClose={() => setShowBackgroundSettings(false)}
            platform="telegram"
          />

          {/* Add telegramChatbot component when showChatbot is true */}
          {/* {showChatbot && selectedContact?.id && (
            <div className="border-t border-border">
              <TelegramChatbot contactId={selectedContact.id} />
            </div>
          )} */}
        </div>
      )}

      {/* Add Chatbot component when a contact is selected */}
      {/* {selectedContact?.id && <Chatbot contactId={selectedContact.id} />} */}
      
      {/* 🚀 NEW: Developer Debug Overlay */}
      <DebugOverlay />
    </div>
  );
};


// Wrap ChatView with ErrorBoundary
export const ChatViewWithErrorBoundary = (props: any) => (
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <div className="w-full h-full">
      <ChatView {...props} />
    </div>
  </ErrorBoundary>
);

export default ChatViewWithErrorBoundary;

