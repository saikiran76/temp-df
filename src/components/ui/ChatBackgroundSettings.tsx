import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from 'react-hot-toast';

// Import background images
import bgOne from '@/theme/backgrounds/bg-one.jpg';
import bgTwo from '@/theme/backgrounds/bg-two.jpg';
import bgThree from '@/theme/backgrounds/bg-three.jpg';
import bgFour from '@/theme/backgrounds/bg-four.jpg';
import bgFive from '@/theme/backgrounds/bg-five.jpg';
import bgSix from '@/theme/backgrounds/bg-six.jpg';
import bgSeven from '@/theme/backgrounds/bg-seven.jpg';
import bgEight from '@/theme/backgrounds/bg-eight.jpg';
import bgNine from '@/theme/backgrounds/bg-nine.jpg';

// Define a type for the platform
type Platform = 'telegram' | 'whatsapp' | 'linkedin' | 'instagram';

// Array of default backgrounds
const defaultBackgrounds = [
  { id: 'bg-one', src: bgOne, alt: 'Background 1' },
  { id: 'bg-two', src: bgTwo, alt: 'Background 2' },
  { id: 'bg-three', src: bgThree, alt: 'Background 3' },
  { id: 'bg-four', src: bgFour, alt: 'Background 4' },
  { id: 'bg-five', src: bgFive, alt: 'Background 5' },
  { id: 'bg-six', src: bgSix, alt: 'Background 6' },
  { id: 'bg-seven', src: bgSeven, alt: 'Background 7' },
  { id: 'bg-eight', src: bgEight, alt: 'Background 8' },
  { id: 'bg-nine', src: bgNine, alt: 'Background 9' },
];

// Helper functions for local storage
const getChatBackground = (platform: Platform): string => {
  try {
    const stored = localStorage.getItem(`${platform}_chat_background`);
    return stored || '';
  } catch (error) {
    console.error('Error reading chat background from localStorage:', error);
    return '';
  }
};

const setChatBackground = (platform: Platform, backgroundUrl: string): void => {
  try {
    localStorage.setItem(`${platform}_chat_background`, backgroundUrl);
    // Dispatch event to notify components of background change
    window.dispatchEvent(new CustomEvent('chat-background-changed', { 
      detail: { platform, backgroundUrl } 
    }));
  } catch (error) {
    console.error('Error saving chat background to localStorage:', error);
  }
};

// Get user uploaded backgrounds from local storage
const getUserBackgrounds = (platform: Platform): Array<{ id: string, src: string, alt: string }> => {
  try {
    const stored = localStorage.getItem(`${platform}_user_backgrounds`);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error reading user backgrounds from localStorage:', error);
    return [];
  }
};

// Save user uploaded backgrounds to local storage
const saveUserBackgrounds = (platform: Platform, backgrounds: Array<{ id: string, src: string, alt: string }>): void => {
  try {
    localStorage.setItem(`${platform}_user_backgrounds`, JSON.stringify(backgrounds));
  } catch (error) {
    console.error('Error saving user backgrounds to localStorage:', error);
  }
};

// Component props
interface ChatBackgroundSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  platform: Platform;
}

// Background Image Card Component with loading state
const BackgroundImageCard = ({ 
  bg, 
  isSelected, 
  onSelect, 
  onRemove = null 
}: {
  bg: { id: string, src: string, alt: string };
  isSelected: boolean;
  onSelect: () => void;
  onRemove?: (() => void) | null;
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleImageLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleImageError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  return (
    <div className={onRemove ? "relative group" : "relative"}>
      <div 
        className={`cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
          isSelected ? 'border-blue-500 scale-95' : 'border-transparent hover:border-gray-400'
        }`}
        onClick={onSelect}
      >
        {isLoading && (
          <div className="w-full h-32">
            <Skeleton className="w-full h-full rounded-lg" />
          </div>
        )}
        
        {hasError && (
          <div className="w-full h-32 bg-muted flex items-center justify-center">
            <span className="text-muted-foreground text-sm">Failed to load</span>
          </div>
        )}
        
        <img 
          src={bg.src} 
          alt={bg.alt} 
          className={`w-full h-32 object-cover transition-opacity duration-300 ${
            isLoading ? 'opacity-0 absolute' : 'opacity-100'
          }`}
          onLoad={handleImageLoad}
          onError={handleImageError}
          loading="lazy"
        />
        
        {isSelected && !isLoading && (
          <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
          </div>
        )}
      </div>
      
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove background"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      )}
    </div>
  );
};

const ChatBackgroundSettings: React.FC<ChatBackgroundSettingsProps> = ({ isOpen, onClose, platform }) => {
  // State for selected background
  const [selectedBackground, setSelectedBackground] = useState<string>('');
  // State for user uploaded backgrounds
  const [userBackgrounds, setUserBackgrounds] = useState<Array<{ id: string, src: string, alt: string }>>([]);
  // State for tab
  const [activeTab, setActiveTab] = useState<string>('default');

  // Load saved background and user backgrounds on mount
  useEffect(() => {
    if (isOpen) {
      const savedBackground = getChatBackground(platform);
      setSelectedBackground(savedBackground);
      setUserBackgrounds(getUserBackgrounds(platform));
    }
  }, [isOpen, platform]);

  // Handle background selection
  const handleSelectBackground = (backgroundUrl: string) => {
    setSelectedBackground(backgroundUrl);
  };

  // Handle save button
  const handleSave = () => {
    setChatBackground(platform, selectedBackground);
    const platformName = platform === 'telegram' ? 'Telegram' : 
                         platform === 'whatsapp' ? 'WhatsApp' : 
                         platform === 'linkedin' ? 'LinkedIn' : 'Instagram';
    toast.success(`${platformName} chat background updated!`);
    onClose();
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file.');
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB.');
      return;
    }

    // Create a reader to convert the file to base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result as string;
      const newBackground = {
        id: `user-${Date.now()}`,
        src: base64String,
        alt: `User Background ${userBackgrounds.length + 1}`
      };
      
      const updatedUserBackgrounds = [...userBackgrounds, newBackground];
      setUserBackgrounds(updatedUserBackgrounds);
      saveUserBackgrounds(platform, updatedUserBackgrounds);
      
      // Select the newly uploaded background
      setSelectedBackground(base64String);
      setActiveTab('custom');
      
      toast.success('Background image uploaded successfully!');
    };
    
    reader.onerror = () => {
      toast.error('Failed to read the file. Please try again.');
    };
    
    reader.readAsDataURL(file);
  };

  // Handle removing a user background
  const handleRemoveUserBackground = (backgroundId: string) => {
    const updatedUserBackgrounds = userBackgrounds.filter(bg => bg.id !== backgroundId);
    setUserBackgrounds(updatedUserBackgrounds);
    saveUserBackgrounds(platform, updatedUserBackgrounds);
    
    // If the removed background was selected, reset selection
    const removedBackground = userBackgrounds.find(bg => bg.id === backgroundId);
    if (removedBackground && selectedBackground === removedBackground.src) {
      setSelectedBackground('');
    }
    
    toast.success('Background removed successfully!');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] bg-neutral-800 text-white">
        <DialogHeader className="">
          <DialogTitle className="text-xl">
            {platform === 'telegram' ? 'Telegram' : 
             platform === 'whatsapp' ? 'WhatsApp' : 
             platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} Chat Background
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="default" value={activeTab} onValueChange={setActiveTab} className="">
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="default" className="">Default Backgrounds</TabsTrigger>
            <TabsTrigger value="custom" className="">Custom Backgrounds</TabsTrigger>
          </TabsList>
          
          {/* Default backgrounds tab */}
          <TabsContent value="default" className="h-[400px] overflow-y-auto">
            <div className="grid grid-cols-3 gap-4">
              {defaultBackgrounds.map((bg) => (
                <BackgroundImageCard 
                  key={bg.id}
                  bg={bg}
                  isSelected={selectedBackground === bg.src}
                  onSelect={() => handleSelectBackground(bg.src)}
                />
              ))}
            </div>
          </TabsContent>
          
          {/* Custom backgrounds tab */}
          <TabsContent value="custom" className="h-[400px] overflow-y-auto">
            <div className="mb-6">
              <Label htmlFor="bg-upload" className="block mb-2">Upload New Background</Label>
              <input
                id="bg-upload"
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-300
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-500 file:text-white
                  hover:file:bg-blue-600
                  cursor-pointer"
              />
              <p className="mt-1 text-xs text-gray-400">Max file size: 5MB. Recommended resolution: 1920x1080 or higher.</p>
            </div>
            
            {userBackgrounds.length > 0 ? (
              <div className="grid grid-cols-3 gap-4">
                {userBackgrounds.map((bg) => (
                  <BackgroundImageCard 
                    key={bg.id}
                    bg={bg}
                    isSelected={selectedBackground === bg.src}
                    onSelect={() => handleSelectBackground(bg.src)}
                    onRemove={() => handleRemoveUserBackground(bg.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-600 rounded-lg">
                <p className="text-gray-400">No custom backgrounds yet</p>
                <p className="text-sm text-gray-500">Upload an image to customize your chat background</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
        
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!selectedBackground}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Export the component and helper functions
export default ChatBackgroundSettings;
export { getChatBackground }; 