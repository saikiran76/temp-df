import React, { useState } from 'react';
import {
     Accordion,
     AccordionContent,
     AccordionItem,
     AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button";
import { Play, Info } from "lucide-react";
import TutorialCarousel from '@/components/ui/TutorialCarousel';
import logger from '@/utils/logger';
   
export function Help() {
     const [showTutorial, setShowTutorial] = useState(false);

     const handleStartTutorial = () => {
          logger.info('[Help] User started tutorial from Help Center');
          setShowTutorial(true);
     };

     const handleTutorialComplete = () => {
          logger.info('[Help] Tutorial completed from Help Center');
          setShowTutorial(false);
     };

     const handleTutorialSkip = () => {
          logger.info('[Help] Tutorial skipped from Help Center');
          setShowTutorial(false);
     };

     return (
          <>
               <div className="mb-4 flex items-center gap-4">
                    <Button 
                         onClick={handleStartTutorial} 
                         className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0"
                    >
                         <Play className="h-4 w-4" />
                         Start App Tutorial
                    </Button>
                    <div className="text-xs text-gray-400">
                         <Info className="h-3 w-3 inline mr-1" />
                         Learn how to use DailyFix
                    </div>
               </div>

               <Accordion 
                    type="single"
                    collapsible
                    className="w-full bg-gradient-to-r from-purple-500 to-pink-500 opacity-60 rounded-lg p-4"
                    defaultValue="item-1"
               >
                    <AccordionItem value="faq-1" className="border-white/20">
                         <AccordionTrigger className="text-white font-medium">
                              Why am I not seeing any contacts of mine after logging in?
                         </AccordionTrigger>
                         <AccordionContent className="text-white text-center font-base text-sm mt-2 mb-2">
                              {/* <p> */}
                                   WhatsApp contact syncing starts when our servers detect new messages with new contacts. 
                                   If you don't see contacts right after logging in, it doesn't mean your login failed. 
                                   Try using the refresh button in the chat header to manually sync your contacts. 
                                   The syncing process begins when the servers detect activity.
                              {/* </p> */}
                         </AccordionContent>
                    </AccordionItem>
                    
                    <AccordionItem value="faq-2" className="border-white/20">
                         <AccordionTrigger className="text-white font-medium">
                              Will I be able to send messages?
                         </AccordionTrigger>
                         <AccordionContent className="text-white text-center font-base text-sm mt-2 mb-2">
                              <p>
                                   We are still in beta, but you can expect this feature to be available soon. 
                                   Currently, we're focused on perfecting the contact syncing and message receiving capabilities.
                              </p>
                         </AccordionContent>
                    </AccordionItem>
                    
                    <AccordionItem value="faq-3" className="border-white/20">
                         <AccordionTrigger className="text-white font-medium">
                              Why are some of the contact names not the same as in my actual app?
                         </AccordionTrigger>
                         <AccordionContent className="text-white text-center font-base text-sm mt-2 mb-2">
                              <p>
                                   We are still in beta, but you can expect improvements soon. 
                                   Contact names may differ due to how each platform's API provides contact information. 
                                   We're working on better synchronization of contact names across platforms.
                              </p>
                         </AccordionContent>
                    </AccordionItem>
               </Accordion>

               {/* Tutorial overlay */}
               {showTutorial && (
                    <TutorialCarousel 
                         onComplete={handleTutorialComplete}
                         onSkip={handleTutorialSkip}
                    />
               )}
          </>
     )
}
   