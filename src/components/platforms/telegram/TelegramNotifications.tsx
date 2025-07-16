import React, { useEffect, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useInboxNotifications } from '@liveblocks/react';
import { updateContactLastMessage } from '@/store/slices/contactSlice';
import type { RootState } from '@/store/store';
import logger from '@/utils/logger';

const TelegramNotifications: React.FC = () => {
  const { inboxNotifications } = useInboxNotifications();
  const session = useSelector((state: RootState) => state.auth.session);
  const dispatch = useDispatch();
  
  // 🚀 PERFORMANCE FIX: Track processed notifications to prevent duplicates
  const processedNotificationIds = useRef(new Set<string>());
  
  // 🚀 PERFORMANCE FIX: Debounce processing to prevent excessive updates
  const processingTimer = useRef<NodeJS.Timeout | null>(null);

  const processNotifications = useCallback(() => {
    if (!inboxNotifications || !session?.user?.id) return;

    // 🚀 PERFORMANCE FIX: Clear processing timer
    if (processingTimer.current) {
      clearTimeout(processingTimer.current);
    }

    // 🚀 PERFORMANCE FIX: Debounce processing
    processingTimer.current = setTimeout(() => {
      const telegramNotifications = inboxNotifications.filter(
        notification => notification.kind === '$telegramMessage' && !notification.readAt
      );

      let hasUpdates = false;

      telegramNotifications.forEach(notification => {
        const notificationId = notification.id;
        
        // 🚀 PERFORMANCE FIX: Skip already processed notifications
        if (processedNotificationIds.current.has(notificationId)) {
          return;
        }
        
        processedNotificationIds.current.add(notificationId);

        if (notification.activities?.[0]?.data) {
          const activityData = notification.activities[0].data;
          const { contact_id, message, timestamp } = activityData;

          if (contact_id && message) {
            logger.info('🔔 Processing Telegram notification for contact list update:', {
              contactId: contact_id,
              message: message.substring(0, 50) + '...',
              timestamp: timestamp
            });

            // Update contact's last message in Redux
            dispatch(updateContactLastMessage({
              contactId: parseInt(String(contact_id)),
              lastMessage: message,
              lastMessageAt: timestamp || Date.now()
            }));

            hasUpdates = true;
          }
        }
      });

      // 🚀 PERFORMANCE FIX: Only dispatch custom event if there were actual updates
      if (hasUpdates) {
        // Single batched event instead of multiple individual events
        window.dispatchEvent(new CustomEvent('telegram-notifications-processed', {
          detail: {
            count: telegramNotifications.length,
            timestamp: Date.now()
          }
        }));
      }
    }, 300); // 300ms debounce delay
  }, [inboxNotifications, session?.user?.id, dispatch]);

  // 🚀 PERFORMANCE FIX: Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (processingTimer.current) {
        clearTimeout(processingTimer.current);
      }
    };
  }, []);

  // Process notifications on mount and when they change
  useEffect(() => {
    processNotifications();
  }, [processNotifications]);

  // 🚀 PERFORMANCE FIX: Cleanup old processed notification IDs periodically
  useEffect(() => {
    const cleanup = setInterval(() => {
      if (processedNotificationIds.current.size > 1000) {
        processedNotificationIds.current.clear();
        logger.info('[TelegramNotifications] Cleared processed notification IDs cache');
      }
    }, 60000); // Clean every minute
    
    return () => clearInterval(cleanup);
  }, []);

  return null; // This component only handles notifications, no UI
};

export default TelegramNotifications; 