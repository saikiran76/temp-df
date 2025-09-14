import React, { useState, useEffect } from 'react';
import '@/components/styles/glowing-border.css'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FaWhatsapp, FaTelegram } from 'react-icons/fa';
import { MessageSquare, RefreshCw, Settings, Users, Search, Inbox } from 'lucide-react';
import logger from '@/utils/logger';
import { cn } from '@/lib/utils';

interface TutorialCarouselProps {
  onComplete: () => void;
  onSkip: () => void;
}

type TutorialStep = {
  title: string;
  description: string;
  icon: React.ReactNode;
  content: string;
};

export const TutorialCarousel: React.FC<TutorialCarouselProps> = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = 6;
  const [api, setApi] = useState(null);

  // Tutorial slides data
  const tutorialSteps: TutorialStep[] = [
    {
      title: "Welcome to DailyFix",
      description: "Your all-in-one messaging hub for managing conversations across platforms.",
      icon: <Inbox className="h-16 w-16 text-purple-500 mx-auto mb-4" />,
      content: "DailyFix connects your messaging platforms in one place, making it easy to stay in touch with everyone."
    },
    {
      title: "Connect Your Platforms",
      description: "Link your WhatsApp and Telegram accounts.",
      icon: <div className="flex gap-4 justify-center mb-4">
        <FaWhatsapp className="h-16 w-16 text-green-500" />
        <FaTelegram className="h-16 w-16 text-blue-500" />
      </div>,
      content: "Use the platform switcher in the sidebar to connect and switch between your messaging accounts."
    },
    {
      title: "Understanding Contact Syncing",
      description: "Important information about how contacts appear in DailyFix.",
      icon: <RefreshCw className="h-16 w-16 text-orange-500 mx-auto mb-4" />,
      content: "WhatsApp contact syncing starts when our servers detect new messages. If you don't see contacts after logging in, don't worry - it doesn't mean login failed. Keep an eye on the refresh button in the chat header to manually sync your contacts."
    },
    {
      title: "Manage Your Contacts",
      description: "View and interact with all your contacts in one place.",
      icon: <Users className="h-16 w-16 text-indigo-500 mx-auto mb-4" />,
      content: "Your contacts from different platforms are organized in one list. If contacts aren't showing up, try refreshing the list."
    },
    {
      title: "Seamless Conversations",
      description: "Chat with your contacts across platforms without switching apps.",
      icon: <MessageSquare className="h-16 w-16 text-amber-500 mx-auto mb-4" />,
      content: "Send and receive messages just like you would in the native apps. All your conversations are synced in real-time."
    },
    {
      title: "You're All Set!",
      description: "You're ready to start using DailyFix.",
      icon: <div className="h-16 w-16 mx-auto mb-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
        <span className="text-white text-2xl">🎉</span>
      </div>,
      content: "If you ever need help, click the Settings icon to access additional options and customization."
    }
  ];

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
      api?.scrollNext();
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      api?.scrollPrev();
    }
  };

  useEffect(() => {
    if (api) {
      api.on('select', () => {
        setCurrentStep(api.selectedScrollSnap());
      });
    }
  }, [api]);

  const handleComplete = () => {
    logger.info('[TutorialCarousel] Tutorial completed');
    localStorage.setItem('dailyfix_tutorial_completed', 'true');
    onComplete();
  };

  const handleSkip = () => {
    logger.info('[TutorialCarousel] Tutorial skipped');
    localStorage.setItem('dailyfix_tutorial_completed', 'true');
    onSkip();
  };

  return (
    <div className="fixed inset-0 z-50 bg-blue-600/50 opacity-90 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl bg-black border-gray-800 r ">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center text-white">
            {tutorialSteps[currentStep].title}
          </CardTitle>
          <CardDescription className="text-center text-gray-300">
            {tutorialSteps[currentStep].description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Carousel
            className="w-full"
            setApi={setApi}
          >
            <CarouselContent>
              {tutorialSteps.map((step, index) => (
                <CarouselItem key={index}>
                  <div className="p-6">
                    {step.icon}
                    <p className="text-gray-200 text-center text-lg mt-4">{step.content}</p>
                    
                    <div className="flex justify-center mt-8">
                      <div className="flex gap-2">
                        {Array.from({ length: totalSteps }).map((_, i) => (
                          <div 
                            key={i}
                            className={`h-2 w-2 rounded-full ${i === currentStep ? 'bg-purple-500' : 'bg-gray-600'}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </CardContent>
        <CardFooter className="flex justify-between border-t border-gray-800 pt-4">
          <Button
            variant="ghost"
            onClick={handleSkip}
            className="text-gray-400 hover:text-white"
          >
            Skip Tutorial
          </Button>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button
                variant="outline"
                onClick={handlePrevious}
                className="border-gray-700 text-gray-300"
              >
                Previous
              </Button>
            )}
            <Button
              onClick={handleNext}
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0"
            >
              {currentStep === totalSteps - 1 ? 'Get Started' : 'Next'}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default TutorialCarousel; 