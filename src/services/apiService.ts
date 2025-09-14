import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { tokenManager } from '@/utils/tokenManager';
import logger from '@/utils/logger';
import { getSupabaseClient } from '@/utils/supabase';

// Standard response structure (keeping from original api.ts)
export const ResponseStatus = {
  SUCCESS: 'success',
  ERROR: 'error',
  RATE_LIMITED: 'rate_limited',
  PARTIAL: 'partial'
};

// Standard error types (keeping from original api.ts)
export const ErrorTypes = {
  TOKEN_EXPIRED: 'token_expired',
  TOKEN_INVALID: 'token_invalid',
  RATE_LIMIT: 'rate_limit',
  API_ERROR: 'api_error',
  NETWORK_ERROR: 'network_error',
  VALIDATION_ERROR: 'validation_error',
  SERVICE_UNAVAILABLE: 'service_unavailable'
};

// API response validator (keeping from original api.ts)
export const validateResponse = (data: any, schema: Record<string, string>) => {
  if (!data) return false;

  for (const [key, type] of Object.entries(schema)) {
    if (!(key in data)) return false;
    if (typeof data[key] !== type) return false;
  }

  return true;
};

// Standard response schemas (keeping from original api.ts)
export const ResponseSchemas = {
  servers: {
    id: 'string',
    name: 'string',
    icon: 'string'
  },
  directMessages: {
    id: 'string',
    recipients: 'object'
  },
  status: {
    status: 'string',
    message: 'string'
  }
};

// Helper to track refresh attempts to prevent infinite loops (keeping from original api.ts)
let refreshAttempts = 0;
const maxRefreshAttempts = 3;
let lastRefreshTime = 0;
const minRefreshInterval = 5000; // 5 seconds

// Track all pending requests to abort them when needed
interface PendingRequest {
  id: string;
  controller: AbortController;
}
let pendingRequests: PendingRequest[] = [];

// Function to get a valid token with fallbacks
const getValidToken = async (): Promise<string | null> => {
  try {
    // First try token manager
    const token = await tokenManager.getValidToken();
    if (token) return token;
    
    // Fallbacks from original api.ts if tokenManager fails
    const accessToken = localStorage.getItem('access_token');
    if (accessToken) return accessToken;
    
    // Try getting from dailyfix_auth
    const authDataStr = localStorage.getItem('dailyfix_auth');
    if (authDataStr) {
      try {
        const authData = JSON.parse(authDataStr);
        const token = authData.session?.access_token;
        if (token) {
          logger.info('[API] Retrieved token from dailyfix_auth');
          return token;
        }
      } catch (e) {
        logger.error('[API] Error parsing auth data:', e);
      }
    }
    
    // Try getting from persist:auth (Redux persisted state)
    const authStr = localStorage.getItem('persist:auth');
    if (authStr) {
      try {
        const authData = JSON.parse(authStr);
        const sessionData = JSON.parse(authData.session);
        const token = sessionData?.access_token;
        if (token) {
          logger.info('[API] Retrieved token from persist:auth');
          return token;
        }
      } catch (e) {
        logger.error('[API] Error parsing persisted auth data:', e);
      }
    }
    
    return null;
  } catch (error) {
    logger.error('[API] Error getting token:', error);
    return null;
  }
};

// Enhanced base query with retry and auth logic
const baseQueryWithAuth = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_URL || "http://localhost:4000",
  prepareHeaders: async (headers, { endpoint }) => {
    // Add request tracking with an AbortController
    const controller = new AbortController();
    const requestId = Date.now() + Math.random().toString(36).substring(2, 9);
    
    pendingRequests.push({
      id: requestId,
      controller
    });
    
    // Set auth token if available
    const token = await getValidToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
      logger.info(`[API] Added Authorization header for request to ${endpoint}`);
    } else {
      logger.warn(`[API] No token available for request to ${endpoint}`);
    }
    
    // Set default headers
    headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
    
    return headers;
  },
  fetchFn: async (input, init) => {
    const customInit = { ...init };
    
    // Find the corresponding AbortController for this request
    const requestIndex = pendingRequests.findIndex(req => {
      // Use a more robust way to match requests
      if (typeof input === 'string') {
        return input.includes(req.id);
      } else if (input && typeof input === 'object' && 'url' in input) {
        return input.url.includes(req.id);
      }
      return false;
    });
    
    if (requestIndex >= 0) {
      // Attach the AbortController's signal
      customInit.signal = pendingRequests[requestIndex].controller.signal;
    }
    
    try {
      const response = await fetch(input, customInit);
      
      // Clean up the pending request after it completes
      if (requestIndex >= 0) {
        pendingRequests.splice(requestIndex, 1);
      }
      
      return response;
    } catch (error) {
      // Clean up the pending request if it errors
      if (requestIndex >= 0) {
        pendingRequests.splice(requestIndex, 1);
      }
      throw error;
    }
  }
});

// Base query with retry and error handling logic from original api.ts
const baseQueryWithReauth = async (args: any, api: any, extraOptions: any) => {
  let result = await baseQueryWithAuth(args, api, extraOptions);
  
  // Handle auth errors (401/403) with token refresh logic
  if ((result.error?.status === 401 || result.error?.status === 403)) {
    // Similar logic for Supabase auth errors as the original
    if (result.error?.status === 403 && 
        typeof args.url === 'string' && 
        args.url.includes('supabase.co/auth/v1')) {
      logger.warn('[API] Detected Supabase auth 403 error, dispatching session expired event');
      
      if (typeof window !== 'undefined') {
        const sessionExpiredEvent = new CustomEvent('supabase-session-expired', {
          detail: { reason: 'auth-403-error' }
        });
        window.dispatchEvent(sessionExpiredEvent);
        logger.info('[API] Dispatched supabase-session-expired event');
        
        return result;
      }
    }
    
    // Check for too many refresh attempts in a short period
    const now = Date.now();
    if (now - lastRefreshTime < minRefreshInterval) {
      logger.warn('[API] Token refresh attempted too soon after previous refresh');
      refreshAttempts++;
      
      if (refreshAttempts >= maxRefreshAttempts) {
        logger.error(`[API] Maximum refresh attempts (${maxRefreshAttempts}) reached`);
        refreshAttempts = 0; // Reset for future attempts
        
        // Check if this is an intentional logout
        const isIntentionalLogout = localStorage.getItem('intentional_logout') === 'true';
        
        // Dispatch session expired event only if not an intentional logout
        if (typeof window !== 'undefined' && !isIntentionalLogout) {
          const sessionExpiredEvent = new CustomEvent('sessionExpired', {
            detail: { reason: 'max_attempts_reached' }
          });
          window.dispatchEvent(sessionExpiredEvent);
          logger.info('[API] Maximum refresh attempts reached, triggering global session expired event');
        } else if (isIntentionalLogout) {
          logger.info('[API] Intentional logout detected, not showing session expired modal');
        }
        
        return result;
      }
    } else {
      // Reset attempts counter if enough time has passed
      refreshAttempts = 1;
    }
    
    lastRefreshTime = now;
    logger.info('[API] Received auth error, attempting to refresh token');
    
    try {
      // Attempt to refresh the token
      const refreshToken = await tokenManager.refreshToken();
      
      if (refreshToken) {
        logger.info('[API] Token refreshed successfully, retrying request');
        
        // Retry the request with new token
        const retryResult = await baseQueryWithAuth(args, api, extraOptions);
        return retryResult;
      } else {
        logger.error('[API] Token refresh returned null token');
        
        // Trigger session expired event if appropriate
        if (typeof window !== 'undefined' &&
            !window.location.pathname.includes('/login') &&
            !window.location.pathname.includes('/auth/callback') &&
            !document.querySelector('.modal-open')) {
          
          // Check if this is an intentional logout
          const isIntentionalLogout = localStorage.getItem('intentional_logout') === 'true';
          
          if (!isIntentionalLogout) {
            const sessionExpiredEvent = new CustomEvent('sessionExpired', {
              detail: { reason: 'token_refresh_failed' }
            });
            window.dispatchEvent(sessionExpiredEvent);
            logger.info('[API] Token refresh failed, triggering global session expired event');
          } else {
            logger.info('[API] Intentional logout detected, not showing session expired modal');
          }
        }
      }
    } catch (refreshError) {
      logger.error('[API] Token refresh failed:', refreshError);
      
      // Trigger session expired event
      if (typeof window !== 'undefined' &&
          !window.location.pathname.includes('/login') &&
          !window.location.pathname.includes('/auth/callback') &&
          !document.querySelector('.modal-open')) {
        
        // Check if this is an intentional logout
        const isIntentionalLogout = localStorage.getItem('intentional_logout') === 'true';
        
        if (!isIntentionalLogout) {
          const sessionExpiredEvent = new CustomEvent('sessionExpired', {
            detail: { reason: 'refresh_error' }
          });
          window.dispatchEvent(sessionExpiredEvent);
          logger.info('[API] Token refresh error, triggering global session expired event');
        } else {
          logger.info('[API] Intentional logout detected, not showing session expired modal');
        }
      }
    }
  }
  
  return result;
};

// Abort all pending requests
export const abortAllRequests = () => {
  pendingRequests.forEach(request => {
    request.controller.abort();
  });
  pendingRequests = [];
  logger.info('[API] Aborted all pending requests');
};

// Get current auth state (keeping from original api.ts)
export const getAuthState = async () => {
  try {
    const token = await tokenManager.getValidToken();
    if (!token) return null;

    const supabase = getSupabaseClient();
    if (!supabase) return null;
    
    const session = await supabase.auth.getSession();
    return session?.data?.session || null;
  } catch (error) {
    logger.error('[API] Error getting auth state:', error);
    return null;
  }
};

// Create RTK Query API service
export const apiService = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  // You can specify global caching settings here
  keepUnusedDataFor: 60, // Keep unused data for 60 seconds by default
  endpoints: (builder) => ({
    // Define all your endpoints here
    
    // Example endpoint for fetching user profile
    getUserProfile: builder.query({
      query: (userId) => `users/${userId}/profile`,
    }),
    
    // Example endpoint for contacts
    getContacts: builder.query({
      query: () => `contacts`,
    }),
    
    // Example endpoint for messages
    getMessages: builder.query({
      query: ({ contactId, page = 0, limit = 20 }) => 
        `messages/${contactId}?page=${page}&limit=${limit}`,
    }),
    
    // Example endpoint for sending a message
    sendMessage: builder.mutation({
      query: ({ contactId, message }) => ({
        url: `messages/${contactId}`,
        method: 'POST',
        body: { message },
      }),
    }),
    
    // Add more endpoints as needed based on your API requirements
  }),
});

// Export hooks for each endpoint
export const {
  useGetUserProfileQuery,
  useGetContactsQuery,
  useGetMessagesQuery,
  useSendMessageMutation,
  // Add more exported hooks as you define more endpoints
} = apiService;

// Also export the entire API service for manual usage and for store setup
export default apiService; 