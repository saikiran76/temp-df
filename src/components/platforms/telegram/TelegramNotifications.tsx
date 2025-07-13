import React, { useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useInboxNotifications } from '@liveblocks/react';
import { updateContactLastMessage } from '@/store/slices/contactSlice';
import logger from '@/utils/logger';
import type { RootState, AppDispatch } from '@/store/store';

const TelegramNotifications: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { inboxNotifications } = useInboxNotifications();
  const session = useSelector((state: RootState) => state.auth.session);

  // Process Telegram notifications and update contact list
  const processNotifications = useCallback(() => {
    if (!inboxNotifications || !session?.user?.id) return;

    // Filter for Telegram notifications
    const telegramNotifications = inboxNotifications.filter(
      notification => notification.kind === '$telegramMessage' && !notification.readAt
    );

    telegramNotifications.forEach(notification => {
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

          // Dispatch custom event for real-time updates
          window.dispatchEvent(new CustomEvent('telegram-message-update', {
            detail: {
              contactId: contact_id,
              message: message,
              timestamp: timestamp || Date.now()
            }
          }));
        }
      }
    });
  }, [inboxNotifications, session?.user?.id, dispatch]);

  // Process notifications on mount and when they change
  useEffect(() => {
    processNotifications();
  }, [processNotifications]);

  // Listen for real-time Telegram message events from WebSocket
  useEffect(() => {
    const handleTelegramMessage = (event: CustomEvent) => {
      const { contactId, message, timestamp, isOwnMessage } = event.detail;
      
      if (contactId && message) {
        logger.info('📨 Received Telegram message event:', {
          contactId,
          message: message.substring(0, 50) + '...',
          timestamp,
          isOwnMessage
        });

        // Update contact's last message in Redux
        dispatch(updateContactLastMessage({
          contactId: parseInt(String(contactId)),
          lastMessage: message,
          lastMessageAt: timestamp || Date.now()
        }));
      }
    };

    // Listen for both traditional and enhanced message events
    window.addEventListener('telegram-message-received', handleTelegramMessage as EventListener);
    window.addEventListener('telegram-message-update', handleTelegramMessage as EventListener);

    return () => {
      window.removeEventListener('telegram-message-received', handleTelegramMessage as EventListener);
      window.removeEventListener('telegram-message-update', handleTelegramMessage as EventListener);
    };
  }, [dispatch]);

  // This component doesn't render anything - it just processes notifications
  return null;
};

export default TelegramNotifications; 