import { useState, useEffect } from 'react';
import '@/index.css'
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, Images, HelpCircle, BookOpen, Shield, AlertTriangle } from "lucide-react";
import platformManager from '@/services/PlatformManager';
import { useSelector } from 'react-redux';
import WhatsAppBridgeSetup, { resetWhatsappSetupFlags } from '@/components/platforms/whatsapp/whatsappBridgeSetup';
import { toast } from 'react-hot-toast';
import api from '@/utils/api';
import { saveWhatsAppStatus, saveTelegramStatus, saveInstagramStatus, saveLinkedInStatus } from '@/utils/connectionStorage';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import TelegramBridgeSetup, { resetTelegramSetupFlags } from './platforms/telegram/telegramBridgeSetup';
import InstagramBridgeSetup, { resetInstagramSetupFlags } from './platforms/instagram/instagramBridgeSetup';
import LinkedInBridgeSetup, { resetLinkedInSetupFlags } from './platforms/linkedin/linkedinBridgeSetup';
import logger from '@/utils/logger';
import { useDispatch } from 'react-redux';
import { setWhatsappConnected, setTelegramConnected } from '@/store/slices/onboardingSlice';
import ChatBackgroundSettings from '@/components/ui/ChatBackgroundSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import ThemeToggle from "@/components/ui/ThemeToggle";
import LinkedinSettingsImage from '@/images/LinkedinSettings.png';

// Define the component for the platform list item
const PlatformItem = ({ 
  platform, 
  isConnected, 
  onToggle, 
  logo, 
  title, 
  subtitle,
  requiresAuth,
  isInitializing,
  isDisconnecting,
  disabled,
  platformDisabled,
  onStatusCheck,
  onLogout,
  isCheckingStatus
}: { 
  platform: string; 
  isConnected: boolean; 
  onToggle: (platform: string, enabled: boolean) => void;
  logo: React.ReactNode;
  title: string;
  subtitle: string;
  requiresAuth?: boolean;
  isInitializing?: boolean;
  isDisconnecting?: boolean;
  disabled?: boolean;
  platformDisabled?: boolean;
  onStatusCheck?: (platform: string) => void;
  onLogout?: (platform: string) => void;
  isCheckingStatus?: boolean;
}) => {
  return (
    <div className={`flex items-center justify-between px-4 py-6 ${platformDisabled ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-muted text-foreground">
          {logo}
        </div>
        <div>
          <h3 className="text-base font-medium text-foreground">{title}</h3>
          <p className={`text-sm ${platformDisabled ? 'text-orange-400' : 'text-muted-foreground'}`}>
            {subtitle}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {platformDisabled && (
          <span className="text-sm text-orange-500 mr-2">Temporarily unavailable</span>
        )}
        {requiresAuth && !isConnected && !platformDisabled && (
          <span className="text-sm text-yellow-500 mr-2">Auth required</span>
        )}
        {isConnected && !platformDisabled && (
          <>
            <span className="text-sm text-green-500 mr-2">(Connected)</span>
            {onStatusCheck && (
              <Button
                onClick={() => onStatusCheck(platform)}
                disabled={isCheckingStatus || disabled}
                variant="outline"
                size="sm"
                className="text-xs mr-2"
              >
                {isCheckingStatus ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Checking...
                  </>
                ) : (
                  'Check Status'
                )}
              </Button>
            )}
            {onLogout && (
              <Button
                onClick={() => onLogout(platform)}
                disabled={isDisconnecting || disabled}
                variant="destructive"
                size="sm"
                className="text-xs mr-2"
              >
                {isDisconnecting ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Logging out...
                  </>
                ) : (
                  'Logout'
                )}
              </Button>
            )}
          </>
        )}
        {isInitializing && !platformDisabled && (
          <Loader2 className="h-4 w-4 text-blue-500 animate-spin mr-2" />
        )}
        {disabled && !isInitializing && !isDisconnecting && !platformDisabled && (
          <span className="text-sm text-muted-foreground mr-2">Setup in progress</span>
        )}
        <Checkbox 
          id={`toggle-${platform}`}
          checked={isConnected}
          onCheckedChange={(checked) => onToggle(platform, checked as boolean)}
          className="data-[state=checked]:bg-blue-600"
          disabled={disabled || isInitializing || isDisconnecting || platformDisabled}
        />
      </div>
    </div>
  );
};

// Main settings component
const PlatformSettings = () => {
  const [availablePlatforms] = useState(platformManager.availablePlatforms);
  const [activePlatforms, setActivePlatforms] = useState<string[]>(platformManager.getAllActivePlatforms());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [initializingPlatform, setInitializingPlatform] = useState<string | null>(null);
  const [showWhatsAppSetup, setShowWhatsAppSetup] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [disconnectingPlatform, setDisconnectingPlatform] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showTelegramSetup, setShowTelegramSetup] = useState(false);
  const [showInstagramSetup, setShowInstagramSetup] = useState(false);
  const [showLinkedInSetup, setShowLinkedInSetup] = useState(false);
  const [showWhatsAppBackgroundSettings, setShowWhatsAppBackgroundSettings] = useState(false);
  const [showTelegramBackgroundSettings, setShowTelegramBackgroundSettings] = useState(false);
  
  // NEW: State for platform status checking
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [checkingPlatform, setCheckingPlatform] = useState<string | null>(null);
  
  // NEW: State for acknowledgment sheet
  const [showAcknowledgmentSheet, setShowAcknowledgmentSheet] = useState(false);
  const [acknowledgedPlatform, setAcknowledgedPlatform] = useState<string | null>(null);
  const [acknowledgmentChecks, setAcknowledgmentChecks] = useState({
    syncDelay: false,
    protocolUpgrade: false,
    refreshRequired: false
  });
  
  // NEW: State for platform guidance alerts
  const [showWhatsAppGuidance, setShowWhatsAppGuidance] = useState(false);
  const [showTelegramGuidance, setShowTelegramGuidance] = useState(false);
  const [showInstagramGuidance, setShowInstagramGuidance] = useState(false);
  const [showLinkedInGuidance, setShowLinkedInGuidance] = useState(false);
  
  // Get onboarding state from Redux for connection status
  const onboardingState = useSelector((state: any) => state.onboarding);
  const { session } = useSelector((state: any) => state.auth);
  
  // Check connection status on mount and after actions
  useEffect(() => {
    const updateConnectionStatus = () => {
      setActivePlatforms(platformManager.getAllActivePlatforms());
    };
    
    updateConnectionStatus();
    
    // Add event listener for connection status changes
    window.addEventListener('platform-connection-changed', updateConnectionStatus);
    
    return () => {
      window.removeEventListener('platform-connection-changed', updateConnectionStatus);
    };
  }, []);

  // Handle disconnecting WhatsApp
  const handleDisconnectWhatsApp = async () => {
    if (!session?.user?.id) {
      toast.error('You must be logged in to disconnect WhatsApp');
      return;
    }
    
    setIsDisconnecting(true);
    
    try {
      // Call the disconnect API
      const response = await api.post('/api/v1/matrix/whatsapp/disconnect');
      
      // Handle successful disconnect
      if (response.data && (response.data.status === 'success' || response.status === 200)) {
        // Update local storage
        saveWhatsAppStatus(false, session.user.id);
        
        // Update the active platforms list
        platformManager.cleanupPlatform('whatsapp');
        setActivePlatforms(platformManager.getAllActivePlatforms());
        
        // Show success message
        toast.success('WhatsApp disconnected successfully');
        
        // Dispatch an event to notify other components
        window.dispatchEvent(new CustomEvent('platform-connection-changed'));
      } else {
        toast.error('Failed to disconnect WhatsApp: ' + (response.data?.message || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Error disconnecting WhatsApp:', error);
      toast.error(error?.response?.data?.message || error?.message || 'Failed to disconnect WhatsApp');
    } finally {
      setIsDisconnecting(false);
      setShowDisconnectDialog(false);
      setDisconnectingPlatform(null);
    }
  };

  // Handle disconnecting Telegram
  const handleDisconnectTelegram = async () => {
    if (!session?.user?.id) {
      toast.error('You must be logged in to disconnect Telegram');
      return;
    }
    
    setIsDisconnecting(true);
    
    try {
      // Call the disconnect API
      const response = await api.post('/api/v1/matrix/telegram/disconnect');
      
      // Handle successful disconnect
      if (response.data && (response.data.status === 'success' || response.status === 200)) {
        // Update local storage
        saveTelegramStatus(false, session.user.id);
        
        // Update the active platforms list
        platformManager.cleanupPlatform('telegram');
        setActivePlatforms(platformManager.getAllActivePlatforms());
        
        // Show success message
        toast.success('Telegram disconnected successfully');
        
        // Dispatch an event to notify other components
        window.dispatchEvent(new CustomEvent('platform-connection-changed'));
      } else {
        toast.error('Failed to disconnect Telegram: ' + (response.data?.message || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Error disconnecting Telegram:', error);
      toast.error(error?.response?.data?.message || error?.message || 'Failed to disconnect Telegram');
    } finally {
      setIsDisconnecting(false);
      setShowDisconnectDialog(false);
      setDisconnectingPlatform(null);
    }
  };

  // Handle disconnecting Instagram
  const handleDisconnectInstagram = async () => {
    if (!session?.user?.id) {
      toast.error('You must be logged in to disconnect Instagram');
      return;
    }
    
    setIsDisconnecting(true);
    
    try {
      // Call the disconnect API
      const response = await api.post('/api/v1/matrix/instagram/disconnect');
      
      // Handle successful disconnect
      if (response.data && (response.data.status === 'success' || response.status === 200)) {
        // Update local storage
        saveInstagramStatus(false, session.user.id);
        
        // Update the active platforms list
        platformManager.cleanupPlatform('instagram');
        setActivePlatforms(platformManager.getAllActivePlatforms());
        
        // Show success message
        toast.success('Instagram disconnected successfully');
        
        // Dispatch an event to notify other components
        window.dispatchEvent(new CustomEvent('platform-connection-changed'));
      } else {
        toast.error('Failed to disconnect Instagram: ' + (response.data?.message || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Error disconnecting Instagram:', error);
      toast.error(error?.response?.data?.message || error?.message || 'Failed to disconnect Instagram');
    } finally {
      setIsDisconnecting(false);
      setShowDisconnectDialog(false);
      setDisconnectingPlatform(null);
    }
  };

  // Handle disconnecting LinkedIn
  const handleDisconnectLinkedIn = async () => {
    if (!session?.user?.id) {
      toast.error('You must be logged in to disconnect LinkedIn');
      return;
    }
    
    setIsDisconnecting(true);
    
    try {
      // Call the disconnect API
      const response = await api.post('/api/v1/matrix/linkedin/disconnect');
      
      // Handle successful disconnect
      if (response.data && (response.data.status === 'success' || response.status === 200)) {
        // Update local storage
        saveLinkedInStatus(false, session.user.id);
        
        // Update the active platforms list
        platformManager.cleanupPlatform('linkedin');
        setActivePlatforms(platformManager.getAllActivePlatforms());
        
        // Show success message
        toast.success('LinkedIn disconnected successfully');
        
        // Dispatch an event to notify other components
        window.dispatchEvent(new CustomEvent('platform-connection-changed'));
      } else {
        toast.error('Failed to disconnect LinkedIn: ' + (response.data?.message || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Error disconnecting LinkedIn:', error);
      toast.error(error?.response?.data?.message || error?.message || 'Failed to disconnect LinkedIn');
    } finally {
      setIsDisconnecting(false);
      setShowDisconnectDialog(false);
      setDisconnectingPlatform(null);
    }
  };

  // Handle toggling a platform on/off
  const handleTogglePlatform = async (platform: string, enabled: boolean) => {
    try {
      if (enabled) {
        // Check if platform is disabled (like Instagram)
        const meta = platformMeta[platform as keyof typeof platformMeta];
        if (meta?.disabled) {
          toast.error(`${meta.title} is temporarily unavailable. The 3rd party Matrix protocol is not allowing login currently. We're working to bring it back soon.`);
          return;
        }
        
        // Emit event to MainLayout to show Terms & Conditions sheet
        window.dispatchEvent(new CustomEvent('platform-terms-required', {
          detail: {
            platform: platform,
            timestamp: Date.now()
          }
        }));
        logger.info(`[PlatformSettings] Emitted platform-terms-required event for ${platform}`);
        return;
      } else if (platformManager.isPlatformActive(platform)) {
        // If disabling WhatsApp or Telegram, show confirmation dialog
        if (platform === 'whatsapp') {
          setDisconnectingPlatform(platform);
          setShowDisconnectDialog(true);
          return;
        } else if (platform === 'telegram') {
          setDisconnectingPlatform(platform);
          setShowDisconnectDialog(true);
          return;
        } else if (platform === 'instagram') {
          setDisconnectingPlatform(platform);
          setShowDisconnectDialog(true);
          return;
        } else if (platform === 'linkedin') {
          resetLinkedInSetupFlags(true);
          setShowLinkedInSetup(true);
        }
        
        // For other platforms, clean up directly
        await platformManager.cleanupPlatform(platform);
        setActivePlatforms(platformManager.getAllActivePlatforms());
      }
      
      console.log(`Platform ${platform} ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error(`Error toggling platform ${platform}:`, error);
      toast.error(`Failed to ${enabled ? 'enable' : 'disable'} ${platform}`);
    } finally {
      setInitializingPlatform(null);
    }
  };

  // Handle platform status check
  const handlePlatformStatusCheck = async (platform: string) => {
    setIsCheckingStatus(true);
    setCheckingPlatform(platform);
    
    try {
      // Use the same API verification logic as PlatformSwitcher
      const isConnected = await platformManager.verifyPlatformConnectionRealtime(platform);
      
      if (isConnected) {
        toast.success(`${platform.charAt(0).toUpperCase() + platform.slice(1)} is connected and active`);
      } else {
        toast.error(`${platform.charAt(0).toUpperCase() + platform.slice(1)} connection failed. Please reconnect.`);
        
        // Platform is disconnected - update local storage and states
        if (session?.user?.id) {
          if (platform === 'whatsapp') {
            saveWhatsAppStatus(false, session.user.id);
          } else if (platform === 'telegram') {
            saveTelegramStatus(false, session.user.id);
          } else if (platform === 'instagram') {
            saveInstagramStatus(false, session.user.id);
          } else if (platform === 'linkedin') {
            saveLinkedInStatus(false, session.user.id);
          }
          
          // Clean up platform and update active platforms
          platformManager.cleanupPlatform(platform);
          setActivePlatforms(platformManager.getAllActivePlatforms());
          
          // Dispatch event to notify other components
          window.dispatchEvent(new CustomEvent('platform-connection-changed', {
            detail: {
              platform: platform,
              isActive: false,
              timestamp: Date.now(),
              source: 'status-check-failed'
            }
          }));
        }
      }
    } catch (error) {
      console.error(`Error checking ${platform} status:`, error);
      toast.error(`Failed to check ${platform} status`);
    } finally {
      setIsCheckingStatus(false);
      setCheckingPlatform(null);
    }
  };

  // Generic platform logout handler
  const handlePlatformLogout = (platform: string) => {
    setDisconnectingPlatform(platform);
    setShowDisconnectDialog(true);
  };

  // Auto-scroll to bridge setup when it's shown
  const scrollToBridgeSetup = () => {
    setTimeout(() => {
      const element = document.querySelector('[data-bridge-setup]');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Listen for terms acceptance from MainLayout
  useEffect(() => {
    const handleTermsAccepted = (event: CustomEvent) => {
      const { platform } = event.detail;
      logger.info(`[PlatformSettings] Terms accepted for ${platform}, showing guidance alert`);
      
      // Show guidance alert instead of directly starting setup
      if (platform === 'whatsapp') {
        logger.info('[PlatformSettings] Setting WhatsApp guidance to true');
        setShowWhatsAppGuidance(true);
      } else if (platform === 'telegram') {
        logger.info('[PlatformSettings] Setting Telegram guidance to true');
        setShowTelegramGuidance(true);
      } else if (platform === 'instagram') {
        logger.info('[PlatformSettings] Setting Instagram guidance to true');
        setShowInstagramGuidance(true);
      } else if (platform === 'linkedin') {
        logger.info('[PlatformSettings] Setting LinkedIn guidance to true');
        setShowLinkedInGuidance(true);
      }
    };

    window.addEventListener('platform-terms-accepted', handleTermsAccepted as EventListener);
    
    return () => {
      window.removeEventListener('platform-terms-accepted', handleTermsAccepted as EventListener);
    };
  }, []);

  // Handle refreshing all platform connections
  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    
    try {
      // In a real app, this would make API calls to refresh connections
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network request
      
      // Update the active platforms list
      setActivePlatforms(platformManager.getAllActivePlatforms());
      
      console.log('Refreshed all platform connections');
    } catch (error) {
      console.error('Error refreshing connections:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle acknowledgment sheet completion
  const handleAcknowledgmentComplete = () => {
    setShowAcknowledgmentSheet(false);
    setAcknowledgedPlatform(null);
    setAcknowledgmentChecks({
      syncDelay: false,
      protocolUpgrade: false,
      refreshRequired: false
    });
  };

  // NEW: Guidance handlers
  const handleWhatsAppGuidanceReady = () => {
    setShowWhatsAppGuidance(false);
    setInitializingPlatform('whatsapp');
    setShowWhatsAppSetup(true);
    scrollToBridgeSetup();
  };

  const handleTelegramGuidanceReady = () => {
    setShowTelegramGuidance(false);
    setInitializingPlatform('telegram');
    resetTelegramSetupFlags(true);
    setShowTelegramSetup(true);
    scrollToBridgeSetup();
  };

  const handleInstagramGuidanceReady = () => {
    setShowInstagramGuidance(false);
    setInitializingPlatform('instagram');
    resetInstagramSetupFlags(true);
    setShowInstagramSetup(true);
    scrollToBridgeSetup();
  };

  const handleLinkedInGuidanceReady = () => {
    setShowLinkedInGuidance(false);
    setInitializingPlatform('linkedin');
    resetLinkedInSetupFlags(true);
    setShowLinkedInSetup(true);
    scrollToBridgeSetup();
  };

  const handleGuidanceCancel = () => {
    setShowWhatsAppGuidance(false);
    setShowTelegramGuidance(false);
    setShowInstagramGuidance(false);
    setShowLinkedInGuidance(false);
  };

  // Check if all acknowledgments are checked
  const allAcknowledgmentsChecked = Object.values(acknowledgmentChecks).every(Boolean);

  // Generic platform disconnect handler
  const handleGenericDisconnect = async () => {
    if (!disconnectingPlatform) return;
    
    switch (disconnectingPlatform) {
      case 'whatsapp':
        await handleDisconnectWhatsApp();
        break;
      case 'telegram':
        await handleDisconnectTelegram();
        break;
      case 'instagram':
        await handleDisconnectInstagram();
        break;
      case 'linkedin':
        await handleDisconnectLinkedIn();
        break;
      default:
        toast.error(`Unknown platform: ${disconnectingPlatform}`);
    }
  };

  // Platform-specific metadata
  const platformMeta = {
    'telegram': {
      title: 'Telegram',
      subtitle: 'Connect your Telegram account',
      logo: <span className="text-blue-400 text-xl">T</span>,
      requiresAuth: true
    },
    'whatsapp': {
      title: 'WhatsApp',
      subtitle: '*****',
      logo: <span className="text-green-400 text-xl">W</span>,
      requiresAuth: true
    },
    'instagram': {
      title: 'Instagram',
      subtitle: '3rd party protocol (Matrix) not allowing login currently - coming back soon',
      logo: <span className="text-pink-400 text-xl">I</span>,
      requiresAuth: true,
      disabled: true
    },
    'linkedin': {
      title: 'LinkedIn',
      subtitle: 'Connect via cURL command (Developer)',
      logo: <span className="text-blue-500 text-xl">L</span>,
      requiresAuth: true
    }
  };

  // Calculate if any setup is in progress
  const anySetupInProgress = initializingPlatform !== null || showWhatsAppSetup || showTelegramSetup || isDisconnecting || showDisconnectDialog;

  return (
    <div className="bg-background text-foreground space-y-6">
      <Tabs defaultValue="accounts" className="w-full">
        <TabsList className="grid grid-cols-3 mb-6">
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="help">Help & Tutorial</TabsTrigger>
        </TabsList>
        
        <TabsContent value="accounts">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold uppercase tracking-wide text-foreground">ACCOUNTS</h2>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleRefreshAll} 
              disabled={isRefreshing}
              className="text-sm"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh All
            </Button>
          </div>
          
          <div className="rounded-lg overflow-hidden bg-card border border-border whatsapp-glowing-border">
            {availablePlatforms.map(platform => {
              const meta = platformMeta[platform as keyof typeof platformMeta];
              const isConnected = activePlatforms.includes(platform);
              
              return (
                <PlatformItem
                  key={platform}
                  platform={platform}
                  isConnected={isConnected}
                  onToggle={handleTogglePlatform}
                  logo={meta.logo}
                  title={meta.title}
                  subtitle={meta.subtitle}
                  requiresAuth={meta.requiresAuth}
                  isInitializing={initializingPlatform === platform}
                  isDisconnecting={isDisconnecting && disconnectingPlatform === platform}
                  disabled={anySetupInProgress}
                  platformDisabled={meta.disabled}
                  onStatusCheck={handlePlatformStatusCheck} // Pass handlePlatformStatusCheck for status check
                  onLogout={handlePlatformLogout} // Pass handlePlatformLogout for logout
                  isCheckingStatus={isCheckingStatus} // Pass isCheckingStatus for status check button
                />
              );
            })}
          </div>
          
          <div className="text-sm text-muted-foreground mt-4">
            <p>Connect your messaging platforms to manage all your conversations in one place.</p>
            <p className="mt-2">Platforms may require additional authentication steps to connect.</p>
          </div>
          
          {/* WhatsApp Setup Component */}
          {showWhatsAppSetup && (
            <div className="mt-8" data-bridge-setup>
              <WhatsAppBridgeSetup 
                onComplete={() => {
                  setShowWhatsAppSetup(false);
                  setInitializingPlatform(null);
                  setActivePlatforms(platformManager.getAllActivePlatforms());
                  // Show acknowledgment sheet after successful connection
                  setAcknowledgedPlatform('WhatsApp');
                  setShowAcknowledgmentSheet(true);
                }}
                onCancel={() => {
                  setShowWhatsAppSetup(false);
                  setInitializingPlatform(null);
                  resetWhatsappSetupFlags(true);
                }}
                relogin={false}
              />
            </div>
          )}

          {/* Telegram Setup Component */}
          {showTelegramSetup && (
            <div className="mt-8" data-bridge-setup>
              <TelegramBridgeSetup 
                onComplete={() => {
                  setShowTelegramSetup(false);
                  setInitializingPlatform(null);
                  setActivePlatforms(platformManager.getAllActivePlatforms());
                  // Show acknowledgment sheet after successful connection
                  setAcknowledgedPlatform('Telegram');
                  setShowAcknowledgmentSheet(true);
                }}
                onCancel={() => {
                  setShowTelegramSetup(false);
                  setInitializingPlatform(null);
                  resetTelegramSetupFlags(true);
                }}
                relogin={false}
              />
            </div>
          )}

          {/* Instagram Setup Component */}
          {showInstagramSetup && (
            <div className="mt-8" data-bridge-setup>
              <InstagramBridgeSetup 
                onComplete={() => {
                  setShowInstagramSetup(false);
                  setInitializingPlatform(null);
                  setActivePlatforms(platformManager.getAllActivePlatforms());
                  // Show acknowledgment sheet after successful connection
                  setAcknowledgedPlatform('Instagram');
                  setShowAcknowledgmentSheet(true);
                }}
                onCancel={() => {
                  setShowInstagramSetup(false);
                  setInitializingPlatform(null);
                  resetInstagramSetupFlags(true);
                }}
                relogin={false}
              />
            </div>
          )}
          
          {/* LinkedIn Setup Component */}
          {showLinkedInSetup && (
            <div className="mt-8" data-bridge-setup>
              <LinkedInBridgeSetup 
                onComplete={() => {
                  setShowLinkedInSetup(false);
                  setInitializingPlatform(null);
                  setActivePlatforms(platformManager.getAllActivePlatforms());
                  // Show acknowledgment sheet after successful connection
                  setAcknowledgedPlatform('LinkedIn');
                  setShowAcknowledgmentSheet(true);
                }}
                onCancel={() => {
                  setShowLinkedInSetup(false);
                  setInitializingPlatform(null);
                  resetLinkedInSetupFlags(true);
                }}
              />
            </div>
          )}
          
          {/* Disconnect Confirmation Dialog */}
          <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
            <AlertDialogContent className="bg-background text-foreground border border-border">
              <AlertDialogHeader>
                <AlertDialogTitle>Logout from {disconnectingPlatform?.charAt(0).toUpperCase() + disconnectingPlatform?.slice(1)}</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground">
                  Are you sure you want to logout from this platform? You'll need to reconnect to access your conversations again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleGenericDisconnect}
                  className="bg-red-600 text-white hover:bg-red-700"
                  disabled={isDisconnecting}
                >
                  {isDisconnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Logging out...
                    </>
                  ) : (
                    'Logout'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>
        
        <TabsContent value="appearance">
          <div className="mb-6">
            <h2 className="text-xl font-bold uppercase tracking-wide text-foreground mb-6">APPEARANCE</h2>
            
            <div className="rounded-lg  overflow-hidden bg-card mb-6 whatsapp-glowing-border">
              {/* Theme Settings */}
              <div className="border-b border-border">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-muted text-foreground">
                      <Images className="h-5 w-5" />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-base font-medium">Theme</h3>
                      <p className="text-sm text-muted-foreground">Switch between light, dark and system theme</p>
                    </div>
                  </div>
                  <div className="ml-4">
                    <ThemeToggle variant="secondary" />
                  </div>
                </div>
              </div>
              
              {/* WhatsApp Chat Background */}
              <div className="border-b border-border">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-muted text-green-500">
                      <Images className="h-5 w-5" />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-base font-medium">WhatsApp Chat Background</h3>
                      <p className="text-sm text-muted-foreground">Customize the background of your WhatsApp chats</p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowWhatsAppBackgroundSettings(true)}
                    className="ml-4"
                  >
                    Customize
                  </Button>
                </div>
              </div>
              
              {/* Telegram Chat Background */}
              <div>
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-muted text-blue-500">
                      <Images className="h-5 w-5" />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-base font-medium">Telegram Chat Background</h3>
                      <p className="text-sm text-muted-foreground">Customize the background of your Telegram chats</p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowTelegramBackgroundSettings(true)}
                    className="ml-4"
                  >
                    Customize
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="text-sm text-muted-foreground mt-4">
              <p>Customize the appearance of your chat platforms to make them your own.</p>
              <p className="mt-2">You can upload your own images or choose from our selection of backgrounds.</p>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="help">
          <div className="mb-6">
            <h2 className="text-xl font-bold uppercase tracking-wide text-foreground mb-6">HELP & TUTORIAL</h2>
            
            <div className="space-y-6">
              {/* Welcome Section */}
              <Card className="bg-card whatsapp-glowing-border overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <BookOpen className="mr-2 h-5 w-5 text-blue-500" />
                    Welcome to DailyFix
                  </CardTitle>
                  <CardDescription>
                    Your all-in-one solution for managing conversations across different platforms
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    DailyFix brings together your communication channels into one streamlined interface, 
                    allowing you to manage all your conversations efficiently.
                  </p>
                </CardContent>
              </Card>
              
              {/* Getting Started Section */}
              <Card className="whatsapp-glowing-border overflow-hidden">
                <CardHeader>
                  <CardTitle>Getting Started</CardTitle>
                  <CardDescription>Follow these steps to set up your account</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-foreground flex items-center">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center mr-2 text-white text-xs">1</span>
                      Connect Your Accounts
                    </h3>
                    <p className="text-muted-foreground text-sm ml-8">
                      Go to the Accounts tab and connect your WhatsApp, Telegram, and LinkedIn accounts.
                      Follow the authentication steps to link your accounts securely.
                    </p>
                    <p className="text-orange-400 text-sm ml-8 italic">
                      Note: Instagram is temporarily unavailable due to 3rd party Matrix protocol issues. We're working to restore it soon.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-foreground flex items-center">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center mr-2 text-white text-xs">2</span>
                      Customize Your Experience
                    </h3>
                    <p className="text-muted-foreground text-sm ml-8">
                      Visit the Appearance tab to customize your chat backgrounds and make the app feel more personal.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-foreground flex items-center">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center mr-2 text-white text-xs">3</span>
                      Start Chatting
                    </h3>
                    <p className="text-muted-foreground text-sm ml-8">
                      Once your accounts are connected, you'll see all your contacts in the sidebar. Click on any contact to start chatting.
                    </p>
                  </div>
                </CardContent>
              </Card>
              
              {/* Key Features Section */}
              <Card className="whatsapp-glowing-border overflow-hidden">
                <CardHeader>
                  <CardTitle>Key Features</CardTitle>
                  <CardDescription>Discover what DailyFix can do for you</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg border border-border bg-muted/30">
                      <h3 className="font-medium text-blue-400 mb-2">Unified Messaging</h3>
                      <p className="text-sm text-muted-foreground">
                        Manage all your WhatsApp, Telegram, and LinkedIn conversations in a single interface.
                      </p>
                      <p className="text-xs text-orange-400 mt-1 italic">
                        Instagram temporarily unavailable due to Matrix protocol issues.
                      </p>
                    </div>
                    
                    <div className="p-3 rounded-lg border border-border bg-muted/30">
                      <h3 className="font-medium text-green-400 mb-2">Custom Chat Backgrounds</h3>
                      <p className="text-sm text-muted-foreground">
                        Personalize your chat experience with custom backgrounds for each platform.
                      </p>
                    </div>
                    
                    <div className="p-3 rounded-lg border border-border bg-muted/30">
                      <h3 className="font-medium text-purple-400 mb-2">AI-Powered Chat Summary</h3>
                      <p className="text-sm text-muted-foreground">
                        Use the AI button in chat to generate summaries of your conversations.
                      </p>
                    </div>
                    
                    <div className="p-3 rounded-lg border border-border bg-muted/30">
                      <h3 className="font-medium text-yellow-400 mb-2">Priority Management</h3>
                      <p className="text-sm text-muted-foreground">
                        Set priorities for contacts to help manage your most important conversations.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Shortcuts & Tips Section */}
              <Card className="whatsapp-glowing-border overflow-hidden">
                <CardHeader>
                  <CardTitle>Shortcuts & Tips</CardTitle>
                  <CardDescription>Become a power user with these handy tips</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-foreground">
                    <li className="flex items-start">
                      <span className="text-blue-500 mr-2">•</span>
                      <span>Use the refresh button in chat to get the latest messages</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-500 mr-2">•</span>
                      <span>Click the AI button to get intelligent summaries of your conversations</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-500 mr-2">•</span>
                      <span>Change chat backgrounds by clicking the image icon in the chat header</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-500 mr-2">•</span>
                      <span>Set contact priorities using the dropdown in the chat header</span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-500 mr-2">•</span>
                      <span>If messages aren't syncing, try the "Refresh All" button in the Accounts tab</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
              
              {/* Help & Support Section */}
              <Card className="bg-card whatsapp-glowing-border overflow-hidden">
                <CardHeader>
                  <CardTitle>Help & Support</CardTitle>
                  <CardDescription>Need assistance? We're here to help</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    If you're experiencing any issues or have questions about DailyFix, please don't hesitate to reach out to our support team.
                  </p>
                  <Button variant="outline" className="w-full">
                    <HelpCircle className="mr-2 h-4 w-4" />
                    Contact Support
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Background Settings Dialogs */}
      <ChatBackgroundSettings 
        isOpen={showWhatsAppBackgroundSettings}
        onClose={() => setShowWhatsAppBackgroundSettings(false)}
        platform="whatsapp"
      />
      
      <ChatBackgroundSettings 
        isOpen={showTelegramBackgroundSettings}
        onClose={() => setShowTelegramBackgroundSettings(false)}
        platform="telegram"
      />
      
      {/* WhatsApp Guidance Sheet */}
      <Sheet open={showWhatsAppGuidance} onOpenChange={() => setShowWhatsAppGuidance(false)}>
        <SheetContent className="w-[400px] sm:w-[600px] flex flex-col h-full">
          <SheetHeader className="pb-4 pt-6 px-6">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <span className="text-green-500 text-xl">W</span>
              Get Ready to Connect WhatsApp
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              Please follow these steps to prepare your WhatsApp for connection.
            </SheetDescription>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            <div className="text-center">
              <img 
                src="https://mobiletrans.wondershare.com/images/images2024/how-to-link-whatsapp-to-another-phone-03.jpg" 
                alt="WhatsApp Linked Devices" 
                className="w-full max-w-md mx-auto rounded-lg border"
              />
            </div>
            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Before you continue:</h3>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white text-sm font-bold">1</div>
                  <div>
                    <p className="font-medium">Open WhatsApp on your phone</p>
                    <p className="text-sm text-muted-foreground">Make sure you have the latest version installed</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white text-sm font-bold">2</div>
                  <div>
                    <p className="font-medium">Go to Settings → Linked Devices</p>
                    <p className="text-sm text-muted-foreground">Tap on "Link a Device" to prepare for QR scanning</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white text-sm font-bold">3</div>
                  <div>
                    <p className="font-medium">Keep your camera ready</p>
                    <p className="text-sm text-muted-foreground">You'll need to scan a QR code in the next step</p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-800 dark:text-green-200">
                  <strong>Ready?</strong> Once you click "I'm Ready", a QR code will appear that you need to scan with your WhatsApp camera.
                </p>
              </div>
            </div>
          </div>
          
          <SheetFooter className="flex-shrink-0 flex gap-2 p-6 pt-4 border-t">
            <Button variant="outline" onClick={handleGuidanceCancel} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleWhatsAppGuidanceReady} className="flex-1 bg-green-600 hover:bg-green-700">
              I'm Ready to Scan
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Telegram Guidance Sheet */}
      <Sheet open={showTelegramGuidance} onOpenChange={() => setShowTelegramGuidance(false)}>
        <SheetContent className="w-[400px] sm:w-[600px] flex flex-col h-full">
          <SheetHeader className="pb-4 pt-6 px-6">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <span className="text-blue-500 text-xl">T</span>
              Get Ready to Connect Telegram
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              Please follow these steps to prepare your Telegram for connection.
            </SheetDescription>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            <div className="text-center">
              <img 
                src="https://www.trishtech.com/wp-content/uploads/2022/09/telegram-link-desktop-device-0.jpg" 
                alt="Telegram Link Device" 
                className="w-full max-w-md mx-auto rounded-lg border"
              />
            </div>
            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Before you continue:</h3>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">1</div>
                  <div>
                    <p className="font-medium">Open Telegram on your phone</p>
                    <p className="text-sm text-muted-foreground">Make sure you have the latest version installed</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">2</div>
                  <div>
                    <p className="font-medium">Go to Settings → Devices</p>
                    <p className="text-sm text-muted-foreground">Look for "Link Desktop Device" or similar option</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">3</div>
                  <div>
                    <p className="font-medium">Tap "Link Desktop Device"</p>
                    <p className="text-sm text-muted-foreground">This will open the QR scanner on your phone</p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Ready?</strong> Once you click "I'm Ready", a QR code will appear for 10 seconds that you need to scan quickly with your Telegram camera.
                </p>
              </div>
            </div>
          </div>
          
          <SheetFooter className="flex-shrink-0 flex gap-2 p-6 pt-4 border-t">
            <Button variant="outline" onClick={handleGuidanceCancel} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleTelegramGuidanceReady} className="flex-1 bg-blue-600 hover:bg-blue-700">
              I'm Ready to Scan
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Instagram Guidance Sheet */}
      <Sheet open={showInstagramGuidance} onOpenChange={() => setShowInstagramGuidance(false)}>
        <SheetContent className="w-[400px] sm:w-[600px] flex flex-col h-full">
          <SheetHeader className="pb-4 pt-6 px-6">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <span className="text-pink-500 text-xl">I</span>
              Get Ready to Connect Instagram (Developer Mode)
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              This connection method requires technical knowledge of browser developer tools.
            </SheetDescription>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Developer Setup Required:</h3>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center text-white text-sm font-bold">1</div>
                  <div>
                    <p className="font-medium">Open Instagram in your browser</p>
                    <p className="text-sm text-muted-foreground">Use Chrome, Firefox, or Edge for best results</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center text-white text-sm font-bold">2</div>
                  <div>
                    <p className="font-medium">Open Developer Tools</p>
                    <p className="text-sm text-muted-foreground">Press F12 or right-click → Inspect Element</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center text-white text-sm font-bold">3</div>
                  <div>
                    <p className="font-medium">Go to Network Tab</p>
                    <p className="text-sm text-muted-foreground">Click on the Network tab in developer tools</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center text-white text-sm font-bold">4</div>
                  <div>
                    <p className="font-medium">Prepare to copy cURL command</p>
                    <p className="text-sm text-muted-foreground">You'll need to copy a network request as cURL</p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-orange-800 dark:text-orange-200 font-medium">Technical Warning</p>
                    <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                      This method requires understanding of browser developer tools and cURL commands. If you're not comfortable with these technical concepts, please skip Instagram for now.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <SheetFooter className="flex-shrink-0 flex gap-2 p-6 pt-4 border-t">
            <Button variant="outline" onClick={handleGuidanceCancel} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleInstagramGuidanceReady} className="flex-1 bg-pink-600 hover:bg-pink-700">
              I Understand - Continue
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* LinkedIn Guidance Sheet */}
      <Sheet open={showLinkedInGuidance} onOpenChange={() => setShowLinkedInGuidance(false)}>
        <SheetContent className="w-[400px] sm:w-[600px] flex flex-col h-full">
          <SheetHeader className="pb-4 pt-6 px-6">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <span className="text-blue-600 text-xl">L</span>
              Get Ready to Connect LinkedIn (Developer Mode)
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              This connection method requires technical knowledge of browser developer tools.
            </SheetDescription>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            <div className="text-center">
              <img 
                src={LinkedinSettingsImage} 
                alt="LinkedIn Developer Tools Setup" 
                className="w-full max-w-md mx-auto rounded-lg border"
              />
            </div>
            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Developer Setup Required:</h3>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">1</div>
                  <div>
                    <p className="font-medium">Open LinkedIn in your browser</p>
                    <p className="text-sm text-muted-foreground">Log in to your LinkedIn account</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">2</div>
                  <div>
                    <p className="font-medium">Open Developer Tools (F12)</p>
                    <p className="text-sm text-muted-foreground">Right-click → Inspect Element or press F12</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">3</div>
                  <div>
                    <p className="font-medium">Go to Network Tab</p>
                    <p className="text-sm text-muted-foreground">Click on the Network tab in developer tools</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">4</div>
                  <div>
                    <p className="font-medium">Filter by 'voyage'</p>
                    <p className="text-sm text-muted-foreground">Type 'voyage' in the filter box to find LinkedIn API calls</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">5</div>
                  <div>
                    <p className="font-medium">Select a cURL request</p>
                    <p className="text-sm text-muted-foreground">Right-click on a voyage request → Copy → Copy as cURL</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">6</div>
                  <div>
                    <p className="font-medium">Extract Cookie from Headers</p>
                    <p className="text-sm text-muted-foreground">Copy the Cookie value from the Headers section</p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-orange-800 dark:text-orange-200 font-medium">Technical Warning</p>
                    <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                      This method requires understanding of browser developer tools, network requests, and session cookies. If you're not comfortable with these technical concepts, please skip LinkedIn for now.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <SheetFooter className="flex-shrink-0 flex gap-2 p-6 pt-4 border-t">
            <Button variant="outline" onClick={handleGuidanceCancel} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleLinkedInGuidanceReady} className="flex-1 bg-blue-600 hover:bg-blue-700">
              I Understand - Continue
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      
      {/* Platform Connection Acknowledgment Sheet */}
      <Sheet open={showAcknowledgmentSheet} onOpenChange={setShowAcknowledgmentSheet}>
        <SheetContent className="w-[400px] sm:w-[540px] flex flex-col h-full">
          <SheetHeader className="pb-4 pt-6 px-6">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5 text-green-500" />
              {acknowledgedPlatform} Connected Successfully!
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              Please read and acknowledge the following important information about your platform connection.
            </SheetDescription>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="sync-delay"
                  checked={acknowledgmentChecks.syncDelay}
                  onCheckedChange={(checked) => 
                    setAcknowledgmentChecks(prev => ({ ...prev, syncDelay: checked as boolean }))
                  }
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="sync-delay"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Sync Delay Acknowledgment
                  </label>
                  <p className="text-xs text-muted-foreground">
                    The syncing of contacts/DMs or connections might not be so fast. You might face some delay and might not see the contacts immediately sometimes.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="protocol-upgrade"
                  checked={acknowledgmentChecks.protocolUpgrade}
                  onCheckedChange={(checked) => 
                    setAcknowledgmentChecks(prev => ({ ...prev, protocolUpgrade: checked as boolean }))
                  }
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="protocol-upgrade"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Continuous Improvement
                  </label>
                  <p className="text-xs text-muted-foreground">
                    The protocol and the application are continuously being upgraded for better experience. Some features may be improved or temporarily unavailable during updates.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="refresh-required"
                  checked={acknowledgmentChecks.refreshRequired}
                  onCheckedChange={(checked) => 
                    setAcknowledgmentChecks(prev => ({ ...prev, refreshRequired: checked as boolean }))
                  }
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="refresh-required"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Next Steps - Critical
                  </label>
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-orange-500">IMPORTANT:</strong> Close Settings, go to Inbox, select {acknowledgedPlatform} in the platform switcher in the sidebar, and <strong className="text-red-500">FIRST REFRESH the contact list</strong> to update contacts before viewing any chats.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <SheetFooter className="flex-shrink-0 p-6 pt-4 border-t">
            <Button
              onClick={handleAcknowledgmentComplete}
              disabled={!allAcknowledgmentsChecked}
              className="w-full"
            >
              {allAcknowledgmentsChecked ? 'I Understand - Continue' : 'Please check all items above'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default PlatformSettings; 