import { QueryClient } from '@tanstack/react-query';

/**
 * React Query Client Configuration
 * 
 * This configures the global query client with optimized settings for the Telegram integration,
 * including socket-driven cache updates and intelligent stale time management.
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time - how long data is considered fresh
      staleTime: 5 * 60 * 1000, // 5 minutes for most data
      
      // Cache time - how long data stays in cache when unused
      gcTime: 10 * 60 * 1000, // 10 minutes (was cacheTime in v4)
      
      // Retry configuration
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors (client errors)
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          return false;
        }
        // Retry up to 3 times for other errors
        return failureCount < 3;
      },
      
      // Retry delay with exponential backoff
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      
      // Refetch on window focus for critical data
      refetchOnWindowFocus: false, // We'll handle this manually for better UX
      
      // Refetch on reconnect
      refetchOnReconnect: true,
      
      // Background refetch interval (disabled by default, enabled per query as needed)
      refetchInterval: false,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
      
      // Retry delay for mutations
      retryDelay: 1000,
    },
  },
});

/**
 * Query Keys Factory
 * 
 * Centralized query key management for consistent caching and invalidation
 */
export const queryKeys = {
  // Telegram contacts
  telegram: {
    all: ['telegram'] as const,
    contacts: (userId: string) => ['telegram', 'contacts', userId] as const,
    contact: (userId: string, contactId: string | number) => 
      ['telegram', 'contact', userId, contactId] as const,
    messages: (userId: string, contactId: string | number) => 
      ['telegram', 'messages', userId, contactId] as const,
    syncStatus: (userId: string, requestId?: string) => 
      ['telegram', 'syncStatus', userId, requestId].filter(Boolean) as const,
  },
  
  // Queue monitoring
  queue: {
    all: ['queue'] as const,
    stats: () => ['queue', 'stats'] as const,
    health: () => ['queue', 'health'] as const,
  },
  
  // Priority data
  priority: {
    all: ['priority'] as const,
    contacts: (userId: string) => ['priority', 'contacts', userId] as const,
  },
};

/**
 * Cache Invalidation Helpers
 * 
 * Helper functions for invalidating related queries when data changes
 */
export const invalidateQueries = {
  // Invalidate all telegram data for a user
  allTelegramData: (userId: string) => {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.telegram.all,
      predicate: (query) => {
        const queryKey = query.queryKey;
        return queryKey.includes(userId);
      },
    });
  },
  
  // Invalidate contacts for a user
  contacts: (userId: string) => {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.telegram.contacts(userId),
    });
  },
  
  // Invalidate specific contact
  contact: (userId: string, contactId: string | number) => {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.telegram.contact(userId, contactId),
    });
  },
  
  // Invalidate messages for a contact
  messages: (userId: string, contactId: string | number) => {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.telegram.messages(userId, contactId),
    });
  },
  
  // Invalidate sync status
  syncStatus: (userId: string) => {
    return queryClient.invalidateQueries({
      queryKey: ['telegram', 'syncStatus', userId],
      exact: false, // This will match all sync status queries for the user
    });
  },
};

/**
 * Cache Update Helpers
 * 
 * Helper functions for optimistically updating cache data
 */
export const updateCache = {
  // Update contacts list
  contacts: (userId: string, updater: (oldData: any) => any) => {
    queryClient.setQueryData(queryKeys.telegram.contacts(userId), updater);
  },
  
  // Add or update a single contact
  contact: (userId: string, contact: any) => {
    // Update the contacts list
    queryClient.setQueryData(
      queryKeys.telegram.contacts(userId),
      (oldData: any) => {
        if (!oldData?.data) return oldData;
        
        const existingIndex = oldData.data.findIndex((c: any) => c.id === contact.id);
        if (existingIndex >= 0) {
          // Update existing contact
          const newData = [...oldData.data];
          newData[existingIndex] = { ...newData[existingIndex], ...contact };
          return { ...oldData, data: newData };
        } else {
          // Add new contact
          return { ...oldData, data: [contact, ...oldData.data] };
        }
      }
    );
    
    // Update individual contact cache
    queryClient.setQueryData(
      queryKeys.telegram.contact(userId, contact.id),
      contact
    );
  },
  
  // Remove a contact
  removeContact: (userId: string, contactId: string | number) => {
    // Remove from contacts list
    queryClient.setQueryData(
      queryKeys.telegram.contacts(userId),
      (oldData: any) => {
        if (!oldData?.data) return oldData;
        return {
          ...oldData,
          data: oldData.data.filter((c: any) => c.id !== contactId)
        };
      }
    );
    
    // Remove individual contact cache
    queryClient.removeQueries({
      queryKey: queryKeys.telegram.contact(userId, contactId),
    });
    
    // Remove messages cache for this contact
    queryClient.removeQueries({
      queryKey: queryKeys.telegram.messages(userId, contactId),
    });
  },
  
  // Update contact's last message
  contactLastMessage: (userId: string, contactId: string | number, lastMessage: string, timestamp: number) => {
    // Update in contacts list
    queryClient.setQueryData(
      queryKeys.telegram.contacts(userId),
      (oldData: any) => {
        if (!oldData?.data) return oldData;
        
        const newData = oldData.data.map((contact: any) => {
          if (contact.id === contactId) {
            return {
              ...contact,
              last_message: lastMessage,
              last_message_at: timestamp,
            };
          }
          return contact;
        });
        
        return { ...oldData, data: newData };
      }
    );
    
    // Update individual contact cache
    queryClient.setQueryData(
      queryKeys.telegram.contact(userId, contactId),
      (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          last_message: lastMessage,
          last_message_at: timestamp,
        };
      }
    );
  },
  
  // Update sync status
  syncStatus: (userId: string, requestId: string | undefined, status: any) => {
    const queryKey = queryKeys.telegram.syncStatus(userId, requestId);
    queryClient.setQueryData(queryKey, status);
  },
};

export default queryClient;
