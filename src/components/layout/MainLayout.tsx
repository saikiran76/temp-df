import { useEffect, useState, useRef, useCallback } from "react"
import '@/index.css'
import '@/components/styles/shine-border.css'
import '@/components/styles/glowing-border.css'
import '@/components/styles/glowing-platform-icons.css'
import { useSelector, useDispatch } from "react-redux"
import { useNavigate, useLocation } from "react-router-dom"
import { AppSidebar } from "@/components/ui/app-sidebar"
import {
  SidebarProvider, SidebarInset, SidebarTrigger
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Settings as SettingsIcon, AlertTriangle, GripVertical, ChevronsLeft, ChevronsRight, MessageSquare, Send, ArrowLeft, LayoutDashboard, Inbox, Shield } from "lucide-react"
import PlatformSettings from "@/components/PlatformSettings"
import PlatformsInfo from "@/components/PlatformsInfo"
import WhatsappContactList from "@/components/platforms/whatsapp/WhatsappContactList"
import TelegramContactList from "@/components/platforms/telegram/TelegramContactList"
import InstagramContactList from "@/components/platforms/instagram/InstagramContactList"
import LinkedinContactList from "@/components/platforms/linkedin/LinkedinContactList"
import { ChatViewWithErrorBoundary as WhatsAppChatView } from '@/components/platforms/whatsapp/WhatsappChatView'
import { ChatViewWithErrorBoundary as TelegramChatView } from '@/components/platforms/telegram/TelegramChatView'
import InstagramChatView from '@/components/platforms/instagram/InstagramChatView'
import { ChatViewWithErrorBoundary as LinkedinChatView } from "@/components/platforms/linkedin/LinkedinChatView"
import Dashboard from '@/components/Dashboard'
import { isWhatsAppConnected, isTelegramConnected, isInstagramConnected, isLinkedInConnected } from '@/utils/connectionStorage'
import { toast } from 'react-hot-toast'
import logger from '@/utils/logger'
import { useMousePosition } from '@/hooks/useMousePosition'
import { useNotificationManager } from '@/hooks/useNotificationManager'
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { Checkbox } from "@/components/ui/checkbox"
import { FaWhatsapp, FaTelegram } from "react-icons/fa"
import { NotificationPopover } from "@/components/notifications"
import platformManager from '@/services/PlatformManager'
import { TestNotification } from "@/components/TestNotification"
import type { RootState } from "@/store/store";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Menu } from "lucide-react"

// 🚀 CRITICAL FIX: Import notification components for real-time message handling
import TelegramNotifications from "@/components/platforms/telegram/TelegramNotifications"
import LinkedinNotifications from "@/components/platforms/linkedin/LinkedinNotifications"

// Define interface for contact objects
interface Contact {
  id: number;
  telegram_id?: string;
  whatsapp_id?: string;
  display_name: string;
  last_message?: string;
  last_message_at?: string;
  avatar_url?: string;
  membership?: string;
  [key: string]: any; // Allow additional properties
}

export default function Page() {
  const navigate = useNavigate()
  const location = useLocation()
  // State to track current view (dashboard or inbox)
  const [currentView, setCurrentView] = useState<'dashboard' | 'inbox'>('dashboard')
  // State to track if content below header is visible
  const [contentVisible, setContentVisible] = useState(true)
  // State to track if settings are open
  const [settingsOpen, setSettingsOpen] = useState(false)
  // State to track active platform contact list
  const [activeContactList, setActiveContactList] = useState<string | null>(null)
  // State to track selected contact ID
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  
  // State for resizable inbox width - default to 35% when settings are open
  const [inboxWidth, setInboxWidth] = useState<number>(100)
  const [isResizing, setIsResizing] = useState<boolean>(false)
  const [isResizerHovered, setIsResizerHovered] = useState<boolean>(false)
  const resizerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef<number>(0)
  const startWidthRef = useRef<number>(0)
  const chatViewRef = useRef(null);
  
  // State to track window width for responsive design
  const [isMobile, setIsMobile] = useState<boolean>(false)

  // Platform active states
  const [isWhatsAppActive, setIsWhatsAppActive] = useState<boolean>(false)
  const [isTelegramActive, setIsTelegramActive] = useState<boolean>(false)
  const [isInstagramActive, setIsInstagramActive] = useState<boolean>(false)
  const [isLinkedInActive, setIsLinkedInActive] = useState<boolean>(false)
  
  // LinkedIn disconnection alert state
  const [showLinkedInDisconnectedAlert, setShowLinkedInDisconnectedAlert] = useState(false)
  const [linkedInConnected, setLinkedInConnected] = useState(false)

  // State for never-connected alert dialog
  const [showNeverConnectedAlert, setShowNeverConnectedAlert] = useState(false)
  const [neverConnectedPlatforms, setNeverConnectedPlatforms] = useState<string[]>([])
  const [isCheckingNeverConnected, setIsCheckingNeverConnected] = useState(false)

  // State for pending navigation from notifications
  const [pendingNavigation, setPendingNavigation] = useState<{ platform: string; contactId: number } | null>(null);

  // Terms & Conditions state
  const [showTermsSheet, setShowTermsSheet] = useState(false)
  const [pendingPlatform, setPendingPlatform] = useState<string | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)

  // Initialize notification manager for sound and browser notifications
  const notificationManager = useNotificationManager({
    enableSound: true,
    enableBrowserNotifications: true,
    soundVolume: 0.7,
    useGeneratedTones: true // Skip external audio files and use generated tones
  });

  // Use the mouse position hook for the glow effect
  useMousePosition();

  // Update isMobile state based on window width
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    // Set initial value
    checkIsMobile()
    
    // Add event listener
    window.addEventListener('resize', checkIsMobile)
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', checkIsMobile)
    }
  }, [])
  
  // Get Redux state
  const onboardingState = useSelector((state: RootState) => state.onboarding)
  const { matrixConnected, whatsappConnected, telegramConnected, instagramConnected } = onboardingState
  const session = useSelector((state: RootState) => state.auth.session)
  const currentUser = useSelector((state: RootState) => state.auth.session?.user)
  const allContacts = useSelector((state: RootState) => state.contacts.items);
  
  // Check if any platform is connected - include all platforms in check
  const isTelegramConnectedActive = telegramConnected || (currentUser?.id && isTelegramConnected(currentUser.id))
  const isWhatsappConnectedActive = whatsappConnected || (currentUser?.id && isWhatsAppConnected(currentUser.id))
  const isInstagramConnectedActive = instagramConnected || (currentUser?.id && isInstagramConnected(currentUser.id))
  const isLinkedInConnectedActive = currentUser?.id && isLinkedInConnected(currentUser.id)
  const isPlatformConnected = matrixConnected || isWhatsappConnectedActive || isTelegramConnectedActive || isInstagramConnectedActive || isLinkedInConnectedActive
  
  // Log platform connection states when they change for debugging
  useEffect(() => {
    logger.info('[MainLayout] Platform connection states:', {
      whatsappActive: isWhatsappConnectedActive,
      telegramActive: isTelegramConnectedActive,
      instagramActive: isInstagramConnectedActive,
      activeContactList,
      isPlatformConnected
    });
  }, [isWhatsappConnectedActive, isTelegramConnectedActive, isInstagramConnectedActive, activeContactList, isPlatformConnected]);
  
  // Check for never-connected platforms when no platforms are detected as connected
  useEffect(() => {
    const checkNeverConnectedOnLoad = async () => {
      // Only check if no platforms appear to be connected and user is authenticated
      if (!isPlatformConnected && currentUser?.id) {
        try {
          logger.info('[MainLayout] No platforms connected locally, checking for never-connected status');
          
          const result = await platformManager.checkForNeverConnectedPlatforms();
          
          if (result.hasNeverConnected && result.platforms.length > 0) {
            logger.info('[MainLayout] Detected never-connected platforms, dispatching event');
            
            // Dispatch event for Dashboard to handle
            window.dispatchEvent(new CustomEvent('platform-never-connected-detected', {
              detail: {
                platforms: result.platforms,
                source: 'main-layout-load',
                timestamp: Date.now()
              }
            }));
          }
        } catch (error) {
          logger.error('[MainLayout] Error checking never-connected platforms:', error);
        }
      }
    };

    // Small delay to ensure other components have loaded
    const timeoutId = setTimeout(checkNeverConnectedOnLoad, 2000);
    return () => clearTimeout(timeoutId);
  }, [isPlatformConnected, currentUser?.id]);

  // Check for never-connected platforms on MainLayout load
  useEffect(() => {
    const checkNeverConnected = async () => {
      // Skip if already checking or alert already dismissed for this session
      if (isCheckingNeverConnected || sessionStorage.getItem('never_connected_dismissed') === 'true') {
        return;
      }

      // Skip if user is not authenticated
      if (!currentUser?.id) {
        return;
      }

      // Skip if platforms are already connected
      if (isPlatformConnected) {
        return;
      }

      try {
        setIsCheckingNeverConnected(true);
        
        // Small delay to ensure other components have loaded
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const result = await platformManager.checkForNeverConnectedPlatforms();
        
        if (result.hasNeverConnected && result.platforms.length > 0) {
          logger.info('[MainLayout] User has never connected to platforms:', result.platforms);
          setNeverConnectedPlatforms(result.platforms);
          setShowNeverConnectedAlert(true);
          logger.info('[MainLayout] SHEET SHOULD SHOW NOW - showNeverConnectedAlert set to true');
        } else {
          logger.info('[MainLayout] User has connected platforms or check failed, not showing sheet');
        }
      } catch (error) {
        logger.error('[MainLayout] Error checking for never-connected platforms:', error);
      } finally {
        setIsCheckingNeverConnected(false);
      }
    };

    // Only run ONCE when user changes and no platforms are connected
    if (currentUser?.id && !isPlatformConnected) {
      checkNeverConnected();
    }
  }, [currentUser?.id, isPlatformConnected]);

  // Listen for platform-never-connected events
  useEffect(() => {
    const handleNeverConnectedEvent = (event: CustomEvent) => {
      logger.info('[MainLayout] Received platform-never-connected event:', event.detail);
      
      const { platform, message } = event.detail;
      
      // Add platform to never-connected list if not already there
      setNeverConnectedPlatforms(prev => {
        if (!prev.includes(platform)) {
          return [...prev, platform];
        }
        return prev;
      });
      
      // Show alert if not already showing
      if (!showNeverConnectedAlert) {
        setShowNeverConnectedAlert(true);
      }
    };

    const handleNeverConnectedDetectedEvent = (event: CustomEvent) => {
      logger.info('[MainLayout] Received platform-never-connected-detected event:', event.detail);
      
      const { platforms } = event.detail;
      
      // Don't show if already dismissed in this session
      const dismissed = sessionStorage.getItem('never_connected_alert_dismissed');
      if (dismissed === 'true') {
        logger.info('[MainLayout] Never-connected alert was dismissed this session, ignoring detected event');
        return;
      }
      
      // Update platforms list and show alert
      setNeverConnectedPlatforms(platforms);
      setShowNeverConnectedAlert(true);
    };

    window.addEventListener('platform-never-connected', handleNeverConnectedEvent as EventListener);
    window.addEventListener('platform-never-connected-detected', handleNeverConnectedDetectedEvent as EventListener);
    
    return () => {
      window.removeEventListener('platform-never-connected', handleNeverConnectedEvent as EventListener);
      window.removeEventListener('platform-never-connected-detected', handleNeverConnectedDetectedEvent as EventListener);
    };
  }, [showNeverConnectedAlert]);
  
  // Listen for platform-terms-required events from PlatformSettings
  useEffect(() => {
    const handleTermsRequired = (event: CustomEvent) => {
      const { platform } = event.detail;
      logger.info(`[MainLayout] Terms required for ${platform}, showing sheet`);
      
      setPendingPlatform(platform);
      setTermsAccepted(false);
      setShowTermsSheet(true);
    };

    window.addEventListener('platform-terms-required', handleTermsRequired as EventListener);
    
    return () => {
      window.removeEventListener('platform-terms-required', handleTermsRequired as EventListener);
    };
  }, []);

  // Handle Terms & Conditions acceptance
  const handleTermsAcceptAndContinue = () => {
    if (!termsAccepted || !pendingPlatform) {
      toast.error('Please accept the terms and conditions to continue');
      return;
    }

    setShowTermsSheet(false);
    
    // Emit event back to PlatformSettings to proceed with setup
    window.dispatchEvent(new CustomEvent('platform-terms-accepted', {
      detail: {
        platform: pendingPlatform,
        timestamp: Date.now()
      }
    }));
    
    logger.info(`[MainLayout] Terms accepted for ${pendingPlatform}, emitting acceptance event`);
    
    // Clear state
    setPendingPlatform(null);
    setTermsAccepted(false);
  };

  // Handle Terms & Conditions cancellation
  const handleTermsCancel = () => {
    setShowTermsSheet(false);
    setPendingPlatform(null);
    setTermsAccepted(false);
    logger.info('[MainLayout] Terms & Conditions cancelled');
  };

  // Redux dispatch for actions
  const dispatch = useDispatch();

  const handleViewToggle = useCallback((view: 'dashboard' | 'inbox') => {
    setCurrentView(view);
    // Reset selected contact when switching views
    setSelectedContactId(null);
    setSelectedContact(null);
    // Close settings when switching views
    setSettingsOpen(false);
  }, []);

  const handleContactSelect = useCallback((contact: Contact) => {
    logger.info(`[MainLayout] Contact selected: ${contact.id}, ${contact.display_name}`);
    console.log('[DEBUG] Contact selected:', contact);
    console.log('[DEBUG] Current view state:', { isMobile, selectedContactId, activeContactList });
    
    setSelectedContactId(contact.id);
    setSelectedContact(contact);
    
    if (isMobile) {
      console.log('[DEBUG] Forcing mobile chat view update');
      setTimeout(() => {
        const updatedState = { isMobile, selectedContactId: contact.id, contact };
        console.log('[DEBUG] Updated mobile state:', updatedState);
      }, 100);
    }
  }, [isMobile, activeContactList]);

  const handlePlatformSelect = useCallback((platformId: string) => {
    logger.info(`[MainLayout] Platform selected from sidebar: ${platformId}`);
    
    if (platformId === activeContactList) {
      logger.info(`[MainLayout] Platform ${platformId} is already active, no change needed`);
      return;
    }
    
    if (platformId === 'whatsapp' && !isWhatsappConnectedActive) {
      toast.error('WhatsApp is not connected. Please connect it in settings.');
      setSettingsOpen(true);
      return;
    } 
    
    if (platformId === 'telegram' && !isTelegramConnectedActive) {
      toast.error('Telegram is not connected. Please connect it in settings.');
      setSettingsOpen(true);
      return;
    }

    if (platformId === 'instagram' && !isInstagramConnectedActive) {
      toast.error('Instagram is not connected. Please connect it in settings.');
      setSettingsOpen(true);
      return;
    }
    
    dispatch({ type: 'contacts/reset' });
    dispatch({ type: 'messages/reset' });
    
    setActiveContactList(platformId);
    setSelectedContactId(null);
    setSelectedContact(null);
    
    localStorage.setItem('dailyfix_active_platform', platformId);
    window.dispatchEvent(new Event('platform-switched'));
    toast.success(`Switched to ${platformId.charAt(0).toUpperCase() + platformId.slice(1)}`);
  }, [activeContactList, isWhatsappConnectedActive, isTelegramConnectedActive, isInstagramConnectedActive, dispatch]);
  
  // Handle chat close
  const handleChatClose = () => {
    console.log('[DEBUG] Closing chat view');
    setSelectedContactId(null);
    setSelectedContact(null);
  }

  // Listen for navigation events from notifications
  useEffect(() => {
    const handleNavigate = (event: CustomEvent) => {
      try {
        const { platform, contactId } = event.detail;
        const numericContactId = parseInt(contactId, 10);
        if (isNaN(numericContactId)) {
          logger.error(`[MainLayout] Invalid contactId received: ${contactId}`);
          return;
        }

        logger.info(`[MainLayout] Navigation requested to platform: ${platform}, contact: ${numericContactId}`);

        // Case 1: Already on the correct platform.
        if (activeContactList === platform) {
          const contactToSelect = allContacts.find((c: Contact) => c.id === numericContactId);
          if (contactToSelect) {
            logger.info(`[MainLayout] Same-platform navigation. Contact found.`);
            handleViewToggle('inbox');
            handleContactSelect(contactToSelect);
          } else {
            logger.warn(`[MainLayout] Contact ID ${numericContactId} not found on active platform ${platform}.`);
            toast.error("Contact not found. Try refreshing the contact list.");
          }
        } else {
          // Case 2: Different platform. Defer navigation.
          logger.info(`[MainLayout] Cross-platform navigation detected. Deferring selection.`);
          setPendingNavigation({ platform, contactId: numericContactId });
          handleViewToggle('inbox');
          handlePlatformSelect(platform); // This will switch UI and trigger data fetching
        }
      } catch (e) {
        logger.error(`[MainLayout] Error handling navigation:`, e);
      }
    };

    window.addEventListener('navigate-to-chat', handleNavigate as EventListener);
    return () => {
      window.removeEventListener('navigate-to-chat', handleNavigate as EventListener);
    };
  }, [allContacts, activeContactList, handleViewToggle, handlePlatformSelect, handleContactSelect]);
  
  // This effect handles deferred navigation after a platform switch
  useEffect(() => {
    if (pendingNavigation && pendingNavigation.platform === activeContactList && allContacts.length > 0) {
      const contactToSelect = allContacts.find(c => c.id === pendingNavigation.contactId);
      
      if (contactToSelect) {
        logger.info(`[MainLayout] Executing deferred navigation to contact:`, contactToSelect);
        handleContactSelect(contactToSelect);
        setPendingNavigation(null); // Clear after successful navigation
      } else {
        // Contacts loaded, but the specific one wasn't there. It might be a sync issue.
        // We'll log a warning and clear the pending state to prevent loops.
        logger.warn(`[MainLayout] Deferred navigation failed. Contact ID ${pendingNavigation.contactId} not found in loaded contacts for ${activeContactList}.`);
        toast.error(`Could not find the notified contact after switching. Please try refreshing.`);
        setPendingNavigation(null);
      }
    }
  }, [allContacts, activeContactList, pendingNavigation, handleContactSelect]);
  
  // Initialize active contact list based on connected platforms on mount
  useEffect(() => {
    if (!activeContactList && isPlatformConnected) {
      // Get the platform from URL or local storage if available
      const storedPlatform = localStorage.getItem('dailyfix_active_platform');
      
      if (storedPlatform) {
        // Check if the stored platform is actually connected
        if ((storedPlatform === 'whatsapp' && isWhatsappConnectedActive) || 
            (storedPlatform === 'telegram' && isTelegramConnectedActive) ||
            (storedPlatform === 'instagram' && isInstagramConnectedActive)) {
          logger.info(`[MainLayout] Restoring previously selected platform: ${storedPlatform}`);
          setActiveContactList(storedPlatform);
          return;
        }
      }
      
      // Only auto-select a platform if we don't have a stored preference
      if (isTelegramConnectedActive) {
        logger.info('[MainLayout] Auto-selecting Telegram as active platform');
        setActiveContactList('telegram');
      } else if (isWhatsappConnectedActive) {
        logger.info('[MainLayout] Auto-selecting WhatsApp as active platform');
        setActiveContactList('whatsapp');
      } else if (isInstagramConnectedActive) {
        logger.info('[MainLayout] Auto-selecting Instagram as active platform');
        setActiveContactList('instagram');
      }
    }
  }, [isPlatformConnected, isWhatsappConnectedActive, isTelegramConnectedActive, isInstagramConnectedActive, activeContactList]);
  
  // Save the active platform when it changes
  useEffect(() => {
    if (activeContactList) {
      localStorage.setItem('dailyfix_active_platform', activeContactList);
      logger.info(`[MainLayout] Saved active platform to localStorage: ${activeContactList}`);
    }
  }, [activeContactList]);
  
  // Handlers for platform-specific selection
  const handleWhatsAppSelected = () => {
    logger.info('[MainLayout] WhatsApp selected from sidebar');
    if (!isWhatsappConnectedActive) {
      toast.error('WhatsApp is not connected. Please connect it in settings.');
      setSettingsOpen(true);
      return;
    }
    setActiveContactList('whatsapp');
    setSelectedContactId(null);
    setSelectedContact(null);
  };
  
  const handleTelegramSelected = () => {
    logger.info('[MainLayout] Telegram selected from sidebar');
    if (!isTelegramConnectedActive) {
      toast.error('Telegram is not connected. Please connect it in settings.');
      setSettingsOpen(true);
      return;
    }
    setActiveContactList('telegram');
    setSelectedContactId(null);
    setSelectedContact(null);
  };

  const handleInstagramSelected = () => {
    logger.info('[MainLayout] Instagram selected from sidebar');
    if (!isInstagramConnectedActive) {
      toast.error('Instagram is not connected. Please connect it in settings.');
      setSettingsOpen(true);
      return;
    }
    setActiveContactList('instagram');
    setSelectedContactId(null);
    setSelectedContact(null);
  };
  
  // Handle platform sync start
  const handleStartSync = (platform: string) => {
    if (platform === 'whatsapp') {
      handleWhatsAppSelected();
    } else if (platform === 'telegram') {
      handleTelegramSelected();
    } else if (platform === 'instagram') {
      handleInstagramSelected();
    } else if (platform === 'linkedin') {
      handleLinkedInSelected();
    }
  };
  
  // Listen for open-settings events
  useEffect(() => {
    const handleOpenSettings = () => {
      setSettingsOpen(true)
    }
    
    window.addEventListener('open-settings', handleOpenSettings)
    
    return () => {
      window.removeEventListener('open-settings', handleOpenSettings)
    }
  }, [])
  
  // Effect to reset the inbox width when settings are opened/closed
  useEffect(() => {
    if (settingsOpen) {
      setInboxWidth(35) // Default width when settings are open (35% for inbox)
    } else {
      setInboxWidth(100) // Full width when settings are closed
    }
  }, [settingsOpen])

  // Fixed resize handlers to ensure they work properly
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!contentRef.current) return
    
    // Store the starting X position and initial width
    startXRef.current = e.clientX
    startWidthRef.current = inboxWidth
    
    setIsResizing(true)
    
    // Explicitly add a class to the body to change cursor while resizing
    document.body.style.cursor = 'col-resize'
    document.body.classList.add('select-none')
  }, [inboxWidth])
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !contentRef.current) return
    
    // Calculate delta movement and apply it to the starting width
    const containerRect = contentRef.current.getBoundingClientRect()
    const containerWidth = containerRect.width
    
    const deltaX = e.clientX - startXRef.current
    const deltaPercentage = (deltaX / containerWidth) * 100
    let newWidth = startWidthRef.current + deltaPercentage
    
    // Restrict width to reasonable limits (25% to 60%)
    newWidth = Math.max(25, Math.min(60, newWidth))
    
    setInboxWidth(newWidth)
  }, [isResizing])
  
  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
    
    // Reset body cursor and selection
    document.body.style.cursor = ''
    document.body.classList.remove('select-none')
    
    // Reset refs
    startXRef.current = 0
    startWidthRef.current = 0
  }, [])
  
  // Set up global event listeners for mouse move and mouse up
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove, { passive: false })
      document.addEventListener('mouseup', handleMouseUp)
      
      // Prevent text selection during resize
      document.body.style.userSelect = 'none'
    } else {
      document.body.style.userSelect = ''
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = ''
    }
  }, [isResizing, handleMouseMove, handleMouseUp])
  
  // Handle never-connected alert actions
  const handleConnectPlatforms = () => {
    setShowNeverConnectedAlert(false);
    navigate('/settings');
  };

  const handleDismissAlert = () => {
    setShowNeverConnectedAlert(false);
    // Store dismissal in session storage to prevent re-showing
    sessionStorage.setItem('never_connected_dismissed', 'true');
  };

  // Function to render the platform icon based on the active platform
  const renderPlatformIcon = () => {
    if (activeContactList === 'telegram') {
      return <Send className="h-5 w-5 mr-2 text-blue-400" />;
    } else if (activeContactList === 'whatsapp') {
      return <MessageSquare className="h-5 w-5 mr-2 text-green-500" />;
    } else if (activeContactList === 'instagram') {
      return <MessageSquare className="h-5 w-5 mr-2 text-pink-500" />;
    } else if (activeContactList === 'linkedin') {
      return <MessageSquare className="h-5 w-5 mr-2 text-blue-600" />;
    }
    return null;
  };

  // Function to render header title based on current view
  const renderHeaderTitle = () => {
    if (settingsOpen) {
      return "Settings";
    }
    
    if (currentView === 'dashboard') {
      return "Dashboard";
    }
    
    if (selectedContact && isMobile) {
      return selectedContact.display_name;
    }
    
    return (
      <div className="flex items-center">
        {renderPlatformIcon()}
        {activeContactList
          ? `${activeContactList.charAt(0).toUpperCase() + activeContactList.slice(1)} Inbox`
          : 'Inbox'}
      </div>
    );
  };

  // Handle settings navigation - Fix for issue B
  const handleSettingsClick = () => {
    if (window.location.pathname === '/settings') {
      // If already on settings page, toggle the settings open state
      setSettingsOpen(!settingsOpen)
    } else {
      // Navigate to settings route
      navigate('/settings')
      setSettingsOpen(true)
    }
  }

  // Handle URL-based settings state - Fix for issue B
  useEffect(() => {
    if (location.pathname === '/settings') {
      setSettingsOpen(true)
    } else {
      setSettingsOpen(false)
    }
  }, [location.pathname])

  // Enhanced platform detection with LinkedIn support
  useEffect(() => {
    const checkActiveContactList = () => {
      const activePlatform = localStorage.getItem('dailyfix_active_platform');
      if (activePlatform === 'whatsapp') {
        setIsWhatsAppActive(true);
        setIsTelegramActive(false);
        setIsInstagramActive(false);
        setIsLinkedInActive(false);
      } else if (activePlatform === 'telegram') {
        setIsTelegramActive(true);
        setIsWhatsAppActive(false);
        setIsInstagramActive(false);
        setIsLinkedInActive(false);
      } else if (activePlatform === 'instagram') {
        setIsInstagramActive(true);
        setIsWhatsAppActive(false);
        setIsTelegramActive(false);
        setIsLinkedInActive(false);
      } else if (activePlatform === 'linkedin') {
        setIsLinkedInActive(true);
        setIsWhatsAppActive(false);
        setIsTelegramActive(false);
        setIsInstagramActive(false);
      }
    };

    checkActiveContactList();
    
    const handleStorageChange = () => {
      checkActiveContactList();
    };

    // Handle platform connection changes (including disconnections)
    const handlePlatformConnectionChange = () => {
      checkActiveContactList();
      // Force re-evaluation of platform connection states
      setTimeout(() => {
        const currentUser = session?.user;
        if (currentUser?.id) {
          // Re-check connection states after disconnect
          const whatsappConnected = isWhatsAppConnected(currentUser.id);
          const telegramConnected = isTelegramConnected(currentUser.id);
          const instagramConnected = isInstagramConnected(currentUser.id);
          const linkedinConnected = isLinkedInConnected(currentUser.id);
          
          // Clear active platform if it's no longer connected
          const activePlatform = localStorage.getItem('dailyfix_active_platform');
          if (activePlatform) {
            if ((activePlatform === 'whatsapp' && !whatsappConnected) ||
                (activePlatform === 'telegram' && !telegramConnected) ||
                (activePlatform === 'instagram' && !instagramConnected) ||
                (activePlatform === 'linkedin' && !linkedinConnected)) {
              localStorage.removeItem('dailyfix_active_platform');
              setActiveContactList(null);
              setSelectedContact(null);
              setSelectedContactId(null);
              setIsWhatsAppActive(false);
              setIsTelegramActive(false);
              setIsInstagramActive(false);
              setIsLinkedInActive(false);
            }
          }
        }
      }, 100);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('platform-connection-changed', handlePlatformConnectionChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('platform-connection-changed', handlePlatformConnectionChange);
    };
  }, [session?.user]);

  // LinkedIn connection monitoring
  useEffect(() => {
    const checkLinkedInConnection = () => {
      if (!session?.user?.id) return;
      
      const connectionStatus = localStorage.getItem('dailyfix_connection_status');
      if (connectionStatus) {
        try {
          const status = JSON.parse(connectionStatus);
          setLinkedInConnected(status.linkedin === true);
        } catch (e) {
          console.error('Error parsing connection status:', e);
          setLinkedInConnected(false);
        }
      } else {
        setLinkedInConnected(false);
      }
    };

    // Check on mount
    checkLinkedInConnection();

    // Listen for LinkedIn disconnection events
    const handleLinkedInDisconnected = (event: CustomEvent) => {
      if (event.detail?.platform === 'linkedin') {
        setLinkedInConnected(false);
        setShowLinkedInDisconnectedAlert(true);
        // If LinkedIn was active, switch to a different platform or show empty state
        if (isLinkedInActive) {
          setSelectedContact(null);
        }
      }
    };

    // Listen for LinkedIn connection events
    const handleLinkedInConnected = (event: CustomEvent) => {
      if (event.detail?.platform === 'linkedin') {
        setLinkedInConnected(true);
        setShowLinkedInDisconnectedAlert(false);
      }
    };

    window.addEventListener('linkedin-disconnected', handleLinkedInDisconnected as EventListener);
    window.addEventListener('linkedin-connected', handleLinkedInConnected as EventListener);
    window.addEventListener('platform-connection-changed', checkLinkedInConnection);

    return () => {
      window.removeEventListener('linkedin-disconnected', handleLinkedInDisconnected as EventListener);
      window.removeEventListener('linkedin-connected', handleLinkedInConnected as EventListener);
      window.removeEventListener('platform-connection-changed', checkLinkedInConnection);
    };
  }, [session?.user?.id, isLinkedInActive]);

  const handleLinkedInSelected = () => {
    setIsLinkedInActive(true);
    setIsTelegramActive(false);
    setIsWhatsAppActive(false);
    setIsInstagramActive(false);
    localStorage.setItem('dailyfix_active_platform', 'linkedin');
    setSelectedContact(null);
    
    // Trigger platform change event
    window.dispatchEvent(new CustomEvent('platform-switched', { 
      detail: { platform: 'linkedin' } 
    }));
  };

  // Update activeContactList based on platform states
  useEffect(() => {
    if (isWhatsAppActive) {
      setActiveContactList('whatsapp');
    } else if (isTelegramActive) {
      setActiveContactList('telegram');
    } else if (isInstagramActive) {
      setActiveContactList('instagram');
    } else if (isLinkedInActive) {
      setActiveContactList('linkedin');
    } else {
      setActiveContactList(null);
    }
  }, [isWhatsAppActive, isTelegramActive, isInstagramActive, isLinkedInActive]);

  // Clear activeContactList when no platforms are connected
  useEffect(() => {
    if (!isPlatformConnected) {
      setActiveContactList(null);
      setSelectedContact(null);
      setSelectedContactId(null);
    }
  }, [isPlatformConnected]);

  return (
    <>
      {/* Never Connected Sheet */}
      <Sheet open={showNeverConnectedAlert} onOpenChange={setShowNeverConnectedAlert}>
        <SheetContent side="right" className="sm:max-w-md flex flex-col h-full">
          <SheetHeader className="flex-shrink-0 space-y-4 pb-4">
            <SheetTitle className="flex items-center gap-2 text-left">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              No Platforms Connected
            </SheetTitle>
            <SheetDescription className="text-left">
              You haven't connected to any messaging platforms yet. To start using DailyFix and view your messaging analytics, you need to connect to at least one platform.
            </SheetDescription>
          </SheetHeader>
          
          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            <div className="space-y-3">
              <p className="font-medium text-foreground text-sm">Available platforms:</p>
              <div className="flex items-center gap-2">
                <FaWhatsapp className="h-4 w-4 text-green-500" />
                <span className="text-foreground text-sm">WhatsApp</span>
              </div>
              <div className="flex items-center gap-2">
                <FaTelegram className="h-4 w-4 text-blue-500" />
                <span className="text-foreground text-sm">Telegram</span>
              </div>
            </div>

            {neverConnectedPlatforms.length > 0 && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border">
                <p className="text-sm text-blue-800 dark:text-blue-200 flex items-center">
                  <MessageSquare className="h-4 w-4 inline mr-1" />
                  Platforms available: {neverConnectedPlatforms.join(', ')}
                </p>
              </div>
            )}
          </div>
          
          {/* Fixed Footer with Buttons */}
          <div className="flex-shrink-0 flex flex-col gap-2 pt-4 mt-4 border-t">
            <Button variant="outline" onClick={handleDismissAlert} className="w-full">
              Maybe Later
            </Button>
            <Button onClick={handleConnectPlatforms} className="w-full">
              <SettingsIcon className="h-4 w-4 mr-2" />
              Connect Platforms
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Terms & Conditions Sheet */}
      <Sheet open={showTermsSheet} onOpenChange={setShowTermsSheet}>
        <SheetContent side="right" className="sm:max-w-lg flex flex-col h-full">
          <SheetHeader className="flex-shrink-0 space-y-4 pb-4">
            <SheetTitle className="flex items-center gap-2 text-left">
              <Shield className="h-5 w-5 text-blue-500" />
              Terms & Conditions
            </SheetTitle>
            <SheetDescription className="text-left">
              Please review and accept our terms before connecting your {pendingPlatform} account.
            </SheetDescription>
          </SheetHeader>
          
          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {/* Security Notice */}
            <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <h4 className="font-medium text-blue-800 dark:text-blue-200 text-sm">Important Security Information</h4>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    By connecting your {pendingPlatform} account, you agree to the following terms:
                  </p>
                </div>
              </div>
            </div>

            {/* Instagram-specific developer warning */}
            {pendingPlatform === 'instagram' && (
              <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                  <div className="space-y-2">
                    <h4 className="font-medium text-orange-800 dark:text-orange-200 text-sm">Developer Connection Method</h4>
                    <p className="text-xs text-orange-700 dark:text-orange-300">
                      Instagram connection uses a <strong>developer-focused cURL method</strong> that requires technical knowledge. 
                      This method involves copying network requests from your browser's developer tools and is intended for 
                      advanced users who understand web development concepts.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Terms List */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div>
                  <h5 className="font-medium text-foreground mb-1 text-sm">Secure Contact Synchronization</h5>
                  <p className="text-xs text-muted-foreground">
                    Our secure protocol (which is open and secure) syncs contacts eventually. 
                    Do not panic or wonder about the contacts if not immediately synced. 
                    Keep track of the refresh sync button after connecting in the contact lists.
                  </p>
                </div>
              </div>

              {/* Instagram-specific terms */}
              {pendingPlatform === 'instagram' && (
                <>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-pink-500 mt-2 flex-shrink-0" />
                    <div>
                      <h5 className="font-medium text-foreground mb-1 text-sm">Developer Method Requirements</h5>
                      <p className="text-xs text-muted-foreground">
                        Instagram connection requires you to manually copy cURL commands from your browser's Network tab. 
                        This method is designed for developers and requires understanding of browser developer tools, 
                        HTTP requests, and session management.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-pink-500 mt-2 flex-shrink-0" />
                    <div>
                      <h5 className="font-medium text-foreground mb-1 text-sm">Session Cookie Security</h5>
                      <p className="text-xs text-muted-foreground">
                        The cURL command contains your Instagram session cookies. These are used only to authenticate 
                        your account and are handled securely. Never share your cURL commands with untrusted parties 
                        as they contain sensitive authentication data.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-pink-500 mt-2 flex-shrink-0" />
                    <div>
                      <h5 className="font-medium text-foreground mb-1 text-sm">Technical Support Limitations</h5>
                      <p className="text-xs text-muted-foreground">
                        Due to the technical nature of Instagram's connection method, support is limited to users 
                        with web development experience. Basic browser developer tools knowledge is required.
                      </p>
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div>
                  <h5 className="font-medium text-foreground mb-1 text-sm">AI Access & Security</h5>
                  <p className="text-xs text-muted-foreground">
                    Our secure AI will also have access to your chats, but it's highly secure and limited. 
                    AI processing is used only for generating summaries and insights to improve your messaging experience.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div>
                  <h5 className="font-medium text-foreground mb-1 text-sm">Data Protection</h5>
                  <p className="text-xs text-muted-foreground">
                    All your data is encrypted and stored securely. We do not share your personal information 
                    or chat data with third parties. Your privacy is our top priority.
                    {pendingPlatform === 'instagram' && (
                      <span className="block mt-1 font-medium">
                        For Instagram: Session cookies are processed securely and never logged or stored permanently.
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div>
                  <h5 className="font-medium text-foreground mb-1 text-sm">Open Source Protocol</h5>
                  <p className="text-xs text-muted-foreground">
                    Our connection protocol is open source and can be audited for security. 
                    We believe in transparency and security through openness.
                  </p>
                </div>
              </div>
            </div>

            {/* Acceptance Checkbox */}
            <div className="pt-3 border-t">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="terms-acceptance"
                  checked={termsAccepted}
                  onCheckedChange={(checked) => setTermsAccepted(checked as boolean)}
                  className="mt-1"
                />
                <label 
                  htmlFor="terms-acceptance" 
                  className="text-sm text-foreground leading-relaxed cursor-pointer"
                >
                  I understand and accept these terms and conditions. I acknowledge that DailyFix will have 
                  secure access to my {pendingPlatform} contacts and messages for the purpose of providing 
                  messaging management and AI-powered insights.
                  {pendingPlatform === 'instagram' && (
                    <span className="block mt-2 font-medium text-orange-600 dark:text-orange-400">
                      ⚠️ I understand that Instagram connection requires technical knowledge of browser developer tools 
                      and cURL commands, and I accept responsibility for properly handling my session authentication data.
                    </span>
                  )}
                </label>
              </div>
            </div>
          </div>
          
          {/* Fixed Footer with Buttons */}
          <SheetFooter className="flex-shrink-0 flex flex-col gap-2 pt-4 mt-4 border-t">
            <Button 
              onClick={handleTermsAcceptAndContinue}
              disabled={!termsAccepted}
              className="w-full"
            >
              Accept & Continue
            </Button>
            <Button 
              variant="outline" 
              onClick={handleTermsCancel}
              className="w-full"
            >
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* LinkedIn Disconnection Alert */}
      <AlertDialog open={showLinkedInDisconnectedAlert} onOpenChange={setShowLinkedInDisconnectedAlert}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-blue-600">
              <AlertTriangle className="h-5 w-5" />
              LinkedIn Disconnected
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Your LinkedIn session has expired or been logged out.</p>
              <p className="text-sm text-muted-foreground">
                To continue receiving LinkedIn messages, please reconnect your LinkedIn account in Settings.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              Dismiss
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowLinkedInDisconnectedAlert(false);
                handleSettingsClick();
              }}
              className="bg-blue-600 hover:bg-blue-700 focus:ring-blue-600"
            >
              Go to Settings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Main Layout */}
      <SidebarProvider 
        className="h-screen"
        defaultOpen={false}
        open={false}
        onOpenChange={() => {}}
        style={{}}
      >
        <AppSidebar
          onWhatsAppSelected={handleWhatsAppSelected}
          onTelegramSelected={handleTelegramSelected}
          onInstagramSelected={handleInstagramSelected}
          onPlatformSelect={handlePlatformSelect}
          onSettingsSelected={handleSettingsClick}
          onPlatformConnect={handleSettingsClick}
        />
        <SidebarInset className="">
          {/* Header */}
          <header className="flex h-16 shrink-0 items-center gap-2 bg-header whatsapp-glowing-border p-4">
            {!isMobile || (!selectedContact && !settingsOpen) ? (
              <SidebarTrigger className="-ml-1" onClick={() => {}} />
            ) : (
              selectedContact && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleChatClose}
                  className="text-foreground hover:bg-accent"
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span className="sr-only">Back to contacts</span>
                </Button>
              )
            )}
            <Separator orientation="vertical" className="mr-2 h-4" />
            
            {/* Mobile Header Layout */}
            {isMobile ? (
              <>
                {/* Mobile: Show condensed title and menu button */}
                <div className="flex-1 ml-2 text-base font-medium text-header-foreground truncate">
                  {renderHeaderTitle()}
                </div>
                
                {/* Mobile: Dropdown menu for actions */}
                <div className="flex items-center space-x-2">
                  {/* Notification Bell - Mobile */}
                  {(isWhatsappConnectedActive && activeContactList === 'whatsapp') && <NotificationPopover platform="whatsapp" />}
                  {(isTelegramConnectedActive && activeContactList === 'telegram') && <NotificationPopover platform="telegram" />}
                  {(isLinkedInConnectedActive && activeContactList === 'linkedin') && <NotificationPopover platform="linkedin" />}
                  
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-header-foreground hover:bg-accent flex-shrink-0"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-5 w-5"
                        >
                          <circle cx="12" cy="12" r="1" />
                          <circle cx="12" cy="5" r="1" />
                          <circle cx="12" cy="19" r="1" />
                        </svg>
                        <span className="sr-only">Menu</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-48">
                      <div className="space-y-2">
                        {!settingsOpen && !selectedContact && (
                          <>
                            <Button
                              variant={currentView === 'dashboard' ? 'default' : 'ghost'}
                              size="sm"
                              onClick={() => handleViewToggle('dashboard')}
                              className="w-full justify-start"
                            >
                              <LayoutDashboard className="h-4 w-4 mr-2" />
                              Dashboard
                            </Button>
                            <Button
                              variant={currentView === 'inbox' ? 'default' : 'ghost'}
                              size="sm"
                              onClick={() => handleViewToggle('inbox')}
                              className="w-full justify-start"
                            >
                              <Inbox className="h-4 w-4 mr-2" />
                              Inbox
                            </Button>
                            <Separator className="my-2" />
                          </>
                        )}
                        {settingsOpen ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSettingsOpen(false)}
                            className="w-full justify-start"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-4 w-4 mr-2"
                            >
                              <path d="M18 6 6 18" />
                              <path d="m6 6 12 12" />
                            </svg>
                            Close Settings
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSettingsOpen(true)}
                            className="w-full justify-start"
                          >
                            <SettingsIcon className="h-4 w-4 mr-2" />
                            Settings
                          </Button>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            ) : (
              <>
                {/* Desktop Header Layout */}
                {/* View Toggle Buttons */}
                {!settingsOpen && !selectedContact && (
                  <div className="flex items-center space-x-2 mr-4">
                    <Button
                      variant={currentView === 'dashboard' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => handleViewToggle('dashboard')}
                      className="text-header-foreground"
                    >
                      <LayoutDashboard className="h-4 w-4 mr-2" />
                      Dashboard
                    </Button>
                    <Button
                      variant={currentView === 'inbox' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => handleViewToggle('inbox')}
                      className="text-header-foreground"
                    >
                      <Inbox className="h-4 w-4 mr-2" />
                      Inbox
                    </Button>
                  </div>
                )}
                
                <div className="flex-1 ml-4 text-lg font-medium text-header-foreground">
                  {renderHeaderTitle()}
                </div>
                
                <div className="flex items-center space-x-2">
                  {/* Notification Bell - Desktop */}
                  {(isWhatsappConnectedActive && activeContactList === 'whatsapp') && <NotificationPopover platform="whatsapp" />}
                  {(isTelegramConnectedActive && activeContactList === 'telegram') && <NotificationPopover platform="telegram" />}
                  {(isLinkedInConnectedActive && activeContactList === 'linkedin') && <NotificationPopover platform="linkedin" />}
                  
                  {settingsOpen ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSettingsOpen(false)}
                      className="text-header-foreground hover:bg-accent"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                      <span className="sr-only">Close</span>
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSettingsOpen(true)}
                      className="text-header-foreground hover:bg-accent"
                    >
                      <SettingsIcon className="h-5 w-5" />
                      <span className="sr-only">Settings</span>
                    </Button>
                  )}
                </div>
              </>
            )}
          </header>

          {/* Main Content */}
          <div className={`flex flex-1 h-full bg-background ${isMobile ? 'ml-0' : 'ml-6'}`} ref={contentRef}>
            {/* Dashboard View */}
            {currentView === 'dashboard' && !settingsOpen && (
              <Dashboard />
            )}

            {/* Settings View */}
            {settingsOpen && (
              <>
                <div
                  style={{ width: isMobile ? '0%' : `${inboxWidth}%`, transition: isResizing ? 'none' : 'width 0.2s ease-in-out' }}
                  className={`h-full flex flex-col bg-background ${isMobile ? 'hidden' : ''}`}
                >
                  <div className="flex-1 flex flex-col p-4 overflow-hidden rounded-lg">
                    {/* Inbox content */}
                    {!isPlatformConnected && (
                      <div className="flex flex-col items-center justify-center h-full gap-6">
                        <div className="w-full max-w-md rounded-lg overflow-hidden mb-4">
                          <img src="https://cdni.iconscout.com/illustration/premium/thumb/nothing-here-yet-illustration-download-in-svg-png-gif-file-formats--404-page-not-found-planet-space-empty-state-pack-science-technology-illustrations-6763396.png" alt="NP"/>
                        </div>
                        <p className="text-muted-foreground text-center text-lg">
                          No platforms connected, go ahead and connect to a platform in Settings
                        </p>
                      </div>
                    )}
                    {isPlatformConnected && !activeContactList && (
                      <div className="flex flex-col gap-6">
                        <div className="rounded-lg overflow-hidden">
                          <div className="p-6 pb-8">
                            <PlatformsInfo onStartSync={handleStartSync} />
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Additional inbox content */}
                  </div>
                </div>
                {!isMobile && (
                  <div
                    ref={resizerRef}
                    className="w-4 h-full bg-transparent flex items-center justify-center cursor-col-resize z-50"
                    onMouseDown={handleMouseDown}
                    onMouseEnter={() => setIsResizerHovered(true)}
                    onMouseLeave={() => setIsResizerHovered(false)}
                  >
                    <div className={`h-full w-[1px] bg-border ${isResizerHovered || isResizing ? 'opacity-100' : 'opacity-50'}`} />
                  </div>
                )}
                <div className="flex-1 h-full flex flex-col bg-card overflow-auto">
                  <div className="flex-1 p-6 overflow-auto">
                    <PlatformSettings />
                  </div>
                </div>
              </>
            )}

            {/* Inbox View */}
            {currentView === 'inbox' && !settingsOpen && (
              <>
                {/* Mobile: Either show contact list OR chat view, but not both */}
                {isMobile && selectedContact ? (
                  <div className="flex-1 h-full w-full bg-chat">
                    {isPlatformConnected && activeContactList === 'whatsapp' ? (
                      <div className="flex-1 h-full rounded-lg">
                        <WhatsAppChatView
                          selectedContact={selectedContact}
                          onContactUpdate={(updatedContact) => {
                            if (selectedContact) {
                              setSelectedContact({ ...selectedContact, ...updatedContact });
                            }
                          }}
                          onClose={handleChatClose}
                        />
                      </div>
                    ) : isPlatformConnected && activeContactList === 'telegram' ? (
                      <div className="flex-1 h-full rounded-lg">
                        <TelegramChatView
                          selectedContact={selectedContact}
                          onContactUpdate={(updatedContact) => {
                            if (selectedContact) {
                              setSelectedContact({ ...selectedContact, ...updatedContact });
                            }
                          }}
                          onClose={handleChatClose}
                        />
                      </div>
                    ) : isPlatformConnected && activeContactList === 'instagram' ? (
                      <div className="flex-1 h-full rounded-lg">
                        <InstagramChatView
                          contact={selectedContact}
                          onContactUpdate={(updatedContact) => {
                            if (selectedContact) {
                              setSelectedContact({ ...selectedContact, ...updatedContact });
                            }
                          }}
                          onClose={handleChatClose}
                        />
                      </div>
                    ) : (
                      // Fallback content in case no platform is active or platform is disconnected
                      <div className="flex items-center justify-center h-full p-4 text-center">
                        <div>
                          <p className="text-muted-foreground mb-4">No active chat selected or platform disconnected.</p>
                          <Button variant="outline" onClick={handleChatClose}>
                            Return to contacts
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Desktop layout OR Mobile contact list view */}
                    <div
                      style={{
                        width: !isMobile && selectedContact ? '35%' : '100%',
                        transition: isResizing ? 'none' : 'width 0.2s ease-in-out',
                      }}
                      className="h-full flex flex-col bg-background"
                    >
                      <div className="flex-1 flex flex-col p-4 overflow-auto rounded-lg">
                        {/* Inbox content */}
                        {!isPlatformConnected && (
                          <div className="flex flex-col items-center justify-center h-full gap-6">
                            <div className="w-full max-w-md rounded-lg overflow-hidden mb-4">
                            <img src="https://cdni.iconscout.com/illustration/premium/thumb/nothing-here-yet-illustration-download-in-svg-png-gif-file-formats--404-page-not-found-planet-space-empty-state-pack-science-technology-illustrations-6763396.png" alt="NP"/>
                            </div>
                            <p className="text-muted-foreground text-center text-lg">
                              No platforms connected, go ahead and connect to a platform in Settings
                            </p>
                          </div>
                        )}
                        {isPlatformConnected && !activeContactList && (
                          <div className="flex flex-col gap-6">
                            <div className="rounded-lg overflow-hidden">
                              <div className="p-6 pb-8">
                                <PlatformsInfo onStartSync={handleStartSync} />
                              </div>
                            </div>
                          </div>
                        )}
                        {isPlatformConnected && activeContactList === 'whatsapp' && (
                          <div className="contact-list-container h-full">
                            <WhatsappContactList
                              onContactSelect={(contact) => {
                                setSelectedContact(contact);
                              }}
                              selectedContactId={selectedContactId}
                            />
                          </div>
                        )}
                        {isPlatformConnected && activeContactList === 'telegram' && (
                          <div className="contact-list-container h-full">
                            <TelegramContactList
                              onContactSelect={(contact) => {
                                setSelectedContact(contact);
                              }}
                              selectedContactId={selectedContactId}
                            />
                          </div>
                        )}
                        {isPlatformConnected && activeContactList === 'instagram' && (
                          <div className="contact-list-container h-full">
                            <InstagramContactList
                              onContactSelect={(contact) => {
                                setSelectedContact(contact);
                              }}
                              selectedContactId={selectedContactId}
                            />
                          </div>
                        )}
                        {isPlatformConnected && activeContactList === 'linkedin' && (
                          <div className="contact-list-container h-full">
                            <LinkedinContactList
                              onContactSelect={(contact) => {
                                setSelectedContact(contact);
                              }}
                              selectedContactId={selectedContactId}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Chat view for desktop */}
                    {!isMobile && selectedContact && (
                      <div className="flex-1 h-full">
                        <div className="flex-1 h-full rounded-lg">
                          {isPlatformConnected && activeContactList === 'whatsapp' && selectedContact && (
                            <div className="flex-1 h-full rounded-lg">
                              <WhatsAppChatView
                                selectedContact={selectedContact}
                                onContactUpdate={(updatedContact) => {
                                  if (selectedContact) {
                                    setSelectedContact({ ...selectedContact, ...updatedContact });
                                  }
                                }}
                                onClose={handleChatClose}
                              />
                            </div>
                          )}
                          {isPlatformConnected && activeContactList === 'telegram' && selectedContact && (
                            <div className="flex-1 h-full rounded-lg">
                              <TelegramChatView
                                selectedContact={selectedContact}
                                onContactUpdate={(updatedContact) => {
                                  if (selectedContact) {
                                    setSelectedContact({ ...selectedContact, ...updatedContact });
                                  }
                                }}
                                onClose={handleChatClose}
                              />
                            </div>
                          )}
                          {isPlatformConnected && activeContactList === 'instagram' && selectedContact && (
                            <div className="flex-1 h-full rounded-lg">
                              <InstagramChatView
                                contact={selectedContact}
                                onContactUpdate={(updatedContact) => {
                                  if (selectedContact) {
                                    setSelectedContact({ ...selectedContact, ...updatedContact });
                                  }
                                }}
                                onClose={handleChatClose}
                              />
                            </div>
                          )}
                          {isPlatformConnected && activeContactList === 'linkedin' && selectedContact && (
                            <div className="flex-1 h-full rounded-lg">
                              <LinkedinChatView
                                selectedContact={selectedContact}
                                onContactUpdate={(updatedContact) => {
                                  if (selectedContact) {
                                    setSelectedContact({ ...selectedContact, ...updatedContact });
                                  }
                                }}
                                onClose={handleChatClose}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
          
          {/* Test Notification Button - Temporary for debugging */}
          {/* <div className="fixed bottom-4 right-4 z-50">
            <button 
              onClick={async () => {
                console.log('[DEBUG] Test button clicked');
                
                // Get debug info
                const debugInfo = notificationManager.getDebugInfo();
                console.log('[DEBUG] Notification manager debug info:', debugInfo);
                
                // Test WhatsApp notification
                console.log('[DEBUG] Testing WhatsApp notification...');
                const whatsappResult = await notificationManager.testNotification('whatsapp');
                console.log('[DEBUG] WhatsApp test result:', whatsappResult);
                
                // Test Telegram notification after a short delay
                setTimeout(async () => {
                  console.log('[DEBUG] Testing Telegram notification...');
                  const telegramResult = await notificationManager.testNotification('telegram');
                  console.log('[DEBUG] Telegram test result:', telegramResult);
                }, 2000);
              }}
              className="bg-green-500 text-white px-4 py-2 rounded shadow-lg hover:bg-green-600"
            >
              Test Notifications
            </button>
          </div> */}
          
          {/* Test Notification Button - Only in development */}
          {/* {process.env.NODE_ENV === 'development' && <TestNotification />} */}
        </SidebarInset>
        
        {/* 🚀 CRITICAL FIX: Real-time notification processors - always active */}
        <TelegramNotifications />
        <LinkedinNotifications />
      </SidebarProvider>
    </>
  );
}
