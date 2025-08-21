import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';
import { updateCache, invalidateQueries } from '../lib/queryClient';
import { logger } from '../utils/logger';

/**
 * Socket Integration Hook for React Query Cache Updates
 * 
 * This hook listens to socket events from the backend and automatically updates
 * the React Query cache to keep the UI in sync with real-time changes.
 */

export const useTelegramSocketIntegration = () => {
  const queryClient = useQueryClient();
  const session = useSelector((state: RootState) => state.auth.session);
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;

    logger.info('[useTelegramSocketIntegration] Setting up socket listeners for React Query cache updates:', { userId });

    // Handle telegram error events (CONTACT_REMOVED, etc.)
    const handleTelegramError = (event: CustomEvent) => {
      const { type, contactId, userFeedback, timestamp } = event.detail;
      
      logger.info('[useTelegramSocketIntegration] Received telegram error event:', {
        type,
        contactId,
        userFeedback: userFeedback?.title,
        timestamp,
        userId
      });
      
      if (type === 'CONTACT_REMOVED' && contactId) {
        // Remove contact from React Query cache
        updateCache.removeContact(userId, contactId);
        
        logger.info('[useTelegramSocketIntegration] Removed contact from React Query cache:', {
          userId,
          contactId,
          type
        });
      }
    };

    // Handle contact sync completion events
    const handleSyncComplete = (event: CustomEvent) => {
      const { userId: eventUserId, status, contactCount, requestId } = event.detail;
      
      if (eventUserId !== userId) return;
      
      logger.info('[useTelegramSocketIntegration] Received sync complete event:', {
        userId: eventUserId,
        status,
        contactCount,
        requestId
      });
      
      if (status === 'completed') {
        // Invalidate contacts to trigger a fresh fetch
        invalidateQueries.contacts(userId);
        
        // Update sync status cache
        if (requestId) {
          updateCache.syncStatus(userId, requestId, {
            is_syncing: false,
            progress: 100,
            message: 'Sync completed successfully',
            last_updated: Date.now()
          });
        }
        
        logger.info('[useTelegramSocketIntegration] Invalidated contacts cache after sync completion:', {
          userId,
          requestId
        });
      }
    };

    // Handle sync error events
    const handleSyncError = (event: CustomEvent) => {
      const { userId: eventUserId, status, message, requestId } = event.detail;
      
      if (eventUserId !== userId) return;
      
      logger.warn('[useTelegramSocketIntegration] Received sync error event:', {
        userId: eventUserId,
        status,
        message,
        requestId
      });
      
      // Update sync status cache with error
      if (requestId) {
        updateCache.syncStatus(userId, requestId, {
          is_syncing: false,
          progress: 0,
          message: message || 'Sync failed',
          error: message,
          last_updated: Date.now()
        });
      }
    };

    // Handle contact updates (new messages, status changes)
    const handleContactUpdate = (event: CustomEvent) => {
      const { contactId, contact, lastMessage, timestamp: messageTimestamp } = event.detail;
      
      logger.info('[useTelegramSocketIntegration] Received contact update event:', {
        contactId,
        hasContact: !!contact,
        hasLastMessage: !!lastMessage,
        messageTimestamp,
        userId
      });
      
      if (contact) {
        // Update the entire contact object
        updateCache.contact(userId, contact);
      } else if (lastMessage && messageTimestamp) {
        // Update just the last message
        updateCache.contactLastMessage(userId, contactId, lastMessage, messageTimestamp);
      }
      
      logger.info('[useTelegramSocketIntegration] Updated contact in React Query cache:', {
        userId,
        contactId,
        updateType: contact ? 'full_contact' : 'last_message'
      });
    };

    // Handle new contact creation
    const handleNewContact = (event: CustomEvent) => {
      const { contact } = event.detail;
      
      if (!contact) return;
      
      logger.info('[useTelegramSocketIntegration] Received new contact event:', {
        contactId: contact.id,
        displayName: contact.display_name,
        userId
      });
      
      // Add the new contact to cache
      updateCache.contact(userId, contact);
      
      logger.info('[useTelegramSocketIntegration] Added new contact to React Query cache:', {
        userId,
        contactId: contact.id
      });
    };

    // Handle contact auto-deletion events
    const handleContactAutoDeleted = (event: CustomEvent) => {
      const { contactId, platform, message, reason } = event.detail;
      
      if (platform !== 'telegram') return;
      
      logger.info('[useTelegramSocketIntegration] Received contact auto-deleted event:', {
        contactId,
        reason,
        message,
        userId
      });
      
      // Remove contact from React Query cache
      updateCache.removeContact(userId, contactId);
      
      logger.info('[useTelegramSocketIntegration] Removed auto-deleted contact from React Query cache:', {
        userId,
        contactId,
        reason
      });
    };

    // Handle invitation acceptance events
    const handleInvitationAccepted = (event: CustomEvent) => {
      const { contactId, contact, timestamp } = event.detail;
      
      logger.info('[useTelegramSocketIntegration] Received invitation accepted event:', {
        contactId,
        hasContact: !!contact,
        timestamp,
        userId
      });
      
      if (contact) {
        // Update the contact with new membership status
        updateCache.contact(userId, contact);
        
        logger.info('[useTelegramSocketIntegration] Updated accepted contact in React Query cache:', {
          userId,
          contactId,
          membership: contact.membership
        });
      }
    };

    // Handle invitation failed events
    const handleInvitationFailed = (event: CustomEvent) => {
      const { contactId, error, errorType, timestamp } = event.detail;
      
      logger.warn('[useTelegramSocketIntegration] Received invitation failed event:', {
        contactId,
        error,
        errorType,
        timestamp,
        userId
      });
      
      if (errorType === 'CONTACT_REMOVED') {
        // Remove contact from cache if it was removed
        updateCache.removeContact(userId, contactId);
        
        logger.info('[useTelegramSocketIntegration] Removed failed contact from React Query cache:', {
          userId,
          contactId,
          errorType
        });
      }
    };

    // Handle Matrix event processed events (from BullMQ)
    const handleMatrixEventProcessed = (event: CustomEvent) => {
      const { eventType, timestamp, jobId } = event.detail;
      
      logger.debug('[useTelegramSocketIntegration] Received Matrix event processed:', {
        eventType,
        timestamp,
        jobId,
        userId
      });
      
      // For message events, invalidate contacts to refresh last messages
      if (eventType === 'm.room.message') {
        invalidateQueries.contacts(userId);
        
        logger.debug('[useTelegramSocketIntegration] Invalidated contacts after Matrix message event:', {
          userId,
          eventType,
          jobId
        });
      }
    };

    // Handle room joined events (from BullMQ)
    const handleRoomJoined = (event: CustomEvent) => {
      const { roomId, contactId, timestamp, jobId } = event.detail;
      
      logger.info('[useTelegramSocketIntegration] Received room joined event:', {
        roomId,
        contactId,
        timestamp,
        jobId,
        userId
      });
      
      // Invalidate contacts to refresh membership status
      invalidateQueries.contacts(userId);
      
      if (contactId) {
        // Invalidate specific contact
        invalidateQueries.contact(userId, contactId);
      }
      
      logger.info('[useTelegramSocketIntegration] Invalidated caches after room join:', {
        userId,
        roomId,
        contactId
      });
    };

    // Add event listeners
    window.addEventListener('telegram:error', handleTelegramError as EventListener);
    window.addEventListener('telegram:sync_complete', handleSyncComplete as EventListener);
    window.addEventListener('telegram:sync_error', handleSyncError as EventListener);
    window.addEventListener('telegram:contact_update', handleContactUpdate as EventListener);
    window.addEventListener('telegram:new_contact', handleNewContact as EventListener);
    window.addEventListener('contact-auto-deleted', handleContactAutoDeleted as EventListener);
    window.addEventListener('telegram:invitation:accepted', handleInvitationAccepted as EventListener);
    window.addEventListener('telegram:invitation:failed', handleInvitationFailed as EventListener);
    window.addEventListener('telegram:matrix_event_processed', handleMatrixEventProcessed as EventListener);
    window.addEventListener('telegram:room_joined', handleRoomJoined as EventListener);

    // Cleanup function
    return () => {
      logger.info('[useTelegramSocketIntegration] Cleaning up socket listeners for React Query cache updates:', { userId });
      
      window.removeEventListener('telegram:error', handleTelegramError as EventListener);
      window.removeEventListener('telegram:sync_complete', handleSyncComplete as EventListener);
      window.removeEventListener('telegram:sync_error', handleSyncError as EventListener);
      window.removeEventListener('telegram:contact_update', handleContactUpdate as EventListener);
      window.removeEventListener('telegram:new_contact', handleNewContact as EventListener);
      window.removeEventListener('contact-auto-deleted', handleContactAutoDeleted as EventListener);
      window.removeEventListener('telegram:invitation:accepted', handleInvitationAccepted as EventListener);
      window.removeEventListener('telegram:invitation:failed', handleInvitationFailed as EventListener);
      window.removeEventListener('telegram:matrix_event_processed', handleMatrixEventProcessed as EventListener);
      window.removeEventListener('telegram:room_joined', handleRoomJoined as EventListener);
    };
  }, [userId, queryClient]);

  return {
    // Expose manual cache update functions for advanced use cases
    updateContactCache: (contactId: string | number, contact: any) => {
      if (userId) {
        updateCache.contact(userId, contact);
      }
    },
    
    removeContactFromCache: (contactId: string | number) => {
      if (userId) {
        updateCache.removeContact(userId, contactId);
      }
    },
    
    invalidateContactsCache: () => {
      if (userId) {
        invalidateQueries.contacts(userId);
      }
    },
    
    updateLastMessageCache: (contactId: string | number, message: string, timestamp: number) => {
      if (userId) {
        updateCache.contactLastMessage(userId, contactId, message, timestamp);
      }
    },
  };
};
