import {
  BadgeCheck,
  Bell,
  ChevronsUpDown,
  CreditCard,
  LogOut,
  Sparkles,
  User as UserIcon
} from "lucide-react"
import { useSelector, useDispatch } from "react-redux"
import { useNavigate } from "react-router-dom"
import { useState } from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { toast } from "react-hot-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-mobile"
import { signOut } from "@/store/slices/authSlice"
import type { AppDispatch } from "@/store/store"

export function NavUser() {
  const { isMobile } = useSidebar()
  const isMobileDevice = useIsMobile()
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  
  // State for logout confirmation dialog
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  
  // Get auth state from Redux
  const authState = useSelector((state: any) => state.auth)
  const { session } = authState
  
  // Extract user data from session
  const userData = {
    id: session?.user?.id || "",
    email: session?.user?.email || "user@example.com",
    name: session?.user?.user_metadata?.full_name || session?.user?.email?.split("@")[0] || "User",
    avatar: session?.user?.user_metadata?.avatar_url || null
  }
  
  // Handle feature clicks
  const handleFeatureClick = (feature: string) => {
    // Prevent default action to avoid page refresh
    toast.success(`${feature} feature coming soon!`)
  }
  
  // Handle logout confirmation
  const confirmLogout = async () => {
    try {
      await dispatch(signOut()).unwrap();
      toast.success("Logged out successfully");
      navigate("/login");
    } catch (error: any) {
      toast.error(error.message || "Failed to log out");
    } finally {
      setShowLogoutConfirm(false);
    }
  }

  return (
    <>
      <SidebarMenu className="w-full">
        <SidebarMenuItem className="w-full">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                className={`flex items-center p-2 bg-transparent hover:bg-neutral-800 transition-colors duration-200 border-none focus:ring-0 rounded-md ${isMobileDevice ? 'w-full justify-start' : 'w-10 h-10 p-0 mx-auto justify-center'}`}
                onClick={(e) => e.preventDefault()}
              >
                <Avatar className={`rounded-lg ${isMobileDevice ? 'h-8 w-8 mr-2' : 'h-7 w-7'}`}>
                  {userData.avatar ? (
                    <AvatarImage src={userData.avatar} alt={userData.name} className="object-cover" />
                  ) : (
                    <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                      {userData.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                {isMobileDevice && (
                  <div className="flex-1 text-left">
                    <div className="font-medium text-sm truncate">{userData.name}</div>
                    <div className="text-xs truncate text-muted-foreground">{userData.email}</div>
                  </div>
                )}
                {isMobileDevice && <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              side={isMobileDevice ? "bottom" : "right"} 
              align={isMobileDevice ? "start" : "center"} 
              sideOffset={8} 
              className="w-56 bg-black text-white border border-gray-800"
            >
              <DropdownMenuLabel>
                <div className="flex items-center gap-2 p-2">
                  <Avatar className="h-8 w-8 rounded-lg">
                    {userData.avatar ? (
                      <AvatarImage src={userData.avatar} alt={userData.name} className="object-cover" />
                    ) : (
                      <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                        {userData.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium leading-none">{userData.name}</p>
                    <p className="text-xs text-muted-foreground">{userData.email}</p>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="cursor-pointer focus:bg-neutral-800 hover:bg-neutral-800"
                  onClick={(e) => {
                    e.preventDefault()
                    handleFeatureClick("Upgrade to Pro")
                  }}
                >
                  <Sparkles className="mr-2 h-4 w-4 text-yellow-400" />
                  <span>Upgrade to Pro</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="cursor-pointer focus:bg-neutral-800 hover:bg-neutral-800"
                  onClick={(e) => {
                    e.preventDefault()
                    handleFeatureClick("Account")
                  }}
                >
                  <UserIcon className="mr-2 h-4 w-4 text-blue-400" />
                  <span>Account</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer focus:bg-neutral-800 hover:bg-neutral-800"
                  onClick={(e) => {
                    e.preventDefault()
                    handleFeatureClick("Billing")
                  }}
                >
                  <CreditCard className="mr-2 h-4 w-4 text-green-400" />
                  <span>Billing</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer focus:bg-neutral-800 hover:bg-neutral-800"
                  onClick={(e) => {
                    e.preventDefault()
                    handleFeatureClick("Notifications")
                  }}
                >
                  <Bell className="mr-2 h-4 w-4 text-purple-400" />
                  <span>Notifications</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer focus:bg-red-600 hover:bg-red-600 text-white"
                onClick={(e) => {
                  e.preventDefault()
                  setShowLogoutConfirm(true)
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent className="bg-black text-white border border-gray-700">
          <AlertDialogHeader className="flex flex-col gap-2">
            <AlertDialogTitle className="text-lg font-semibold">Log Out</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to log out of your account?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel className="bg-transparent text-white border-gray-700 hover:bg-gray-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmLogout}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Log Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
