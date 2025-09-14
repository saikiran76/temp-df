import { useState, useEffect } from 'react';
import '@/index.css'
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, Images, HelpCircle, BookOpen } from "lucide-react";
import platformManager from '@/services/PlatformManager';
import { useSelector } from 'react-redux';
import WhatsAppBridgeSetup, { resetWhatsappSetupFlags } from '@/components/platforms/whatsapp/whatsappBridgeSetup';
import { toast } from 'react-hot-toast';
import api from '@/utils/api';
import { saveWhatsAppStatus, saveTelegramStatus } from '@/utils/connectionStorage';
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
import TelegramBridgeSetup, { resetTelegramSetupFlags } from './platforms/telegram/telegramBridgeSetup';
import logger from '@/utils/logger';
import { useDispatch } from 'react-redux';
import { setWhatsappConnected, setTelegramConnected } from '@/store/slices/onboardingSlice';
import ChatBackgroundSettings from '@/components/ui/ChatBackgroundSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import ThemeToggle from "@/components/ui/ThemeToggle";

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
  disabled
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
}) => {
  return (
    <div className="flex items-center justify-between px-4 py-6">
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 text-white">
          {logo}
        </div>
        <div>
          <h3 className="text-base font-medium">{title}</h3>
          <p className="text-sm text-gray-400">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {requiresAuth && !isConnected && (
          <span className="text-sm text-yellow-500 mr-2">Auth required</span>
        )}
        {isConnected && (
          <span className="text-sm text-green-500 mr-2">Connected</span>
        )}
        {isInitializing && (
          <Loader2 className="h-4 w-4 text-blue-500 animate-spin mr-2" />
        )}
        {isDisconnecting && (
          <Loader2 className="h-4 w-4 text-red-500 animate-spin mr-2" />
        )}
        {disabled && !isInitializing && !isDisconnecting && (
          <span className="text-sm text-gray-400 mr-2">Setup in progress</span>
        )}
        <Checkbox 
          id={`toggle-${platform}`}
          checked={isConnected}
          onCheckedChange={(checked) => onToggle(platform, checked as boolean)}
          className="data-[state=checked]:bg-blue-600"
          disabled={disabled || isInitializing || isDisconnecting}
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
  const [showWhatsAppBackgroundSettings, setShowWhatsAppBackgroundSettings] = useState(false);
  const [showTelegramBackgroundSettings, setShowTelegramBackgroundSettings] = useState(false);
  
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

  // Handle toggling a platform on/off
  const handleTogglePlatform = async (platform: string, enabled: boolean) => {
    try {
      if (enabled) {
        // Set initializing state
        setInitializingPlatform(platform);
        
        if (platform === 'whatsapp') {
          // Show WhatsApp setup instead of directly initializing
          setShowWhatsAppSetup(true);
          return;
        } else if (platform === 'telegram') {
          // Reset Telegram setup flags before showing setup
          logger.info('[PlatformSettings] Resetting Telegram setup flags before initialization');
          resetTelegramSetupFlags(true);
          // Show Telegram setup instead of directly initializing
          setShowTelegramSetup(true);
          return;
        }
        
        // Attempt to switch to this platform
        await platformManager.switchPlatform(platform);
        setActivePlatforms(platformManager.getAllActivePlatforms());
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

  // Handle WhatsApp setup completion
  const handleWhatsAppSetupComplete = () => {
    setShowWhatsAppSetup(false);
    setInitializingPlatform(null);
    // Update the active platforms list after setup completion
    setActivePlatforms(platformManager.getAllActivePlatforms());
  };

  // Handle WhatsApp setup cancellation
  const handleWhatsAppSetupCancel = () => {
    setShowWhatsAppSetup(false);
    setInitializingPlatform(null);
    logger.info('[PlatformSettings] WhatsApp setup cancelled, resetting flags.');
    resetWhatsappSetupFlags(true);
  };

  // Handle Telegram setup completion
  const handleTelegramSetupComplete = () => {
    setShowTelegramSetup(false);
    setInitializingPlatform(null);
    // Update the active platforms list after setup completion
    setActivePlatforms(platformManager.getAllActivePlatforms());
  };

  // Handle Telegram setup cancellation
  const handleTelegramSetupCancel = () => {
    setShowTelegramSetup(false);
    setInitializingPlatform(null);
    logger.info('[PlatformSettings] Telegram setup cancelled, resetting flags.');
    resetTelegramSetupFlags(true);
  };

  // Add the missing confirmDisconnect function
  const confirmDisconnect = () => {
    if (disconnectingPlatform === 'whatsapp') {
      handleDisconnectWhatsApp();
    } else if (disconnectingPlatform === 'telegram') {
      handleDisconnectTelegram();
    }
  };

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
    }
  };

  // Calculate if any setup is in progress
  const anySetupInProgress = initializingPlatform !== null || showWhatsAppSetup || showTelegramSetup || isDisconnecting || showDisconnectDialog;

  return (
    <div className=" bg-[#131516] space-y-6">
      <Tabs defaultValue="accounts" className="w-full">
        <TabsList className="grid grid-cols-3 mb-6">
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="help">Help & Tutorial</TabsTrigger>
        </TabsList>
        
        <TabsContent value="accounts">
          <div className="flex justify-between items-center mb-6 ">
            <h2 className="text-xl font-bold uppercase tracking-wide text-gray-200">ACCOUNTS</h2>
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
          
          <div className="rounded-lg overflow-hidden bg-black/50 whatsapp-glowing-border">
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
                />
              );
            })}
          </div>
          
          <div className="text-sm text-gray-400 mt-4">
            <p>Connect your messaging platforms to manage all your conversations in one place.</p>
            <p className="mt-2">Platforms may require additional authentication steps to connect.</p>
          </div>
          
          {/* WhatsApp Setup Component */}
          {showWhatsAppSetup && (
            <div className="mt-8">
              <WhatsAppBridgeSetup 
                onComplete={handleWhatsAppSetupComplete}
                onCancel={handleWhatsAppSetupCancel}
                relogin={false}
              />
            </div>
          )}

          {/* Telegram Setup Component */}
          {showTelegramSetup && (
            <div className="mt-8">
              <TelegramBridgeSetup 
                onComplete={handleTelegramSetupComplete}
                onCancel={handleTelegramSetupCancel}
                relogin={false}
              />
            </div>
          )}
          
          {/* Disconnect Confirmation Dialog */}
          <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
            <AlertDialogContent className="bg-black text-white border border-gray-800">
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect {disconnectingPlatform?.charAt(0).toUpperCase() + disconnectingPlatform?.slice(1)}</AlertDialogTitle>
                <AlertDialogDescription className="text-gray-400">
                  Are you sure you want to disconnect this platform? You'll need to reconnect to access your conversations again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={confirmDisconnect}
                  className="bg-red-600 text-white hover:bg-red-700"
                  disabled={isDisconnecting}
                >
                  {isDisconnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Disconnecting...
                    </>
                  ) : (
                    'Disconnect'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>
        
        <TabsContent value="appearance">
          <div className="mb-6">
            <h2 className="text-xl font-bold uppercase tracking-wide text-gray-200 mb-6">APPEARANCE</h2>
            
            <div className="rounded-lg  overflow-hidden bg-black/50 mb-6 whatsapp-glowing-border">
              {/* Theme Settings */}
              <div className="border-b border-gray-800">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 text-white">
                      <Images className="h-5 w-5" />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-base font-medium">Theme</h3>
                      <p className="text-sm text-gray-400">Switch between light, dark and system theme</p>
                    </div>
                  </div>
                  <div className="ml-4">
                    <ThemeToggle variant="secondary" />
                  </div>
                </div>
              </div>
              
              {/* WhatsApp Chat Background */}
              <div className="border-b border-gray-800">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 text-green-500">
                      <Images className="h-5 w-5" />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-base font-medium">WhatsApp Chat Background</h3>
                      <p className="text-sm text-gray-400">Customize the background of your WhatsApp chats</p>
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
                    <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 text-blue-500">
                      <Images className="h-5 w-5" />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-base font-medium">Telegram Chat Background</h3>
                      <p className="text-sm text-gray-400">Customize the background of your Telegram chats</p>
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
            
            <div className="text-sm text-gray-400 mt-4">
              <p>Customize the appearance of your chat platforms to make them your own.</p>
              <p className="mt-2">You can upload your own images or choose from our selection of backgrounds.</p>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="help">
          <div className="mb-6">
            <h2 className="text-xl font-bold uppercase tracking-wide text-gray-200 mb-6">HELP & TUTORIAL</h2>
            
            <div className="space-y-6">
              {/* Welcome Section */}
              <Card className="bg-black/50 whatsapp-glowing-border overflow-hidden">
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
                  <p className="text-gray-300">
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
                    <h3 className="text-sm font-medium text-white flex items-center">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-900 flex items-center justify-center mr-2">1</span>
                      Connect Your Accounts
                    </h3>
                    <p className="text-gray-400 text-sm ml-8">
                      Go to the Accounts tab and connect your WhatsApp and Telegram accounts.
                      Follow the authentication steps to link your accounts securely.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-white flex items-center">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-900 flex items-center justify-center mr-2">2</span>
                      Customize Your Experience
                    </h3>
                    <p className="text-gray-400 text-sm ml-8">
                      Visit the Appearance tab to customize your chat backgrounds and make the app feel more personal.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-white flex items-center">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-900 flex items-center justify-center mr-2">3</span>
                      Start Chatting
                    </h3>
                    <p className="text-gray-400 text-sm ml-8">
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
                    <div className="p-3 rounded-lg border border-gray-800 bg-black/30">
                      <h3 className="font-medium text-blue-400 mb-2">Unified Messaging</h3>
                      <p className="text-sm text-gray-400">
                        Manage all your WhatsApp and Telegram conversations in a single interface.
                      </p>
                    </div>
                    
                    <div className="p-3 rounded-lg border border-gray-800 bg-black/30">
                      <h3 className="font-medium text-green-400 mb-2">Custom Chat Backgrounds</h3>
                      <p className="text-sm text-gray-400">
                        Personalize your chat experience with custom backgrounds for each platform.
                      </p>
                    </div>
                    
                    <div className="p-3 rounded-lg border border-gray-800 bg-black/30">
                      <h3 className="font-medium text-purple-400 mb-2">AI-Powered Chat Summary</h3>
                      <p className="text-sm text-gray-400">
                        Use the AI button in chat to generate summaries of your conversations.
                      </p>
                    </div>
                    
                    <div className="p-3 rounded-lg border border-gray-800 bg-black/30">
                      <h3 className="font-medium text-yellow-400 mb-2">Priority Management</h3>
                      <p className="text-sm text-gray-400">
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
                  <ul className="space-y-2 text-sm text-gray-300">
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
              <Card className="bg-black/50 whatsapp-glowing-border overflow-hidden">
                <CardHeader>
                  <CardTitle>Help & Support</CardTitle>
                  <CardDescription>Need assistance? We're here to help</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-300">
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
    </div>
  );
};

export default PlatformSettings; 