import React, { Suspense, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell } from "lucide-react";
import { FaWhatsapp, FaTelegram } from "react-icons/fa";
import NotificationBadge from "./NotificationBadge";
import { WhatsAppNotifications } from "./WhatsAppNotifications";
import { TelegramNotifications } from "./TelegramNotifications";
import { LinkedInNotifications } from "./LinkedinNotifications";

interface NotificationPopoverProps {
  platform?: 'whatsapp' | 'telegram' | 'linkedin';
}

export function NotificationPopover({ platform = 'whatsapp' }: NotificationPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleClose = () => setIsOpen(false);
    window.addEventListener('close-notification-popover', handleClose);
    return () => {
      window.removeEventListener('close-notification-popover', handleClose);
    };
  }, []);

  const renderNotifications = () => {
    switch (platform) {
      case 'telegram':
        return <TelegramNotifications />;
      case 'linkedin':
        return <LinkedInNotifications />;
      case 'whatsapp':
      default:
        return <WhatsAppNotifications />;
    }
  };

  const getTitle = () => {
    switch (platform) {
      case 'telegram':
        return 'Telegram Notifications';
      case 'linkedin':
        return 'LinkedIn Notifications';
      case 'whatsapp':
      default:
        return 'WhatsApp Notifications';
    }
  };

  const getPlatformIcon = () => {
    switch (platform) {
      case 'telegram':
        return <FaTelegram className="h-4 w-4 text-blue-500" />;
      case 'linkedin':
        return (
          <div className="h-4 w-4 bg-blue-600 text-white text-xs font-bold rounded flex items-center justify-center">
            in
          </div>
        );
      case 'whatsapp':
      default:
        return <FaWhatsapp className="h-4 w-4 text-green-500" />;
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      {/* Enhanced Trigger Button with Platform Icon */}
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-header-foreground hover:bg-accent group"
        >
          <div className="flex items-center space-x-1 p-4">
            {/* Platform Icon */}
            <div className="flex-shrink-0">
              {getPlatformIcon()}
            </div>
            {/* Bell Icon */}
            <Bell className="h-5 w-5" />
          </div>
          <NotificationBadge platform={platform} />
          <span className="sr-only">{getTitle()}</span>
        </Button>
      </PopoverTrigger>
      
      {/* Enhanced Popover Content */}
      <PopoverContent 
        className="w-96 p-0 bg-popover border-border shadow-lg"
        align="end"
        sideOffset={8}
      >
        {/* Enhanced Header with Platform Icon */}
        <div className="p-4 border-b border-border bg-muted/50">
          <div className="flex items-center space-x-2">
            {getPlatformIcon()}
            <h3 className="font-semibold text-popover-foreground">{getTitle()}</h3>
          </div>
        </div>
        
        <div className="max-h-96 overflow-y-auto">
          <Suspense 
            fallback={
              <div className="p-4 text-center text-muted-foreground">
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  <span>Loading notifications...</span>
                </div>
              </div>
            }
          >
            {renderNotifications()}
          </Suspense>
        </div>
      </PopoverContent>
    </Popover>
  );
} 