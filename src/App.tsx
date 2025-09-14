import { useState, useEffect, useRef } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import '@/index.css';

// Import our components
import AppRoutes from '@/routes/AppRoutes';
import ThemeProvider from '@/providers/ThemeProvider';
import StoreProvider from '@/providers/StoreProvider';
import SessionExpiredModal from '@/components/modals/SessionExpiredModal';
import SessionManager from '@/components/SessionManager';
import SessionExpirationHandler from '@/components/SessionExpirationHandler';
import DebugPanel from '@/components/DebugPanel';
import { useLogger } from '@/hooks/useLogger';
import { initializeAuthSecurity } from '@/utils/authSecurityHelpers';

// Global initialization flag to prevent multiple security initializations
// across hot reloads and strict mode
let securityInitialized = false;
let appInitialized = false;

function App() {
  const logger = useLogger();
  const [showSessionExpiredModal, setShowSessionExpiredModal] = useState<boolean>(false);
  const [appReadyState, setAppReadyState] = useState<'initializing' | 'loading' | 'ready'>(
    appInitialized ? 'ready' : 'initializing'
  );
  const appStartTimeRef = useRef(Date.now());
  const emergencyTimerRef = useRef<any>(null);
  const [hasInitializedSecurity, setHasInitializedSecurity] = useState(securityInitialized);
  const [showEmergencyNav, setShowEmergencyNav] = useState(false);

  // Initialize auth security features once on app load
  useEffect(() => {
    // CRITICAL FIX: Use both local and global flags to prevent multiple initializations
    if (hasInitializedSecurity || securityInitialized) {
      return;
    }
    
    logger.info('[App] Initializing security features (one-time)');
    securityInitialized = true;
    setHasInitializedSecurity(true);
    
    try {
      initializeAuthSecurity();
      // Set app to loading state after initialization
      setAppReadyState('loading');
    } catch (error) {
      logger.error('[App] Error initializing security features:', error);
      // Still move to loading state even on error to prevent getting stuck
      setAppReadyState('loading');
    }
  }, [logger, hasInitializedSecurity]);
  
  // CRITICAL FIX: Improved emergency timeout for completely stuck applications
  useEffect(() => {
    // Skip if app is already ready
    if (appReadyState === 'ready' || appInitialized) {
      return;
    }
    
    // Clear any existing timer to prevent duplicate timers
    if (emergencyTimerRef.current) {
      clearTimeout(emergencyTimerRef.current);
    }
    
    // If app doesn't become ready in 8 seconds (reduced from 10), show emergency navigation
    emergencyTimerRef.current = setTimeout(() => {
      const timeElapsed = Date.now() - appStartTimeRef.current;
      logger.error(`[App] CRITICAL: Application has been stuck for ${timeElapsed}ms. Showing emergency navigation.`);
      
      // Show emergency navigation instead of forcing reload/navigation
      setShowEmergencyNav(true);
    }, 8000);
    
    return () => {
      if (emergencyTimerRef.current) {
        clearTimeout(emergencyTimerRef.current);
        emergencyTimerRef.current = null;
      }
    };
  }, [appReadyState, logger]);
  
  // Mark app as ready after initial render
  useEffect(() => {
    if (appReadyState === 'loading' && !appInitialized) {
      const readyTimer = setTimeout(() => {
        setAppReadyState('ready');
        appInitialized = true;
        logger.info('[App] Application marked as ready');
        
        // Clear emergency timer once app is ready
        if (emergencyTimerRef.current) {
          clearTimeout(emergencyTimerRef.current);
          emergencyTimerRef.current = null;
        }
      }, 500); // Reduced from 1000ms to 500ms for faster initialization
      
      return () => {
        clearTimeout(readyTimer);
      };
    }
  }, [appReadyState, logger]);

  // Listen for the custom sessionExpired event
  useEffect(() => {
    const handleSessionExpired = (event: CustomEvent) => {
      logger.info('[App] Session expired event received:', event.detail);
      
      // Check if this is an intentional logout
      const isIntentionalLogout = localStorage.getItem('intentional_logout') === 'true';
      
      if (!isIntentionalLogout) {
        // Only show the session expired modal if it's not an intentional logout
        logger.info('[App] Showing session expired modal');
        setShowSessionExpiredModal(true);
      } else {
        logger.info('[App] Intentional logout detected, not showing session expired modal');
      }
    };

    // Add event listener
    window.addEventListener('sessionExpired', handleSessionExpired as EventListener);

    // Cleanup
    return () => {
      window.removeEventListener('sessionExpired', handleSessionExpired as EventListener);
    };
  }, [logger]);

  // Handle modal close
  const handleModalClose = () => {
    setShowSessionExpiredModal(false);
  };

  // Only render emergency navigation when needed and in development mode
  const renderEmergencyNavigation = () => {
    if (!showEmergencyNav || process.env.NODE_ENV !== 'development') return null;
    
    return (
      <div 
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 9999,
          background: '#f44336',
          padding: '10px',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        <h4 style={{ margin: 0 }}>Emergency Navigation</h4>
        <button 
          onClick={() => {
            setShowEmergencyNav(false);
            window.location.href = '/login';
          }}
          style={{ cursor: 'pointer', padding: '5px', borderRadius: '4px' }}
        >
          Login Page
        </button>
        <button 
          onClick={() => {
            setShowEmergencyNav(false);
            window.location.href = '/onboarding';
          }}
          style={{ cursor: 'pointer', padding: '5px', borderRadius: '4px' }}
        >
          Onboarding
        </button>
        <button 
          onClick={() => {
            setShowEmergencyNav(false);
            window.location.href = '/dashboard';
          }}
          style={{ cursor: 'pointer', padding: '5px', borderRadius: '4px' }}
        >
          Dashboard
        </button>
        <button 
          onClick={() => {
            setShowEmergencyNav(false);
            window.location.reload();
          }}
          style={{ cursor: 'pointer', padding: '5px', borderRadius: '4px' }}
        >
          Reload Page
        </button>
        <button 
          onClick={() => setShowEmergencyNav(false)}
          style={{ cursor: 'pointer', padding: '5px', borderRadius: '4px', background: '#333' }}
        >
          Dismiss
        </button>
      </div>
    );
  };

  return (
    <StoreProvider>
      <ThemeProvider>
        <BrowserRouter>
          {/* Session expired modal */}
          <SessionExpiredModal
            isOpen={showSessionExpiredModal}
            onClose={handleModalClose}
          />

          <Toaster position="top-center" closeButton />
          
          <SessionManager>
            <SessionExpirationHandler />
            <AppRoutes />
            {/* Debug panel only in development mode */}
            {/* {process.env.NODE_ENV === 'development' && <DebugPanel />} */}
          </SessionManager>
          
          {/* Emergency navigation buttons - only shown when needed */}
          {renderEmergencyNavigation()}
        </BrowserRouter>
      </ThemeProvider>
    </StoreProvider>
  );
}

export default App;
