import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getSupabaseClient } from '@/utils/supabase';
import { tokenManager } from '@/utils/tokenManager';
import { fetchOnboardingStatus } from './onboardingSlice';
import logger from '@/utils/logger';
import authService from '../../services/authService';
import { initiateGoogleSignIn } from '@/utils/googleAuth';

// Define the state interface
interface AuthState {
  session: any | null;
  user: any | null;
  loading: boolean;
  error: string | null;
  initializing: boolean;
  hasInitialized: boolean;
  matrixCredentials: any | null;
  onboardingFetching: boolean;
  googleAuthPending: boolean;
}

// Initial state
const initialState: AuthState = {
  session: null,
  user: null,
  loading: false,
  error: null,
  initializing: false,
  hasInitialized: false,
  matrixCredentials: null,
  onboardingFetching: false,
  googleAuthPending: false
};

// Async thunks
export const signInWithGoogle = createAsyncThunk(
  'auth/signInWithGoogle',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      dispatch(setGoogleAuthPending(true));
      await initiateGoogleSignIn();
      // Note: The actual authentication will be handled by the redirect
      // We're not returning anything here as the page will be redirected
      return null;
    } catch (error) {
      logger.error('[Auth] Google sign-in error:', error);
      dispatch(setGoogleAuthPending(false));
      return rejectWithValue(error.message || 'Failed to sign in with Google');
    }
  }
);

export const signIn = createAsyncThunk(
  'auth/signIn',
  async ({ email, password }: { email: string; password: string }, { rejectWithValue }) => {
    try {
      logger.info('[Auth] Signing in with email');
      
      // Get the Supabase client
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Authentication service is not available');
      }
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      return data;
    } catch (error: any) {
      logger.error('[Auth] Sign in error:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const signUp = createAsyncThunk(
  'auth/signUp',
  async ({ email, password }: { email: string; password: string }, { rejectWithValue }) => {
    try {
      logger.info('[Auth] Signing up with email');
      
      // Get the Supabase client
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Authentication service is not available');
      }
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });

      if (error) throw error;
      return data;
    } catch (error: any) {
      logger.error('[Auth] Sign up error:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const signOut = createAsyncThunk(
  'auth/signOut',
  async (_, { rejectWithValue }) => {
    try {
      logger.info('[Auth] Signing out');
      
      // Set a flag to indicate this is an intentional logout, not a session expiration
      localStorage.setItem('intentional_logout', 'true');
      
      // Import socket cleanup functions here to avoid circular dependencies
      const { disconnectSocket } = await import('@/utils/socket');
      const { cleanupSocket } = await import('@/utils/socketManager');
      
      // Clean up all socket connections
      try {
        logger.info('[Auth] Cleaning up socket connections during logout');
        
        // Disconnect the main socket
        await disconnectSocket();
        
        // Also use the socketManager cleanup
        cleanupSocket();
        
        // Clean up any tracked sockets in the window object
        if (typeof window !== 'undefined' && window._socketConnections) {
          logger.info(`[Auth] Cleaning up ${window._socketConnections.length} tracked socket connections`);
          
          // Disconnect all tracked sockets
          for (const socket of window._socketConnections) {
            if (socket && typeof socket.disconnect === 'function') {
              socket.removeAllListeners();
              socket.disconnect();
            }
          }
          
          // Clear the array
          window._socketConnections = [];
        }
      } catch (socketError) {
        logger.error('[Auth] Error cleaning up sockets during logout:', socketError);
        // Continue with logout even if socket cleanup fails
      }
      
      // Get the Supabase client
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Authentication service is not available');
      }
      
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // Clear auth data from localStorage
      localStorage.removeItem('dailyfix_auth');
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      localStorage.removeItem('dailyfix_active_platform');
      
      // Remove the intentional logout flag after a short delay
      setTimeout(() => {
        localStorage.removeItem('intentional_logout');
      }, 2000);
      
      logger.info('[Auth] Successfully signed out and cleared local storage');
      return null;
    } catch (error: any) {
      logger.error('[Auth] Sign out error:', error);
      
      // Even if the API call fails, still clear local storage
      localStorage.removeItem('dailyfix_auth');
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      localStorage.removeItem('dailyfix_active_platform');
      
      // Remove the intentional logout flag
      localStorage.removeItem('intentional_logout');
      
      return rejectWithValue(error.message);
    }
  }
);

export const resetPassword = createAsyncThunk(
  'auth/resetPassword',
  async (email: string, { rejectWithValue }) => {
    try {
      logger.info('[Auth] Sending password reset email');
      
      // Get the Supabase client
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Authentication service is not available');
      }
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      
      if (error) throw error;
      return true;
    } catch (error: any) {
      logger.error('[Auth] Password reset error:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const getSession = createAsyncThunk(
  'auth/getSession',
  async (_, { rejectWithValue }) => {
    try {
      logger.info('[Auth] Getting current session');
      
      // Get the Supabase client
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Authentication service is not available');
      }
      
      const { data, error } = await supabase.auth.getSession();
      
      if (error) throw error;
      return data;
    } catch (error: any) {
      logger.error('[Auth] Get session error:', error);
      return rejectWithValue(error.message);
    }
  }
);

// Auth slice
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    updateSession(state, action) {
      state.session = action.payload.session;
      state.user = action.payload.user || null;
      state.loading = false;
      state.error = null;
      state.hasInitialized = true;
      state.initializing = false;

      // Log session update
      logger.info('[AuthSlice] Session updated:', {
        hasSession: !!state.session,
        userId: state.user?.id
      });
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
      state.loading = false;
    },
    setInitializing: (state, action) => {
      state.initializing = action.payload;
    },
    setHasInitialized: (state, action) => {
      state.hasInitialized = action.payload;
    },
    updateMatrixCredentials: (state, action) => {
      state.matrixCredentials = action.payload;
    },
    clearAuth: (state) => {
      state.session = null;
      state.user = null;
      state.loading = false;
      state.error = null;
      state.matrixCredentials = null;
      tokenManager.clearTokens();
    },
    setOnboardingFetching: (state, action) => {
      state.onboardingFetching = action.payload;
    },
    setGoogleAuthPending: (state, action) => {
      state.googleAuthPending = action.payload;
    }
  },
  extraReducers: (builder) => {
    // Sign in
    builder.addCase(signIn.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(signIn.fulfilled, (state, action) => {
      state.loading = false;
      state.session = action.payload.session;
      state.user = action.payload.user;
      state.error = null;
      state.hasInitialized = true;
    });
    builder.addCase(signIn.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
      state.session = null;
      state.user = null;
    });

    // Sign up
    builder.addCase(signUp.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(signUp.fulfilled, (state, action) => {
      state.loading = false;
      state.session = action.payload.session;
      state.error = null;
    });
    builder.addCase(signUp.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // Sign out
    builder.addCase(signOut.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(signOut.fulfilled, (state) => {
      state.loading = false;
      state.session = null;
      state.user = null;
      state.error = null;
      state.matrixCredentials = null;
      state.hasInitialized = false;
    });
    builder.addCase(signOut.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
      // Even if the API call fails, still clear the auth state
      state.session = null;
      state.user = null;
      state.matrixCredentials = null;
      state.hasInitialized = false;
    });

    // Google sign-in
    builder.addCase(signInWithGoogle.pending, (state) => {
      state.googleAuthPending = true;
      state.error = null;
    });
    builder.addCase(signInWithGoogle.fulfilled, (state) => {
      state.googleAuthPending = false;
      // Session will be set in the callback handler
    });
    builder.addCase(signInWithGoogle.rejected, (state, action) => {
      state.googleAuthPending = false;
      state.error = action.payload as string;
    });

    // Password reset
    builder.addCase(resetPassword.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(resetPassword.fulfilled, (state) => {
      state.loading = false;
    });
    builder.addCase(resetPassword.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // Get session
    builder.addCase(getSession.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(getSession.fulfilled, (state, action) => {
      state.loading = false;
      state.session = action.payload.session;
    });
    builder.addCase(getSession.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // Add case for fetchOnboardingStatus
    builder.addCase(fetchOnboardingStatus.pending, (state) => {
      state.onboardingFetching = true;
    });
    builder.addCase(fetchOnboardingStatus.fulfilled, (state, action) => {
      state.onboardingFetching = false;
      if (action.payload?.matrixCredentials) {
        state.matrixCredentials = action.payload.matrixCredentials;
      }
    });
    builder.addCase(fetchOnboardingStatus.rejected, (state) => {
      state.onboardingFetching = false;
    });
  }
});

export const {
  updateSession,
  setLoading,
  setError,
  setInitializing,
  setHasInitialized,
  updateMatrixCredentials,
  clearAuth,
  setOnboardingFetching,
  setGoogleAuthPending
} = authSlice.actions;

export const selectSession = (state: any) => state.auth.session;
export const selectUser = (state: any) => state.auth.user;
export const selectIsLoading = (state: any) => state.auth.loading;
export const selectError = (state: any) => state.auth.error;
export const selectIsInitializing = (state: any) => state.auth.initializing;
export const selectHasInitialized = (state: any) => state.auth.hasInitialized;
export const selectMatrixCredentials = (state: any) => state.auth.matrixCredentials;
export const selectGoogleAuthPending = (state: any) => state.auth.googleAuthPending;

export const authReducer = authSlice.reducer;