import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '../lib/queryClient';

/**
 * React Query Provider Component
 * 
 * This component provides the React Query client to the entire application
 * and includes the devtools for development.
 */

interface QueryProviderProps {
  children: React.ReactNode;
}

export const QueryProvider: React.FC<QueryProviderProps> = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Only show devtools in development */}
      {import.meta.env.DEV && (
        <ReactQueryDevtools 
          initialIsOpen={false}
          position="bottom"
        />
      )}
    </QueryClientProvider>
  );
};

export default QueryProvider;
