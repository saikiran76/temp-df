import axios from 'axios';
import { getSupabaseClient } from './supabase';
import logger from './logger';
// Remove direct import of store to break circular dependency
// import { store } from '@/store/store';
// import { updateSession } from '@/store/slices/authSlice';

// Standard response structure
export const ResponseStatus = {
  SUCCESS: 'success',
  ERROR: 'error',
  RATE_LIMITED: 'rate_limited',
  PARTIAL: 'partial'
};

// Standard error types
export const ErrorTypes = {
  TOKEN_EXPIRED: 'token_expired',
  TOKEN_INVALID: 'token_invalid',
  RATE_LIMIT: 'rate_limit',
  API_ERROR: 'api_error',
  NETWORK_ERROR: 'network_error',
  VALIDATION_ERROR: 'validation_error',
  SERVICE_UNAVAILABLE: 'service_unavailable'
};

// API response validator
export const validateResponse = (data, schema) => {
  if (!data) return false;

  for (const [key, type] of Object.entries(schema)) {
    if (!(key in data)) return false;
    if (typeof data[key] !== type) return false;
  }

  return true;
};

// Standard response schemas
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

// Create base axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://api.dailyfix.app',
  timeout: 35000, // 35 seconds
  headers: {
    'Content-Type': 'application/json',
  }
});

// Track if a token refresh is in progress
let isRefreshing = false;
// Store pending requests
let pendingRequests: Array<() => void> = [];

// Helper to get current access token
const getAccessToken = (): string | null => {
  try {
    return localStorage.getItem('access_token');
  } catch (error) {
    logger.error('[API] Error getting access token:', error);
    return null;
  }
};

// Helper to check if token is expired or about to expire
const isTokenExpired = (): boolean => {
  try {
    const expiryStr = localStorage.getItem('token_expires_at');
    if (!expiryStr) return true;
    
    const expiryTime = parseInt(expiryStr, 10) * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    
    // Consider token expired if it expires in less than 5 minutes
    return currentTime > (expiryTime - 5 * 60 * 1000);
  } catch (error) {
    logger.error('[API] Error checking token expiry:', error);
    return true;
  }
};

// Refresh token and update stored session
const refreshToken = async (): Promise<string> => {
  if (isRefreshing) {
    // Wait for the ongoing refresh to complete
    return new Promise((resolve) => {
      pendingRequests.push(() => {
        const token = getAccessToken();
        resolve(token || '');
      });
    });
  }
  
  isRefreshing = true;
  
  try {
    logger.info('[API] Refreshing token');
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }
    
    const { data, error } = await supabase.auth.refreshSession();
    
    if (error) {
      throw error;
    }
    
    if (data.session) {
      // Update session in Redux store - using a custom event instead of direct store dispatch
      // to avoid circular dependency
      window.dispatchEvent(new CustomEvent('session-updated', {
        detail: { session: data.session }
      }));
      
      // Store the new token
      localStorage.setItem('access_token', data.session.access_token);
      
      // Store the new expiry if available
      if (data.session.expires_at) {
        localStorage.setItem('token_expires_at', String(data.session.expires_at));
      } else if (data.session.expires_in) {
        const expiresAt = Math.floor(Date.now() / 1000) + Number(data.session.expires_in);
        localStorage.setItem('token_expires_at', String(expiresAt));
      }
      
      logger.info('[API] Token refreshed successfully');
      
      // Process pending requests
      pendingRequests.forEach(callback => callback());
      pendingRequests = [];
      
      return data.session.access_token;
    } else {
      throw new Error('No session returned from refresh');
    }
  } catch (error) {
    logger.error('[API] Token refresh failed:', error);
    
    // Process pending requests with error
    pendingRequests.forEach(callback => callback());
    pendingRequests = [];
    
    // Dispatch event for auth components to handle
    window.dispatchEvent(new CustomEvent('sessionExpired', {
      detail: { reason: 'Token refresh failed' }
    }));
    
    throw error;
  } finally {
    isRefreshing = false;
  }
};

// Request interceptor - add auth token
api.interceptors.request.use(
  async (config) => {
    // Skip authentication for public endpoints
    if (config.url?.includes('/public/') || config.headers.skipAuth) {
      return config;
    }
    
    // Check if token is expired or about to expire
    if (isTokenExpired()) {
      try {
        const newToken = await refreshToken();
        config.headers.Authorization = `Bearer ${newToken}`;
      } catch (error) {
        // Let the request proceed without token and fail with 401
        // This will be caught by the response interceptor
        logger.warn('[API] Proceeding with request without valid token');
      }
    } else {
      // Use existing token
      const token = getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle 401 Unauthorized
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    // If request failed due to 401 Unauthorized and it hasn't been retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        // Refresh token
        const newToken = await refreshToken();
        
        // Update the request with new token
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        
        // Retry the request
        return await axios(originalRequest);
      } catch (refreshError) {
        // If refresh fails, let the error propagate
        logger.error('[API] Failed to refresh token on 401 response:', refreshError);
        
        // Dispatch session expired event
        window.dispatchEvent(new CustomEvent('sessionExpired', {
          detail: { reason: 'Authentication failed', originalError: error }
        }));
        
        return Promise.reject(error);
      }
    }
    
    return Promise.reject(error);
  }
);

// Helper method to get current auth state
export const getAuthState = async () => {
  try {
    const token = await getAccessToken();
    if (!token) return null;

    const supabase = getSupabaseClient();
    const session = await supabase.auth.getSession();
    return session?.data?.session || null;
  } catch (error) {
    console.error('Error getting auth state:', error);
    return null;
  }
};

export default api;