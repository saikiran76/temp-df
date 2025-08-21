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

// 🚀 NEW: Enhanced contact sync state interface
interface ContactSyncState {
  isActive: boolean;
  status: 'idle' | 'connecting' | 'fetching' | 'processing' | 'validating' | 'caching' | 'complete' | 'error' | 'timeout';
  message: string;
  progress: number;
  contactsFound?: number;
  contactsProcessed?: number;
  duration?: number;
  error?: string;
  timestamp: string;
  showInHeader: boolean;
}

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
  isLoading?: boolean; // 🚀 CRITICAL UX FIX: Add loading state prop
}

const ContactItem = memo(({ contact, onClick, isSelected, notificationCount, isLoading = false }: ContactItemProps) => {
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
      const response = await api.delete(`/api/v1/telegram/contacts/${contact.id}`, {
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
        
        logger.info('[telegram] Contact deleted successfully:', {
          contactId: contact.id,
          contactName: contact.display_name
        });
      } else {
        throw new Error(response.data?.message || 'Failed to delete contact');
      }
    } catch (error) {
      logger.error('[telegramContactList] Error deleting contact:', {
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
        } ${isDeleting ? 'opacity-50 pointer-events-none' : ''} ${
          isLoading ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 animate-pulse' : ''
        }`}
        onClick={isLoading ? undefined : onClick}
        onMouseEnter={() => !isDeleting && !isLoading && setShowTooltip(true)}
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
          <div className="relative">
            <ContactAvatar contact={contact} />
            {/* 🚀 CRITICAL UX FIX: Show loading spinner on avatar when loading */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-full">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              </div>
            )}
          </div>
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
                      console.warn('[telegramContactList] Invalid date format:', contact.last_message_at, error);
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

// Add a "Connect telegram" component
const TelegramNotConnected = () => {
  const navigate = useNavigate();

  return (
    <Card className="h-full w-full border-none shadow-none bg-[#ECE5DD]/10">
      <CardContent className="flex flex-col items-center justify-center h-full py-10">
        <div className="p-4 rounded-full bg-gray-800 mb-4">
          <FiMessageSquare className="w-8 h-8 text-green-500" />
        </div>
        <CardTitle className="text-xl mb-2">Telegram Not Connected</CardTitle>
        <CardDescription className="text-center mb-6 max-w-md">
          You need to connect your Telegram account to view your contacts and messages.
        </CardDescription>
        <Button 
          onClick={() => navigate('/settings')}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          Connect Telegram
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

interface TelegramContactListProps {
  onContactSelect: (contact: any) => void;
  selectedContactId?: number;
}

const TelegramContactList = ({ onContactSelect, selectedContactId }: TelegramContactListProps) => {
  const contacts = useSelector((state: RootState) => state.contacts.items);
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const session = useSelector((state: RootState) => state.auth.session);
  const loading = useSelector((state: RootState) => state.contacts.loading);
  const error = useSelector((state: RootState) => state.contacts.error);
  
  // 🚀 CRITICAL UX FIX: Add loading state for contact selection
  const [loadingContactId, setLoadingContactId] = useState<number | null>(null);
  const [contactLoadingStates, setContactLoadingStates] = useState<Record<number, boolean>>({});
  
  // 🚀 CRITICAL UX FIX: Enhanced contact selection with immediate loading feedback
  const handleContactSelectWithFeedback = useCallback(async (contact: any) => {
    if (!contact || contactLoadingStates[contact.id]) {
      return; // Prevent double-clicks and invalid selections
    }
    
    logger.info('[TelegramContactList] Contact selected with immediate loading feedback:', {
      contactId: contact.id,
      displayName: contact.display_name,
      membership: contact.membership
    });
    
    // 🎯 IMMEDIATE FEEDBACK: Set loading state instantly
    setLoadingContactId(contact.id);
    setContactLoadingStates(prev => ({ ...prev, [contact.id]: true }));
    
    // 🎯 IMMEDIATE FEEDBACK: Show loading toast
    const loadingToastId = toast.loading(
      `Opening chat with ${contact.display_name}...`,
      {
        duration: 10000, // Will be dismissed when chat loads
        style: {
          background: '#3B82F6',
          color: '#ffffff',
          border: 'none',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)',
        },
      }
    );
    
    try {
      // Call the parent's onContactSelect function
      await onContactSelect(contact);
      
      // 🎯 SUCCESS FEEDBACK: Dismiss loading toast and show success
      toast.dismiss(loadingToastId);
      toast.success(
        `Chat with ${contact.display_name} opened successfully!`,
        {
          duration: 2000,
          style: {
            background: '#10B981',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)',
          },
        }
      );
      
    } catch (error) {
      // 🎯 ERROR FEEDBACK: Show error message
      toast.dismiss(loadingToastId);
      toast.error(
        `Failed to open chat with ${contact.display_name}. Please try again.`,
        {
          duration: 5000,
          style: {
            background: '#EF4444',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)',
          },
        }
      );
      
      logger.error('[TelegramContactList] Error selecting contact:', {
        contactId: contact.id,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      // 🎯 CLEANUP: Clear loading states
      setTimeout(() => {
        setLoadingContactId(null);
        setContactLoadingStates(prev => ({ ...prev, [contact.id]: false }));
      }, 1000); // Small delay to prevent flickering
    }
  }, [onContactSelect, contactLoadingStates]);
  
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
  
  // 🚀 NEW: Enhanced contact sync state interface
  const [contactSyncState, setContactSyncState] = useState<ContactSyncState>({
    isActive: false,
    status: 'idle',
    message: '',
    progress: 0,
    timestamp: new Date().toISOString(),
    showInHeader: false
  });
  
  // 🚀 CRITICAL FIX: Reset contact sync state on component mount
  useEffect(() => {
    logger.info('[TelegramContactList] 🔄 Resetting contact sync state on mount');
    setContactSyncState({
      isActive: false,
      status: 'idle',
      message: '',
      progress: 0,
      timestamp: new Date().toISOString(),
      showInHeader: false
    });
    setSyncProgress(null);
  }, []);
  
  // 🚀 CRITICAL FIX: Auto-reset sync state if stuck for too long
  useEffect(() => {
    if (contactSyncState.isActive) {
      const timeout = setTimeout(() => {
        logger.warn('[TelegramContactList] ⏰ Contact sync timeout - resetting state');
        setContactSyncState(prev => ({
          ...prev,
          isActive: false,
          status: 'timeout',
          message: 'Sync timed out',
          showInHeader: false
        }));
        setSyncProgress(null);
        toast.dismiss('contact-sync');
        toast.error('Contact sync timed out. Please try refreshing.', {
          duration: 5000
        });
      }, 30000); // 30 second timeout
      
      return () => clearTimeout(timeout);
    }
  }, [contactSyncState.isActive]);
  const [forceRefreshKey, setForceRefreshKey] = useState(0); // CRITICAL FIX: Force refresh key for real-time updates

  // 🚀 NEW: Matrix-based unread count state for real-time read receipt sync
  const [matrixUnreadCounts, setMatrixUnreadCounts] = useState<Record<string, number>>({});
  const [unreadCountsLoading, setUnreadCountsLoading] = useState(false);
  // 🛡️ CIRCUIT BREAKER: Disable polling if endpoint missing or unstable
  const [apiCircuitOpen, setApiCircuitOpen] = useState(false);
  const [apiFailCount, setApiFailCount] = useState(0);
  
  // 🎯 RETRY CONTROL: Add delays between failed attempts to reduce spam
  const [lastRetryTime, setLastRetryTime] = useState<number>(0);
  const RETRY_DELAY = 5000; // 5 seconds between retries
  
  // 🎯 NEW: Load Matrix unread counts from backend API with retry delay
  const loadUnreadCounts = useCallback(async () => {
    if (unreadCountsLoading || !session?.user?.id || apiCircuitOpen) return;
    
    // 🎯 RETRY CONTROL: Add delay between retries to reduce spam
    const now = Date.now();
    if (lastRetryTime > 0 && (now - lastRetryTime) < RETRY_DELAY) {
      logger.debug('[TelegramContactList] ⏳ Skipping API call - too soon since last attempt', {
        timeUntilNextRetry: Math.round((RETRY_DELAY - (now - lastRetryTime)) / 1000)
      });
      return;
    }

    try {
      setUnreadCountsLoading(true);
      setLastRetryTime(now);
      logger.info('[TelegramContactList] 📊 Loading initial Matrix unread counts from backend');
      
      const response = await api.get('/api/v1/telegram/unreadCounts');
      
      if (response.data && typeof response.data === 'object') {
        logger.info('[TelegramContactList] ✅ Loaded Matrix unread counts:', {
          counts: response.data,
          totalContacts: Object.keys(response.data.unreadCounts || response.data).length
        });
        
        // Support both { unreadCounts } and plain map response shapes
        const counts = response.data.unreadCounts || response.data;
        setMatrixUnreadCounts(counts);
        
        // Force refresh the contact list to reflect new counts
        setForceRefreshKey(prev => prev + 1);
      } else {
        logger.warn('[TelegramContactList] ⚠️ Invalid unread counts response format:', response.data);
      }
    } catch (error: any) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const nextFailCount = apiFailCount + 1;
      setApiFailCount(nextFailCount);
      
      if (status === 404) {
        logger.warn('[TelegramContactList] ⚠️ Endpoint not found - likely not deployed to production yet', {
          status,
          statusText,
          error: error.message
        });
        if (!apiCircuitOpen) {
          setApiCircuitOpen(true);
          logger.warn('[TelegramContactList] 🛑 Disabling unreadCounts polling (circuit open) due to 404. Falling back to socket-only updates.');
        }
      } else if (status === 401) {
        logger.warn('[TelegramContactList] 🔐 Authentication failed - checking token validity', {
          status,
          statusText,
          error: error.message,
          hasSession: !!session,
          hasToken: !!session?.accessToken
        });
      } else {
        logger.error('[TelegramContactList] ❌ Failed to load Matrix unread counts:', {
          status,
          statusText,
          error: error.message,
          response: error.response?.data
        });
        if (nextFailCount >= 3 && !apiCircuitOpen) {
          setApiCircuitOpen(true);
          logger.warn('[TelegramContactList] 🛑 Disabling unreadCounts polling after repeated failures. Falling back to socket-only updates.');
        }
      }
      // Don't show toast error for unread counts to avoid user annoyance
    } finally {
      setUnreadCountsLoading(false);
    }
  }, [session?.user?.id, unreadCountsLoading, lastRetryTime, apiCircuitOpen]);
  
  // 🚀 NEW: Load unread counts on component mount and when contacts change
  useEffect(() => {
    if (session?.user?.id && contacts.length > 0 && !apiCircuitOpen) {
      // Small delay to ensure contacts are loaded
      const timeout = setTimeout(() => {
        loadUnreadCounts();
      }, 500);
      
      return () => clearTimeout(timeout);
    }
  }, [session?.user?.id, contacts.length, apiCircuitOpen, loadUnreadCounts]);
  
  // 🚀 NEW: Listen for Matrix read receipt updates from TelegramChatView
  useEffect(() => {
    const handleUnreadUpdated = (event: CustomEvent) => {
      const { contactId, unreadCount } = event.detail;
      
      logger.info('[TelegramContactList] 📊 Received Matrix unread count update:', {
        contactId,
        unreadCount,
        previousCount: matrixUnreadCounts[contactId] || 0
      });
      
      // Update Matrix-based unread counts
      setMatrixUnreadCounts(prev => ({
        ...prev,
        [contactId]: unreadCount
      }));
      
      // Force refresh the contact list to reflect new counts
      setForceRefreshKey(prev => prev + 1);
    };
    
    // Listen for custom events from TelegramChatView
    window.addEventListener('telegram:unread:updated', handleUnreadUpdated as EventListener);
    
    return () => {
      window.removeEventListener('telegram:unread:updated', handleUnreadUpdated as EventListener);
    };
  }, [matrixUnreadCounts]);

  const unreadNotificationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    
    // Combine Liveblocks notifications with Matrix-based unread counts
    if (inboxNotifications) {
      for (const notification of inboxNotifications) {
        if (!notification.readAt && "subjectId" in notification && notification.subjectId) {
          counts[notification.subjectId] = (counts[notification.subjectId] || 0) + 1;
        }
      }
    }
    
    // 🚀 PRIORITY: Matrix-based counts override Liveblocks for accuracy
    // Matrix read receipts are the source of truth for read/unread status
    Object.keys(matrixUnreadCounts).forEach(contactId => {
      const matrixCount = matrixUnreadCounts[contactId];
      if (matrixCount !== undefined) {
        counts[contactId] = matrixCount;
      }
    });
    
    return counts;
  }, [inboxNotifications, matrixUnreadCounts, forceRefreshKey]); // CRITICAL FIX: Add matrixUnreadCounts to dependencies

  // CRITICAL FIX: Track processed messages to prevent duplicates
  const processedMessageIds = useRef(new Set<string>());
  
  // CRITICAL FIX: Clear old processed message IDs periodically
  useEffect(() => {
    const cleanup = setInterval(() => {
      if (processedMessageIds.current.size > 1000) {
        processedMessageIds.current.clear();
        logger.info('[TelegramContactList] Cleared processed message IDs cache');
      }
    }, 60000); // Clean every minute
    
    return () => clearInterval(cleanup);
  }, []);

  // CRITICAL FIX: Force contact list re-sorting by updating array reference - MOVED BEFORE useEffect hooks
  const forceContactResort = useCallback(() => {
    // 🚀 CRITICAL FIX: Instead of sorting a local copy, we need to trigger the useMemo re-computation
    // The useMemo depends on contacts, so we need to ensure the contacts array gets a new reference
    // We'll do this by updating the forceRefreshKey which is in the useMemo dependencies
    
    logger.info('[TelegramContactList] 🔄 FORCING CONTACT RESORT - Triggering re-sort via forceRefreshKey');
    
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
      
      logger.info('[TelegramContactList] 🔄 EXPECTED NEW ORDER after resort:', 
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
        logger.warn('[TelegramContactList] No valid user ID in session, cannot fetch contacts');
        return;
      }
      
      // CRITICAL FIX: Prevent duplicate fetches by checking if already loading
      if (loading && retryCount === 0) {
        logger.info('[TelegramContactList] Already loading contacts, skipping duplicate fetch');
        return;
      }
      
      // Log active platform for debugging (reduced logging)
      const activePlatform = localStorage.getItem('dailyfix_active_platform');
      if (activePlatform !== 'telegram') {
        logger.info('[TelegramContactList] Not active platform, skipping fetch');
        return;
      }
      
      logger.info('[TelegramContactList] Fetching contacts...');
      const result = await dispatch(fetchContacts({
        userId: session.user.id,
        platform: 'telegram'
      })).unwrap();

      if (result?.inProgress) {
        logger.info('[telegramContactList] Sync in progress, showing sync state');
        setSyncProgress({
          state: SYNC_STATES.SYNCING,
          message: 'Syncing contacts...'
        });
        return;
      }
    } catch (err) {
      logger.error('[telegramContactList] Error fetching contacts:', err);
      if (retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
        logger.info(`[telegramContactList] Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
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
        logger.warn('[telegramContactList] Sync timeout reached, forcing completion');
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
            platform: 'telegram'
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
        platform: 'telegram'
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
        const response = await api.get(`/api/v1/telegram/syncStatus?requestId=${requestId}`);
        const statusData = response.data;

        logger.info('[telegramContactList] Sync status poll:', {
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
          logger.warn('[telegramContactList] Sync progress appears stuck, forcing completion');
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
              platform: 'telegram'
            }));
          }
          return;
        }

        // CRITICAL FIX: Double-check with /contacts endpoint if sync is really still in progress
        if (pollCount % 3 === 0 && statusData.is_syncing) {
          try {
            const contactsResponse = await api.get('/api/v1/telegram/contacts');
            const contactsData = contactsResponse.data;

            // If contacts endpoint says sync is complete but status endpoint disagrees,
            // trust the contacts endpoint
            if (contactsData?.meta?.sync_info &&
                !contactsData.meta.sync_info.is_syncing &&
                statusData.is_syncing) {
              logger.warn('[telegramContactList] Sync status mismatch detected, forcing completion');
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
                  platform: 'telegram'
                }));
              }
              return;
            }
          } catch (contactsError) {
            logger.error('[telegramContactList] Error checking contacts endpoint:', contactsError);
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
              platform: 'telegram'
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
              platform: 'telegram'
            }));
          }
        }

        // Reset consecutive errors counter on success
        consecutiveErrors = 0;
      } catch (error) {
        logger.error('[telegramContactList] Error polling sync status:', error);
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
              platform: 'telegram'
            }));
          }
        }
      }
    }, 2000); // Poll every 2 seconds

    // Safety cleanup after 2 minutes
    setTimeout(() => {
      if (syncStatusPollingRef.current === pollInterval) {
        clearInterval(pollInterval);
        logger.info('[telegramContactList] Safety cleanup triggered for sync polling');
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
      logger.info('[telegramContactList] Handling contact selection:', {
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
            logger.info('[telegramContactList] Auto-accepting invite for contact:', contact.id);
            
            // Show loading state
            toast.loading('Joining chat...', { 
              id: `join-${contact.id}`,
              duration: 5000 
            });
            
            const response = await api.post(`/api/v1/telegram/contacts/${contact.id}/accept`);
            
            toast.dismiss(`join-${contact.id}`);
            
            if (response.data?.status === 'success') {
              logger.info('[telegramContactList] Invite accepted successfully:', {
                contactId: contact.id,
                response: response.data
              });
              
              const updatedContact = response.data.contact || { ...contact, membership: 'join' };
              dispatch(updateContactMembership({ contactId: contact.id, updatedContact }));
              
              toast.success(`Joined ${contact.display_name} successfully!`, {
                duration: 2000
              });
              
              // Select the updated contact
              onContactSelect(updatedContact);
              
            } else if (response.data?.joinedBefore) {
              logger.info('[telegramContactList] Contact was already joined:', contact.id);
              
              const updatedContact = { ...contact, membership: 'join' };
              dispatch(updateContactMembership({ contactId: contact.id, updatedContact }));
              
              toast.success(`Already joined ${contact.display_name}`, {
                duration: 2000
              });
              
              onContactSelect(updatedContact);
              
            } else {
              logger.warn('[telegramContactList] Invite acceptance failed:', {
                contactId: contact.id,
                error: response.data?.message
              });
              
              toast.error('Failed to join chat: ' + (response.data?.message || 'Unknown error'));
              
              // Still try to select the contact - the backend might handle it automatically
              onContactSelect({ ...contact });
            }
          } catch (error) {
            logger.error('[telegramContactList] Error accepting invite:', {
              contactId: contact.id,
              error: error.message
            });
            
            toast.dismiss(`join-${contact.id}`);
            
            // 🚀 CRITICAL FIX: Gracefully handle 404 or network errors like WhatsApp does
            // If the API call fails, still try to select the contact - the backend auto-accepts
            toast.success('Attempting to join chat...', { duration: 2000 });
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
          // Normal contact selection
          onContactSelect({ ...contact });
          break;
          
        case undefined:
          // No membership info - assume we can access it
          logger.warn('[telegramContactList] Contact has no membership state, attempting selection:', contact);
          onContactSelect({ ...contact });
          break;
          
        default:
          logger.warn('[telegramContactList] Unknown membership state:', membership);
          toast.error(`Cannot access chat: ${membership} status`);
          return;
      }
    } catch (err) {
      logger.error('[telegramContactList] Error handling contact selection:', err);
      toast.dismiss(`join-${contact.id}`);
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
      logger.warn('[telegramContactList] No session found, redirecting to login');
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
      if (activePlatform === 'telegram') {
        logger.info('[telegramContactList] Platform switched to telegram, requiring refresh');
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
          logger.warn('[telegramContactList] Cannot initialize socket - no valid session');
          return;
        }

        // Now attempt socket initialization with the validated session
        const socket = await initializeSocket({ platform: 'telegram' });

        if (!socket) {
          logger.error('[telegramContactList] Failed to get socket instance');
          return;
        }

        const handleSyncProgress = (data, ack?: Function) => {
          if (data.userId === session.user.id) {
            logger.info('[TelegramContactList] 🚀 Background contact sync progress:', {
              progress: data.progress,
              details: data.details,
              contactsFound: data.contactsFound,
              contactsProcessed: data.contactsProcessed
            });
            
            // Update legacy sync progress for existing UI
            setSyncProgress({
              state: SYNC_STATES.SYNCING,
              progress: data.progress,
              message: data.details || 'Syncing contacts...'
            });
            
            // 🚀 NEW: Enhanced contact sync state with detailed feedback
            setContactSyncState({
              isActive: true,
              status: data.progress < 25 ? 'connecting' : 
                     data.progress < 50 ? 'fetching' :
                     data.progress < 75 ? 'processing' :
                     data.progress < 90 ? 'validating' : 'caching',
              message: data.details || 'Syncing contacts...',
              progress: data.progress,
              contactsFound: data.contactsFound,
              contactsProcessed: data.contactsProcessed,
              timestamp: new Date().toISOString(),
              showInHeader: true
            });
            
            // Show user-friendly toast for initial sync
            if (data.progress === 0 || data.progress <= 10) {
              toast.loading('Looking for new contacts...', {
                id: 'contact-sync',
                duration: 15000
              });
            }
          }
          
          // 🚀 CRITICAL FIX: Send ACK to prevent backend timeout warnings
          if (ack) {
            ack({ success: true, handled: data.userId === session.user.id });
          }
        };

        const handleSyncComplete = (data, ack?: Function) => {
          if (data.userId === session.user.id) {
            logger.info('[TelegramContactList] ✅ Background contact sync completed:', {
              contactsFound: data.contactsFound,
              contactsProcessed: data.contactsProcessed,
              duration: data.duration,
              newContacts: data.newContacts
            });
            
            // Update legacy sync progress
            setSyncProgress(null);
            
            // 🚀 NEW: Enhanced contact sync completion feedback
            setContactSyncState({
              isActive: false,
              status: 'complete',
              message: data.contactsFound > 0 ? 
                `Successfully synced ${data.contactsFound} contacts` :
                'Contact sync complete - no new contacts found',
              progress: 100,
              contactsFound: data.contactsFound,
              contactsProcessed: data.contactsProcessed,
              duration: data.duration,
              timestamp: new Date().toISOString(),
              showInHeader: false
            });
            
            // Dismiss loading toast and show success
            toast.dismiss('contact-sync');
            
            if (data.contactsFound > 0) {
              toast.success(`Found ${data.contactsFound} contacts! ${data.newContacts > 0 ? `${data.newContacts} new` : 'All up to date'}`, {
                duration: 4000,
                icon: '🎉'
              });
            } else {
              toast('Contact sync complete - no new contacts found', {
                duration: 2000,
                icon: '📭'
              });
            }
            
            // Only reload if we're the active platform
            const activePlatform = localStorage.getItem('dailyfix_active_platform');
            if (activePlatform === 'telegram') {
              loadContactsWithRetry();
            }
            
            // Hide sync state after a delay
            setTimeout(() => {
              setContactSyncState(prev => ({ ...prev, showInHeader: false }));
            }, 3000);
          }
          
          // 🚀 CRITICAL FIX: Send ACK to prevent backend timeout warnings
          if (ack) {
            ack({ success: true, handled: data.userId === session.user.id });
          }
        };

        const handleSyncError = (data, ack?: Function) => {
          if (data.userId === session.user.id) {
            logger.error('[TelegramContactList] ❌ Background contact sync failed:', {
              error: data.error,
              duration: data.duration,
              contactsProcessed: data.contactsProcessed
            });
            
            // Update legacy sync progress
            setSyncProgress({
              state: SYNC_STATES.REJECTED,
              message: data.error || 'Sync failed'
            });
            
            // 🚀 NEW: Enhanced contact sync error feedback
            setContactSyncState({
              isActive: false,
              status: 'error',
              message: `Contact sync failed: ${data.error || 'Unknown error'}`,
              progress: 0,
              error: data.error,
              duration: data.duration,
              timestamp: new Date().toISOString(),
              showInHeader: false
            });
            
            // Dismiss loading toast and show error
            toast.dismiss('contact-sync');
            toast.error(`Contact sync failed: ${data.error || 'Unknown error'}`, {
              duration: 6000
            });
            
            // Hide sync state after a delay
            setTimeout(() => {
              setContactSyncState(prev => ({ ...prev, showInHeader: false }));
            }, 5000);
          }
        };

        const handleContactRemoved = (data) => {
          if (data.userId === session.user.id) {
            logger.info('[telegramContactList] Contact removed by backend via socket:', {
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
        socket.on('telegram:sync_progress', handleSyncProgress);
        socket.on('telegram:sync_complete', handleSyncComplete);
        socket.on('telegram:sync_error', handleSyncError);
        socket.on('telegram:contact:removed', handleContactRemoved);

        // 🚨 CRITICAL FIX: JOIN USER ROOM TO RECEIVE BACKEND EVENTS
        const userRoom = `user:${session.user.id}`;
        socket.emit('join:room', userRoom);
        logger.info(`[telegramContactList] 🎯 JOINING USER ROOM: ${userRoom}`);
        
        // 🚨 CRITICAL FIX: Authenticate with user ID for targeted events
        socket.emit('authenticate', { userId: session.user.id });
        logger.info(`[telegramContactList] 🎯 AUTHENTICATING USER: ${session.user.id}`);

        // 🚨 CRITICAL FIX: Add confirmation handlers
        socket.on('room:joined', (data) => {
          logger.info(`[telegramContactList] ✅ ROOM JOINED CONFIRMED: ${data.roomId}`);
        });
        
        socket.on('authenticated', (data) => {
          logger.info(`[telegramContactList] ✅ AUTHENTICATION CONFIRMED:`, data);
        });
        
        socket.on('room:error', (data) => {
          logger.error(`[telegramContactList] ❌ ROOM JOIN ERROR:`, data);
        });

        // CRITICAL FIX: Add missing real-time message listeners
        socket.on('telegram:contact_auto_created', (data: any) => {
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
              platform: 'telegram'
            }));
          }
          
          // Show success notification
          toast.success(`New contact "${data.contact?.display_name}" auto-created successfully`);
        });

        // CRITICAL FIX: Listen for real-time message updates
        socket.on('telegram:message_received', (data: any) => {
          // 🚀 CRITICAL FIX: Create unique message ID to prevent duplicates
          const messageId = `${data.contactId}-${data.timestamp}-${data.message?.substring(0, 10)}`;
          
          if (processedMessageIds.current.has(messageId)) {
            logger.debug('[telegramContactList] Skipping duplicate message:', { messageId, contactId: data.contactId });
            return;
          }
          
          processedMessageIds.current.add(messageId);
          
          logger.info('📨 Message received via WebSocket:', {
            contactId: data.contactId,
            message: data.message?.substring(0, 50) + (data.message?.length > 50 ? '...' : ''),
            timestamp: data.timestamp,
            messageId,
            isOwnMessage: data.isOwnMessage,
            isOutgoing: data.isOutgoing,
            sender: data.sender,
            messageDirection: data.isOwnMessage ? 'SENT' : 'RECEIVED'
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

        // CRITICAL FIX: Also listen for traditional telegram:message events
        socket.on('telegram:message', (data: any) => {
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

        // 🚀 CRITICAL FIX: Listen for real-time invitation acceptance events
        socket.on('telegram:invitation:accepted', (data: any) => {
          logger.info('🎯 Invitation accepted via WebSocket:', {
            contactId: data.contactId,
            contact: data.contact,
            timestamp: data.timestamp
          });
          
          // Update contact membership in Redux
          if (data.contactId && data.contact) {
            dispatch(updateContactMembership({
              contactId: data.contactId,
              updatedContact: data.contact
            }));
            
            // Show success notification
            toast.success(`Successfully joined ${data.contact.display_name || 'chat'}!`, {
              duration: 3000
            });
          }
        });

        // 🚀 CRITICAL FIX: Listen for real-time invitation failure events
        socket.on('telegram:invitation:failed', (data: any) => {
          logger.error('❌ Invitation acceptance failed via WebSocket:', {
            contactId: data.contactId,
            error: data.error,
            timestamp: data.timestamp
          });
          
          // Show error notification
          toast.error(`Failed to join chat: ${data.error}`, {
            duration: 5000
          });
        });

        return () => {
          socket.off('telegram:sync_progress', handleSyncProgress);
          socket.off('telegram:sync_complete', handleSyncComplete);
          socket.off('telegram:sync_error', handleSyncError);
          socket.off('telegram:contact:removed', handleContactRemoved);
          socket.off('telegram:contact_auto_created');
          socket.off('telegram:message_received');
          socket.off('telegram:message'); // Clean up traditional listener
          socket.off('telegram:invitation:accepted'); // Clean up invitation events
          socket.off('telegram:invitation:failed'); // Clean up invitation events
          socket.off('room:joined');
          socket.off('authenticated');
          socket.off('room:error');
        };
      } catch (error) {
        logger.error('[telegramContactList] Socket initialization error:', error);
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
        if (notification.kind === '$telegramMessage' && notification.activities?.[0]?.data) {
          const activityData = notification.activities[0].data;
          const { contact_id, message, timestamp } = activityData;
          
          if (contact_id && message) {
            // 🚀 CRITICAL FIX: Create unique message ID to prevent duplicates
            const messageText = String(message); // Convert to string first
            const messageId = `liveblocks-${contact_id}-${timestamp}-${messageText?.substring(0, 10)}`;
            
            if (processedMessageIds.current.has(messageId)) {
              logger.debug('[telegramContactList] Skipping duplicate Liveblocks message:', { messageId, contact_id });
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
      
      if (!contactId || !message) {
        logger.warn('[telegramContactList] Invalid sent message event data:', {
          contactId,
          hasMessage: !!message,
          timestamp
        });
        return;
      }
      
      // 🚀 CRITICAL FIX: Create unique message ID to prevent duplicates with socket events
      const messageId = `sent-${contactId}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
      
      // 🚀 PERFORMANCE FIX: Check for recent duplicates only (last 5 seconds)
      const recentIds = Array.from(processedMessageIds.current).filter(id => {
        const parts = id.split('-');
        if (parts.length >= 3) {
          const idTimestamp = parseInt(parts[2]);
          return Date.now() - idTimestamp < 5000; // 5 seconds
        }
        return false;
      });
      
      // Check if we have a very similar recent message (same contact and similar content)
      const isDuplicate = recentIds.some(id => {
        if (id.includes(`sent-${contactId}-`) && id.includes(message.substring(0, 10))) {
          return true;
        }
        return false;
      });
      
      if (isDuplicate) {
        logger.debug('[telegramContactList] Skipping likely duplicate sent message:', { 
          messageId, 
          contactId,
          messagePreview: message.substring(0, 30) + '...'
        });
        return;
      }
      
      processedMessageIds.current.add(messageId);
      
      logger.info('🎯 User sent message - updating contact list:', {
        contactId: parseInt(contactId),
        message: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
        timestamp,
        messageId,
        totalProcessed: processedMessageIds.current.size
      });
      
      // Update contact's last message with sent message
      dispatch(updateContactLastMessage({
        contactId: parseInt(contactId),
        lastMessage: message,
        lastMessageAt: timestamp || Date.now()
      }));
      
      // 🚀 PERFORMANCE FIX: Use throttled resort calls to prevent excessive updates
      setTimeout(() => {
        forceContactResort();
      }, 200); // Reduced delay for faster UI updates
    };

    // Listen for sent message events from ChatView
    window.addEventListener('telegram-message-sent', handleSentMessage as EventListener);
    
    return () => {
      window.removeEventListener('telegram-message-sent', handleSentMessage as EventListener);
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
          logger.debug('[telegramContactList] Skipping duplicate custom message:', { messageId, contactId });
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

    window.addEventListener('telegram-message-update', handleMessageUpdate as EventListener);
    
    return () => {
      window.removeEventListener('telegram-message-update', handleMessageUpdate as EventListener);
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
      if (displayName.includes('telegram bridge') || 
          displayName === 'telegram bridge bot') return false;
      
      // Filter out status broadcasts
      if (displayName.includes('telegram status') ||
          displayName.includes('status broadcast') ||
          displayName.includes('broadcast')) return false;

      // CRITICAL: Filter out any whatsapp-related contacts that might leak into telegram list
      if (displayName.includes('whatsapp') || 
          displayName.includes('wa') ||
          displayName.includes('(wa)')) return false;

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

    // 🚀 CRITICAL FIX: Proper sorting like real telegram - LATEST MESSAGE FIRST ALWAYS
    return filtered.sort((a, b) => {
      // CRITICAL FIX: Add safety checks for contact existence
      if (!a || !b || !a.id || !b.id) return 0;
      
      try {
        // Get notification counts for both contacts
        const aNotifications = unreadNotificationCounts[a.id] || 0;
        const bNotifications = unreadNotificationCounts[b.id] || 0;
        
        // 🔥 STEP 1: LATEST MESSAGE TIME is the PRIMARY sort criteria (like real telegram)
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
        logger.warn('[telegramContactList] Error sorting contacts:', error);
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
      if (activePlatform === 'telegram' && session?.user?.id) {
        logger.info('[telegramContactList] Platform connection changed, refreshing contacts');
        // Small delay to ensure connection status is updated
        setTimeout(() => {
          dispatch(fetchContacts({
            userId: session.user.id,
            platform: 'telegram'
          }));
        }, 500);
      }
    };

    const handleForceRefresh = (event: CustomEvent) => {
      const activePlatform = localStorage.getItem('dailyfix_active_platform');
      if (activePlatform === 'telegram' && session?.user?.id) {
        logger.info('[telegramContactList] Force refresh requested from platform switcher');
        // Force refresh contacts immediately
        dispatch(freshSyncContacts({
          userId: session.user.id,
          platform: 'telegram'
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
      if (event.detail?.platform === 'telegram') {
        setIsVerifyingPlatform(true);
        setVerificationMessage('Verifying telegram connection...');
      }
    };

    const handlePlatformVerificationEnd = (event: CustomEvent) => {
      if (event.detail?.platform === 'telegram') {
        setIsVerifyingPlatform(false);
        setVerificationMessage('');
      }
    };

    // Handle contact auto-deletion events from backend
    const handleContactAutoDeleted = (event: CustomEvent) => {
      const { contactId, platform, message, reason } = event.detail;
      
      if (platform === 'telegram') {
        logger.info('[telegramContactList] Contact auto-deleted by backend:', {
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

    // Handle telegram error events (CONTACT_REMOVED, etc.)
    const handleTelegramError = (event: CustomEvent) => {
      const { type, contactId, userFeedback, timestamp } = event.detail;
      
      logger.info('[telegramContactList] Received telegram error event:', {
        type,
        contactId,
        userFeedback: userFeedback?.title,
        timestamp
      });
      
      if (type === 'CONTACT_REMOVED' && contactId) {
        // Remove contact from Redux state
        dispatch(hideContact(contactId));
        
        // Show user-friendly toast with action buttons
        const toastId = toast(
          (t) => (
            <div className="flex flex-col space-y-2">
              <div className="flex items-start space-x-2">
                <div className="flex-1">
                  <h4 className="font-medium text-sm">{userFeedback?.title || 'Contact Removed'}</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {userFeedback?.message || 'This contact is no longer accessible.'}
                  </p>
                </div>
                <button
                  onClick={() => toast.dismiss(t.id)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ×
                </button>
              </div>
              {userFeedback?.actions && userFeedback.actions.length > 0 && (
                <div className="flex space-x-2 pt-2 border-t border-gray-200">
                  {userFeedback.actions.map((action, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        handleErrorAction(action, contactId);
                        toast.dismiss(t.id);
                      }}
                      className={`px-3 py-1 text-xs rounded transition-colors ${
                        action.primary
                          ? 'bg-blue-500 text-white hover:bg-blue-600'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ),
          {
            duration: userFeedback?.autoRemove ? (userFeedback.timeout || 5000) : Infinity,
            style: {
              background: '#ffffff',
              color: '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              maxWidth: '400px',
            },
          }
        );
      } else if (userFeedback) {
        // Handle other error types with appropriate styling
        const toastType = userFeedback.type === 'error' ? 'error' : 
                         userFeedback.type === 'warning' ? 'error' : 'info';
        
        const toastStyle = {
          background: userFeedback.type === 'error' ? '#EF4444' : 
                     userFeedback.type === 'warning' ? '#F59E0B' : '#3B82F6',
          color: '#ffffff',
          border: 'none',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        };
        
        if (toastType === 'error') {
          toast.error(userFeedback.message, {
            duration: userFeedback.autoRemove ? (userFeedback.timeout || 5000) : 6000,
            style: toastStyle,
          });
        } else {
          toast(userFeedback.message, {
            duration: userFeedback.autoRemove ? (userFeedback.timeout || 5000) : 4000,
            style: toastStyle,
          });
        }
      }
    };

    // Handle error action buttons
    const handleErrorAction = (action: any, contactId?: number) => {
      logger.info('[telegramContactList] Handling error action:', {
        handler: action.handler,
        contactId,
        data: action.data
      });
      
      switch (action.handler) {
        case 'refreshContacts':
          if (session?.user?.id) {
            logger.info('[telegramContactList] Refreshing contacts due to error action');
            dispatch(freshSyncContacts({
              userId: session.user.id,
              platform: 'telegram'
            }));
          }
          break;
          
        case 'navigateBack':
          // Navigate back to contact list if in chat view
          if (selectedContactId) {
            onContactSelect(null);
          }
          break;
          
        case 'removeContact':
          if (contactId) {
            dispatch(hideContact(contactId));
            toast.success('Contact removed from your list', {
              duration: 3000,
              style: {
                background: '#10B981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
              },
            });
          }
          break;
          
        case 'retryLastAction':
        case 'retryJoin':
          // Retry the last action - could be contact refresh or specific contact action
          if (contactId && session?.user?.id) {
            // For now, just refresh contacts
            dispatch(fetchContacts({
              userId: session.user.id,
              platform: 'telegram'
            }));
          }
          break;
          
        case 'dismissError':
          // Just dismiss - no action needed
          break;
          
        default:
          logger.warn('[telegramContactList] Unknown error action handler:', action.handler);
      }
    };

    window.addEventListener('platform-verification-start', handlePlatformVerificationStart as EventListener);
    window.addEventListener('platform-verification-end', handlePlatformVerificationEnd as EventListener);
    window.addEventListener('contact-auto-deleted', handleContactAutoDeleted as EventListener);
    window.addEventListener('telegram:error', handleTelegramError as EventListener);
    
    return () => {
      window.removeEventListener('platform-verification-start', handlePlatformVerificationStart as EventListener);
      window.removeEventListener('platform-verification-end', handlePlatformVerificationEnd as EventListener);
      window.removeEventListener('contact-auto-deleted', handleContactAutoDeleted as EventListener);
      window.removeEventListener('telegram:error', handleTelegramError as EventListener);
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
                Please wait while we verify your telegram connection...
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
          <CardTitle className="text-header-foreground font-bold text-xl">telegram Chats</CardTitle>
          <div className="flex items-center space-x-2 relative">
            
            {/* 🚀 NEW: Background contact sync progress indicator */}
            {contactSyncState.isActive && contactSyncState.showInHeader && (
              <div className="flex items-center space-x-2 bg-blue-500/10 px-3 py-1 rounded-md border border-blue-500/20">
                <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <div className="flex flex-col">
                  <span className="text-blue-400 font-medium text-xs">
                    {contactSyncState.message}
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="text-blue-300 text-xs">
                      {contactSyncState.progress}%
                    </span>
                    {contactSyncState.contactsFound !== undefined && (
                      <span className="text-blue-300 text-xs">
                        {contactSyncState.contactsProcessed || 0}/{contactSyncState.contactsFound} contacts
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
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
                    onClick={() => handleContactSelectWithFeedback(contact)}
                    isSelected={selectedContactId === contact.id}
                    notificationCount={notificationCount}
                    isLoading={contactLoadingStates[contact.id] || loadingContactId === contact.id}
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

export default TelegramContactList;
