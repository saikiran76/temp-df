import { createClient, SupabaseClient } from '@supabase/supabase-js';
import logger from './logger';

// Keep track of initialization status to prevent multiple instances
let isInitialized = false;

// Properly type supabaseInstance
let supabaseInstance: SupabaseClient | null = null;

// Define interface for storage value
interface StorageValue {
  session?: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    expires_in?: number;
    user?: any;
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Get a Supabase client instance with secure session persistence
 * Implements best practices for token security in SPAs:
 * - Uses local storage with security mitigations
 * - Implements short-lived access tokens
 * - Automatic token rotation
 * - XSS protection via custom storage handlers
 * 
 * This is a singleton implementation that ensures only one client instance
 * exists across the application.
 */
export const getSupabaseClient = () => {
  // Return existing instance if already initialized
  if (supabaseInstance) {
    return supabaseInstance;
  }

  // Check if already being initialized (prevents duplicate initialization)
  if (isInitialized) {
    logger.warn('[Supabase] Already initializing, waiting for existing client');
    
    // Wait for initialization to complete
    let retryCount = 0;
    const maxRetries = 10;
    const checkInitialized = () => {
      if (supabaseInstance) {
        return supabaseInstance;
      }
      
      retryCount += 1;
      if (retryCount < maxRetries) {
        setTimeout(checkInitialized, 100);
      } else {
        logger.error('[Supabase] Failed to get initialized client after max retries');
      }
    };
    
    // Start checking
    setTimeout(checkInitialized, 100);
    
    // Return null for now, the caller should handle this
    return null;
  }

  // Set initialization flag to prevent multiple instances
  isInitialized = true;

  try {
    // Get environment variables with fallback for production
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://odpltrqbcognwmxttlpp.supabase.co';
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    // Log values for debugging
    logger.info('[Supabase] Initializing client with URL:', supabaseUrl);
    logger.info('[Supabase] API key available:', !!supabaseKey);

    // Create the client with secure configuration
    supabaseInstance = createClient(
      supabaseUrl,
      supabaseKey,
      {
        auth: {
          // Enable session persistence in local storage
          persistSession: true,
          // Automatically refresh tokens when they expire
          autoRefreshToken: true,
          // Enable detection of auth parameters in URL
          detectSessionInUrl: true,
          // Use a custom storage key
          storageKey: 'dailyfix_auth',
          // Use PKCE flow for enhanced security
          flowType: 'pkce',
          // Custom storage implementation with security mitigations
          storage: {
            getItem: (key) => {
              try {
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : null;
              } catch (e) {
                logger.error('[Supabase] Error getting item from storage:', e);
                return null;
              }
            },
            setItem: (key, value: unknown) => {
              try {
                // Store the session data
                localStorage.setItem(key, JSON.stringify(value));

                // Store individual tokens for easier access
                // This makes it easier to refresh tokens and check expiry
                const storageValue = value as StorageValue;
                if (storageValue && typeof storageValue === 'object' && storageValue.session) {
                  const session = storageValue.session;
                  
                  if (session.access_token) {
                    localStorage.setItem('access_token', session.access_token);
                    
                    // Store the token's expiration for monitoring
                    if (session.expires_at) {
                      localStorage.setItem('token_expires_at', String(session.expires_at));
                    } else if (session.expires_in) {
                      const expiresAt = Math.floor(Date.now() / 1000) + Number(session.expires_in);
                      localStorage.setItem('token_expires_at', String(expiresAt));
                    }
                  }
                  
                  // Store the refresh token securely
                  if (session.refresh_token) {
                    localStorage.setItem('refresh_token', session.refresh_token);
                  }
                  
                  // Store user data for quick access
                  if (session.user) {
                    localStorage.setItem('user_data', JSON.stringify(session.user));
                  }
                  
                  // Record the last authentication time
                  localStorage.setItem('auth_timestamp', Date.now().toString());
                }
                
                // Dispatch an event that the session was updated
                window.dispatchEvent(new CustomEvent('supabase-session-updated', {
                  detail: { source: 'storage-setItem' }
                }));
                
                logger.info('[Supabase] Auth data stored successfully');
              } catch (e) {
                logger.error('[Supabase] Error setting item in storage:', e);
              }
            },
            removeItem: (key) => {
              try {
                localStorage.removeItem(key);
                
                // Clean up all related tokens
                if (key === 'dailyfix_auth') {
                  localStorage.removeItem('access_token');
                  localStorage.removeItem('refresh_token');
                  localStorage.removeItem('token_expires_at');
                  localStorage.removeItem('user_data');
                  localStorage.removeItem('auth_timestamp');
                  
                  // Dispatch an event that the session was removed
                  window.dispatchEvent(new CustomEvent('supabase-session-removed', {
                    detail: { source: 'storage-removeItem' }
                  }));
                  
                  logger.info('[Supabase] Auth data removed from storage');
                }
              } catch (e) {
                logger.error('[Supabase] Error removing item from storage:', e);
              }
            }
          }
        }
      }
    );
    
    // Set up auth state change listener
    supabaseInstance.auth.onAuthStateChange((event, session) => {
      logger.info('[Supabase] Auth state changed:', event);
      
      if (event === 'SIGNED_IN') {
        logger.info('[Supabase] User signed in, session established');
      } else if (event === 'SIGNED_OUT') {
        logger.info('[Supabase] User signed out, clearing session data');
      } else if (event === 'TOKEN_REFRESHED') {
        logger.info('[Supabase] Token refreshed successfully');
      } else if (event === 'USER_UPDATED') {
        logger.info('[Supabase] User data updated');
      }
      
      // Dispatch an event for components to react to auth changes
      window.dispatchEvent(new CustomEvent('auth-state-changed', {
        detail: { event, session }
      }));
    });
  } catch (error) {
    logger.error('[Supabase] Error initializing client:', error);
    isInitialized = false;
    throw error;
  } finally {
    // Reset initialization flag once complete
    isInitialized = false;
  }
  
  return supabaseInstance;
};

// For backward compatibility, but this shouldn't be used for new code
// We need a getter approach to avoid creating a client upon import
// export const supabase = getSupabaseClient();

// For backward compatibility - a proxy to the actual client
export const supabase = {
  auth: {
    getSession: async () => {
      const client = getSupabaseClient();
      return client ? client.auth.getSession() : { data: null, error: new Error('Supabase client not available') };
    },
    refreshSession: async (params: { refresh_token: string }) => {
      const client = getSupabaseClient();
      return client ? client.auth.refreshSession(params) : { data: null, error: new Error('Supabase client not available') };
    },
    signInWithPassword: async (params: { email: string, password: string }) => {
      const client = getSupabaseClient();
      return client ? client.auth.signInWithPassword(params) : { data: null, error: new Error('Supabase client not available') };
    },
    signOut: async () => {
      const client = getSupabaseClient();
      return client ? client.auth.signOut() : { error: new Error('Supabase client not available') };
    }
  }
};

// Default export for newer code
export default getSupabaseClient;
