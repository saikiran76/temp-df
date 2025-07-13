import React from "react";
import { useInboxNotifications } from "@liveblocks/react";

interface NotificationBadgeProps {
  platform?: 'whatsapp' | 'telegram' | 'linkedin';
}

export function NotificationBadge({ platform = 'whatsapp' }: NotificationBadgeProps) {
  const { inboxNotifications } = useInboxNotifications();

  const getFilteredCount = () => {
    if (!inboxNotifications) return 0;

    let platformPrefix = '';
    switch (platform) {
      case 'telegram':
        platformPrefix = '$telegram';
        break;
      case 'linkedin':
        platformPrefix = '$linkedin';
        break;
      case 'whatsapp':
      default:
        platformPrefix = '$whatsapp';
        break;
    }
    
    return inboxNotifications.filter((notification) => {
      // Filter by platform
      if (!notification.kind.startsWith(platformPrefix)) return false;
      
      // Only count unread notifications
      if (notification.readAt) return false;

      // Filter out bridge bot notifications
      const activityData = (notification as any)?.activities?.[0]?.data;
      if (activityData) {
        const displayName = String(activityData.contact_display_name || activityData.sender || '').toLowerCase();
        if (displayName.includes('bridge bot') || 
            displayName.includes('telegram bridge') ||
            displayName.includes('whatsapp bridge') ||
            displayName.includes('linkedin bridge')) {
          return false; // Exclude bridge bot notifications from badge count
        }
      }
      
      return true;
    }).length || 0;
  };

  const count = getFilteredCount();

  if (count === 0) return null;

  const getBadgeColor = () => {
    switch (platform) {
      case 'telegram':
        return 'bg-blue-500';
      case 'linkedin':
        return 'bg-blue-600';
      case 'whatsapp':
      default:
        return 'bg-green-500';
    }
  };

  return (
    <span className={`absolute -top-1 -right-1 h-5 w-5 rounded-full text-xs font-medium flex items-center justify-center text-white ${getBadgeColor()}`}>
      {count > 99 ? '99+' : count}
    </span>
  );
} 