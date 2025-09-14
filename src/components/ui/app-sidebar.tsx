import * as React from "react"
import '@/index.css'
import { useState, useEffect } from "react"
import { Command, MessageCircle, Settings, CheckCircle, Plus, Wifi, WifiOff, Inbox, RefreshCw, HelpCircle } from "lucide-react"
import { FaWhatsapp, FaTelegram } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { PlatformSwitcher } from "@/components/platforms/PlatformSwitcher";
import ThemeToggle from "@/components/ui/ThemeToggle";

import { NavUser } from "@/components/ui/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
} from "@/components/ui/sidebar"
import { isWhatsAppConnected, isTelegramConnected } from '@/utils/connectionStorage';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Help } from "@/components/ui/modals/help";

// This is sample data
interface PlatformItem {
  id: string;
  title: string;
  icon: React.ElementType;
  onClick: () => void;
  isActive: boolean;
  isConnected: boolean;
  color: string;
}

interface AppSidebarProps {
  onWhatsAppSelected?: () => void;
  onTelegramSelected?: () => void;
  onSettingsSelected?: () => void;
  onPlatformConnect?: (platformId: string) => void;
  onPlatformSelect?: (platformId: string) => void;
}

export function AppSidebar({
  onWhatsAppSelected,
  onTelegramSelected,
  onSettingsSelected,
  onPlatformConnect,
  onPlatformSelect,
  ...props
}: AppSidebarProps) {
  const userId = React.useMemo(() => {
    try {
      const authData = localStorage.getItem('dailyfix_auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed?.user?.id;
      }
    } catch (e) {
      console.error('Error getting user ID:', e);
    }
    return undefined;
  }, []);

  const [connectionStatusChangeCounter, setConnectionStatusChangeCounter] = React.useState(0);

  React.useEffect(() => {
    const handlePlatformConnectionChange = () => {
      setConnectionStatusChangeCounter(prev => prev + 1);
      console.log('[AppSidebar] Platform connection status changed, updating UI');
    };
    window.addEventListener('platform-connection-changed', handlePlatformConnectionChange);
    return () => {
      window.removeEventListener('platform-connection-changed', handlePlatformConnectionChange);
    };
  }, []);

  const whatsAppConnected = React.useMemo(
    () => userId ? isWhatsAppConnected(userId) : false,
    [userId, connectionStatusChangeCounter]
  );

  const telegramConnected = React.useMemo(
    () => userId ? isTelegramConnected(userId) : false,
    [userId, connectionStatusChangeCounter]
  );

  const platformItems: PlatformItem[] = React.useMemo(() => [
    {
      id: "whatsapp",
      title: "WhatsApp",
      icon: FaWhatsapp,
      onClick: onWhatsAppSelected || (() => {}),
      isActive: whatsAppConnected,
      isConnected: whatsAppConnected,
      color: "text-green-500"
    },
    {
      id: "telegram",
      title: "Telegram",
      icon: FaTelegram,
      onClick: onTelegramSelected || (() => {}),
      isActive: telegramConnected,
      isConnected: telegramConnected,
      color: "text-blue-500"
    }
  ], [onWhatsAppSelected, onTelegramSelected, whatsAppConnected, telegramConnected]);

  const [activePlatform, setActivePlatform] = React.useState<string | null>(
    whatsAppConnected ? "whatsapp" : (telegramConnected ? "telegram" : null)
  );

  React.useEffect(() => {
    if (activePlatform && !platformItems.find(p => p.id === activePlatform && p.isConnected)) {
      const nextConnectedPlatform = platformItems.find(p => p.isConnected);
      setActivePlatform(nextConnectedPlatform ? nextConnectedPlatform.id : null);
      console.log('[AppSidebar] Active platform disconnected, switching to:', nextConnectedPlatform?.id || 'none');
    }
  }, [platformItems, activePlatform]);

  const handlePlatformChange = (platformId: string) => {
    console.log('[AppSidebar] Platform changed to:', platformId);
    setActivePlatform(platformId);
    if (platformId === 'whatsapp' && onWhatsAppSelected) {
      onWhatsAppSelected();
    } else if (platformId === 'telegram' && onTelegramSelected) {
      onTelegramSelected();
    }
    if (onPlatformSelect) {
      onPlatformSelect(platformId);
    }
  };

  const [helpOpen, setHelpOpen] = useState(false);
  const isMobile = useIsMobile();

  // Consistent button styling class
  const buttonClass = `flex items-center ${isMobile ? 'justify-start w-full gap-2' : 'justify-center'} h-8 ${isMobile ? 'w-full' : 'w-8'} p-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors ${isMobile ? '' : 'mx-auto'}`;

  return (
    <Sidebar
      collapsible="icon"
      className="overflow-hidden [&>[data-sidebar=sidebar]]:flex-row"
      {...props}
    >
      <Sidebar
        collapsible="none"
        className={`${isMobile ? '!w-auto max-w-[240px]' : '!w-[calc(var(--sidebar-width-icon)_+_2px)]'} border-r  border-gray-800 whatsapp-glowing-border`}
      >
        <SidebarHeader className="px-2 py-3">
          <div className={`flex ${isMobile ? 'w-full justify-start gap-2' : 'aspect-square size-8 justify-center'} items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground ${isMobile ? '' : 'mx-auto'}`}>
            <Command className="size-4" />
            {isMobile && <span className="text-sm font-medium">DailyFix</span>}
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2">
          <SidebarGroup className="px-0 mb-4">
            <PlatformSwitcher
              platforms={platformItems}
              activePlatform={activePlatform}
              onPlatformChange={handlePlatformChange}
              onPlatformConnect={onPlatformConnect}
            />
          </SidebarGroup>
          <SidebarGroup className="px-0 mt-4">
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    className={buttonClass}
                    onClick={() => {
                      console.log('[AppSidebar] Settings clicked');
                      if (onSettingsSelected) onSettingsSelected();
                    }}
                  >
                    <Settings className="h-5 w-5 text-gray-200" />
                    {isMobile && <span className="text-sm text-gray-200">Settings</span>}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-white/60" side="right" sideOffset={8}>
                  Settings
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="px-2 pb-4">
          <SidebarGroup className="px-0 mb-4">
            <Dialog className="bg-neutral-700 chat-glowing-border" open={helpOpen} onOpenChange={setHelpOpen}>
              <DialogTrigger asChild>
                <TooltipProvider>
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <button
                        className={buttonClass}
                        onClick={() => setHelpOpen(true)}
                      >
                        <HelpCircle className="h-5 w-5 text-gray-200" />
                        {isMobile && <span className="text-sm text-gray-200">Help</span>}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="bg-white/60" side="right" sideOffset={8}>
                      Help
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px] bg-neutral-800 ">
                <DialogHeader className="mb-4">
                  <DialogTitle className="text-xl font-semibold">Help Center</DialogTitle>
                </DialogHeader>
                <Help />
              </DialogContent>
            </Dialog>
          </SidebarGroup>
          
          {/* Theme Toggle */}
          <SidebarGroup className="px-0 mb-4">
            <ThemeToggle />
          </SidebarGroup>
          
          <NavUser />
        </SidebarFooter>
      </Sidebar>
    </Sidebar>
  );
}
