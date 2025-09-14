import React from 'react';
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { MessageCircle, Plus, Wifi, WifiOff, RefreshCw, CheckCircle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import '@/components/styles/glowing-platform-icons.css';
// import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import logger from '@/utils/logger';

interface PlatformItem {
  id: string;
  title: string;
  icon: React.ElementType;
  isConnected: boolean;
  color: string;
}

interface PlatformSwitcherProps {
  platforms: PlatformItem[];
  activePlatform: string | null;
  onPlatformChange: (platformId: string) => void;
  onPlatformConnect?: (platformId: string) => void;
}

export const PlatformSwitcher = ({
  platforms,
  activePlatform,
  onPlatformChange,
  onPlatformConnect
}: PlatformSwitcherProps) => {
  const isMobile = useIsMobile();
  const connectedPlatforms = platforms.filter(platform => platform.isConnected);
  const availablePlatforms = platforms.filter(platform => !platform.isConnected);
  const currentPlatform = connectedPlatforms.find(p => p.id === activePlatform) || connectedPlatforms[0];

  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);

  const refreshPlatformStatus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRefreshing) return;
    setIsRefreshing(true);
    console.log('[AppSidebar] Refreshing platform connection statuses');
    const refreshEvent = new CustomEvent('refresh-platform-status');
    window.dispatchEvent(refreshEvent);
    setTimeout(() => setIsRefreshing(false), 2000);
  };

  let IconComponent: React.ElementType = MessageCircle;
  let iconColor = "text-gray-200";
  let tooltipText = "Switch Platforms";

  if (connectedPlatforms.length === 0) {
    IconComponent = Plus;
    iconColor = "text-muted-foreground";
    tooltipText = "Connect Platform";
  } else if (currentPlatform) {
    IconComponent = currentPlatform.icon;
    iconColor = currentPlatform.color;
    tooltipText = `Switch from ${currentPlatform.title}`;
  } else {
    const firstConnected = connectedPlatforms[0];
    IconComponent = firstConnected.icon;
    iconColor = firstConnected.color;
    tooltipText = "Switch Platforms";
  }

  const handleConnectedPlatformClick = (platformId: string) => {
    console.log('[PlatformSwitcher] Switching to platform:', platformId);
    
    // Only perform platform switch actions if we're actually switching platforms (not clicking the same one)
    if (platformId !== activePlatform) {
      // Set the active platform in localStorage first
      localStorage.setItem('dailyfix_active_platform', platformId);
      logger.info(`[PlatformSwitcher] Set ${platformId} as active platform in localStorage`);
      
      // Use setTimeout to ensure this runs after all synchronous code,
      // preventing potential initialization order issues
      setTimeout(() => {
        try {
          // Trigger proper contact refresh based on the platform
          const userId = JSON.parse(localStorage.getItem('dailyfix_auth') || '{}')?.user?.id;
          if (userId) {
            // Dispatch a simple custom event - avoid complex event details to prevent serialization issues
            window.dispatchEvent(new CustomEvent('platform-connection-changed'));
            
            // Use a simple refresh event instead of one with complex details
            const refreshEvent = new CustomEvent('refresh-platform-status');
            window.dispatchEvent(refreshEvent);
            logger.info(`[PlatformSwitcher] Auto-refreshed contacts after switching to ${platformId}`);
          }
        } catch (error) {
          logger.error('[PlatformSwitcher] Error during platform switch event dispatching:', error);
        }
      }, 0);
      
      // Show a simple toast notification - avoid complex objects that might cause initialization issues
      toast(`Switched to ${platformId.charAt(0).toUpperCase() + platformId.slice(1)}. PLEASE HIT REFRESH BUTTON.`);
      
      logger.info(`[PlatformSwitcher] Showed platform switch notification for ${platformId}`);
    }
    
    onPlatformChange(platformId);
    setIsOpen(false);
  };

  const handleConnectPlatformClick = (platformId: string) => {
    console.log('[PlatformSwitcher] Connecting to platform:', platformId);
    if (onPlatformConnect) {
      onPlatformConnect(platformId);
    }
    setIsOpen(false);
  };

  const buttonClass = `flex items-center ${isMobile ? 'justify-start w-full gap-2' : 'justify-center'} h-8 ${isMobile ? 'w-full' : 'w-8'} p-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors relative ${connectedPlatforms.length === 0 ? 'border-2 border-dashed border-muted-foreground/30' : ''}`;

  // Determine platform-specific glow classes
  const getGlowClasses = (platformId: string) => {
    if (platformId === 'telegram') {
      return 'platform-icon-glow-base telegram-icon-glow';
    }
    if (platformId === 'whatsapp') {
      return 'platform-icon-glow-base whatsapp-icon-glow';
    }
    return '';
  };

  // Determine active indicator classes
  const getActiveIndicatorClasses = (platformId: string) => {
    if (platformId === 'telegram') {
      return 'platform-active-indicator telegram-active-indicator';
    }
    if (platformId === 'whatsapp') {
      return 'platform-active-indicator whatsapp-active-indicator';
    }
    return '';
  };

  return (
    <TooltipProvider>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button className={buttonClass}>
                <span className={currentPlatform ? getGlowClasses(currentPlatform.id) : ''}>
                  <IconComponent className={`h-5 w-5 ${iconColor}`} />
                </span>
                {isMobile && <span className="text-sm text-gray-200">{tooltipText}</span>}
                {currentPlatform && connectedPlatforms.length > 0 && (
                  <div className={`absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-sidebar-background ${getActiveIndicatorClasses(currentPlatform.id)}`} />
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent className="bg-white/50" side="right" sideOffset={8}>
            {tooltipText}
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          className="w-48 p-2 z-[9999] fixed bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-lg"
          align="center"
          side={isMobile ? "bottom" : "right"}
          sideOffset={20}
        >
          <div className="flex justify-end mb-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={refreshPlatformStatus}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="sr-only">Refresh connection status</span>
            </Button>
          </div>
          {connectedPlatforms.length === 0 && (
            <>
              <div className="text-sm font-medium py-1.5 px-2">Available Platforms</div>
              <div className="h-px bg-muted my-1 -mx-1" />
              <div className="space-y-1">
                {availablePlatforms.map((platform) => {
                  const Icon = platform.icon;
                  return (
                    <button
                      key={platform.id}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={() => handleConnectPlatformClick(platform.id)}
                    >
                      <span className={getGlowClasses(platform.id)}>
                        <Icon className={`h-4 w-4 ${platform.color}`} />
                      </span>
                      <span>{platform.title}</span>
                      <Plus className="ml-auto h-3 w-3" />
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {connectedPlatforms.length > 0 && (
            <>
              <div className="text-sm font-medium py-1.5 px-2 flex items-center gap-2">
                <Wifi className="h-3 w-3 text-green-500" />
                Connected Platforms
              </div>
              <div className="h-px bg-muted my-1 -mx-1" />
              <div className="space-y-1 mb-3">
                {connectedPlatforms.map((platform) => {
                  const Icon = platform.icon;
                  return (
                    <button
                      key={platform.id}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm hover:bg-accent hover:text-accent-foreground ${activePlatform === platform.id ? 'bg-muted' : ''}`}
                      onClick={() => handleConnectedPlatformClick(platform.id)}
                    >
                      <span className={getGlowClasses(platform.id)}>
                        <Icon className={`h-4 w-4 ${platform.color}`} />
                      </span>
                      <span>{platform.title}</span>
                      {activePlatform === platform.id && (
                        <CheckCircle className="ml-auto h-3 w-3 text-green-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {availablePlatforms.length > 0 && connectedPlatforms.length > 0 && (
            <>
              <div className="text-sm font-medium py-1.5 px-2 flex items-center gap-2">
                <WifiOff className="h-3 w-3 text-muted-foreground" />
                Available Platforms
              </div>
              <div className="h-px bg-muted my-1 -mx-1" />
              <div className="space-y-1">
                {availablePlatforms.map((platform) => {
                  const Icon = platform.icon;
                  return (
                    <button
                      key={platform.id}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={() => handleConnectPlatformClick(platform.id)}
                    >
                      <span className={getGlowClasses(platform.id)}>
                        <Icon className={`h-4 w-4 ${platform.color}`} />
                      </span>
                      <span>{platform.title}</span>
                      <Plus className="ml-auto h-3 w-3" />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
};