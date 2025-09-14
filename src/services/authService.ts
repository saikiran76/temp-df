import { getSupabaseClient } from '../utils/supabase';
import { tokenManager } from '../utils/tokenManager';
import logger from '../utils/logger';
import { getGoogleAuthUrl } from '../utils/googleAuth';

logger.info('AuthService module loaded');

class AuthService {
    initialized: boolean;
    initPromise: Promise<void> | null;
    lastSessionCheck: number;
    SESSION_CHECK_COOLDOWN: number;
    SESSION_EXPIRY_HOURS: number;

    constructor() {
        this.initialized = false;
        this.initPromise = null;
        this.lastSessionCheck = 0;
        this.SESSION_CHECK_COOLDOWN = 5000; // 5 seconds
        this.SESSION_EXPIRY_HOURS = 5; // 5 hours session persistence
    }

    // Helper method to standardize session storage
    async storeSessionData(session: any) {
        if (!session?.access_token || !session?.refresh_token || !session?.user) {
            throw new Error('Invalid session data for storage');
        }

        const expiryTime = new Date();
        expiryTime.setHours(expiryTime.getHours() + this.SESSION_EXPIRY_HOURS);

        const expires_at = session.expires_at || expiryTime.toISOString();

        const storageData = {
            session: {
                access_token: session.access_token,
                refresh_token: session.refresh_token,
                expires_at: expires_at,
                provider_token: session.provider_token,
                provider_refresh_token: session.provider_refresh_token,
                user: session.user
            },
            user: session.user,
            last_active: new Date().toISOString()
        };

        try {
            localStorage.setItem('dailyfix_auth', JSON.stringify(storageData));
            localStorage.setItem('access_token', session.access_token);
            localStorage.setItem('session_expiry', expires_at);
            
            const supabase = getSupabaseClient();
            if (supabase) {
                const { data: accounts, error } = await supabase
                                .from('accounts')
                                .select('*')
                                .eq('user_id', session.user.id)
                                .eq('platform', 'matrix')
                                .maybeSingle();
                if (!error && accounts) {
                    const matrixCreds = (accounts as any).credentials;
                    localStorage.setItem('matrix_credentials', JSON.stringify(matrixCreds));
                    logger.info('[AuthService] Matrix credentials stored successfully');
                }
            }
            logger.info('[AuthService] Session stored successfully, expires:', expires_at);
            return true;
        } catch (error) {
            logger.error('[AuthService] Failed to store session data:', error);
            return false;
        }
    }

    clearSessionData(clearCredentials = false) {
        try {
            localStorage.removeItem('dailyfix_auth');
            localStorage.removeItem('access_token');
            localStorage.removeItem('session_expiry');
            localStorage.removeItem('matrix_credentials');

            if (clearCredentials) {
                localStorage.removeItem('dailyfix_credentials');
                logger.info('[AuthService] Stored credentials cleared');
            }

            tokenManager.clearTokens();
            logger.info('[AuthService] Session data cleared successfully');
        } catch (error) {
            logger.error('[AuthService] Error clearing session data:', error);
        }
    }

    async initialize() {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = (async () => {
            if (this.initialized) {
                return;
            }

            const supabase = getSupabaseClient();
            if (!supabase) {
                logger.error('[AuthService] Supabase client not available for initialization');
                return;
            }
            
            supabase.auth.onAuthStateChange(async (event, session) => {
                logger.info('[AuthService] Auth state changed:', event);
                if (event === 'SIGNED_IN' && session) {
                    await this.storeSessionData(session);
                } else if (event === 'SIGNED_OUT') {
                    this.clearSessionData();
                }
            });

            await this.validateSession();
            this.initialized = true;
        })();
        
        try {
            return await this.initPromise;
        } catch (error) {
            logger.error('[AuthService] Initialization error:', error);
            throw error;
        } finally {
            this.initPromise = null;
        }
    }
    
    async validateSession(force = false) {
        try {
            if (!force && Date.now() - this.lastSessionCheck < this.SESSION_CHECK_COOLDOWN) {
                return null;
            }
            this.lastSessionCheck = Date.now();

            const supabase = getSupabaseClient();
            if (!supabase) {
                logger.error('[AuthService] Supabase client not available for session validation');
                return null;
            }
            
            const authDataStr = localStorage.getItem('dailyfix_auth');
            if (authDataStr) {
                 try {
                    const authData = JSON.parse(authDataStr);
                    const expiryStr = authData.session?.expires_at || localStorage.getItem('session_expiry');
                    const now = new Date();
                    const expiryTime = expiryStr ? new Date(expiryStr) : null;
                    const isSessionValid = expiryTime && expiryTime > now;

                    if (isSessionValid && authData.session?.access_token) {
                        const { data: { user }, error: validateError } = await supabase.auth.getUser(authData.session.access_token);
                        if (!validateError && user) {
                            authData.last_active = new Date().toISOString();
                            localStorage.setItem('dailyfix_auth', JSON.stringify(authData));
                            return { session: authData.session, user };
                        }
                    }
                } catch (parseError) {
                    logger.error('[AuthService] Error parsing stored auth data:', parseError);
                    this.clearSessionData();
                }
            }

            const { data: { session }, error } = await supabase.auth.getSession();
            if (error || !session) {
                const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
                if (refreshError || !refreshedSession) {
                    this.clearSessionData();
                    return null;
                }
                await this.storeSessionData(refreshedSession);
                return refreshedSession;
            }

            await this.storeSessionData(session);
            return session;
        } catch (error) {
            logger.error('[AuthService] Session validation error:', error);
            this.clearSessionData();
            return null;
        }
    }
    
    async storeCredentials(email, password) {
        try {
            const credentials = { email, password, timestamp: Date.now() };
            localStorage.setItem('dailyfix_credentials', JSON.stringify(credentials));
            logger.info('[AuthService] Credentials stored for recovery');
            return true;
        } catch (error) {
            logger.error('[AuthService] Error storing credentials:', error);
            return false;
        }
    }

    async signIn(email, password) {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error('Supabase not initialized');
        
        try {
            const { data: { session }, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            if (!session) throw new Error('Sign-in successful, but no session returned.');
            
            await this.storeCredentials(email, password);
            await this.storeSessionData(session);

            return { session, user: session.user };
        } catch (error) {
            logger.error('[AuthService] Sign-in error:', error);
            throw error;
        }
    }

    async signOut() {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error('Supabase not initialized');

        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            this.clearSessionData(true);
        } catch (error) {
            logger.error('[AuthService] Sign-out error:', error);
            this.clearSessionData(true);
            throw error;
        }
    }

    async getGoogleSignInUrl() {
        try {
            return getGoogleAuthUrl();
        } catch (error) {
            logger.error('[AuthService] Error getting Google sign-in URL:', error);
            throw error;
        }
    }

    async processGoogleSession(session: any) {
        try {
            await this.storeSessionData(session);
            return { session, user: session.user };
        } catch (error) {
            logger.error('[AuthService] Error processing Google session:', error);
            throw error;
        }
    }
}

const authService = new AuthService();
export default authService;