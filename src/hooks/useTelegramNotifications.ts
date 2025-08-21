import { useState, useEffect, useCallback } from 'react';
import { useInboxNotifications, useMarkInboxNotificationAsRead } from '@liveblocks/react';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store/store';
import api from '@/utils/api';
import logger from '@/utils/logger';

export default function useTelegramNotifications() {
  const { inboxNotifications } = useInboxNotifications();
  const markAsRead = useMarkInboxNotificationAsRead();
  const session = useSelector((state: RootState) => state.auth.session);
  
  // 🎯 NEW: Backend Matrix SDK-based unread counts (source of truth)
  const [matrixUnreadCounts, setMatrixUnreadCounts] = useState<Record<string, number>>({});
  const [matrixNotifications, setMatrixNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  // 🛡️ CIRCUIT BREAKER: Disable polling when backend endpoint is unavailable
  const [apiCircuitOpen, setApiCircuitOpen] = useState(false);
  const [apiFailCount, setApiFailCount] = useState(0);
  
  // 🎯 NEW: Load Matrix-based unread counts from backend
  const loadMatrixUnreadCounts = useCallback(async () => {
    if (!session?.user?.id || loading || apiCircuitOpen) {
      return;
    }

    try {
      setLoading(true);
      logger.info('[useTelegramNotifications] 📊 Loading Matrix unread counts from backend');
      
      const response = await api.get('/api/v1/telegram/unreadCounts');
      
      if (response.data && typeof response.data === 'object') {
        // Support both { unreadCounts } and plain map response shapes
        const counts = (response.data as any).unreadCounts || response.data;
        logger.info('[useTelegramNotifications] ✅ Loaded Matrix unread counts:', {
          counts,
          totalContacts: Object.keys(counts).length
        });
        
        setMatrixUnreadCounts(counts);
      }
    } catch (error: any) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const nextFailCount = apiFailCount + 1;
      setApiFailCount(nextFailCount);
      
      if (status === 404) {
        logger.warn('[useTelegramNotifications] ⚠️ Endpoint not found - likely not deployed to production yet', {
          status,
          statusText,
          error: error.message
        });
        if (!apiCircuitOpen) {
          setApiCircuitOpen(true);
          logger.warn('[useTelegramNotifications] 🛑 Disabling unreadCounts fetch (circuit open) due to 404. Falling back to socket-only updates.');
        }
      } else {
        logger.error('[useTelegramNotifications] ❌ Failed to load Matrix unread counts:', {
          status,
          statusText,
          error: error.message,
          response: error.response?.data
        });
        if (nextFailCount >= 3 && !apiCircuitOpen) {
          setApiCircuitOpen(true);
          logger.warn('[useTelegramNotifications] 🛑 Disabling unreadCounts fetch after repeated failures. Falling back to socket-only updates.');
        }
      }
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, loading, apiCircuitOpen, apiFailCount]);
  
  // 🎯 NEW: Listen for real-time Matrix unread count updates
  useEffect(() => {
    const handleUnreadUpdated = (event: CustomEvent) => {
      const { contactId, unreadCount } = event.detail;
      
      logger.info('[useTelegramNotifications] 📊 Received Matrix unread count update:', {
        contactId,
        unreadCount
      });
      
      setMatrixUnreadCounts(prev => ({
        ...prev,
        [contactId]: unreadCount
      }));
    };
    
    // Listen for telegram unread updates
    window.addEventListener('telegram:unread:updated', handleUnreadUpdated as EventListener);
    
    return () => {
      window.removeEventListener('telegram:unread:updated', handleUnreadUpdated as EventListener);
    };
  }, []);
  
  // 🎯 NEW: Load initial unread counts on mount
  useEffect(() => {
    if (session?.user?.id && !apiCircuitOpen) {
      loadMatrixUnreadCounts();
    }
  }, [session?.user?.id, apiCircuitOpen, loadMatrixUnreadCounts]);
  
  // Filter for Telegram-specific notifications from Liveblocks
  const telegramNotifications = inboxNotifications?.filter(
    (notification) => notification.kind.startsWith('$telegram')
  ) || [];
  
  // Filter for unread notifications from Liveblocks
  const unreadNotifications = telegramNotifications.filter(
    (notification) => !notification.readAt
  );
  
  // 🎯 PRIORITY: Matrix-based counts override Liveblocks for accuracy
  const matrixTotalUnread = Object.values(matrixUnreadCounts).reduce((sum, count) => sum + count, 0);
  const liveblocksUnreadCount = unreadNotifications.length;
  
  // Use Matrix count if available, otherwise fall back to Liveblocks
  const totalUnreadCount = matrixTotalUnread > 0 ? matrixTotalUnread : liveblocksUnreadCount;
  
  // 🎯 NEW: Enhanced mark as read with backend Matrix SDK integration
  const markTelegramAsRead = useCallback(async (notificationId: string, contactId?: string) => {
    try {
      // If contactId is provided, also mark in backend Matrix SDK
      if (contactId && session?.user?.id) {
        logger.info('[useTelegramNotifications] 📝 Marking contact messages as read in Matrix SDK:', contactId);
        
        // This will trigger backend Matrix read receipts and socket events
        await api.post('/api/v1/telegram/markAsRead', {
          contactId,
          messageIds: [] // Empty array means mark all messages as read
        });
      }
    } catch (error: any) {
      logger.error('[useTelegramNotifications] ❌ Failed to mark notification as read:', {
        notificationId,
        contactId,
        error: error.message
      });
    }
  }, [session?.user?.id]);
  
  // 🎯 NEW: Enhanced mark all as read with backend Matrix SDK integration
  const markAllTelegramAsRead = useCallback(async () => {
    try {
      // Mark all contacts as read in backend Matrix SDK
      if (session?.user?.id && Object.keys(matrixUnreadCounts).length > 0) {
        logger.info('[useTelegramNotifications] 📝 Marking all contacts as read in Matrix SDK');
        
        // Mark each contact with unread messages as read
        const markPromises = Object.entries(matrixUnreadCounts)
          .filter(([_, count]) => count > 0)
          .map(([contactId, _]) => 
            api.post('/api/v1/telegram/markAsRead', {
              contactId,
              messageIds: [] // Empty array means mark all messages as read
            })
          );
        
        await Promise.all(markPromises);
      }
    } catch (error: any) {
      logger.error('[useTelegramNotifications] ❌ Failed to mark all notifications as read:', {
        error: error.message
      });
    }
  }, [session?.user?.id, matrixUnreadCounts]);
  
  return {
    // Liveblocks notifications (for UI rendering)
    notifications: telegramNotifications,
    unreadNotifications,
    
    // Matrix SDK-based counts (source of truth for accuracy)
    unreadCount: totalUnreadCount,
    matrixUnreadCounts,
    
    // Enhanced actions with Matrix SDK integration
    markAsRead: markTelegramAsRead,
    markAllAsRead: markAllTelegramAsRead,
    
    // Loading state
    loading,
    
    // Utility functions
    refreshUnreadCounts: loadMatrixUnreadCounts,
  };
}