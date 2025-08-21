import React, { useState, useEffect, useCallback } from 'react';
import { useInboxNotifications } from '@liveblocks/react';
import { Badge } from '@/components/ui/badge';
import api from '@/utils/api';
import logger from '@/utils/logger';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store/store';

interface NotificationBadgeProps {
  className?: string;
  platform?: 'telegram' | 'whatsapp' | 'instagram';
}

const NotificationBadge: React.FC<NotificationBadgeProps> = ({ 
  className = '', 
  platform = 'telegram' 
}) => {
  const { inboxNotifications } = useInboxNotifications();
  const session = useSelector((state: RootState) => state.auth.session);
  
  // 🎯 NEW: Backend Matrix SDK-based unread counts (source of truth)
  const [matrixUnreadCounts, setMatrixUnreadCounts] = useState<Record<string, number>>({});
  const [unreadCountsLoading, setUnreadCountsLoading] = useState(false);
  // 🛡️ CIRCUIT BREAKER: Disable polling when backend endpoint is unavailable
  const [apiCircuitOpen, setApiCircuitOpen] = useState(false);
  const [apiFailCount, setApiFailCount] = useState(0);
  
  // 🎯 RETRY CONTROL: Add delays between failed attempts to reduce spam
  const [lastRetryTime, setLastRetryTime] = useState<number>(0);
  const RETRY_DELAY = 5000; // 5 seconds between retries
  
  // 🎯 NEW: Load Matrix unread counts from backend API with retry delay
  const loadMatrixUnreadCounts = useCallback(async () => {
    if (unreadCountsLoading || !platform || apiCircuitOpen) return;
    
    // 🎯 RETRY CONTROL: Add delay between retries to reduce spam
    const now = Date.now();
    if (lastRetryTime > 0 && (now - lastRetryTime) < RETRY_DELAY) {
      logger.debug('[NotificationBadge] ⏳ Skipping API call - too soon since last attempt', {
        platform,
        timeUntilNextRetry: Math.round((RETRY_DELAY - (now - lastRetryTime)) / 1000)
      });
      return;
    }

    try {
      setUnreadCountsLoading(true);
      setLastRetryTime(now);
      logger.info('[NotificationBadge] 📊 Loading Matrix unread counts for platform:', platform);
      
      const response = await api.get(`/api/v1/${platform}/unreadCounts`);
      
      if (response.data && typeof response.data === 'object') {
        // Support both { unreadCounts } and plain map response shapes
        const counts = (response.data as any).unreadCounts || response.data;
        logger.info('[NotificationBadge] ✅ Loaded Matrix unread counts:', {
          platform,
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
        logger.warn('[NotificationBadge] ⚠️ Endpoint not found - likely not deployed to production yet', {
          platform,
          status,
          statusText,
          error: error.message
        });
        if (!apiCircuitOpen) {
          setApiCircuitOpen(true);
          logger.warn('[NotificationBadge] 🛑 Disabling unreadCounts polling (circuit open) due to 404. Falling back to socket-only updates.');
        }
      } else if (status === 401) {
        logger.warn('[NotificationBadge] 🔐 Authentication failed - checking token validity', {
          platform,
          status,
          statusText,
          error: error.message,
          hasSession: !!session,
          hasToken: !!session?.accessToken
        });
      } else {
        logger.error('[NotificationBadge] ❌ Failed to load Matrix unread counts:', {
          platform,
          status,
          statusText,
          error: error.message,
          response: error.response?.data
        });
        if (nextFailCount >= 3 && !apiCircuitOpen) {
          setApiCircuitOpen(true);
          logger.warn('[NotificationBadge] 🛑 Disabling unreadCounts polling after repeated failures. Falling back to socket-only updates.');
        }
      }
    } finally {
      setUnreadCountsLoading(false);
    }
  }, [session?.user?.id, platform, unreadCountsLoading, lastRetryTime, apiCircuitOpen]);
  
  // 🎯 NEW: Listen for real-time Matrix unread count updates
  useEffect(() => {
    const handleUnreadUpdated = (event: CustomEvent) => {
      const { contactId, unreadCount } = event.detail;
      
      logger.info('[NotificationBadge] 📊 Received Matrix unread count update:', {
        platform,
        contactId,
        unreadCount
      });
      
      setMatrixUnreadCounts(prev => ({
        ...prev,
        [contactId]: unreadCount
      }));
    };
    
    // Listen for platform-specific unread updates
    const eventName = `${platform}:unread:updated`;
    window.addEventListener(eventName, handleUnreadUpdated as EventListener);
    
    // NEW: Handle full sync events to replace the entire map (authoritative)
    const handleUnreadSync = (event: CustomEvent) => {
      const { unreadCounts, totalUnreadCount, source } = event.detail || {};
      if (!unreadCounts || typeof unreadCounts !== 'object') return;

      logger.info('[NotificationBadge] 🔄 Applying unread sync update:', {
        platform,
        totalUnreadCount,
        source,
        contactCount: Object.keys(unreadCounts).length
      });

      setMatrixUnreadCounts(unreadCounts);
    };

    const syncEventName = `${platform}:unread:sync`;
    window.addEventListener(syncEventName, handleUnreadSync as EventListener);

    return () => {
      window.removeEventListener(eventName, handleUnreadUpdated as EventListener);
      window.removeEventListener(syncEventName, handleUnreadSync as EventListener);
    };
  }, [platform]);
  
  // 🎯 NEW: Load initial unread counts on mount
  useEffect(() => {
    if (platform && session?.user?.id && !apiCircuitOpen) {
      loadMatrixUnreadCounts();
    }
  }, [platform, session?.user?.id, apiCircuitOpen, loadMatrixUnreadCounts]);

  // Filter notifications by platform if specified
  const filteredNotifications = inboxNotifications?.filter(notification => {
    if (!platform) return true;
    
    // Check if notification has platform-specific data
    const activityData = (notification as any).activities?.[0]?.data;
    if (activityData?.platform === platform) {
      return true;
    }
    
    // For telegram, also check notification kind
    if (platform === 'telegram') {
      return notification.kind === '$telegramMessage' || 
             notification.kind === '$telegramMention' ||
             notification.kind === '$newContact';
    }
    
    return false;
  }) || [];

  // 🎯 PRIORITY: Matrix-based counts override Liveblocks for accuracy
  const matrixTotalUnread = Object.values(matrixUnreadCounts).reduce((sum, count) => sum + count, 0);
  const liveblocksUnreadCount = filteredNotifications.filter(notification => !notification.readAt).length;
  
  // Use Matrix count if available, otherwise fall back to Liveblocks
  const unreadCount = matrixTotalUnread > 0 ? matrixTotalUnread : liveblocksUnreadCount;

  if (unreadCount === 0) {
    return null;
  }

  return (
    <Badge 
      variant="destructive" 
      className={`absolute -top-2 -right-2 h-5 min-w-[20px] rounded-full px-1.5 text-xs font-bold ${className}`}
      title={`${unreadCount} unread ${platform ? platform : ''} messages`}
    >
      {unreadCount > 99 ? '99+' : unreadCount}
    </Badge>
  );
};

export default NotificationBadge; 
export { NotificationBadge };