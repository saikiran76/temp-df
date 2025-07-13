import React, { useEffect, useCallback, useState, memo, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '@/store/store';
import PropTypes from 'prop-types';
import { toast } from 'react-hot-toast';
import { fetchContacts, selectContactPriority, updateContactMembership, freshSyncContacts, hideContact, updateContactDisplayName, updateContactLastMessage } from '@/store/slices/contactSlice';
import logger from '@/utils/logger';
import { SYNC_STATES } from '@/utils/syncUtils';
import { getSocket, initializeSocket } from '@/utils/socket';
import { format } from 'date-fns';
import api from '@/utils/api';
import { BiSolidHide } from "react-icons/bi";
import { MdCloudSync } from "react-icons/md";
import { FiEdit3, FiRefreshCw, FiSearch, FiX, FiMessageSquare, FiFilter } from "react-icons/fi";
import useAvatarCache from '@/hooks/useAvatarCache';
import '@/components/styles/ShakeAnimation.css';
import platformManager from '@/services/PlatformManager';
import ErrorMessage from '@/components/ui/ErrorMessage';
import { useIsMobile } from '@/hooks/use-mobile';
import { Virtuoso } from 'react-virtuoso';
import { Loader2 } from "lucide-react";
import { useInboxNotifications } from '@liveblocks/react';

// Import shadcn UI components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import sync_experience from '@/components/assets/sync.gif'
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

// Update the ShimmerContactList component with more visible styling
const ShimmerContactList = () => (
  <div className="space-y-4 p-4 bg-background h-full min-h-[300px]">
    {[1, 2, 3, 4, 5, 6, 7].map((i) => (
      <div key={i} className="flex items-center space-x-4 p-3 bg-card rounded-md animate-pulse">
        <Skeleton className="h-12 w-12 rounded-full bg-muted" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-3/4 bg-muted" />
          <Skeleton className="h-4 w-1/2 bg-muted" />
        </div>
      </div>
    ))}
  </div>
);

// Component for showing priority
const PriorityBubble = ({ priority }) => {
  if (!priority) return null;
  
  const getColorClass = () => {
    switch (priority) {
      case 'high':
        return 'bg-red-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'low':
        return 'bg-green-500';
      default:
        return 'bg-gray-400';
    }
  };
  
  return (
    <Badge 
      variant="default" 
      className={`absolute left-1 top-1 size-2 rounded-full ${getColorClass()}`}
    />
  );
};

// New PriorityBadge component similar to TelegramContactList
const PriorityBadge = ({ priority }) => {
  if (!priority) return null;
  
  const getPriorityClasses = () => {
    switch (priority) {
      case 'High':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'Medium':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'Low':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };
  
  const className = getPriorityClasses();
  const label = priority.charAt(0).toUpperCase() + priority.slice(1);
  
  return (
    <Badge 
      variant="outline"
      className={`text-xs font-medium py-0.5 px-2 rounded ${className}`}
    >
      {label} Priority
    </Badge>
  );
};

// Contact Avatar component
const ContactAvatar = ({ contact, size = 40 }) => {
  const avatarUrl = contact.avatar_url || null;
  const displayName = contact.display_name || 'Unknown';
  const initials = displayName.substring(0, 2).toUpperCase();
  
  return (
    <Avatar className={`h-${size / 4} w-${size / 4}`}>
      {avatarUrl ? (
        <AvatarImage src={avatarUrl} alt={displayName} />
      ) : null}
      <AvatarFallback className="bg-secondary text-secondary-foreground">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
};

// Contact item component using shadcn components
interface ContactItemProps {
  contact: {
    id: number;
    display_name: string;
    last_message?: string;
    last_message_at?: string;
    avatar_url?: string;
    membership?: string;
  };
  onClick: () => void;
  isSelected: boolean;
  notificationCount?: number;
}

const ContactItem = memo(({ contact, onClick, isSelected, notificationCount }: ContactItemProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const priority = useSelector((state: RootState) => selectContactPriority(state, contact.id));
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(contact.display_name);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const editInputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isEditing && editInputRef.current && !editInputRef.current.contains(e.target)) {
        setIsEditing(false);
        setEditedName(contact.display_name);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing, contact.display_name]);

  const handleEdit = (e) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    
    try {
      // Call the backend API to delete the contact
      const response = await api.delete(`/api/v1/whatsapp/contacts/${contact.id}`, {
        data: { reason: 'Deleted by user' }
      });

      if (response.data?.status === 'success') {
        // Remove from Redux state
        dispatch(hideContact(contact.id));
        
        // Success feedback with smooth animation
        toast.success(`${contact.display_name} has been removed from your contacts`, {
          duration: 4000,
          style: {
            background: '#10B981',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)',
          },
        });
        
        logger.info('[WhatsApp] Contact deleted successfully:', {
          contactId: contact.id,
          contactName: contact.display_name
        });
      } else {
        throw new Error(response.data?.message || 'Failed to delete contact');
      }
    } catch (error) {
      logger.error('[WhatsAppContactList] Error deleting contact:', {
        contactId: contact.id,
        error: error.message
      });
      
      // Error feedback
      toast.error(`Failed to delete ${contact.display_name}. Please try again.`, {
        duration: 5000,
        style: {
          background: '#EF4444',
          color: '#ffffff',
          border: 'none',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)',
        },
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setShowTooltip(false); // Hide tooltip after action
    }
  };

  const handleNameSubmit = (e) => {
    if (e.key === 'Enter' && editedName.trim()) {
      dispatch(updateContactDisplayName({ contactId: contact.id, displayName: editedName.trim() }));
      setIsEditing(false);
    }
  };

  return (
    <>
      <div
        className={`p-4 rounded-lg mb-2 bg-card hover:bg-accent shadow-md cursor-pointer transition-all duration-200 border border-border hover:border-primary/20 relative ${
          isSelected ? 'bg-accent' : ''
        } ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}
        onClick={onClick}
        onMouseEnter={() => !isDeleting && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {showTooltip && !isDeleting && (
          <div className="absolute right-2 top-2 flex gap-2 z-10">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleEdit}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-blue-100 dark:hover:bg-blue-900 transition-all duration-200"
                  >
                    <FiEdit3 size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Edit contact name</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleDeleteClick}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900 transition-all duration-200"
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <BiSolidHide size={16} />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Delete contact</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
        
        <div className="flex items-center gap-3">
          <ContactAvatar contact={contact} />
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input
                ref={editInputRef}
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={handleNameSubmit}
                className="bg-input text-foreground px-2 py-1 rounded w-full border border-border"
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="text-foreground font-medium truncate">{contact.display_name}</div>
                  {priority && <PriorityBadge priority={priority} />}
                </div>
                <div className="text-muted-foreground text-sm truncate">
                  {contact.last_message && contact.last_message.trim() ? (
                    <span className="line-clamp-1">
                      {contact.last_message.length > 50 
                        ? `${contact.last_message.substring(0, 50)}...` 
                        : contact.last_message}
                    </span>
                  ) : notificationCount && notificationCount > 0 ? (
                    <span className="italic text-blue-500">
                      {notificationCount === 1 ? '1 new message' : `${notificationCount} new messages`}
                    </span>
                  ) : (
                    <span className="italic opacity-70">No messages yet</span>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="flex flex-col items-end space-y-1">
            {(contact.last_message_at || notificationCount > 0) && (
              <div className="text-muted-foreground text-xs flex-shrink-0">
                  {(() => {
                    try {
                      // 🚀 CRITICAL FIX: Show current time for notifications if no last_message_at
                      const timeToShow = contact.last_message_at || Date.now();
                      const date = new Date(timeToShow);
                      if (isNaN(date.getTime())) return 'Now';
                      
                      // 🚀 CRITICAL FIX: Better time formatting
                      const now = new Date();
                      const diffMs = now.getTime() - date.getTime();
                      const diffMinutes = Math.floor(diffMs / (1000 * 60));
                      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                      
                      // Show relative time for very recent messages
                      if (diffMinutes < 1) return 'Now';
                      if (diffMinutes < 60) return `${diffMinutes}m`;
                      if (diffHours < 24) return format(date, 'HH:mm');
                      if (diffDays < 7) return format(date, 'E HH:mm');
                      return format(date, 'MMM d');
                    } catch (error) {
                      console.warn('[WhatsAppContactList] Invalid date format:', contact.last_message_at, error);
                      return notificationCount > 0 ? 'Now' : 'Unknown';
                    }
                  })()}
              </div>
            )}
            {notificationCount && notificationCount > 0 ? (
              <Badge variant="destructive" className="h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full">
                {notificationCount}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader className="">
            <AlertDialogTitle className="flex items-center gap-2">
              <BiSolidHide className="h-5 w-5 text-red-500" />
              Delete Contact
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete <span className="font-semibold">{contact.display_name}</span>?
              </p>
              <p className="text-sm text-muted-foreground">
                This will permanently remove the contact and all associated data from both your device and our servers. This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="">
            <AlertDialogCancel 
              disabled={isDeleting}
              className="hover:bg-muted"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                <>
                  <BiSolidHide className="h-4 w-4 mr-2" />
                  Delete Contact
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

// Add a "Connect WhatsApp" component
const WhatsAppNotConnected = () => {
  const navigate = useNavigate();

  return (
    <Card className="h-full w-full border-none shadow-none bg-[#ECE5DD]/10">
      <CardContent className="flex flex-col items-center justify-center h-full py-10">
        <div className="p-4 rounded-full bg-gray-800 mb-4">
          <FiMessageSquare className="w-8 h-8 text-green-500" />
        </div>
        <CardTitle className="text-xl mb-2">WhatsApp Not Connected</CardTitle>
        <CardDescription className="text-center mb-6 max-w-md">
          You need to connect your WhatsApp account to view your contacts and messages.
        </CardDescription>
        <Button 
          onClick={() => navigate('/settings')}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          Connect WhatsApp
        </Button>
      </CardContent>
    </Card>
  );
};

// Add a "No Platforms Connected" component
const NoPlatformsConnected = () => {
  const navigate = useNavigate();

  return (
    <Card className="h-full w-full border-none shadow-none bg-neutral-900/10">
      <CardContent className="flex flex-col items-center justify-center h-full py-10">
        <div className="p-4 rounded-full bg-gray-800 mb-4">
          <FiMessageSquare className="w-8 h-8 text-blue-500" />
        </div>
        <CardTitle className="text-xl mb-2">No Platforms Connected</CardTitle>
        <CardDescription className="text-center mb-6 max-w-md">
          You need to connect to any messaging platform in Settings to view your inbox.
        </CardDescription>
        <Button 
          onClick={() => navigate('/settings')}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          Go to Settings
        </Button>
      </CardContent>
    </Card>
  );
};

interface WhatsAppContactListProps {
  onContactSelect: (contact: any) => void;
  selectedContactId?: number;
}

const WhatsAppContactList = ({ onContactSelect, selectedContactId }: WhatsAppContactListProps) => {
  const contacts = useSelector((state: RootState) => state.contacts.items);
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const session = useSelector((state: RootState) => state.auth.session);
  const loading = useSelector((state: RootState) => state.contacts.loading);
  const error = useSelector((state: RootState) => state.contacts.error);
  
  // CRITICAL FIX: Get the actual priorityMap from Redux state
  const priorityMap = useSelector((state: RootState) => state.contacts.priorityMap);

  // Get notifications from Liveblocks
  const { inboxNotifications } = useInboxNotifications();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastManualRefreshTime, setLastManualRefreshTime] = useState(0);
  const [syncProgress, setSyncProgress] = useState(null);
  const [showAcknowledgment, setShowAcknowledgment] = useState(false);
  const [hasShownAcknowledgment, setHasShownAcknowledgment] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // syncRequestId is used in the refreshContacts function
  const [syncRequestId, setSyncRequestId] = useState(null);
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const [refreshTooltip, setRefreshTooltip] = useState('');
  const refreshButtonRef = useRef(null);
  const syncStatusPollingRef = useRef(null);
  const [refreshRequired, setRefreshRequired] = useState(false);

  // Platform verification state
  const [isVerifyingPlatform, setIsVerifyingPlatform] = React.useState(false);
  const [verificationMessage, setVerificationMessage] = React.useState('');

  // Enhanced filtering and search state
  const [priorityFilter, setPriorityFilter] = useState({
    high: true,
    medium: true,
    low: true,
    none: true, // Contacts without priority
  });
  const [showPriorityFilter, setShowPriorityFilter] = useState(false);
  const [sortBy, setSortBy] = useState('activity'); // 'activity', 'priority', 'name'
  const [forceRefreshKey, setForceRefreshKey] = useState(0); // CRITICAL FIX: Force refresh key for real-time updates

  const unreadNotificationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (inboxNotifications) {
      for (const notification of inboxNotifications) {
        if (!notification.readAt && "subjectId" in notification && notification.subjectId) {
          counts[notification.subjectId] = (counts[notification.subjectId] || 0) + 1;
        }
      }
    }
    return counts;
  }, [inboxNotifications, forceRefreshKey]); // CRITICAL FIX: Add forceRefreshKey to dependencies

  // CRITICAL FIX: Track processed messages to prevent duplicates
  const processedMessageIds = useRef(new Set<string>());
  
  // CRITICAL FIX: Clear old processed message IDs periodically
  useEffect(() => {
    const cleanup = setInterval(() => {
      if (processedMessageIds.current.size > 1000) {
        processedMessageIds.current.clear();
        logger.info('[WhatsAppContactList] Cleared processed message IDs cache');
      }
    }, 60000); // Clean every minute
    
    return () => clearInterval(cleanup);
  }, []);

  // CRITICAL FIX: Force contact list re-sorting by updating array reference - MOVED BEFORE useEffect hooks
  const forceContactResort = useCallback(() => {
    // 🚀 CRITICAL FIX: Instead of sorting a local copy, we need to trigger the useMemo re-computation
    // The useMemo depends on contacts, so we need to ensure the contacts array gets a new reference
    // We'll do this by updating the forceRefreshKey which is in the useMemo dependencies
    
    logger.info('[WhatsAppContactList] 🔄 FORCING CONTACT RESORT - Triggering re-sort via forceRefreshKey');
    
    // Force re-render triggers - this will cause the useMemo to re-run
    setLastManualRefreshTime(Date.now());
    setForceRefreshKey(prev => prev + 1);
    
    // Also log current contact order for debugging
    setTimeout(() => {
      const sortedContacts = [...contacts].sort((a, b) => {
        if (!a || !b || !a.id || !b.id) return 0;
        
        try {
          // Get notification counts
          const aNotifications = unreadNotificationCounts[a.id] || 0;
          const bNotifications = unreadNotificationCounts[b.id] || 0;
          
          // 🚀 CRITICAL FIX: Latest message timestamp should be PRIMARY sort criteria
          const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          
          // STEP 1: Latest message ALWAYS wins first (regardless of notifications)
          if (aTime !== bTime) {
            return bTime - aTime; // Most recent first
          }
          
          // STEP 2: If same timestamp, then notifications get priority
          if (aNotifications !== bNotifications) {
            return bNotifications - aNotifications;
          }
          
          return 0;
        } catch (error) {
          return 0;
        }
      });
      
      logger.info('[WhatsAppContactList] 🔄 EXPECTED NEW ORDER after resort:', 
        sortedContacts.slice(0, 3).map(c => ({ 
          id: c.id, 
          name: c.display_name, 
          last_message: c.last_message?.substring(0, 20),
          last_message_at: c.last_message_at 
        }))
      );
    }, 150); // Small delay to see the result
  }, [contacts, unreadNotificationCounts, setLastManualRefreshTime, setForceRefreshKey]);

  // CRITICAL FIX: Optimize loadContactsWithRetry to prevent infinite loops
  const loadContactsWithRetry = useCallback(async (retryCount = 0) => {
    try {
      if (!session?.user?.id) {
        logger.warn('[WhatsAppContactList] No valid user ID in session, cannot fetch contacts');
        return;
      }
      
      // CRITICAL FIX: Prevent duplicate fetches by checking if already loading
      if (loading && retryCount === 0) {
        logger.info('[WhatsAppContactList] Already loading contacts, skipping duplicate fetch');
        return;
      }
      
      // Log active platform for debugging (reduced logging)
      const activePlatform = localStorage.getItem('dailyfix_active_platform');
      if (activePlatform !== 'whatsapp') {
        logger.info('[WhatsAppContactList] Not active platform, skipping fetch');
        return;
      }
      
      logger.info('[WhatsAppContactList] Fetching contacts...');
      const result = await dispatch(fetchContacts({
        userId: session.user.id,
        platform: 'whatsapp'
      })).unwrap();

      if (result?.inProgress) {
        logger.info('[WhatsAppContactList] Sync in progress, showing sync state');
        setSyncProgress({
          state: SYNC_STATES.SYNCING,
          message: 'Syncing contacts...'
        });
        return;
      }
    } catch (err) {
      logger.error('[WhatsAppContactList] Error fetching contacts:', err);
      if (retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
        logger.info(`[WhatsAppContactList] Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        setTimeout(() => {
          loadContactsWithRetry(retryCount + 1);
        }, delay);
      }
    }
  }, [dispatch, session?.user?.id, loading]); // CRITICAL FIX: Removed syncProgress from dependencies

  const handleRefresh = async () => {
    // Check if we're in cooldown period
    if (refreshCooldown) {
      // IMPROVED: More engaging messages when clicking refresh multiple times
      const messages = [
        'Whoa there! Still refreshing, give it a moment...',
        'Patience, young padawan. Contacts are still syncing...',
        'Hold your horses! Sync in progress...',
        "I'm working as fast as I can! Still syncing...",
        "Rome wasn't built in a day, and neither is your contact list. Still syncing...",
      ];
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      setRefreshTooltip(randomMessage);

      // Shake the button to provide visual feedback
      if (refreshButtonRef.current) {
        refreshButtonRef.current.classList.add('shake-animation');
        setTimeout(() => {
          refreshButtonRef.current?.classList.remove('shake-animation');
        }, 500);
      }
      return;
    }

    // Check if we've refreshed recently (within 3 seconds)
    const now = Date.now();
    if (now - lastManualRefreshTime < 3000) {
      toast('Please wait a moment before refreshing again');
      return;
    }

    // CRITICAL FIX: Set a timeout to ensure we don't get stuck
    const syncTimeout = setTimeout(() => {
      if (syncProgress && syncProgress.state === SYNC_STATES.SYNCING) {
        logger.warn('[WhatsAppContactList] Sync timeout reached, forcing completion');
        setRefreshCooldown(false);
        setIsRefreshing(false);
        setSyncProgress({
          state: SYNC_STATES.APPROVED,
          message: 'Sync timed out, showing available contacts',
          progress: 100
        });
        if (session?.user?.id) {
          dispatch(fetchContacts({
            userId: session.user.id,
            platform: 'whatsapp'
          }));
        }
      }
    }, 60000);

    try {
      setIsRefreshing(true);
      setRefreshCooldown(true);
      setLastManualRefreshTime(now);

      setSyncProgress({
        state: SYNC_STATES.SYNCING,
        message: 'Starting fresh sync...',
        progress: 0
      });

      if (!session?.user?.id) {
        throw new Error('No valid user ID in session');
      }

      const result = await dispatch(freshSyncContacts({
        userId: session.user.id,
        platform: 'whatsapp'
      })).unwrap();

      // Check if we have a request ID to track
      if (result?.meta?.sync_info?.request_id) {
        setSyncRequestId(result.meta.sync_info.request_id);
      }

      // Check if sync is still in progress
      if (result?.meta?.sync_info?.is_syncing) {
        setSyncProgress({
          state: SYNC_STATES.SYNCING,
          message: 'Sync in progress...',
          progress: result?.meta?.sync_info?.progress || 10
        });

        // Start polling for sync status if we have a request ID
        if (result?.meta?.sync_info?.request_id) {
          pollSyncStatus(result.meta.sync_info.request_id);
        }

        toast.success('Contacts are being refreshed in the background');
      } else {
        // Sync completed immediately
        setSyncProgress({
          state: SYNC_STATES.APPROVED,
          message: 'Sync completed successfully',
          progress: 100
        });
        toast.success(result?.message || 'Contacts refreshed successfully');

        // Reset cooldown after a short delay
        setTimeout(() => {
          setRefreshCooldown(false);
          setSyncProgress(null); // ✅ Clear sync progress after completion
        }, 2000);

        // Clear the sync timeout
        clearTimeout(syncTimeout);
      }
    } catch (error) {
      const errorMsg = error?.message || String(error);
      let errorMessage = 'Failed to refresh contacts.';
      if (errorMsg.toLowerCase().includes('timeout')) {
        errorMessage = 'Fresh syncing stopped due to timeout';
      } else if (errorMsg.toLowerCase().includes('failed')) {
        errorMessage = errorMsg;
      }

      toast.error('Sync encountered an issue: ' + errorMessage);
      setSyncProgress({
        state: SYNC_STATES.REJECTED,
        message: errorMessage,
        progress: 0
      });

      // Reset cooldown after error
      setRefreshCooldown(false);

      // Clear the sync timeout
      clearTimeout(syncTimeout);
    } finally {
      setIsRefreshing(false);

      // Clear tooltip after a delay
      setTimeout(() => {
        setRefreshTooltip('');
      }, 3000);
    }

    // When refresh is clicked, allow interactions
    setRefreshRequired(false);
  };

  // Function to poll sync status
  const pollSyncStatus = useCallback((requestId) => {
    if (!requestId) return;

    let pollCount = 0;
    const maxPolls = 15; // Maximum number of polls (15 * 2s = 30s)
    let consecutiveErrors = 0;
    let lastProgress = 0;
    let stuckCount = 0;

    const pollInterval = setInterval(async () => {
      try {
        pollCount++;

        // Store the interval reference
        syncStatusPollingRef.current = pollInterval;

        // Get sync status from API
        const response = await api.get(`/api/v1/whatsapp/syncStatus?requestId=${requestId}`);
        const statusData = response.data;

        logger.info('[WhatsAppContactList] Sync status poll:', {
          requestId,
          pollCount,
          status: statusData
        });

        // CRITICAL FIX: Check if progress is stuck
        if (statusData.progress === lastProgress) {
          stuckCount++;
        } else {
          stuckCount = 0;
          lastProgress = statusData.progress;
        }

        // If progress is stuck for too long (5 polls = 10 seconds), consider it completed
        if (stuckCount >= 5) {
          logger.warn('[WhatsAppContactList] Sync progress appears stuck, forcing completion');
          clearInterval(pollInterval);
          setRefreshCooldown(false);
          setSyncProgress({
            state: SYNC_STATES.APPROVED,
            message: 'Sync completed (timeout)',
            progress: 100
          });
          
          // Clear sync progress after timeout
          setTimeout(() => {
            setSyncProgress(null);
          }, 2000);

          // Fetch the updated contacts
          if (session?.user?.id) {
            dispatch(fetchContacts({
              userId: session.user.id,
              platform: 'whatsapp'
            }));
          }
          return;
        }

        // CRITICAL FIX: Double-check with /contacts endpoint if sync is really still in progress
        if (pollCount % 3 === 0 && statusData.is_syncing) {
          try {
            const contactsResponse = await api.get('/api/v1/whatsapp/contacts');
            const contactsData = contactsResponse.data;

            // If contacts endpoint says sync is complete but status endpoint disagrees,
            // trust the contacts endpoint
            if (contactsData?.meta?.sync_info &&
                !contactsData.meta.sync_info.is_syncing &&
                statusData.is_syncing) {
              logger.warn('[WhatsAppContactList] Sync status mismatch detected, forcing completion');
              clearInterval(pollInterval);
              setRefreshCooldown(false);
              setSyncProgress({
                state: SYNC_STATES.APPROVED,
                message: 'Sync completed successfully',
                progress: 100
              });

              // Fetch the updated contacts
              if (session?.user?.id) {
                dispatch(fetchContacts({
                  userId: session.user.id,
                  platform: 'whatsapp'
                }));
              }
              return;
            }
          } catch (contactsError) {
            logger.error('[WhatsAppContactList] Error checking contacts endpoint:', contactsError);
          }
        }

        if (!statusData.is_syncing) {
          // Sync completed
          clearInterval(pollInterval);
          setRefreshCooldown(false);
          setSyncProgress({
            state: SYNC_STATES.APPROVED,
            message: 'Sync completed successfully',
            progress: 100
          });

          // Fetch the updated contacts
          if (session?.user?.id) {
            dispatch(fetchContacts({
              userId: session.user.id,
              platform: 'whatsapp'
            }));
          }

          toast.success('Contacts refreshed successfully');
        } else {
          // Update progress
          setSyncProgress({
            state: SYNC_STATES.SYNCING,
            message: statusData.message || 'Sync in progress...',
            progress: statusData.progress || 50
          });
        }

        // Stop polling after max attempts
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          setRefreshCooldown(false);
          setSyncProgress({
            state: SYNC_STATES.APPROVED,
            message: 'Sync completed (timeout)',
            progress: 100
          });

          // Fetch the updated contacts anyway
          if (session?.user?.id) {
            dispatch(fetchContacts({
              userId: session.user.id,
              platform: 'whatsapp'
            }));
          }
        }

        // Reset consecutive errors counter on success
        consecutiveErrors = 0;
      } catch (error) {
        logger.error('[WhatsAppContactList] Error polling sync status:', error);
        consecutiveErrors++;

        // If polling fails consistently, stop after fewer attempts
        if (consecutiveErrors >= 3 || pollCount > 5) {
          clearInterval(pollInterval);
          setRefreshCooldown(false);
          setSyncProgress({
            state: SYNC_STATES.APPROVED,
            message: 'Sync status unknown, showing available contacts',
            progress: 100
          });

          // Fetch whatever contacts are available
          if (session?.user?.id) {
            dispatch(fetchContacts({
              userId: session.user.id,
              platform: 'whatsapp'
            }));
          }
        }
      }
    }, 2000); // Poll every 2 seconds

    // Safety cleanup after 2 minutes
    setTimeout(() => {
      if (syncStatusPollingRef.current === pollInterval) {
        clearInterval(pollInterval);
        logger.info('[WhatsAppContactList] Safety cleanup triggered for sync polling');
        setSyncProgress({
          state: SYNC_STATES.APPROVED,
          message: 'Sync timed out',
          progress: 100
        });
      }
      if (refreshCooldown) {
        setRefreshCooldown(false);
        setSyncProgress({
          state: SYNC_STATES.APPROVED,
          message: 'Sync status polling timed out',
          progress: 100
        });
      }
    }, 120000);
  }, [dispatch, refreshCooldown, session]);

  const handleContactSelect = useCallback(async (contact) => {
    // Prevent contact selection if refresh is required
    if (refreshRequired) {
      toast('Please refresh contacts first');
      return;
    }
    
    try {
      logger.info('[WhatsAppContactList] Handling contact selection:', {
        contactId: contact.id,
        membership: contact?.membership
      });
      
      // Remove tooltips immediately to prevent UI interference
      const tooltips = document.querySelectorAll('.tooltip');
      tooltips.forEach(t => t.remove());

      const membership = contact?.membership;
      switch (membership) {
        case 'invite':
          try {
            logger.info('[WhatsAppContactList] Auto-accepting invite for contact:', contact.id);
            const response = await api.post(`/api/v1/whatsapp/contacts/${contact.id}/accept`);
            if (response.data?.success) {
              logger.info('[WhatsAppContactList] Invite accepted successfully:', {
                contactId: contact.id,
                response: response.data
              });
              const updatedContact = response.data.contact || { ...contact, membership: 'join' };
              dispatch(updateContactMembership({ contactId: contact.id, updatedContact }));
              
              // Ensure selection is called with the updated contact
              onContactSelect(updatedContact);
            } else if (response.data?.joinedBefore) {
              logger.info('[WhatsAppContactList] Contact was already joined:', contact.id);
              
              // Make sure the contact has updated membership
              const updatedContact = { ...contact, membership: 'join' };
              onContactSelect(updatedContact);
            } else {
              logger.warn('[WhatsAppContactList] Invite acceptance failed:', {
                contactId: contact.id,
                error: response.data?.message
              });
              onContactSelect({ ...contact });
            }
          } catch (error) {
            logger.error('[WhatsAppContactList] Error accepting invite:', {
              contactId: contact.id,
              error: error.message
            });
            onContactSelect({ ...contact });
          }
          break;
        case 'leave':
          toast.error('You have left this chat');
          return;
        case 'ban':
          toast.error('You are banned from this chat');
          return;
        case 'join':
          onContactSelect({ ...contact });
          break;
        case undefined:
          logger.warn('[WhatsAppContactList] Contact has no membership state:', contact);
          onContactSelect({ ...contact });
          break;
        default:
          logger.warn('[WhatsAppContactList] Unknown membership state:', membership);
          toast.error('Invalid membership status');
          return;
      }
    } catch (err) {
      logger.error('[WhatsAppContactList] Error handling contact selection:', err);
      toast.error('Failed to select contact');
    }
  }, [onContactSelect, dispatch, refreshRequired]);

  // This function is used by child components via props
  const handleContactUpdate = useCallback((updatedContact) => {
    dispatch(updateContactMembership({ contactId: updatedContact.id, updatedContact }));
  }, [dispatch]);

  // CRITICAL FIX: Simplified initial contact loading - only load once on mount
  useEffect(() => {
    if (!session) {
      logger.warn('[WhatsAppContactList] No session found, redirecting to login');
      navigate('/login');
      return;
    }
    
    // Only load contacts if we don't already have them and we're not already loading
    if (contacts.length === 0 && !loading) {
      loadContactsWithRetry();
    }
  }, [session, navigate]); // CRITICAL FIX: Removed loadContactsWithRetry from dependencies

  // CRITICAL FIX: Simplified platform change handling - removed redundant checks
  useEffect(() => {
    const handlePlatformSwitch = () => {
      const activePlatform = localStorage.getItem('dailyfix_active_platform');
      if (activePlatform === 'whatsapp') {
        logger.info('[WhatsAppContactList] Platform switched to WhatsApp, requiring refresh');
        setRefreshRequired(true);
      }
    };
    
    window.addEventListener('platform-switched', handlePlatformSwitch);
    
    return () => {
      window.removeEventListener('platform-switched', handlePlatformSwitch);
    };
  }, []); // CRITICAL FIX: Empty dependency array to prevent re-registration

  // CRITICAL FIX: Optimized socket initialization to prevent infinite loops
  useEffect(() => {
    const initSocket = async () => {
      try {
        // Add explicit check for valid session before initializing socket
        if (!session?.access_token || !session?.user?.id) {
          logger.warn('[WhatsAppContactList] Cannot initialize socket - no valid session');
          return;
        }

        // Now attempt socket initialization with the validated session
        const socket = await initializeSocket({ platform: 'whatsapp' });

        if (!socket) {
          logger.error('[WhatsAppContactList] Failed to get socket instance');
          return;
        }

        const handleSyncProgress = (data) => {
          if (data.userId === session.user.id) {
            setSyncProgress({
              state: SYNC_STATES.SYNCING,
              progress: data.progress,
              message: data.details || 'Syncing contacts...'
            });
          }
        };

        const handleSyncComplete = (data) => {
          if (data.userId === session.user.id) {
            setSyncProgress(null);
            // Only reload if we're the active platform
            const activePlatform = localStorage.getItem('dailyfix_active_platform');
            if (activePlatform === 'whatsapp') {
              loadContactsWithRetry();
            }
          }
        };

        const handleSyncError = (data) => {
          if (data.userId === session.user.id) {
            setSyncProgress({
              state: SYNC_STATES.REJECTED,
              message: data.error || 'Sync failed'
            });
            toast.error('Contact sync failed: ' + (data.error || 'Unknown error'));
          }
        };

        const handleContactRemoved = (data) => {
          if (data.userId === session.user.id) {
            logger.info('[WhatsAppContactList] Contact removed by backend via socket:', {
              contactId: data.contactId,
              reason: data.reason
            });
            
            // Remove from Redux state
            dispatch(hideContact(data.contactId));
            
            // Clear selection if the removed contact was currently selected
            if (selectedContactId === data.contactId) {
              onContactSelect(null);
            }
            
            // Show informative toast
            toast.success(data.message || 'Contact has been automatically removed', {
              duration: 6000,
              style: {
                background: '#10B981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)',
              },
            });
          }
        };

        // Add listeners for real-time updates
        socket.on('whatsapp:sync_progress', handleSyncProgress);
        socket.on('whatsapp:sync_complete', handleSyncComplete);
        socket.on('whatsapp:sync_error', handleSyncError);
        socket.on('whatsapp:contact:removed', handleContactRemoved);

        // 🚨 CRITICAL FIX: JOIN USER ROOM TO RECEIVE BACKEND EVENTS
        const userRoom = `user:${session.user.id}`;
        socket.emit('join:room', userRoom);
        logger.info(`[WhatsAppContactList] 🎯 JOINING USER ROOM: ${userRoom}`);
        
        // 🚨 CRITICAL FIX: Authenticate with user ID for targeted events
        socket.emit('authenticate', { userId: session.user.id });
        logger.info(`[WhatsAppContactList] 🎯 AUTHENTICATING USER: ${session.user.id}`);

        // 🚨 CRITICAL FIX: Add confirmation handlers
        socket.on('room:joined', (data) => {
          logger.info(`[WhatsAppContactList] ✅ ROOM JOINED CONFIRMED: ${data.roomId}`);
        });
        
        socket.on('authenticated', (data) => {
          logger.info(`[WhatsAppContactList] ✅ AUTHENTICATION CONFIRMED:`, data);
        });
        
        socket.on('room:error', (data) => {
          logger.error(`[WhatsAppContactList] ❌ ROOM JOIN ERROR:`, data);
        });

        // CRITICAL FIX: Add missing real-time message listeners
        socket.on('whatsapp:contact_auto_created', (data: any) => {
          logger.info('🎯 Auto-created contact received via WebSocket:', {
            contactId: data.contact?.id,
            displayName: data.contact?.display_name,
            platform: data.platform,
            source: data.source
          });
          
          // Refresh contact list to include the new auto-created contact
          if (session?.user?.id) {
            dispatch(fetchContacts({
              userId: session.user.id,
              platform: 'whatsapp'
            }));
          }
          
          // Show success notification
          toast.success(`New contact "${data.contact?.display_name}" auto-created successfully`);
        });

        // CRITICAL FIX: Listen for real-time message updates
        socket.on('whatsapp:message_received', (data: any) => {
          // 🚀 CRITICAL FIX: Create unique message ID to prevent duplicates
          const messageId = `${data.contactId}-${data.timestamp}-${data.message?.substring(0, 10)}`;
          
          if (processedMessageIds.current.has(messageId)) {
            logger.debug('[WhatsAppContactList] Skipping duplicate message:', { messageId, contactId: data.contactId });
            return;
          }
          
          processedMessageIds.current.add(messageId);
          
          logger.info('📨 Message received via WebSocket:', {
            contactId: data.contactId,
            message: data.message,
            timestamp: data.timestamp,
            messageId
          });
          
          // Update contact's last message in real-time
          if (data.contactId && data.message) {
            dispatch(updateContactLastMessage({
              contactId: data.contactId,
              lastMessage: data.message,
              lastMessageAt: data.timestamp
            }));
            
            // 🚀 CRITICAL FIX: Force immediate re-render and re-sort
            setTimeout(() => {
              forceContactResort();
            }, 100); // Small delay to ensure Redux state updates first
          }
        });

        // CRITICAL FIX: Also listen for traditional whatsapp:message events
        socket.on('whatsapp:message', (data: any) => {
          logger.info('📨 Traditional message received via WebSocket:', {
            contactId: data.contactId,
            messageContent: data.message?.content,
            messageId: data.message?.message_id
          });
          
          // Update contact's last message from traditional system
          if (data.contactId && data.message) {
            const messageText = data.message.content || data.message.body || '';
            const messageTime = data.message.timestamp || data.message.sent_at || Date.now();
            
            dispatch(updateContactLastMessage({
              contactId: data.contactId,
              lastMessage: messageText,
              lastMessageAt: messageTime
            }));
          }
        });

        return () => {
          socket.off('whatsapp:sync_progress', handleSyncProgress);
          socket.off('whatsapp:sync_complete', handleSyncComplete);
          socket.off('whatsapp:sync_error', handleSyncError);
          socket.off('whatsapp:contact:removed', handleContactRemoved);
          socket.off('whatsapp:contact_auto_created');
          socket.off('whatsapp:message_received');
          socket.off('whatsapp:message'); // Clean up traditional listener
          socket.off('room:joined');
          socket.off('authenticated');
          socket.off('room:error');
        };
      } catch (error) {
        logger.error('[WhatsAppContactList] Socket initialization error:', error);
      }
    };

    // Only attempt to initialize the socket if we have a session
    if (session?.access_token) {
      initSocket();
    }
  }, [session?.access_token, session?.user?.id, dispatch, forceContactResort]); // CRITICAL FIX: Optimized dependencies

  // CRITICAL FIX: Enhanced real-time contact updates from Liveblocks notifications
  useEffect(() => {
    if (inboxNotifications && inboxNotifications.length > 0) {
      // Process new unread notifications to update contact last messages
      const newNotifications = inboxNotifications.filter(notification => !notification.readAt);
      
      newNotifications.forEach(notification => {
        if (notification.kind === '$whatsappMessage' && notification.activities?.[0]?.data) {
          const activityData = notification.activities[0].data;
          const { contact_id, message, timestamp } = activityData;
          
          if (contact_id && message) {
            // 🚀 CRITICAL FIX: Create unique message ID to prevent duplicates
            const messageText = String(message); // Convert to string first
            const messageId = `liveblocks-${contact_id}-${timestamp}-${messageText?.substring(0, 10)}`;
            
            if (processedMessageIds.current.has(messageId)) {
              logger.debug('[WhatsAppContactList] Skipping duplicate Liveblocks message:', { messageId, contact_id });
              return;
            }
            
            processedMessageIds.current.add(messageId);
            
            logger.info('🔔 Processing Liveblocks notification for real-time contact update:', {
              contactId: contact_id,
              message: messageText,
              timestamp: timestamp,
              messageId
            });
            
            // Update contact's last message from Liveblocks notification
            dispatch(updateContactLastMessage({
              contactId: parseInt(String(contact_id)),
              lastMessage: messageText,
              lastMessageAt: timestamp || Date.now()
            }));
            
            // 🚀 CRITICAL FIX: Force contact resort after Redux update
            setTimeout(() => {
              forceContactResort();
            }, 100);
          }
        }
      });
    }
  }, [inboxNotifications, dispatch, forceContactResort]);

  // 🚀 CRITICAL FIX: Listen for user's own SENT messages to update contact list
  useEffect(() => {
    const handleSentMessage = (event: CustomEvent) => {
      const { contactId, message, timestamp } = event.detail;
      
      if (contactId && message) {
        // 🚀 CRITICAL FIX: Create unique message ID to prevent duplicates
        const messageId = `sent-${contactId}-${timestamp}-${message?.substring(0, 10)}`;
        
        if (processedMessageIds.current.has(messageId)) {
          logger.debug('[WhatsAppContactList] Skipping duplicate sent message:', { messageId, contactId });
          return;
        }
        
        processedMessageIds.current.add(messageId);
        
        logger.info('🎯 User sent message - updating contact list:', {
          contactId,
          message,
          timestamp,
          messageId
        });
        
        // Update contact's last message with sent message
        dispatch(updateContactLastMessage({
          contactId: parseInt(contactId),
          lastMessage: message,
          lastMessageAt: timestamp || Date.now()
        }));
        
        // 🚀 CRITICAL FIX: Force contact resort after Redux update
        setTimeout(() => {
          forceContactResort();
        }, 100);
      }
    };

    // Listen for sent message events from ChatView
    window.addEventListener('whatsapp-message-sent', handleSentMessage as EventListener);
    
    return () => {
      window.removeEventListener('whatsapp-message-sent', handleSentMessage as EventListener);
    };
  }, [dispatch, forceContactResort]);

  // CRITICAL FIX: Listen for custom events from notification system
  useEffect(() => {
    const handleMessageUpdate = (event: CustomEvent) => {
      const { contactId, message, timestamp } = event.detail;
      
      if (contactId && message) {
        // 🚀 CRITICAL FIX: Create unique message ID to prevent duplicates
        const messageId = `custom-${contactId}-${timestamp}-${message?.substring(0, 10)}`;
        
        if (processedMessageIds.current.has(messageId)) {
          logger.debug('[WhatsAppContactList] Skipping duplicate custom message:', { messageId, contactId });
          return;
        }
        
        processedMessageIds.current.add(messageId);
        
        logger.info('🎯 Received message update event:', {
          contactId,
          message,
          timestamp,
          messageId
        });
        
        // Update contact's last message
        dispatch(updateContactLastMessage({
          contactId: parseInt(contactId),
          lastMessage: message,
          lastMessageAt: timestamp || Date.now()
        }));
        
        // 🚀 CRITICAL FIX: Force contact resort after Redux update
        setTimeout(() => {
          forceContactResort();
        }, 100);
      }
    };

    window.addEventListener('whatsapp-message-update', handleMessageUpdate as EventListener);
    
    return () => {
      window.removeEventListener('whatsapp-message-update', handleMessageUpdate as EventListener);
    };
  }, [dispatch, forceContactResort]);

  // Initialize avatar cache hook
  const { prefetchAvatars, clearExpiredAvatars } = useAvatarCache();

  // Prefetch avatars for visible contacts
  useEffect(() => {
    if (contacts && contacts.length > 0) {
      // Get contacts with avatar URLs
      const contactsWithAvatars = contacts.filter(c => c.avatar_url);
      
      // Only log in development mode to reduce console spam
      if (process.env.NODE_ENV === 'development') {
        console.log(`Found ${contactsWithAvatars.length} contacts with avatars out of ${contacts.length} total`);
      }

      // Prefetch avatars in the background
      prefetchAvatars(contactsWithAvatars);

      // Clear expired avatars once per session
      clearExpiredAvatars(7); // Clear avatars older than 7 days
    }
  }, [contacts, prefetchAvatars, clearExpiredAvatars]);

  const filteredContacts = useMemo(() => {
    const displayNameMap = new Map();
    return contacts.filter(contact => {
      const displayName = contact.display_name?.toLowerCase() || '';
      
      // CRITICAL: Only show contacts with 'join' or 'invite' membership
      const membership = contact.membership;
      if (membership && membership !== 'join' && membership !== 'invite') {
        return false; // Filter out 'leave', 'ban', etc.
      }
      
      // Filter out any contact with 'bot' in the name
      if (displayName.includes('bot')) return false;
      
      // Filter out bridge bots specifically (redundant but explicit)
      if (displayName.includes('whatsapp bridge') || 
          displayName === 'whatsapp bridge bot') return false;
      
      // Filter out status broadcasts
      if (displayName.includes('whatsapp status') ||
          displayName.includes('status broadcast') ||
          displayName.includes('broadcast')) return false;

      // CRITICAL: Filter out any Telegram-related contacts that might leak into WhatsApp list
      if (displayName.includes('telegram') || 
          displayName.includes('tg') ||
          displayName.includes('(tg)')) return false;

      if (displayNameMap.has(displayName)) {
        const existing = displayNameMap.get(displayName);
        const existingTime = new Date(existing.last_message_at || 0).getTime();
        const currentTime = new Date(contact.last_message_at || 0).getTime();
        if (currentTime > existingTime) {
          displayNameMap.set(displayName, contact);
          return true;
        }
        return false;
      }
      displayNameMap.set(displayName, contact);
      return true;
    });
  }, [contacts]);

  // Enhanced filtering and sorting with notifications, priorities, and search
  const processedContacts = useMemo(() => {
    let filtered = filteredContacts;

    // CRITICAL FIX: Reduced debug logging to prevent console spam
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] Priority filtering - priorityMap size:', Object.keys(priorityMap || {}).length);
      console.log('[DEBUG] Priority filtering - priorityFilter:', priorityFilter);
    }

    // Apply priority filtering
    if (!priorityFilter.high || !priorityFilter.medium || !priorityFilter.low || !priorityFilter.none) {
      filtered = filtered.filter(contact => {
        // CRITICAL FIX: Add safety check for contact existence
        if (!contact || !contact.id) return false;
        
        try {
          const priority = selectContactPriority({ contacts: { items: contacts, priorityMap: priorityMap } }, contact.id);
          
          if (!priority && priorityFilter.none) return true;
          if (priority === 'high' && priorityFilter.high) return true;
          if (priority === 'medium' && priorityFilter.medium) return true;
          if (priority === 'low' && priorityFilter.low) return true;
          
          return false;
        } catch (error) {
          // If priority check fails, include in 'none' filter
          return priorityFilter.none;
        }
      });
    }

    // Apply search filtering (search in display name and last message)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(contact => {
        const nameMatch = contact.display_name?.toLowerCase().includes(query);
        const messageMatch = contact.last_message?.toLowerCase().includes(query);
        return nameMatch || messageMatch;
      });
    }

    // 🚀 CRITICAL FIX: Proper sorting like real WhatsApp - LATEST MESSAGE FIRST ALWAYS
    return filtered.sort((a, b) => {
      // CRITICAL FIX: Add safety checks for contact existence
      if (!a || !b || !a.id || !b.id) return 0;
      
      try {
        // Get notification counts for both contacts
        const aNotifications = unreadNotificationCounts[a.id] || 0;
        const bNotifications = unreadNotificationCounts[b.id] || 0;
        
        // 🔥 STEP 1: LATEST MESSAGE TIME is the PRIMARY sort criteria (like real WhatsApp)
        const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        
        // CRITICAL: Latest message ALWAYS wins first (sent OR received)
        if (aTime !== bTime) {
          return bTime - aTime; // Most recent activity first
        }
        
        // 🔥 STEP 2: If same timestamp, then unread notifications get priority
        if (aNotifications !== bNotifications) {
          return bNotifications - aNotifications;
        }
        
        // 🔥 STEP 3: If same notifications and time, use priority as tiebreaker
        let aPriority, bPriority;
        try {
          aPriority = selectContactPriority({ contacts: { items: contacts, priorityMap: priorityMap } }, a.id);
        } catch (error) {
          aPriority = 'low';
        }
        
        try {
          bPriority = selectContactPriority({ contacts: { items: contacts, priorityMap: priorityMap } }, b.id);
        } catch (error) {
          bPriority = 'low';
        }
        
        const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
        const aPriorityScore = priorityOrder[aPriority] || 0;
        const bPriorityScore = priorityOrder[bPriority] || 0;
        
        if (aPriorityScore !== bPriorityScore) {
          return bPriorityScore - aPriorityScore;
        }
        
        // 🔥 STEP 4: Final fallback - alphabetical
        return (a.display_name || '').localeCompare(b.display_name || '');
      } catch (error) {
        logger.warn('[WhatsAppContactList] Error sorting contacts:', error);
        return 0;
      }
    });
  }, [filteredContacts, searchQuery, priorityFilter, sortBy, unreadNotificationCounts, contacts, priorityMap, forceRefreshKey, lastManualRefreshTime]); // CRITICAL FIX: Add contact data changes to dependencies

  const searchedContacts = processedContacts; // For backward compatibility

  // CRITICAL FIX: Removed the problematic useEffect that was causing infinite loops
  // The checkAndRefreshIfActive function was calling loadContactsWithRetry repeatedly
  // This was the main cause of the page hanging and infinite contact fetching

  // Listen for platform connection changes to refresh contacts - OPTIMIZED
  useEffect(() => {
    const handlePlatformConnectionChange = () => {
      const activePlatform = localStorage.getItem('dailyfix_active_platform');
      if (activePlatform === 'whatsapp' && session?.user?.id) {
        logger.info('[WhatsappContactList] Platform connection changed, refreshing contacts');
        // Small delay to ensure connection status is updated
        setTimeout(() => {
          dispatch(fetchContacts({
            userId: session.user.id,
            platform: 'whatsapp'
          }));
        }, 500);
      }
    };

    const handleForceRefresh = (event: CustomEvent) => {
      const activePlatform = localStorage.getItem('dailyfix_active_platform');
      if (activePlatform === 'whatsapp' && session?.user?.id) {
        logger.info('[WhatsappContactList] Force refresh requested from platform switcher');
        // Force refresh contacts immediately
        dispatch(freshSyncContacts({
          userId: session.user.id,
          platform: 'whatsapp'
        }));
      }
    };

    window.addEventListener('platform-connection-changed', handlePlatformConnectionChange);
    window.addEventListener('force-refresh-contacts', handleForceRefresh as EventListener);
    
    return () => {
      window.removeEventListener('platform-connection-changed', handlePlatformConnectionChange);
      window.removeEventListener('force-refresh-contacts', handleForceRefresh as EventListener);
    };
  }, [session?.user?.id, dispatch]); // CRITICAL FIX: Removed loadContactsWithRetry from dependencies

  // Listen for platform verification events
  useEffect(() => {
    const handlePlatformVerificationStart = (event: CustomEvent) => {
      if (event.detail?.platform === 'whatsapp') {
        setIsVerifyingPlatform(true);
        setVerificationMessage('Verifying WhatsApp connection...');
      }
    };

    const handlePlatformVerificationEnd = (event: CustomEvent) => {
      if (event.detail?.platform === 'whatsapp') {
        setIsVerifyingPlatform(false);
        setVerificationMessage('');
      }
    };

    // Handle contact auto-deletion events from backend
    const handleContactAutoDeleted = (event: CustomEvent) => {
      const { contactId, platform, message, reason } = event.detail;
      
      if (platform === 'whatsapp') {
        logger.info('[WhatsAppContactList] Contact auto-deleted by backend:', {
          contactId,
          reason,
          message
        });
        
        // Remove from Redux state
        dispatch(hideContact(contactId));
        
        // Show informative toast
        toast.success(message || 'Contact has been automatically removed', {
          duration: 6000,
          style: {
            background: '#10B981',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)',
          },
        });
      }
    };

    window.addEventListener('platform-verification-start', handlePlatformVerificationStart as EventListener);
    window.addEventListener('platform-verification-end', handlePlatformVerificationEnd as EventListener);
    window.addEventListener('contact-auto-deleted', handleContactAutoDeleted as EventListener);
    
    return () => {
      window.removeEventListener('platform-verification-start', handlePlatformVerificationStart as EventListener);
      window.removeEventListener('platform-verification-end', handlePlatformVerificationEnd as EventListener);
      window.removeEventListener('contact-auto-deleted', handleContactAutoDeleted as EventListener);
    };
  }, [dispatch]);

  // Show verification overlay during platform switching
  if (isVerifyingPlatform) {
    return (
      <div className="flex-1 overflow-hidden bg-background">
        <div className="flex items-center justify-center h-full p-8">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-green-500" />
            </div>
            <div>
              <h3 className="text-lg font-medium">Platform Verification</h3>
              <p className="text-muted-foreground">{verificationMessage}</p>
              <p className="text-sm text-muted-foreground mt-2">
                Please wait while we verify your WhatsApp connection...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className="flex flex-col h-full w-full border-none shadow-none rounded-lg bg-background opacity-90 relative">
      <CardHeader className="p-4 bg-header border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-header-foreground font-bold text-xl">WhatsApp Chats</CardTitle>
          <div className="flex items-center space-x-2 relative">
            {isRefreshing ? (
              <MdCloudSync className="animate-spin text-header-foreground w-6 h-6" />
            ) : refreshCooldown ? (
              <MdCloudSync className="text-header-foreground w-6 h-6 pulse-animation" />
            ) : (
              <FiRefreshCw className="text-header-foreground w-6 h-6" />
            )}
            <div className="flex flex-col">
              <Button
                onClick={handleRefresh}
                disabled={loading || isRefreshing}
                variant="ghost"
                className={`bg-header border-border text-header-foreground inline-flex px-3 py-1 items-center justify-center rounded-lg text-sm ${
                  loading || isRefreshing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent'
                } ${refreshCooldown ? 'bg-accent' : ''} ${refreshRequired ? 'animate-pulse bg-blue-700 hover:bg-blue-600' : ''}`}
                onMouseEnter={() => refreshCooldown ? setRefreshTooltip('Sync in progress') : refreshRequired && setRefreshTooltip('Click to refresh contacts')}
                onMouseLeave={() => setRefreshTooltip('')}
              >
                {isRefreshing ? 'Syncing...' : refreshCooldown ? 'Syncing...' : refreshRequired ? 'Refresh Required' : 'Refresh'}
                {syncProgress && syncProgress.state === SYNC_STATES.SYNCING && syncProgress.progress > 0 && (
                  <span className="ml-1 text-xs">{syncProgress.progress}%</span>
                )}
              </Button>
              {syncProgress && syncProgress.state === SYNC_STATES.SYNCING && (
                <Progress 
                  value={syncProgress.progress || 0} 
                  className="h-1 w-full bg-secondary"
                />
              )}
            </div>
            {refreshTooltip && (
              <div className="absolute top-full mt-2 right-0 bg-popover text-popover-foreground text-xs rounded py-1 px-2 z-10">
                {refreshTooltip}
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Enhanced Search and Filter Section */}
      <div className="sticky top-0 z-10 p-4 bg-background border-b border-border space-y-3">
        {/* Search Input */}
        <div className="relative">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts and messages..."
            className="w-full bg-card text-foreground px-10 py-2 rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary placeholder-muted-foreground"
          />
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
          {searchQuery && (
            <Button
              onClick={() => setSearchQuery('')}
              variant="ghost"
              size="icon"
              className="absolute right-3 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            >
              <FiX className="h-4 w-4" />
              <span className="sr-only">Clear search</span>
            </Button>
          )}
        </div>

        {/* Filter and Sort Controls */}
        <div className="flex items-center justify-between gap-2">
          {/* Sort Dropdown */}
          <div className="relative">
            <Button variant="outline" size="sm" className="text-xs">
              Sort: {sortBy === 'activity' ? 'Recent' : sortBy === 'priority' ? 'Priority' : 'Name'}
            </Button>
          </div>

          {/* Priority Filter */}
          <div className="relative">
            <Button 
              variant={showPriorityFilter ? "default" : "outline"} 
              size="sm" 
              className="text-xs"
              onClick={() => setShowPriorityFilter(!showPriorityFilter)}
            >
              <FiFilter className="w-3 h-3 mr-1" />
              Filter
            </Button>
          </div>
        </div>
      </div>

      {/* Contact List */}
      <CardContent className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <ShimmerContactList />
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-4">
            {/* <ErrorMessage message={`Failed to load contacts: ${error}`} /> */}
            <Button
              onClick={() => loadContactsWithRetry()}
              variant="default"
              className="mt-4"
            >
              Retry
            </Button>
          </div>
        ) : !searchedContacts?.length ? (
          <div className="flex flex-col items-center justify-center p-4 h-full min-h-[300px]">
            {searchQuery ? (
              <p className="text-muted-foreground">No contacts found matching "{searchQuery}"</p>
            ) : syncProgress?.state === SYNC_STATES.SYNCING ? (
              <>
                <img 
                  src={sync_experience} 
                  alt="Syncing contacts" 
                  className="w-32 h-32 mb-4"
                />
                <p className="text-muted-foreground">Syncing contacts...</p>
                {syncProgress.progress && (
                  <p className="text-sm text-muted-foreground mt-2">{syncProgress.progress}% complete</p>
                )}
              </>
            ) : (
              <>
                <div className="p-4 rounded-full bg-muted mb-4">
                  <FiMessageSquare className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground text-center">
                  There is nothing here right now.<br />
                  Check back any time soon.
                </p>
              </>
            )}
          </div>
        ) : (
          <Virtuoso
            key={`contacts-${forceRefreshKey}-${lastManualRefreshTime}-${JSON.stringify(contacts.map(c => c.last_message_at)).slice(0, 50)}`}
            style={{ height: '100%' }}
            data={searchedContacts}
            itemContent={(index, contact) => {
              const notificationCount = unreadNotificationCounts[contact.id] || 0;
              
              // MOBILE UX FIX: Proper touch handling for mobile scrolling
              let touchStartY = 0;
              let touchStartX = 0;
              let touchStartTime = 0;
              let isTouchMoved = false;
              
              const handleTouchStart = (e: React.TouchEvent) => {
                const touch = e.touches[0];
                touchStartY = touch.clientY;
                touchStartX = touch.clientX;
                touchStartTime = Date.now();
                isTouchMoved = false;
              };
              
              const handleTouchMove = (e: React.TouchEvent) => {
                const touch = e.touches[0];
                const deltaY = Math.abs(touch.clientY - touchStartY);
                const deltaX = Math.abs(touch.clientX - touchStartX);
                
                // If user moved more than 10px in any direction, consider it a scroll/swipe
                if (deltaY > 10 || deltaX > 10) {
                  isTouchMoved = true;
                }
              };
              
              const handleTouchEnd = (e: React.TouchEvent) => {
                const touchEndTime = Date.now();
                const touchDuration = touchEndTime - touchStartTime;
                
                // Only trigger click if:
                // 1. Touch didn't move significantly (not a scroll)
                // 2. Touch duration was reasonable (not a long press)
                // 3. Touch duration was not too short (not accidental)
                if (!isTouchMoved && touchDuration > 100 && touchDuration < 500) {
                  e.preventDefault();
                  handleContactSelect(contact);
                }
              };
              
              return (
                <div
                  key={contact.id}
                  className="cursor-pointer transition-colors duration-200"
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onClick={(e) => {
                    // Only handle click on non-touch devices
                    if (e.detail === 0) return; // Ignore programmatic clicks
                    if ('ontouchstart' in window) return; // Ignore on touch devices
                    handleContactSelect(contact);
                  }}
                >
                  <ContactItem
                    contact={contact}
                    isSelected={contact.id === selectedContactId}
                    notificationCount={notificationCount}
                    onClick={() => {
                      // This onClick is now handled by the parent div's events
                      // Keep it here for compatibility but don't use it directly
                    }}
                  />
                </div>
              );
            }}
          />
        )}
        
        {/* Overlay that prevents interaction until refreshed */}
        {refreshRequired && !loading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
            <div className="bg-popover p-6 rounded-lg text-center max-w-sm">
              <FiRefreshCw className="mx-auto text-primary w-10 h-10 mb-4 animate-spin" />
              <h3 className="text-popover-foreground font-bold text-xl mb-2">Refresh Required</h3>
              <p className="text-muted-foreground mb-4">
                Please refresh your contacts to continue
              </p>
              <Button
                onClick={handleRefresh}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Refresh Now
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WhatsAppContactList;
