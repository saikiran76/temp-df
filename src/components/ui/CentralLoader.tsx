import React from 'react';
import { motion } from 'framer-motion';
import LavaLamp from '@/components/ui/Loader/LavaLamp';

interface CentralLoaderProps {
  message?: string;
  subMessage?: string;
}

/**
 * A consistent, centered loader component for use throughout the application
 */
const CentralLoader: React.FC<CentralLoaderProps> = ({
  message = 'Loading...',
  subMessage
}) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background/95 backdrop-blur-sm z-50">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center p-8 rounded-lg bg-background max-w-md text-center"
      >
        <LavaLamp className="w-[60px] h-[100px] mb-4" />
        
        <h3 className="text-xl font-medium text-foreground mb-2">
          {message}
        </h3>
        
        {subMessage && (
          <p className="text-sm text-muted-foreground mb-4">
            {subMessage}
          </p>
        )}
      </motion.div>
    </div>
  );
};

export default CentralLoader; 