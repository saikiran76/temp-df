import logger from './logger';
import { supabase } from './supabase';
import { toast } from 'react-hot-toast';
import { getSupabaseClient } from './supabase';

// Add interface to Window object for isRefreshingToken
declare global {
  interface Window {
    isRefreshingToken?: boolean;
  }
}

class TokenManager {
  // Declare class properties
  private tokens: Map<string, string>;
  private sessionMonitorInterval: ReturnType<typeof setInterval> | null;
  private _noRefreshTokenDetected: boolean;
  
  // Validation tracking properties
  validationAttempts: number = 0;
  maxValidationAttempts: number = 3;
  validationPromise: Promise<string | null> | null = null;
  lastValidationTime: number = 0;
  minValidationInterval: number = 2000; // 2 seconds
  
  // Refresh tracking properties
  refreshAttempts: number = 0;
  maxRefreshAttempts: number = 3;
  refreshPromise: Promise<string | null> | null = null;
  lastRefreshTime: number = 0;
  minRefreshInterval: number = 5000; // 5 seconds

  constructor() {
    this.tokens = new Map();
    this.sessionMonitorInterval = null;
    this._noRefreshTokenDetected = false;

    // Start session monitoring when the TokenManager is created
    this.startSessionMonitoring();
  }

  // CRITICAL FIX: Periodically check session validity
  startSessionMonitoring() {
    // Clear any existing interval
    if (this.sessionMonitorInterval) {
      clearInterval(this.sessionMonitorInterval);
    }

    // Check session validity every 5 minutes
    this.sessionMonitorInterval = setInterval(async () => {
      try {
        // Only run checks if we're on a protected route
        const isProtectedRoute = !window.location.pathname.includes('/login') &&
                                !window.location.pathname.includes('/signup') &&
                                !window.location.pathname.includes('/auth/callback');

        if (!isProtectedRoute) {
          return; // Don't check on non-protected routes
        }

        logger.info('[TokenManager] Performing periodic session check');

        // Check if session is about to expire
        const expiryStr = localStorage.getItem('session_expiry');
        if (expiryStr) {
          try {
            const expiryTime = new Date(expiryStr).getTime();
            const currentTime = Date.now();
            const timeRemaining = expiryTime - currentTime;

            // If session expires in less than 30 minutes, try to refresh it proactively
            if (timeRemaining < 30 * 60 * 1000 && timeRemaining > 0) {
              logger.info(`[TokenManager] Session expires in ${Math.round(timeRemaining/60000)} minutes, refreshing proactively`);
              await this.refreshToken();
            }
            // If session has already expired, show notification
            else if (timeRemaining <= 0) {
              logger.warn('[TokenManager] Session has expired during periodic check');

              // Try to refresh one last time
              const newToken = await this.refreshToken();
              if (!newToken) {
                // CRITICAL FIX: Use the global session expired event instead of toast
                // This will trigger the SessionExpiredModal to show
                logger.info('[TokenManager] Session expired during periodic check, triggering global session expired event');

                // Check if this is an intentional logout
                const isIntentionalLogout = localStorage.getItem('intentional_logout') === 'true';
                
                if (!isIntentionalLogout) {
                  // Only dispatch the event if it's not an intentional logout
                  // Dispatch a custom event that the App component will listen for
                  const sessionExpiredEvent = new CustomEvent('sessionExpired', {
                    detail: { reason: 'session_expired' }
                  });
                  window.dispatchEvent(sessionExpiredEvent);
                } else {
                  logger.info('[TokenManager] Intentional logout detected, not showing session expired modal');
                }

                // Don't redirect automatically - the modal will handle this
                // This prevents the jarring page refresh experience
              }
            }
          } catch (e) {
            logger.error('[TokenManager] Error checking session expiry:', e);
          }
        }
      } catch (error) {
        logger.error('[TokenManager] Error in session monitoring:', error);
      }
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  async getValidToken(userId = 'default', forceRefresh = false) {
    try {
      // If we've already detected that no refresh token is available, don't try to validate
      if (this._noRefreshTokenDetected) {
        logger.warn('[TokenManager] No refresh token available, skipping token validation');

        // Dispatch the session expired event again if needed
        if (typeof window !== 'undefined') {
          const sessionExpiredEvent = new CustomEvent('supabase-session-expired', {
            detail: { reason: 'no-refresh-token' }
          });
          window.dispatchEvent(sessionExpiredEvent);
        }

        return null;
      }

      // CRITICAL FIX: Prevent multiple simultaneous validation attempts
      const now = Date.now();
      if (this.validationPromise) {
        logger.info('[TokenManager] Token validation already in progress, waiting for it to complete');
        return this.validationPromise;
      }

      // CRITICAL FIX: Prevent too frequent validation attempts
      if (now - this.lastValidationTime < this.minValidationInterval && !forceRefresh) {
        logger.info('[TokenManager] Token validation attempted too soon after previous validation, using cached token');
        const cachedToken = localStorage.getItem('access_token');
        if (cachedToken) {
          return cachedToken;
        }
      }

      // CRITICAL FIX: Prevent infinite validation loops
      if (this.validationAttempts >= this.maxValidationAttempts) {
        logger.error(`[TokenManager] Maximum validation attempts (${this.maxValidationAttempts}) reached, using cached token if available`);
        this.validationAttempts = 0;

        // Try to use any available token as a fallback
        const cachedToken = localStorage.getItem('access_token');
        if (cachedToken) {
          return cachedToken;
        }

        // If no token is available, show a non-refreshing toast
        // toast.error('Authentication error. Please refresh the page.');
        return null;
      }

      this.validationAttempts++;
      this.lastValidationTime = now;

      // Create a promise for this validation attempt
      this.validationPromise = (async () => {
        try {
          // CRITICAL FIX: Check token expiration with better error handling
          const checkTokenExpiration = () => {
            try {
              const expiryStr = localStorage.getItem('session_expiry');
              if (!expiryStr) return true; // If no expiry, assume expired

              const expiryTime = new Date(expiryStr).getTime();
              const currentTime = Date.now();
              // Add a 5-minute buffer to ensure we refresh before expiration
              const isExpired = expiryTime - currentTime < 5 * 60 * 1000;

              if (isExpired) {
                logger.info('[TokenManager] Token is expired or expiring soon');
              }

              return isExpired;
            } catch (e) {
              logger.error('[TokenManager] Error checking token expiration:', e);
              return true; // Assume expired on error
            }
          };

          const isTokenExpired = checkTokenExpiration();

          // Try to get token from multiple sources with better error handling
          let token = null;
          let tokenSource = null;

          // Try dailyfix_auth
          try {
            const dailyfixAuth = localStorage.getItem('dailyfix_auth');
            if (dailyfixAuth) {
              const authData = JSON.parse(dailyfixAuth);
              if (authData.session?.access_token || authData.access_token) {
                token = authData.session?.access_token || authData.access_token;
                tokenSource = 'dailyfix_auth';
              }
            }
          } catch (e) {
            logger.error('[TokenManager] Error getting token from dailyfix_auth:', e);
          }

          // Try access_token
          if (!token) {
            try {
              const accessToken = localStorage.getItem('access_token');
              if (accessToken) {
                token = accessToken;
                tokenSource = 'access_token';
              }
            } catch (e) {
              logger.error('[TokenManager] Error getting token from access_token:', e);
            }
          }

          logger.info('[TokenManager] Token check result:', {
            hasToken: !!token,
            tokenSource,
            userId,
            forceRefresh,
            isTokenExpired
          });

          // If token is expired or force refresh is requested, refresh immediately
          if (forceRefresh || isTokenExpired || !token) {
            logger.info('[TokenManager] Token expired or force refresh requested, refreshing token');
            return this.refreshToken(userId);
          }

          // If we have a valid token, use it
          if (token) {
            logger.info(`[TokenManager] Using token from ${tokenSource}`);
            return token;
          }

          // If we get here, we need to refresh the token
          logger.info('[TokenManager] No valid token found, attempting refresh');
          return this.refreshToken(userId);
        } catch (error) {
          logger.error('[TokenManager] Error in getValidToken inner try-catch:', error);

          // Try to use any available token as a fallback
          try {
            const cachedToken = localStorage.getItem('access_token');
            if (cachedToken) {
              return cachedToken;
            }
          } catch (e) {
            logger.error('[TokenManager] Error getting fallback token:', e);
          }

          return null;
        } finally {
          // CRITICAL FIX: Clear the promise reference to allow future validation attempts
          setTimeout(() => {
            this.validationPromise = null;
          }, 100);
        }
      })();

      return this.validationPromise;
    } catch (error) {
      logger.error('[TokenManager] Error in getValidToken outer try-catch:', error);
      this.validationPromise = null;

      // Try to use any available token as a last resort
      try {
        const cachedToken = localStorage.getItem('access_token');
        if (cachedToken) {
          return cachedToken;
        }
      } catch (e) {
        logger.error('[TokenManager] Error getting last resort token:', e);
      }

      return null;
    }
  }

  async refreshToken(userId = 'default') {
    try {
      // CRITICAL FIX: Prevent multiple simultaneous refresh attempts
      const now = Date.now();
      if (this.refreshPromise) {
        logger.info('[TokenManager] Token refresh already in progress, waiting for it to complete');
        return this.refreshPromise;
      }

      // CRITICAL FIX: Prevent too frequent refresh attempts
      if (now - this.lastRefreshTime < this.minRefreshInterval) {
        logger.info('[TokenManager] Token refresh attempted too soon after previous refresh, using cached token');
        const cachedToken = localStorage.getItem('access_token');
        if (cachedToken) {
          return cachedToken;
        }
      }

      // CRITICAL FIX: Prevent infinite refresh loops
      if (this.refreshAttempts >= this.maxRefreshAttempts) {
        logger.error(`[TokenManager] Maximum refresh attempts (${this.maxRefreshAttempts}) reached, forcing logout`);
        this.refreshAttempts = 0;
        this.clearTokens();

        // Don't redirect if we're already on the login page
        if (!window.location.pathname.includes('/login')) {
          // Use a non-refreshing toast to inform the user
          toast.error('Your session has expired. Please log in again.', {
            duration: 5000,
            className: 'bg-red-500',
          });

          // Delay redirect to allow toast to be seen
          setTimeout(() => {
            window.location.href = '/login';
          }, 2000);
        }

        return null;
      }

      this.refreshAttempts++;
      this.lastRefreshTime = now;

      // Create a promise for this refresh attempt
      this.refreshPromise = (async () => {
        try {
          logger.info('[TokenManager] Attempting to refresh token');

          // CRITICAL FIX: Try multiple sources for refresh token in a specific order
          let refreshToken = null;
          let refreshTokenSources = [
            // Check dedicated refresh_token in localStorage first (most reliable)
            { source: 'localStorage refresh_token', token: localStorage.getItem('refresh_token') },
            
            // Then check the dailyfix_auth object
            {
              source: 'dailyfix_auth',
              token: (() => {
                try {
                  const authData = localStorage.getItem('dailyfix_auth');
                  if (!authData) return null;
                  const parsed = JSON.parse(authData);
                  return parsed.session?.refresh_token;
                } catch (e) {
                  logger.error('[TokenManager] Error parsing dailyfix_auth for refresh token:', e);
                  return null;
                }
              })()
            },
            
            // Check Redux persisted state
            {
              source: 'persist:auth',
              token: (() => {
                try {
                  const authStr = localStorage.getItem('persist:auth');
                  if (!authStr) return null;
                  const authData = JSON.parse(authStr);
                  if (!authData.session) return null;
                  const sessionData = JSON.parse(authData.session);
                  return sessionData?.refresh_token;
                } catch (e) {
                  logger.error('[TokenManager] Error parsing persisted auth data for refresh token:', e);
                  return null;
                }
              })()
            },
            
            // Try to get from supabase directly as a last resort
            {
              source: 'supabase.auth.getSession',
              token: (async () => {
                try {
                  const supabaseClient = getSupabaseClient();
                  if (!supabaseClient) return null;
                  const { data } = await supabaseClient.auth.getSession();
                  return data?.session?.refresh_token;
                } catch (e) {
                  logger.error('[TokenManager] Error getting session from Supabase for refresh token:', e);
                  return null;
                }
              })()
            }
          ];

          // Try each source in order
          for (const source of refreshTokenSources) {
            if (source.token) {
              refreshToken = source.token;
              logger.info(`[TokenManager] Found refresh token in ${source.source}`);
              break;
            }
          }

          // CRITICAL FIX: If no refresh token was found in storage, 
          // try to get one from supabase directly
          if (!refreshToken) {
            try {
              const { data: sessionData } = await getSupabaseClient().auth.getSession();
              if (sessionData?.session?.refresh_token) {
                refreshToken = sessionData.session.refresh_token;
                logger.info('[TokenManager] Retrieved refresh token from supabase.auth.getSession()');
                
                // Save the refresh token for future use
                localStorage.setItem('refresh_token', refreshToken);
              }
            } catch (sessionError) {
              logger.error('[TokenManager] Error getting session from Supabase:', sessionError);
            }
          }

          if (!refreshToken) {
            logger.warn('[TokenManager] No refresh token found in any storage location');

            // Dispatch a custom event to notify the SessionExpirationHandler
            if (typeof window !== 'undefined') {
              const sessionExpiredEvent = new CustomEvent('supabase-session-expired', {
                detail: { reason: 'no-refresh-token' }
              });
              window.dispatchEvent(sessionExpiredEvent);
              logger.info('[TokenManager] Dispatched supabase-session-expired event');
            }

            // Set a flag to prevent repeated refresh attempts
            this._noRefreshTokenDetected = true;

            throw new Error('No refresh token found in any storage location');
          }

          logger.info('[TokenManager] Found refresh token, attempting to refresh session');

          // CRITICAL FIX: Implement a robust token refresh mechanism with proper error handling
          let data, error;
          let refreshAttempted = false;

          try {
            // STEP 1: First try to get a fresh session directly from Supabase
            // This is the most reliable method and avoids using refresh tokens
            logger.info('[TokenManager] Attempting to get current session first');
            const supabaseClient = getSupabaseClient();
            if (!supabaseClient) {
              throw new Error('Supabase client is not available');
            }
            
            const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();

            if (!sessionError && sessionData?.session?.access_token) {
              logger.info('[TokenManager] Successfully retrieved current session');
              data = sessionData;
              error = null;

              // Store the new tokens immediately
              try {
                if (sessionData.session.refresh_token) {
                  localStorage.setItem('refresh_token', sessionData.session.refresh_token);
                }
                if (sessionData.session.access_token) {
                  localStorage.setItem('access_token', sessionData.session.access_token);
                }
                if (sessionData.session.expires_at) {
                  localStorage.setItem('session_expiry', sessionData.session.expires_at);
                }
              } catch (storageError) {
                logger.error('[TokenManager] Error storing refreshed tokens:', storageError);
              }
            } else {
              // STEP 2: If direct session retrieval fails, try to refresh with our token
              logger.info('[TokenManager] Current session unavailable, attempting refresh');
              refreshAttempted = true;

              // Use a mutex to prevent concurrent refresh attempts
              if (window.isRefreshingToken) {
                logger.info('[TokenManager] Another refresh is in progress, waiting...');
                // Wait for the other refresh to complete (max 5 seconds)
                for (let i = 0; i < 10; i++) {
                  await new Promise(resolve => setTimeout(resolve, 500));
                  if (!window.isRefreshingToken) {
                    // Try to get the session again after the other refresh completed
                    const { data: newSessionData } = await getSupabaseClient().auth.getSession();
                    if (newSessionData?.session?.access_token) {
                      logger.info('[TokenManager] Using session from concurrent refresh');
                      data = newSessionData;
                      error = null;
                      break;
                    }
                  }
                }
              }

              // If we still don't have a session, try to refresh ourselves
              if (!data) {
                // Set the mutex to prevent concurrent refreshes
                window.isRefreshingToken = true;

                try {
                  // CRITICAL FIX: Add timeout to prevent hanging refresh requests
                  const refreshPromise = getSupabaseClient().auth.refreshSession({
                    refresh_token: refreshToken
                  });

                  // Create a timeout promise
                  const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Token refresh timeout')), 10000);
                  });

                  // Race the refresh and timeout promises
                  const result = await Promise.race([refreshPromise, timeoutPromise]);
                  data = result.data;
                  error = result.error;

                  // CRITICAL FIX: Store the new tokens immediately if refresh succeeded
                  if (!error && data?.session) {
                    try {
                      if (data.session.refresh_token) {
                        localStorage.setItem('refresh_token', data.session.refresh_token);
                        logger.info('[TokenManager] Stored new refresh token');
                      }
                      if (data.session.access_token) {
                        localStorage.setItem('access_token', data.session.access_token);
                      }
                      if (data.session.expires_at) {
                        localStorage.setItem('session_expiry', data.session.expires_at);
                      }
                    } catch (storageError) {
                      logger.error('[TokenManager] Error storing refreshed tokens:', storageError);
                    }
                  }
                } finally {
                  // Always clear the mutex
                  window.isRefreshingToken = false;
                }
              }

              // STEP 3: Handle specific error cases
              if (error) {
                const errorMsg = error.message || '';

                // CRITICAL FIX: Handle "Already Used" error specifically
                if (errorMsg.includes('Already Used')) {
                  logger.warn('[TokenManager] Detected "Already Used" refresh token error');

                  // Clear the invalid refresh token
                  localStorage.removeItem('refresh_token');

                  // STEP 4: Try to recover using stored credentials
                  try {
                    // Try to get email/password from localStorage
                    const storedCredentials = localStorage.getItem('dailyfix_credentials');

                    if (storedCredentials) {
                      const { email, password } = JSON.parse(storedCredentials);

                      if (email && password) {
                        logger.info('[TokenManager] Found stored credentials, attempting silent re-authentication');
                        const signInResult = await getSupabaseClient().auth.signInWithPassword({
                          email,
                          password
                        });

                        if (!signInResult.error && signInResult.data?.session) {
                          logger.info('[TokenManager] Successfully re-authenticated with stored credentials');
                          data = signInResult.data;
                          error = null;
                        }
                      }
                    }
                  } catch (credError) {
                    logger.error('[TokenManager] Error during credential recovery:', credError);
                  }
                }
              }
            }

            // CRITICAL FIX: Return the refreshed access token and set it for future requests
            if (data?.session?.access_token) {
              logger.info('[TokenManager] Successfully refreshed token');
              
              // Handle success - reset refresh attempts counter
              this.refreshAttempts = 0;
              
              // Return the new access token
              return data.session.access_token;
            } else {
              logger.error('[TokenManager] Token refresh failed:', error);
              throw error || new Error('Failed to refresh token');
            }
          } catch (refreshError) {
            logger.error('[TokenManager] Error refreshing token:', refreshError);

            // Handle clear errors
            if (refreshError?.message?.includes('Refresh token has expired')) {
              logger.info('[TokenManager] Detected expired refresh token, need to re-authenticate');
              
              // Check if this is an intentional logout
              const isIntentionalLogout = localStorage.getItem('intentional_logout') === 'true';
              
              // Trigger session expired event only if not an intentional logout
              if (typeof window !== 'undefined' && !isIntentionalLogout) {
                const sessionExpiredEvent = new CustomEvent('sessionExpired', {
                  detail: { reason: 'refresh_token_expired' }
                });
                window.dispatchEvent(sessionExpiredEvent);
              } else if (isIntentionalLogout) {
                logger.info('[TokenManager] Intentional logout detected, not showing session expired modal');
              }
            }
            
            throw new Error('Failed to refresh token: ' + (refreshError?.message || 'Unknown error'));
          }
        } catch (error) {
          logger.error('[TokenManager] Token refresh failed:', error);
          
          // Handle the error and trigger UI feedback
          if (typeof window !== 'undefined') {
            // Check if this is an intentional logout
            const isIntentionalLogout = localStorage.getItem('intentional_logout') === 'true';
            
            if (!isIntentionalLogout) {
              // Only trigger the session expired event if it's not an intentional logout
              // Trigger a global session expired event
              const sessionExpiredEvent = new CustomEvent('sessionExpired', {
                detail: { reason: 'token_refresh_failed', error: error.message }
              });
              window.dispatchEvent(sessionExpiredEvent);
            } else {
              logger.info('[TokenManager] Intentional logout detected, not showing session expired modal');
            }
          }
          
          return null;
        } finally {
          // Clear the promise to allow future attempts
          setTimeout(() => {
            this.refreshPromise = null;
          }, 100);
        }
      })();

      return this.refreshPromise;
    } catch (error) {
      logger.error('[TokenManager] Unexpected error in refreshToken outer try-catch:', error);
      this.refreshPromise = null;
      return null;
    }
  }

  clearTokens(userId = 'default') {
    try {
      localStorage.removeItem('dailyfix_auth');
      localStorage.removeItem('access_token');
      this.tokens.delete(userId);
      logger.info('[TokenManager] Tokens cleared for user:', userId);
    } catch (error) {
      logger.info('[TokenManager] Error clearing tokens:', error);
    }
  }

  setToken(token, userId = 'default') {
    try {
      this.tokens.set(userId, token);
      localStorage.setItem('access_token', token);

      // Ensure the token is also set in the dailyfix_auth object
      const dailyfixAuth = localStorage.getItem('dailyfix_auth');
      if (dailyfixAuth) {
        const authData = JSON.parse(dailyfixAuth);
        if (authData.session) {
          authData.session.access_token = token;
        } else {
          authData.session = {
            access_token: token,
            refresh_token: null,
            expires_at: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
          };
        }
        localStorage.setItem('dailyfix_auth', JSON.stringify(authData));
      }

      logger.info('[TokenManager] Token set for user:', userId);
    } catch (error) {
      logger.error('[TokenManager] Error setting token:', error);
    }
  }
}

export const tokenManager = new TokenManager();
export default tokenManager;