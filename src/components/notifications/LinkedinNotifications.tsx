import React, { Suspense, useCallback } from "react";
import { useInboxNotifications, useMarkInboxNotificationAsRead } from "@liveblocks/react/suspense";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, AtSign, UserPlus, Users, Check, CheckCheck } from "lucide-react";
import { format } from "date-fns";

// Custom notification renderer for LinkedIn messages
const LinkedInMessageNotification = ({ notification, onNotificationClick }: any) => {
  // The core of the fix: activityData is nested inside the 'activities' array
  const activityData = notification?.activities?.[0]?.data;
  const { kind, readAt } = notification;

  // 🔥 DEBUG: Log the exact notification structure being processed
  console.log('🐛 [FRONTEND DEBUG] Processing LinkedIn notification:', {
    id: notification?.id,
    kind,
    activityData: activityData,
  });

  // Defensive programming for the extracted data
  if (!activityData) {
    console.warn("🚨 [FRONTEND] LinkedIn notification has no activity data, skipping render.", notification);
    return null;
  }

  // Ensure activityData exists with fallback
  const safeActivityData = activityData || {};
  
  const getIcon = () => {
    switch (kind) {
      case '$linkedinMessage':
        return <MessageSquare className="h-5 w-5 text-blue-600" />;
      case '$linkedinMention':
        return <AtSign className="h-5 w-5 text-blue-700" />;
      case '$newContact':
        return <UserPlus className="h-5 w-5 text-purple-600" />;
      case '$groupInvite':
        return <Users className="h-5 w-5 text-orange-600" />;
      default:
        return <MessageSquare className="h-5 w-5 text-gray-600" />;
    }
  };

  const getSenderName = () => {
    // Use the new `contact_display_name` field from the backend, with a fallback
    return safeActivityData.contact_display_name || safeActivityData.sender || 'Unknown sender';
  };

  const getTitle = () => {
    const sender = getSenderName();
    const contactName = safeActivityData.contactName || 'Unknown contact';
    
    switch (kind) {
      case '$linkedinMessage':
        return sender;
      case '$linkedinMention':
        return `${sender} mentioned you`;
      case '$newContact':
        return `New LinkedIn contact: ${contactName}`;
      case '$groupInvite':
        return `LinkedIn group invite from ${safeActivityData.inviter || 'Unknown'}`;
      default:
        return 'New LinkedIn notification';
    }
  };

  const getMessage = () => {
    const message = safeActivityData.message || 'No message content';
    const contactName = safeActivityData.contactName || 'Unknown contact';
    const groupName = safeActivityData.room || 'Unknown group';
    
    switch (kind) {
      case '$linkedinMessage':
      case '$linkedinMention':
        return message;
      case '$newContact':
        return `${contactName} has been added to your LinkedIn contacts`;
      case '$groupInvite':
        return `You've been invited to join ${groupName}`;
      default:
        return 'You have a new LinkedIn notification';
    }
  };

  const getTimestamp = () => {
    if (safeActivityData.timestamp) {
      try {
        // Handle both timestamp formats (number and string)
        const date = typeof safeActivityData.timestamp === 'number' 
          ? new Date(safeActivityData.timestamp) 
          : new Date(safeActivityData.timestamp);
        return format(date, 'MMM d, h:mm a');
      } catch (error) {
        console.warn("Invalid timestamp format:", safeActivityData.timestamp);
        return 'Just now';
      }
    }
    return 'Just now';
  };

  // 🎯 SUCCESS: This is a valid LinkedIn message notification
  console.log('✅ [FRONTEND] Rendering valid LinkedIn notification:', {
    kind,
    sender: safeActivityData.sender,
    contact_display_name: safeActivityData.contact_display_name,
    message: safeActivityData.message,
  });

  return (
    <div
      className={`flex items-start space-x-3 p-4 rounded-lg transition-all duration-200 cursor-pointer hover:bg-primary/5 border-l-4 ${
        readAt 
          ? 'bg-card/50 opacity-75 border-l-muted-foreground/30' 
          : 'bg-accent/80 border-l-blue-600 hover:bg-accent'
      }`}
      onClick={() => onNotificationClick(notification)}
    >
      {/* Enhanced Icon with Platform Color */}
      <div className="flex-shrink-0 mt-1">
        <div className={`p-2 rounded-full ${readAt ? 'bg-muted' : 'bg-blue-50'}`}>
          {getIcon()}
        </div>
      </div>
      
      {/* Enhanced Content Layout */}
      <div className="flex-1 min-w-0">
        {/* Header with Sender and Status */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center space-x-2">
            {/* Sender Name */}
            <p className="text-sm font-semibold text-foreground truncate max-w-[180px]">
              {getTitle()}
            </p>
            {/* LinkedIn Icon for Platform Identification */}
            <div className="flex-shrink-0">
              <div className="h-4 w-4 bg-blue-600 text-white text-xs font-bold rounded flex items-center justify-center">
                in
              </div>
            </div>
          </div>
          
          {/* Read Status */}
          <div className="flex items-center space-x-1">
            {readAt ? (
              <CheckCheck className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Check className="h-3 w-3 text-blue-600" />
            )}
          </div>
        </div>
        
        {/* Message Preview with Better Typography */}
        <div className="mb-2">
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {getMessage()}
          </p>
        </div>
        
        {/* Footer with Timestamp and Additional Info */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {getTimestamp()}
          </p>
          
          {/* Message Type Indicator */}
          {kind === '$linkedinMention' && (
            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
              Mention
            </Badge>
          )}
          {kind === '$groupInvite' && (
            <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">
              Group Invite
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
};

// Notifications Content Component (needs Suspense)
function LinkedInNotificationsContent() {
  const { inboxNotifications } = useInboxNotifications();
  const markInboxNotificationAsRead = useMarkInboxNotificationAsRead();

  const handleNotificationClick = useCallback((notification: any) => {
    if (!notification.readAt) {
      markInboxNotificationAsRead(notification.id);
    }

    if (notification.subjectId) {
      // Dispatch a custom event to be handled by MainLayout
      window.dispatchEvent(new CustomEvent('navigate-to-chat', {
        detail: {
          platform: 'linkedin',
          contactId: notification.subjectId,
        }
      }));

      // Also, dispatch an event to close the popover
      window.dispatchEvent(new CustomEvent('close-notification-popover'));
      
      console.log(`[Notifications] Dispatched navigate-to-chat for LinkedIn contact: ${notification.subjectId}`);
    } else {
      console.warn('[Notifications] Clicked LinkedIn notification is missing a subjectId', notification);
    }
  }, [markInboxNotificationAsRead]);

  // CRITICAL FIX: Add real-time contact update dispatch
  React.useEffect(() => {
    if (inboxNotifications && inboxNotifications.length > 0) {
      // Process new unread notifications to dispatch contact updates
      const newNotifications = inboxNotifications.filter(notification => !notification.readAt);
      
      newNotifications.forEach(notification => {
        if (notification.kind === '$linkedinMessage' && notification.activities?.[0]?.data) {
          const activityData = notification.activities[0].data;
          const { contact_id, message, timestamp } = activityData;
          
          if (contact_id && message) {
            console.log('🔔 Dispatching real-time LinkedIn contact update event:', {
              contactId: contact_id,
              message: message,
              timestamp: timestamp
            });
            
            // Dispatch custom event for real-time contact updates
            window.dispatchEvent(new CustomEvent('linkedin-message-update', {
              detail: {
                contactId: contact_id,
                message: message,
                timestamp: timestamp || Date.now()
              }
            }));
          }
        }
      });
    }
  }, [inboxNotifications]);

  // Filter out invalid notifications before rendering
  const validNotifications = (inboxNotifications || []).filter((notification) => {
    if (!notification || !notification.id) {
      console.warn("🚨 [FRONTEND] Skipping LinkedIn notification without ID:", notification);
      return false;
    }
    
    // For now, only show LinkedIn messages until other types are properly implemented
    if (notification.kind !== '$linkedinMessage') {
      console.log(`🚨 [FRONTEND] Filtering out non-message LinkedIn notification: ${notification.kind}`);
      return false;
    }
    
    // The core of the fix: activityData is nested inside the 'activities' array
    const activityData = notification?.activities?.[0]?.data;

    // Ensure LinkedIn messages have required data
    if (notification.kind === '$linkedinMessage') {
      // Use the new `contact_display_name` field for validation
      const hasValidData = activityData && 
                          (activityData.contact_display_name || activityData.sender) && 
                          activityData.message;
      if (!hasValidData) {
        console.warn("🚨 [FRONTEND] Filtering out LinkedIn message with missing data:", { 
          id: notification.id, 
          kind: notification.kind,
          activityData: activityData 
        });
        return false;
      }

      // Filter out bridge bot notifications
      const displayName = String(activityData.contact_display_name || activityData.sender || '').toLowerCase();
      if (displayName.includes('bridge bot') || 
          displayName.includes('linkedin bridge') ||
          displayName.includes('telegram bridge') ||
          displayName.includes('whatsapp bridge')) {
        console.log(`🚨 [FRONTEND] Filtering out LinkedIn bridge bot notification from: ${displayName}`);
        return false;
      }
    }
    
    return true;
  });
  
  console.log(`🎯 [FRONTEND] Showing ${validNotifications.length} valid LinkedIn notifications out of ${inboxNotifications.length} total`);
  
  if (validNotifications.length === 0) {
    return (
      <div className="p-8 text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">No LinkedIn notifications yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          You'll see LinkedIn messages here when they arrive
        </p>
        {inboxNotifications.length > 0 && (
          <p className="text-xs text-orange-600 mt-2">
            ({inboxNotifications.length} notifications filtered out - check console for details)
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      {validNotifications.map((notification) => (
        <LinkedInMessageNotification
          key={notification.id}
          notification={notification}
          onNotificationClick={handleNotificationClick}
        />
      ))}
    </div>
  );
}

// Main LinkedIn Notifications Component (with Suspense wrapper)
export function LinkedInNotifications() {
  return (
    <Suspense 
      fallback={
        <div className="p-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start space-x-3 p-3 rounded-lg bg-muted animate-pulse">
              <div className="h-4 w-4 bg-muted-foreground/20 rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted-foreground/20 rounded w-3/4" />
                <div className="h-3 bg-muted-foreground/20 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      }
    >
      <LinkedInNotificationsContent />
    </Suspense>
  );
} 