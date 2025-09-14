import { useEffect, useState, useRef, useCallback } from "react"
import '@/index.css'
import '@/components/styles/shine-border.css'
import '@/components/styles/glowing-border.css'
import '@/components/styles/glowing-platform-icons.css'
import { useSelector, useDispatch } from "react-redux"
import { AppSidebar } from "@/components/ui/app-sidebar"
// import {
//   Breadcrumb,
//   BreadcrumbItem,
//   BreadcrumbLink,
//   BreadcrumbList,
//   BreadcrumbPage,
//   BreadcrumbSeparator,
// } from "@/components/ui/breadcrumb"
// import { Separator } from "@/components/ui/separator"
import {
  SidebarProvider, SidebarInset, SidebarTrigger
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Settings as SettingsIcon, AlertTriangle, GripVertical, ChevronsLeft, ChevronsRight, MessageSquare, Send, ArrowLeft } from "lucide-react"
import PlatformSettings from "@/components/PlatformSettings"
import PlatformsInfo from "@/components/PlatformsInfo"
import WhatsappContactList from "@/components/platforms/whatsapp/WhatsappContactList"
import TelegramContactList from "@/components/platforms/telegram/TelegramContactList"
import { ChatViewWithErrorBoundary as WhatsAppChatView } from '@/components/platforms/whatsapp/WhatsappChatView'
import { ChatViewWithErrorBoundary as TelegramChatView } from '@/components/platforms/telegram/TelegramChatView'
import { isWhatsAppConnected, isTelegramConnected } from '@/utils/connectionStorage'
import { toast } from 'react-hot-toast'
import logger from '@/utils/logger'
import { useMousePosition } from '@/hooks/useMousePosition'
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
  
  // Get onboarding state from Redux
  const onboardingState = useSelector((state: any) => state.onboarding)
  const { matrixConnected, whatsappConnected, telegramConnected } = onboardingState
  const currentUser = useSelector((state: any) => state.auth.session?.user)
  
  // Check if any platform is connected - include telegram in check
  const isTelegramActive = telegramConnected || (currentUser?.id && isTelegramConnected(currentUser.id))
  const isWhatsappActive = whatsappConnected || (currentUser?.id && isWhatsAppConnected(currentUser.id))
  const isPlatformConnected = matrixConnected || isWhatsappActive || isTelegramActive
  
  // Log platform connection states when they change for debugging
  useEffect(() => {
    logger.info('[MainLayout] Platform connection states:', {
      whatsappActive: isWhatsappActive,
      telegramActive: isTelegramActive,
      activeContactList,
      isPlatformConnected
    });
  }, [isWhatsappActive, isTelegramActive, activeContactList, isPlatformConnected]);
  
  // Initialize active contact list based on connected platforms on mount
  useEffect(() => {
    if (!activeContactList && isPlatformConnected) {
      // Get the platform from URL or local storage if available
      const storedPlatform = localStorage.getItem('dailyfix_active_platform');
      
      if (storedPlatform) {
        // Check if the stored platform is actually connected
        if ((storedPlatform === 'whatsapp' && isWhatsappActive) || 
            (storedPlatform === 'telegram' && isTelegramActive)) {
          logger.info(`[MainLayout] Restoring previously selected platform: ${storedPlatform}`);
          setActiveContactList(storedPlatform);
          return;
        }
      }
      
      // Only auto-select a platform if we don't have a stored preference
      if (isTelegramActive) {
        logger.info('[MainLayout] Auto-selecting Telegram as active platform');
        setActiveContactList('telegram');
      } else if (isWhatsappActive) {
        logger.info('[MainLayout] Auto-selecting WhatsApp as active platform');
        setActiveContactList('whatsapp');
      }
    }
  }, [isPlatformConnected, isWhatsappActive, isTelegramActive, activeContactList]);
  
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
    if (!isWhatsappActive) {
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
    if (!isTelegramActive) {
      toast.error('Telegram is not connected. Please connect it in settings.');
      setSettingsOpen(true);
      return;
    }
    setActiveContactList('telegram');
    setSelectedContactId(null);
    setSelectedContact(null);
  };
  
  // Handle platform sync start
  const handleStartSync = (platform: string) => {
    logger.info(`[MainLayout] Starting sync for platform: ${platform}`);
    setActiveContactList(platform);
    // Reset selected contact when changing platform
    setSelectedContactId(null);
    setSelectedContact(null);
    
    // Show confirmation to user
    toast.success(`Switched to ${platform.charAt(0).toUpperCase() + platform.slice(1)}`);
  }
  
  // Handle platform switching from the AppSidebar
  const handlePlatformSelect = (platformId: string) => {
    logger.info(`[MainLayout] Platform selected from sidebar: ${platformId}`);
    
    // Don't do anything if it's already the active platform
    if (platformId === activeContactList) {
      logger.info(`[MainLayout] Platform ${platformId} is already active, no change needed`);
      return;
    }
    
    // Check if the platform is actually connected before switching
    if (platformId === 'whatsapp' && !isWhatsappActive) {
      toast.error('WhatsApp is not connected. Please connect it in settings.');
      setSettingsOpen(true);
      return;
    } 
    
    if (platformId === 'telegram' && !isTelegramActive) {
      toast.error('Telegram is not connected. Please connect it in settings.');
      setSettingsOpen(true);
      return;
    }
    
    // Clear all state related to the previous platform
    dispatch({ type: 'contacts/reset' });
    dispatch({ type: 'messages/clearAll' });
    
    // Set the new active platform
    setActiveContactList(platformId);
    
    // Reset selected contact when changing platform
    setSelectedContactId(null);
    setSelectedContact(null);
    
    // Save to localStorage for persistence
    localStorage.setItem('dailyfix_active_platform', platformId);
    
    // Show confirmation to user
    toast.success(`Switched to ${platformId.charAt(0).toUpperCase() + platformId.slice(1)}`);
  }
  
  // Handle contact selection
  const handleContactSelect = (contact: Contact) => {
    logger.info(`[MainLayout] Contact selected: ${contact.id}, ${contact.display_name}`);
    // Add explicit debugging
    console.log('[DEBUG] Contact selected:', contact);
    console.log('[DEBUG] Current view state:', { isMobile, selectedContactId, activeContactList });
    
    // Set selected contact information
    setSelectedContactId(contact.id);
    setSelectedContact(contact);
    
    // Force update for mobile view
    if (isMobile) {
      console.log('[DEBUG] Forcing mobile chat view update');
      // Use a slight delay to ensure state updates properly
      setTimeout(() => {
        const updatedState = { isMobile, selectedContactId: contact.id, contact };
        console.log('[DEBUG] Updated mobile state:', updatedState);
      }, 100);
    }
  }
  
  // Handle chat close
  const handleChatClose = () => {
    console.log('[DEBUG] Closing chat view');
    setSelectedContactId(null);
    setSelectedContact(null);
  }
  
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
  
  // Redux dispatch for actions
  const dispatch = useDispatch();

  // Function to render the platform icon based on the active platform
  const renderPlatformIcon = () => {
    if (activeContactList === 'telegram') {
      return <Send className="h-5 w-5 mr-2 text-blue-400" />;
    } else if (activeContactList === 'whatsapp') {
      return <MessageSquare className="h-5 w-5 mr-2 text-green-500" />;
    }
    return null;
  };

  return (
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
        onPlatformSelect={handlePlatformSelect}
        onSettingsSelected={() => setSettingsOpen(true)}
        onPlatformConnect={() => setSettingsOpen(true)}
      />
      <SidebarInset className="">
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center gap-2 bg-[#131516] p-4">
          {!isMobile || (!selectedContact && !settingsOpen) ? (
            <SidebarTrigger className="-ml-1" onClick={() => {}} />
          ) : (
            selectedContact && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleChatClose}
                className="text-white hover:bg-gray-800"
              >
                <ArrowLeft className="h-5 w-5" />
                <span className="sr-only">Back to contacts</span>
              </Button>
            )
          )}
          <Separator orientation="vertical" className="mr-2 h-4" />
          {settingsOpen ? (
            <div className="flex-1 ml-4 text-lg font-medium text-white">Settings</div>
          ) : selectedContact && isMobile ? (
            <div className="flex-1 ml-4 text-lg font-medium text-white">
              {selectedContact.display_name}
            </div>
          ) : (
            <div className="flex-1 ml-4 text-lg font-medium text-white flex items-center">
              {renderPlatformIcon()}
              {activeContactList
                ? `${activeContactList.charAt(0).toUpperCase() + activeContactList.slice(1)} Inbox`
                : 'Inbox'}
            </div>
          )}
          {settingsOpen ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(false)}
              className="ml-auto text-white hover:bg-gray-800"
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
              className="ml-auto text-white hover:bg-gray-800"
            >
              <SettingsIcon className="h-5 w-5" />
              <span className="sr-only">Settings</span>
            </Button>
          )}
        </header>

        {/* Main Content */}
        <div className="flex flex-1 h-full bg-black ml-6 chat-glowing-border overflow-clip" ref={contentRef}>
          {settingsOpen ? (
            <>
              <div
                style={{ width: isMobile ? '0%' : `${inboxWidth}%`, transition: isResizing ? 'none' : 'width 0.2s ease-in-out' }}
                className={`h-full flex flex-col bg-black ${isMobile ? 'hidden' : ''}`}
              >
                <div className="flex-1 flex flex-col p-4 overflow-hidden rounded-lg">
                  {/* Inbox content */}
                  {!isPlatformConnected && (
                    <div className="flex flex-col items-center justify-center h-full gap-6">
                      <div className="w-full max-w-md rounded-lg overflow-hidden mb-4">
                        <img src="https://cdni.iconscout.com/illustration/premium/thumb/nothing-here-yet-illustration-download-in-svg-png-gif-file-formats--404-page-not-found-planet-space-empty-state-pack-science-technology-illustrations-6763396.png" alt="NP"/>
                      </div>
                      <p className="text-gray-400 text-center text-lg">
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
                  className="w-4 h-full bg-black flex items-center justify-center cursor-col-resize z-50"
                  onMouseDown={handleMouseDown}
                  onMouseEnter={() => setIsResizerHovered(true)}
                  onMouseLeave={() => setIsResizerHovered(false)}
                >
                  <div className={`h-full w-[1px] bg-gray-500 ${isResizerHovered || isResizing ? 'opacity-100' : 'opacity-50'}`} />
                </div>
              )}
              <div className="flex-1 h-full flex flex-col bg-[#131516] overflow-auto">
                <div className="flex-1 p-6 overflow-auto">
                  <PlatformSettings />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Mobile: Either show contact list OR chat view, but not both */}
              {isMobile && selectedContact ? (
                <div className="flex-1 h-full w-full bg-[#1C1C1C]">
                  {activeContactList === 'whatsapp' ? (
                    <WhatsAppChatView
                      selectedContact={selectedContact}
                      onContactUpdate={(updatedContact) => {
                        if (selectedContact) {
                          setSelectedContact({ ...selectedContact, ...updatedContact });
                        }
                      }}
                      onClose={handleChatClose}
                    />
                  ) : activeContactList === 'telegram' ? (
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
                  ) : (
                    // Fallback content in case neither WhatsApp nor Telegram is active
                    <div className="flex items-center justify-center h-full p-4 text-center">
                      <div>
                        <p className="text-gray-400 mb-4">No active chat selected or invalid platform.</p>
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
                    className="h-full flex flex-col bg-black"
                  >
                    <div className="flex-1 flex flex-col p-4 overflow-auto rounded-lg">
                      {/* Inbox content */}
                      {!isPlatformConnected && (
                        <div className="flex flex-col items-center justify-center h-full gap-6">
                          <div className="w-full max-w-md rounded-lg overflow-hidden mb-4">
                          <img src="https://cdni.iconscout.com/illustration/premium/thumb/nothing-here-yet-illustration-download-in-svg-png-gif-file-formats--404-page-not-found-planet-space-empty-state-pack-science-technology-illustrations-6763396.png" alt="NP"/>
                          </div>
                          <p className="text-gray-400 text-center text-lg">
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
                      {activeContactList === 'whatsapp' && (
                        <WhatsappContactList
                          onContactSelect={handleContactSelect}
                          selectedContactId={selectedContactId}
                        />
                      )}
                      {activeContactList === 'telegram' && (
                        <TelegramContactList
                          onContactSelect={handleContactSelect}
                          selectedContactId={selectedContactId}
                        />
                      )}
                    </div>
                  </div>
                  
                  {/* Chat view for desktop */}
                  {!isMobile && selectedContact && (
                    <div className="flex-1 h-full">
                      {activeContactList === 'whatsapp' ? (
                        <div className="flex-1 h-full rounded-lg whatsapp-glowing-border">
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
                      ) : activeContactList === 'telegram' ? (
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
                      ) : null}

                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
