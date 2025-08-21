import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';
import { queryKeys, updateCache, invalidateQueries } from '../lib/queryClient';
import axios from 'axios';
import { logger } from '../utils/logger';

/**
 * React Query Hooks for Telegram Integration
 * 
 * This module provides React Query hooks for fetching and managing Telegram data
 * with socket-driven cache updates and optimistic updates.
 */

// API Base URL
const API_BASE_URL = import.meta.env.VITE_TELEGRAM_SERVICE_URL || 'http://localhost:3007/api';

// API Client
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Add request interceptor for authentication
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('supabase.auth.token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Hook for fetching Telegram contacts with React Query
 */
export const useTelegramContacts = (options: {
  forceSync?: boolean;
  requestId?: string;
  enabled?: boolean;
} = {}) => {
  const session = useSelector((state: RootState) => state.auth.session);
  const userId = session?.user?.id;
  
  return useQuery({
    queryKey: queryKeys.telegram.contacts(userId || ''),
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      
      logger.info('[useTelegramContacts] Fetching contacts:', {
        userId,
        forceSync: options.forceSync,
        requestId: options.requestId
      });
      
      const response = await apiClient.get('/telegram/contacts', {
        params: {
          forceSync: options.forceSync,
          requestId: options.requestId,
        },
      });
      
      logger.info('[useTelegramContacts] Contacts fetched:', {
        userId,
        contactCount: response.data.data?.length || 0,
        source: response.data.source,
        syncInfo: response.data.meta?.sync_info
      });
      
      return response.data;
    },
    enabled: !!userId && (options.enabled !== false),
    staleTime: options.forceSync ? 0 : 5 * 60 * 1000, // Fresh data for force sync, 5 min for regular
    gcTime: 10 * 60 * 1000, // 10 minutes cache time
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
};

/**
 * Hook for fetching sync status
 */
export const useSyncStatus = (requestId?: string, options: {
  enabled?: boolean;
  refetchInterval?: number;
} = {}) => {
  const session = useSelector((state: RootState) => state.auth.session);
  const userId = session?.user?.id;
  
  return useQuery({
    queryKey: queryKeys.telegram.syncStatus(userId || '', requestId),
    queryFn: async () => {
      if (!userId || !requestId) throw new Error('User ID and request ID required');
      
      const response = await apiClient.get('/telegram/syncStatus', {
        params: { requestId },
      });
      
      return response.data;
    },
    enabled: !!userId && !!requestId && (options.enabled !== false),
    refetchInterval: options.refetchInterval || 2000, // Poll every 2 seconds by default
    staleTime: 0, // Always fetch fresh sync status
    gcTime: 1 * 60 * 1000, // 1 minute cache time
  });
};

/**
 * Hook for fetching contact messages
 */
export const useContactMessages = (contactId: string | number, options: {
  limit?: number;
  offset?: number;
  enabled?: boolean;
} = {}) => {
  const session = useSelector((state: RootState) => state.auth.session);
  const userId = session?.user?.id;
  
  return useQuery({
    queryKey: queryKeys.telegram.messages(userId || '', contactId),
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      
      const response = await apiClient.get(`/telegram/contacts/${contactId}/messages`, {
        params: {
          limit: options.limit || 50,
          offset: options.offset || 0,
        },
      });
      
      return response.data;
    },
    enabled: !!userId && !!contactId && (options.enabled !== false),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes cache time
  });
};

/**
 * Hook for accepting contact invitations
 */
export const useAcceptContact = () => {
  const queryClient = useQueryClient();
  const session = useSelector((state: RootState) => state.auth.session);
  const userId = session?.user?.id;
  
  return useMutation({
    mutationFn: async (contactId: string | number) => {
      if (!userId) throw new Error('User not authenticated');
      
      logger.info('[useAcceptContact] Accepting contact:', { userId, contactId });
      
      const response = await apiClient.post(`/telegram/contacts/${contactId}/accept`);
      
      logger.info('[useAcceptContact] Contact accepted:', {
        userId,
        contactId,
        response: response.data
      });
      
      return response.data;
    },
    onSuccess: (data, contactId) => {
      if (!userId) return;
      
      // Update the contact in cache
      if (data.contact) {
        updateCache.contact(userId, data.contact);
      }
      
      // Invalidate contacts to refresh the list
      invalidateQueries.contacts(userId);
      
      logger.info('[useAcceptContact] Cache updated after contact acceptance:', {
        userId,
        contactId,
        updatedContact: data.contact
      });
    },
    onError: (error: any, contactId) => {
      logger.error('[useAcceptContact] Error accepting contact:', {
        userId,
        contactId,
        error: error.response?.data || error.message
      });
      
      // Handle specific error types from the error translation service
      if (error.response?.data?.errorType === 'CONTACT_REMOVED') {
        // Remove the contact from cache
        if (userId) {
          updateCache.removeContact(userId, contactId);
        }
      }
    },
  });
};

/**
 * Hook for refreshing contacts (force sync)
 */
export const useRefreshContacts = () => {
  const queryClient = useQueryClient();
  const session = useSelector((state: RootState) => state.auth.session);
  const userId = session?.user?.id;
  
  return useMutation({
    mutationFn: async (options: { requestId?: string } = {}) => {
      if (!userId) throw new Error('User not authenticated');
      
      const requestId = options.requestId || `refresh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      logger.info('[useRefreshContacts] Starting force refresh:', { userId, requestId });
      
      const response = await apiClient.get('/telegram/contacts', {
        params: {
          forceSync: true,
          requestId,
        },
      });
      
      logger.info('[useRefreshContacts] Force refresh completed:', {
        userId,
        requestId,
        contactCount: response.data.data?.length || 0
      });
      
      return { ...response.data, requestId };
    },
    onSuccess: (data) => {
      if (!userId) return;
      
      // Update the contacts cache with fresh data
      queryClient.setQueryData(queryKeys.telegram.contacts(userId), data);
      
      // Invalidate related queries
      invalidateQueries.allTelegramData(userId);
      
      logger.info('[useRefreshContacts] Cache updated after refresh:', {
        userId,
        contactCount: data.data?.length || 0,
        source: data.source
      });
    },
    onError: (error: any) => {
      logger.error('[useRefreshContacts] Error refreshing contacts:', {
        userId,
        error: error.response?.data || error.message
      });
    },
  });
};

/**
 * Hook for sending messages
 */
export const useSendMessage = () => {
  const queryClient = useQueryClient();
  const session = useSelector((state: RootState) => state.auth.session);
  const userId = session?.user?.id;
  
  return useMutation({
    mutationFn: async ({ contactId, message }: {
      contactId: string | number;
      message: string;
    }) => {
      if (!userId) throw new Error('User not authenticated');
      
      logger.info('[useSendMessage] Sending message:', {
        userId,
        contactId,
        messageLength: message.length
      });
      
      const response = await apiClient.post(`/telegram/contacts/${contactId}/send`, {
        message,
      });
      
      return response.data;
    },
    onSuccess: (data, { contactId, message }) => {
      if (!userId) return;
      
      // Optimistically update the contact's last message
      updateCache.contactLastMessage(userId, contactId, message, Date.now());
      
      // Invalidate messages for this contact to refresh
      invalidateQueries.messages(userId, contactId);
      
      logger.info('[useSendMessage] Cache updated after sending message:', {
        userId,
        contactId,
        messageLength: message.length
      });
    },
    onError: (error: any, { contactId }) => {
      logger.error('[useSendMessage] Error sending message:', {
        userId,
        contactId,
        error: error.response?.data || error.message
      });
    },
  });
};

/**
 * Hook for deleting/hiding contacts
 */
export const useDeleteContact = () => {
  const queryClient = useQueryClient();
  const session = useSelector((state: RootState) => state.auth.session);
  const userId = session?.user?.id;
  
  return useMutation({
    mutationFn: async (contactId: string | number) => {
      if (!userId) throw new Error('User not authenticated');
      
      logger.info('[useDeleteContact] Deleting contact:', { userId, contactId });
      
      const response = await apiClient.delete(`/telegram/contacts/${contactId}`);
      
      return response.data;
    },
    onSuccess: (data, contactId) => {
      if (!userId) return;
      
      // Remove the contact from cache
      updateCache.removeContact(userId, contactId);
      
      logger.info('[useDeleteContact] Contact removed from cache:', {
        userId,
        contactId
      });
    },
    onError: (error: any, contactId) => {
      logger.error('[useDeleteContact] Error deleting contact:', {
        userId,
        contactId,
        error: error.response?.data || error.message
      });
    },
  });
};

/**
 * Hook for queue statistics (admin/debugging)
 */
export const useQueueStats = (options: { enabled?: boolean } = {}) => {
  return useQuery({
    queryKey: queryKeys.queue.stats(),
    queryFn: async () => {
      const response = await apiClient.get('/queue/stats');
      return response.data;
    },
    enabled: options.enabled !== false,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 30 * 1000, // Refresh every 30 seconds
  });
};
