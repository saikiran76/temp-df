import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';
import { messageService } from '../../services/messageService';
import { messageCacheService } from '../../services/MessageCacheService'; // 🚀 NEW: Import cache service
import logger from '../../utils/logger';

// 🚀 ENHANCED: Async thunks with integrated caching
export const fetchMessages = createAsyncThunk<
  { messages: any[]; hasMore: boolean; fromCache?: boolean },
  { contactId: string; page?: number; limit?: number; platform?: string }
>(
  'messages/fetchAll',
  async ({ contactId, page = 0, limit = 20, platform = 'whatsapp' }, { rejectWithValue }) => {
    try {
      logger.info(`[Messages] Fetching ${platform} messages for contact:`, contactId);
      
      // 🚀 NEW: Check cache first if it's the first page
      if (page === 0) {
        const cacheResult = await messageCacheService.getMessages(contactId, platform);
        if (cacheResult.isFresh && cacheResult.messages.length > 0) {
          logger.info(`[Messages] Using cached ${platform} messages:`, cacheResult.messages.length);
          return {
            messages: cacheResult.messages,
            hasMore: cacheResult.metadata?.hasMore || false,
            fromCache: true
          };
        }
      }
      
      // Fetch from network
      const result = await messageService.fetchMessages(contactId, { page, limit }, platform);
      logger.info(`[Messages] Fetched ${platform} messages:`, result.messages?.length);
      
      // 🚀 NEW: Cache the results if it's the first page
      if (page === 0 && result.messages.length > 0) {
        await messageCacheService.cacheMessages(
          contactId, 
          platform, 
          result.messages, 
          result.hasMore,
          true // Replace existing cache
        );
      }
      
      return result;
    } catch (error) {
      logger.error(`[Messages] Failed to fetch ${platform} messages:`, error);
      return rejectWithValue((error as Error).message);
    }
  }
);

export const sendMessage = createAsyncThunk<
  { messageId: string },
  { contactId: string; message: { content: string }; platform?: string }
>(
  'messages/send',
  async ({ contactId, message, platform = 'whatsapp' }, { rejectWithValue }) => {
    try {
      logger.info(`[Messages] Sending ${platform} message to contact:`, contactId);
      const result = await messageService.sendMessage(contactId, message, platform);
      logger.info(`[Messages] Sent ${platform} message:`, result.messageId);
      
      // 🚀 NEW: Add sent message to cache
      const sentMessage = {
        ...message,
        id: result.messageId,
        message_id: result.messageId,
        sender_id: 'current_user', // Will be replaced with actual user ID
        timestamp: new Date().toISOString(),
        status: 'sent',
        type: 'text'
      };
      
      await messageCacheService.addMessage(contactId, platform, sentMessage);
      
      return result;
    } catch (error) {
      logger.error(`[Messages] Failed to send ${platform} message:`, error);
      return rejectWithValue((error as Error).message);
    }
  }
);

export const markMessagesAsRead = createAsyncThunk<
  { messageIds: string[] },
  { contactId: string; messageIds: string[]; platform?: string }
>(
  'messages/markAsRead',
  async ({ contactId, messageIds, platform = 'whatsapp' }, { rejectWithValue }) => {
    try {
      await messageService.markAsRead(contactId, messageIds, platform);
      return { messageIds };
    } catch (error) {
      logger.error(`[Messages] Failed to mark ${platform} messages as read:`, error);
      return rejectWithValue((error as Error).message);
    }
  }
);

export const fetchNewMessages = createAsyncThunk<
  { messages: any[] },
  { contactId: string; lastEventId: string; platform?: string }
>(
  'messages/fetchNew',
  async ({ contactId, lastEventId, platform = 'whatsapp' }, { rejectWithValue }) => {
    try {
      logger.info(`[Messages] Fetching new ${platform} messages for contact:`, { contactId, lastEventId });
      const result = await messageService.fetchNewMessages(contactId, lastEventId, platform);
      logger.info(`[Messages] Fetched new ${platform} messages:`, result.messages?.length);
      
      // 🚀 NEW: Add new messages to cache
      if (result.messages.length > 0) {
        for (const message of result.messages) {
          await messageCacheService.addMessage(contactId, platform, message);
        }
      }
      
      return result;
    } catch (error) {
      logger.error(`[Messages] Failed to fetch new ${platform} messages:`, error);
      return rejectWithValue((error as Error).message);
    }
  }
);

export const refreshMessages = createAsyncThunk<
  any,
  { contactId: string; platform?: string }
>(
  'messages/refresh',
  async ({ contactId, platform = 'whatsapp' }, { rejectWithValue }) => {
    try {
      logger.info(`[Messages] Refreshing ${platform} messages for contact:`, contactId);
      const result = await messageService.refreshMessages(contactId, platform);
      logger.info(`[Messages] Refreshed ${platform} messages:`, result.messages?.length);
      
      // 🚀 NEW: Update cache with refreshed messages
      if (result.messages.length > 0) {
        await messageCacheService.cacheMessages(
          contactId, 
          platform, 
          result.messages, 
          true,
          true // Replace existing cache
        );
      }
      
      return { contactId, ...result };
    } catch (error) {
      logger.error(`[Messages] Failed to refresh ${platform} messages:`, error);
      return rejectWithValue((error as Error).message);
    }
  }
);

// 🚀 NEW: Cache management thunks
export const clearCacheForContact = createAsyncThunk<
  { contactId: string; platform: string },
  { contactId: string; platform?: string }
>(
  'messages/clearCache',
  async ({ contactId, platform = 'whatsapp' }) => {
    try {
      await messageCacheService.clearMessagesForContact(contactId, platform);
      logger.info(`[Messages] Cleared cache for contact:`, { contactId, platform });
      return { contactId, platform };
    } catch (error) {
      logger.error(`[Messages] Failed to clear cache:`, error);
      throw error;
    }
  }
);

export const getCacheStats = createAsyncThunk<
  any,
  void
>(
  'messages/getCacheStats',
  async () => {
    try {
      const stats = await messageCacheService.getStats();
      logger.info(`[Messages] Cache stats:`, stats);
      return stats;
    } catch (error) {
      logger.error(`[Messages] Failed to get cache stats:`, error);
      throw error;
    }
  }
);

// 🚀 NEW: Cache management constants
const MAX_CONTACTS_IN_CACHE = 10; // Keep messages for last 10 contacts
const MESSAGE_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Enhanced initial state with caching metadata
const initialState = {
  items: {}, // Object: { contactId: { messages: [], lastFetched: timestamp, hasMore: boolean } }
  loading: false,
  error: null,
  hasMore: true,
  currentPage: 0,
  messageQueue: [],
  unreadMessageIds: [], // Array instead of Set
  lastKnownMessageIds: {}, // Map of contactId to last message ID
  newMessagesFetching: false,
  newMessagesError: null,
  refreshing: false,
  refreshError: null,
  // 🚀 NEW: Cache management
  cacheMetadata: {}, // { contactId: { lastAccessed: timestamp, messageCount: number } }
  optimisticMessages: {}, // { contactId: [optimistic messages] }
  currentContactId: null, // Track currently selected contact
  // 🚀 NEW: Cache statistics
  cacheStats: {
    totalContacts: 0,
    totalMessages: 0,
    cacheSize: 0,
    hitRate: 0,
    lastCleanup: 0
  }
};

const messageSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    // 🚀 ENHANCED: Contact-specific clearing with cache integration
    clearMessagesForContact: (state, action) => {
      const contactId = action.payload;
      if (contactId && state.items[contactId]) {
        delete state.items[contactId];
        delete state.cacheMetadata[contactId];
        delete state.optimisticMessages[contactId];
        logger.info('[Messages] Cleared messages for contact:', contactId);
        
        // 🚀 NEW: Also clear from IndexedDB cache
        messageCacheService.clearMessagesForContact(contactId, 'whatsapp').catch(error => {
          logger.error('[Messages] Failed to clear cache for contact:', error);
        });
      }
    },
    
    // 🚀 NEW: Smart cache cleanup - remove oldest accessed contacts
    cleanupMessageCache: (state) => {
      const contactIds = Object.keys(state.items);
      if (contactIds.length <= MAX_CONTACTS_IN_CACHE) return;
      
      // Sort by last accessed time, remove oldest
      const sortedContacts = contactIds
        .map(id => ({ id, lastAccessed: state.cacheMetadata[id]?.lastAccessed || 0 }))
        .sort((a, b) => a.lastAccessed - b.lastAccessed);
      
      const contactsToRemove = sortedContacts.slice(0, contactIds.length - MAX_CONTACTS_IN_CACHE);
      
      contactsToRemove.forEach(({ id }) => {
        delete state.items[id];
        delete state.cacheMetadata[id];
        delete state.optimisticMessages[id];
        logger.info('[Messages] Removed from cache due to limit:', id);
        
        // 🚀 NEW: Also clear from IndexedDB cache
        messageCacheService.clearMessagesForContact(id, 'whatsapp').catch(error => {
          logger.error('[Messages] Failed to clear cache for contact:', error);
        });
      });
    },
    
    // 🚀 NEW: Set currently selected contact for cache management
    setCurrentContact: (state, action) => {
      const contactId = action.payload;
      state.currentContactId = contactId;
      
      // Update last accessed time
      if (contactId && state.cacheMetadata[contactId]) {
        state.cacheMetadata[contactId].lastAccessed = Date.now();
      }
    },
    
    // 🚀 DEPRECATED: Keep for backward compatibility but make it a no-op
    clearMessages: (state) => {
      logger.warn('[Messages] clearMessages called - this is deprecated. Use clearMessagesForContact instead.');
      // Don't clear anything - this was the main performance killer
    },
    
    removeFromMessageQueue: (state, action) => {
      state.messageQueue = state.messageQueue.filter(msg => msg.id !== action.payload);
    },
    
    updateMessageStatus: (state, action) => {
      const { contactId, messageId, status } = action.payload;
      const contactData = state.items[contactId];
      if (contactData?.messages) {
        const messageIndex = contactData.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex !== -1) {
          contactData.messages[messageIndex].status = status;
        }
      }
    },
    
    // 🚀 ENHANCED: Better message received handling with caching
    messageReceived: (state, action) => {
      const { contactId, message } = action.payload;
      const normalized = messageService.normalizeMessage(message);

      // Initialize contact data if not exists
      if (!state.items[contactId]) {
        state.items[contactId] = {
          messages: [],
          lastFetched: Date.now(),
          hasMore: true
        };
        state.cacheMetadata[contactId] = {
          lastAccessed: Date.now(),
          messageCount: 0
        };
      }

      const contactData = state.items[contactId];
      
      // Check for duplicates based on message_id only
      const exists = contactData.messages.some(existingMsg => {
        return (existingMsg.message_id && normalized.message_id &&
                existingMsg.message_id === normalized.message_id) ||
               (existingMsg.id && normalized.id &&
                existingMsg.id === normalized.id);
      });

      if (!exists) {
        // Add message and maintain chronological order
        contactData.messages = [
          ...contactData.messages,
          normalized
        ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        // Update cache metadata
        state.cacheMetadata[contactId].messageCount = contactData.messages.length;
        state.cacheMetadata[contactId].lastAccessed = Date.now();

        // 🚀 NEW: Also add to IndexedDB cache
        messageCacheService.addMessage(contactId, 'whatsapp', normalized).catch(error => {
          logger.error('[Messages] Failed to add message to cache:', error);
        });

        logger.debug('[Messages] New message added to cache:', {
          contactId,
          id: normalized.id,
          message_id: normalized.message_id,
          content: normalized.content,
          timestamp: normalized.timestamp,
          totalMessages: contactData.messages.length
        });
      } else {
        logger.debug('[Messages] Duplicate message detected:', {
          contactId,
          id: normalized.id,
          message_id: normalized.message_id
        });
      }
    },
    
    // 🚀 NEW: Optimistic message handling
    addOptimisticMessage: (state, action) => {
      const { contactId, message } = action.payload;
      
      if (!state.optimisticMessages[contactId]) {
        state.optimisticMessages[contactId] = [];
      }
      
      const optimisticMessage = {
        ...message,
        id: `optimistic_${uuidv4()}`,
        status: 'sending',
        timestamp: new Date().toISOString(),
        isOptimistic: true
      };
      
      state.optimisticMessages[contactId].push(optimisticMessage);
      logger.info('[Messages] Added optimistic message:', { contactId, messageId: optimisticMessage.id });
    },
    
    // 🚀 NEW: Confirm optimistic message with server response
    confirmOptimisticMessage: (state, action) => {
      const { contactId, tempId, serverMessage } = action.payload;
      
      // Remove from optimistic messages
      if (state.optimisticMessages[contactId]) {
        state.optimisticMessages[contactId] = state.optimisticMessages[contactId]
          .filter(msg => msg.id !== tempId);
      }
      
      // Add to regular messages
      if (serverMessage) {
        messageSlice.caseReducers.messageReceived(state, {
          type: 'messages/messageReceived',
          payload: { contactId, message: serverMessage }
        });
      }
    },
    
    // 🚀 NEW: Revert optimistic message on failure
    revertOptimisticMessage: (state, action) => {
      const { contactId, tempId } = action.payload;
      
      if (state.optimisticMessages[contactId]) {
        const messageIndex = state.optimisticMessages[contactId].findIndex(msg => msg.id === tempId);
        if (messageIndex !== -1) {
          state.optimisticMessages[contactId][messageIndex].status = 'failed';
          logger.warn('[Messages] Reverted optimistic message:', { contactId, tempId });
        }
      }
    },
    
    addToMessageQueue: (state, action) => {
      const newMessage = action.payload;
      const exists = state.messageQueue.some(m =>
        m.content === newMessage.content &&
        m.timestamp === newMessage.timestamp
      );

      if (!exists) {
        state.messageQueue.push({
          ...newMessage,
          tempId: uuidv4()
        });
      }
    },
    
    // 🚀 NEW: Update cache statistics
    updateCacheStats: (state, action) => {
      state.cacheStats = { ...state.cacheStats, ...action.payload };
    },
    
    // CRITICAL FIX: Add reset action for global cleanup
    reset: () => initialState
  },
  extraReducers: (builder) => {
    builder
      // Fetch messages
      .addCase(fetchMessages.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        const { messages, hasMore, fromCache } = action.payload;
        const contactId = action.meta.arg.contactId;
        const page = action.meta.arg.page;

        // Initialize contact data if not exists
        if (!state.items[contactId]) {
          state.items[contactId] = {
            messages: [],
            lastFetched: Date.now(),
            hasMore: true
          };
          state.cacheMetadata[contactId] = {
            lastAccessed: Date.now(),
            messageCount: 0
          };
        }

        const contactData = state.items[contactId];
        
        // Normalize all messages
        const normalized = messages.map(msg => messageService.normalizeMessage(msg));

        // Check for duplicates using message_id only
        const uniqueMessages = normalized.filter(newMsg => {
          return !contactData.messages.some(existingMsg =>
            (existingMsg.message_id && newMsg.message_id &&
             existingMsg.message_id === newMsg.message_id) ||
            (existingMsg.id && newMsg.id &&
             existingMsg.id === newMsg.id)
          );
        });

        // 🚀 ENHANCED: Smart message merging based on page
        if (page === 0) {
          // Fresh load - replace messages
          contactData.messages = uniqueMessages;
        } else {
          // Pagination - prepend older messages
          contactData.messages = [
            ...uniqueMessages,
            ...contactData.messages
          ];
        }
        
        // Sort messages chronologically
        contactData.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        // Update metadata
        contactData.hasMore = hasMore;
        contactData.lastFetched = Date.now();
        state.cacheMetadata[contactId].messageCount = contactData.messages.length;
        state.cacheMetadata[contactId].lastAccessed = Date.now();
        
        state.hasMore = hasMore;
        state.currentPage = page;
        state.loading = false;
        
        logger.info('[Messages] Messages cached successfully:', {
          contactId,
          page,
          newMessages: uniqueMessages.length,
          totalMessages: contactData.messages.length,
          hasMore,
          fromCache: fromCache || false
        });
        
        // Trigger cache cleanup if needed
        messageSlice.caseReducers.cleanupMessageCache(state);
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch messages';
      })
      
      // Send message
      .addCase(sendMessage.fulfilled, (state, action) => {
        const contactId = action.meta.arg.contactId;
        const messageContent = action.meta.arg.message;
        
        // Initialize contact data if not exists
        if (!state.items[contactId]) {
          state.items[contactId] = {
            messages: [],
            lastFetched: Date.now(),
            hasMore: true
          };
          state.cacheMetadata[contactId] = {
            lastAccessed: Date.now(),
            messageCount: 0
          };
        }
        
        const sentMessage = {
          ...messageContent,
          id: action.payload.messageId,
          status: 'sent',
          timestamp: new Date().toISOString()
        };
        
        state.items[contactId].messages.push(sentMessage);
        state.cacheMetadata[contactId].messageCount++;
        state.cacheMetadata[contactId].lastAccessed = Date.now();
      })
      
      // Mark as read
      .addCase(markMessagesAsRead.fulfilled, (state, action) => {
        const messageIds = action.payload.messageIds;
        state.unreadMessageIds = state.unreadMessageIds.filter(id => !messageIds.includes(id));
      })
      
      // Fetch new messages
      .addCase(fetchNewMessages.pending, (state) => {
        state.newMessagesFetching = true;
        state.newMessagesError = null;
      })
      .addCase(fetchNewMessages.fulfilled, (state, action) => {
        const { messages } = action.payload;
        const contactId = action.meta.arg.contactId;

        if (!messages || messages.length === 0) {
          state.newMessagesFetching = false;
          return;
        }

        // Initialize contact data if not exists
        if (!state.items[contactId]) {
          state.items[contactId] = {
            messages: [],
            lastFetched: Date.now(),
            hasMore: true
          };
          state.cacheMetadata[contactId] = {
            lastAccessed: Date.now(),
            messageCount: 0
          };
        }

        const contactData = state.items[contactId];
        
        // Use message_id for unique key generation
        const getMessageKey = (msg) => msg.message_id || msg.id;

        const existingKeys = new Set(contactData.messages.map(getMessageKey));

        const normalized = messages
          .map(messageService.normalizeMessage)
          .filter(msg => !existingKeys.has(getMessageKey(msg)));

        if (normalized.length > 0) {
          contactData.messages = [
            ...contactData.messages,
            ...normalized
          ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

          // Update last known message ID
          const latestMessage = normalized[normalized.length - 1];
          state.lastKnownMessageIds[contactId] = latestMessage.id;
          
          // Update cache metadata
          state.cacheMetadata[contactId].messageCount = contactData.messages.length;
          state.cacheMetadata[contactId].lastAccessed = Date.now();

          logger.debug('[Messages] New messages added to cache:', {
            contactId,
            count: normalized.length,
            totalMessages: contactData.messages.length
          });
        }

        state.newMessagesFetching = false;
      })
      .addCase(fetchNewMessages.rejected, (state, action) => {
        state.newMessagesFetching = false;
        state.newMessagesError = action.payload || 'Failed to fetch new messages';
      })
      
      // Refresh messages
      .addCase(refreshMessages.pending, (state) => {
        state.refreshing = true;
        state.refreshError = null;
      })
      .addCase(refreshMessages.fulfilled, (state, action) => {
        const { contactId, messages } = action.payload;
        state.refreshing = false;

        if (!messages || !Array.isArray(messages)) return;

        // Initialize contact data if not exists
        if (!state.items[contactId]) {
          state.items[contactId] = {
            messages: [],
            lastFetched: Date.now(),
            hasMore: true
          };
          state.cacheMetadata[contactId] = {
            lastAccessed: Date.now(),
            messageCount: 0
          };
        }

        const contactData = state.items[contactId];
        
        // Use existing message normalization
        const normalized = messages.map(msg => messageService.normalizeMessage(msg))
          .filter(newMsg => !contactData.messages.some(existingMsg =>
            (existingMsg.message_id && newMsg.message_id &&
             existingMsg.message_id === newMsg.message_id) ||
            (existingMsg.id && newMsg.id &&
             existingMsg.id === newMsg.id)
          ));

        if (normalized.length > 0) {
          contactData.messages = [
            ...contactData.messages,
            ...normalized
          ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          
          // Update cache metadata
          state.cacheMetadata[contactId].messageCount = contactData.messages.length;
          state.cacheMetadata[contactId].lastAccessed = Date.now();
        }
      })
      .addCase(refreshMessages.rejected, (state, action) => {
        state.refreshing = false;
        state.refreshError = action.payload;
      })
      
      // 🚀 NEW: Cache management actions
      .addCase(clearCacheForContact.fulfilled, (state, action) => {
        const { contactId } = action.payload;
        if (state.items[contactId]) {
          delete state.items[contactId];
          delete state.cacheMetadata[contactId];
          delete state.optimisticMessages[contactId];
        }
      })
      
      .addCase(getCacheStats.fulfilled, (state, action) => {
        state.cacheStats = action.payload;
      });
  }
});

// Export actions
export const {
  clearMessages, // Keep for backward compatibility (now no-op)
  clearMessagesForContact, // NEW: Contact-specific clearing
  cleanupMessageCache, // NEW: Smart cache management
  setCurrentContact, // NEW: Track current contact
  removeFromMessageQueue,
  updateMessageStatus,
  messageReceived,
  addToMessageQueue,
  addOptimisticMessage, // NEW: Optimistic updates
  confirmOptimisticMessage, // NEW: Confirm optimistic updates
  revertOptimisticMessage, // NEW: Revert failed optimistic updates
  updateCacheStats, // NEW: Update cache statistics
  reset
} = messageSlice.actions;

// Export reducer
export const messageReducer = messageSlice.reducer;

// 🚀 ENHANCED: Improved selectors with caching support
const selectMessagesState = (state) => state.messages;
const selectMessagesItems = (state) => state.messages.items;
const selectContactId = (_, contactId) => contactId;

// Enhanced message selector with optimistic messages
export const selectMessages = createSelector(
  [selectMessagesItems, selectContactId, (state) => state.messages.optimisticMessages],
  (items, contactId, optimisticMessages) => {
    const contactData = items[contactId];
    const regularMessages = contactData?.messages || [];
    const optimistic = optimisticMessages[contactId] || [];
    
    // Combine regular and optimistic messages
    return [...regularMessages, ...optimistic]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }
);

// NEW: Selector for cached message count
export const selectCachedMessageCount = createSelector(
  [selectMessagesState, selectContactId],
  (messages, contactId) => messages.cacheMetadata[contactId]?.messageCount || 0
);

// NEW: Selector to check if messages are cached
export const selectHasCachedMessages = createSelector(
  [selectMessagesItems, selectContactId],
  (items, contactId) => {
    const contactData = items[contactId];
    return contactData && contactData.messages.length > 0;
  }
);

// NEW: Selector for cache freshness
export const selectCacheFreshness = createSelector(
  [selectMessagesState, selectContactId],
  (messages, contactId) => {
    const contactData = messages.items[contactId];
    if (!contactData) return null;
    
    const age = Date.now() - contactData.lastFetched;
    return {
      age,
      isFresh: age < MESSAGE_CACHE_TTL,
      lastFetched: contactData.lastFetched
    };
  }
);

// NEW: Selector for cache statistics
export const selectCacheStats = createSelector(
  [selectMessagesState],
  (messages) => messages.cacheStats
);

export const selectMessageLoading = createSelector(
  [selectMessagesState],
  (messages) => messages.loading
);

export const selectMessageError = createSelector(
  [selectMessagesState],
  (messages) => messages.error
);

export const selectHasMoreMessages = createSelector(
  [selectMessagesItems, selectContactId],
  (items, contactId) => items[contactId]?.hasMore ?? true
);

export const selectCurrentPage = createSelector(
  [selectMessagesState],
  (messages) => messages.currentPage
);

export const selectMessageQueue = createSelector(
  [selectMessagesState],
  (messages) => messages.messageQueue
);

export const selectUnreadMessageIds = createSelector(
  [selectMessagesState],
  (messages) => messages.unreadMessageIds
);

export const selectNewMessagesFetching = createSelector(
  [selectMessagesState],
  (messages) => messages.newMessagesFetching
);

export const selectLastKnownMessageId = createSelector(
  [selectMessagesState, selectContactId],
  (messages, contactId) => messages.lastKnownMessageIds[contactId]
);

export const selectNewMessagesError = createSelector(
  [selectMessagesState],
  (messages) => messages.newMessagesError
);

export const selectRefreshing = createSelector(
  [selectMessagesState],
  (messages) => messages.refreshing
);

// Export default
export default messageSlice.reducer;
