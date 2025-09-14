import logger from './logger';
import { getSupabaseClient } from './supabase';
import tokenManager from './tokenManager';
import { toast } from 'react-hot-toast';
import DOMPurify from 'dompurify';

/**
 * Auth Security Helpers
 * 
 * This file contains utilities to enhance security for authentication:
 * - Content Security Policy (CSP) setup
 * - XSS protection utilities
 * - Token refresh and validation utilities
 * - Secure storage helpers
 */

/**
 * Sets up a Content Security Policy to mitigate XSS attacks
 * Call this early in your application bootstrap
 */
export function setupCSP(): void {
  try {
    // Check if we already have a CSP meta tag
    const existingCSP = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if (existingCSP) {
      logger.info('[Security] CSP already set up');
      return;
    }

    // Determine the environment
    const isDevelopment = process.env.NODE_ENV === 'development' || 
                         window.location.hostname === 'localhost' || 
                         window.location.hostname === '127.0.0.1';
    
    // Create a CSP meta tag based on environment
    const cspMeta = document.createElement('meta');
    cspMeta.httpEquiv = 'Content-Security-Policy';
    
    if (isDevelopment) {
      // More permissive CSP for development
      logger.info('[Security] Setting up development CSP with localhost connections');
      cspMeta.content = `
        default-src 'self';
        script-src 'self' 'unsafe-inline' 'unsafe-eval' https://storage.googleapis.com https://*.googleapis.com;
        style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
        img-src 'self' data: https://* blob:;
        font-src 'self' https://fonts.gstatic.com;
        connect-src 'self' http://localhost:* https://localhost:* ws://localhost:* wss://localhost:* https://*.supabase.co wss://*.supabase.co https://*.googleapis.com https://api.dailyfix.io https://*.dailyfix-api-gateway.duckdns.org https://dailyfix-api-gateway.duckdns.org;
        frame-src 'self' https://*.supabase.co;
      `.replace(/\s+/g, ' ').trim();
    } else {
      // Stricter CSP for production
      logger.info('[Security] Setting up production CSP');
      cspMeta.content = `
        default-src 'self';
        script-src 'self' 'unsafe-inline' 'unsafe-eval' https://storage.googleapis.com https://*.googleapis.com;
        style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
        img-src 'self' data: https://* blob:;
        font-src 'self' https://fonts.gstatic.com;
        connect-src 'self' https://*.supabase.co wss://*.supabase.co wss://* ws://* https://*.googleapis.com https://api.dailyfix.io https://*.dailyfix-api-gateway.duckdns.org https://dailyfix-api-gateway.duckdns.org;
        frame-src 'self' https://*.supabase.co;
      `.replace(/\s+/g, ' ').trim();
    }

    // Add the meta tag to the head of the document
    document.head.appendChild(cspMeta);
    logger.info('[Security] Content Security Policy set up');
  } catch (error) {
    logger.error('[Security] Error setting up CSP:', error);
  }
}

/**
 * Sanitizes HTML content to prevent XSS attacks
 * Use this function for any user-generated content displayed in the UI
 * 
 * @param html HTML string to sanitize
 * @returns Sanitized HTML string
 */
export function sanitizeHTML(html: string): string {
  const temp = document.createElement('div');
  temp.textContent = html;
  return temp.innerHTML;
}

/**
 * Checks if a token is expired or about to expire
 * @param expiresAt Expiry timestamp in seconds
 * @param bufferSeconds Buffer time in seconds (default: 300 - 5 minutes)
 * @returns True if token is expired or about to expire
 */
export function isTokenExpiring(expiresAt?: number | null, bufferSeconds: number = 300): boolean {
  if (!expiresAt) {
    console.warn('[Security] No token expiry time found in localStorage');
    return false; // Don't attempt refresh if no expiry time
  }

  // Convert to ms timestamp for comparison
  const expiryTime = expiresAt * 1000;
  const now = Date.now();
  
  // Check if token is already expired
  if (now >= expiryTime) {
    console.info('[Security] Token is already expired');
    return true;
  }
  
  // Check if token is about to expire within buffer time
  const timeUntilExpiry = expiryTime - now;
  const isExpiringSoon = timeUntilExpiry <= bufferSeconds * 1000;
  
  if (isExpiringSoon) {
    console.info(`[Security] Token expires in ${Math.round(timeUntilExpiry / 1000)}s`);
  }
  
  return isExpiringSoon;
}

// Keep track of refresh attempts to prevent excessive calls
let lastRefreshAttempt = 0;
const REFRESH_DEBOUNCE_MS = 10000; // 10 seconds

/**
 * Refreshes the token if it's about to expire
 * @returns Promise that resolves after token refresh attempt
 */
export async function refreshTokenIfNeeded(): Promise<void> {
  try {
    // Debounce refresh attempts to prevent excessive calls
    const now = Date.now();
    if (now - lastRefreshAttempt < REFRESH_DEBOUNCE_MS) {
      logger.info('[Security] Token refresh attempted too soon, skipping');
      return;
    }
    
    // Mark this attempt
    lastRefreshAttempt = now;
    
    // Get auth data from localStorage
    const authDataStr = localStorage.getItem('dailyfix_auth');
    if (!authDataStr) {
      console.info('[Security] No auth data found, skipping token refresh');
      return;
    }
    
    // Parse auth data
    const authData = JSON.parse(authDataStr);
    if (!authData || !authData.refresh_token) {
      console.info('[Security] No refresh token available in auth data, skipping refresh');
      return;
    }
    
    // Check if token is expiring
    if (!isTokenExpiring(authData.expires_at)) {
      // Token not expiring, no need to refresh
      return;
    }
    
    console.info('[Security] Token is expiring, attempting refresh');
    
    // Only refresh if we have a refresh token
    if (!authData.refresh_token) {
      console.error('[Security] No refresh token available');
      return;
    }
    
    // Get Supabase client
    const supabase = getSupabaseClient();
    if (!supabase) {
      logger.error('[Security] Cannot refresh token - Supabase client not available');
      return;
    }
    
    // Get the current session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    // Check if we have a valid session
    if (sessionError) {
      logger.error('[Security] Error getting session for refresh:', sessionError);
      return;
    }
    
    if (!sessionData?.session?.refresh_token) {
      logger.error('[Security] No refresh token available');
      return;
    }
    
    // Attempt to refresh the session
    const { data, error } = await supabase.auth.refreshSession();
    
    if (error) {
      logger.error('[Security] Error refreshing token:', error);
      
      // Dispatch session expired event if refresh fails with auth error
      if (error.message?.toLowerCase().includes('expired') || 
          error.message?.toLowerCase().includes('invalid')) {
        window.dispatchEvent(new CustomEvent('session-expired', {
          detail: { reason: 'refresh-failed' }
        }));
      }
      
      return;
    }
    
    if (!data.session) {
      logger.error('[Security] Token refresh succeeded but no session returned');
      return;
    }
    
    // Update token in localStorage
    localStorage.setItem('access_token', data.session.access_token);
    
    if (data.session.refresh_token) {
      localStorage.setItem('refresh_token', data.session.refresh_token);
    }
    
    if (data.session.expires_at) {
      localStorage.setItem('token_expires_at', String(data.session.expires_at));
    } else if (data.session.expires_in) {
      const expiryTime = Math.floor(Date.now() / 1000) + data.session.expires_in;
      localStorage.setItem('token_expires_at', String(expiryTime));
    }
    
    logger.info('[Security] Token refreshed successfully');
  } catch (error) {
    logger.error('[Security] Error refreshing token:', error);
  }
}

/**
 * Utility to extract token expiration time from a JWT
 * 
 * @param token JWT token string
 * @returns Number representing expiry timestamp in seconds, or null if invalid
 */
export function getTokenExpiryTime(token: string): number | null {
  try {
    if (!token) return null;
    
    // JWT tokens have three segments separated by dots
    const segments = token.split('.');
    if (segments.length !== 3) {
      logger.warn('[Security] Invalid JWT format');
      return null;
    }
    
    // Decode the JWT payload (second segment)
    const payload = JSON.parse(atob(segments[1]));
    
    // Check for exp claim
    if (!payload.exp) {
      logger.warn('[Security] JWT has no expiry claim');
      return null;
    }
    
    return payload.exp;
  } catch (error) {
    logger.error('[Security] Error parsing JWT:', error);
    return null;
  }
}

/**
 * Sets up a background refresh timer to ensure tokens stay fresh
 * 
 * @param intervalMinutes How often to check for token refresh need (in minutes)
 * @returns Interval ID for cleanup
 */
export function setupTokenRefreshTimer(intervalMinutes = 5): NodeJS.Timeout {
  try {
    // Check if we have a session before setting up timer
    const hasSessionData = localStorage.getItem('dailyfix_auth');
    if (!hasSessionData) {
      logger.info('[Security] No auth data found, skipping token refresh timer setup');
      // Return a dummy timer
      return setTimeout(() => {}, 1000 * 60 * 60); // Return a dummy 1-hour timeout
    }

    logger.info(`[Security] Setting up token refresh timer (every ${intervalMinutes} minutes)`);
    
    // Convert minutes to milliseconds
    const intervalMs = intervalMinutes * 60 * 1000;
    
    // Set up interval to refresh token
    const intervalId = setInterval(async () => {
      // Only trigger refresh if we still have auth data
      const currentAuthData = localStorage.getItem('dailyfix_auth');
      if (!currentAuthData) {
        logger.info('[Security] No auth data found on timer tick, skipping refresh');
        return;
      }
      
      logger.debug('[Security] Token refresh timer triggered');
      await refreshTokenIfNeeded();
    }, intervalMs);
    
    return intervalId;
  } catch (error) {
    logger.error('[Security] Error setting up token refresh timer:', error);
    // Return a dummy timer ID
    return setTimeout(() => {}, 0);
  }
}

/**
 * Initializes all security features
 * Call this once during app initialization
 */
export function initializeAuthSecurity(): void {
  try {
    logger.info('[Security] Initializing auth security measures');
    
    // Set up CSP
    setupCSP();
    
    // Set up token refresh timer
    setupTokenRefreshTimer();
    
    logger.info('[Security] Auth security measures initialized');
  } catch (error) {
    logger.error('[Security] Error initializing auth security:', error);
  }
}

// Define CSP headers
const DEFAULT_CSP = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:;
  font-src 'self' data:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'self';
  connect-src 'self' https://*.supabase.co wss://*.supabase.co ws://localhost:* wss://localhost:* http://localhost:* https://localhost:* https://api.dailyfix.app https://*.googleapis.com ws://* wss://*;
  upgrade-insecure-requests;
`; 