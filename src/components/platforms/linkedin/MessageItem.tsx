import React from 'react';
import { format } from 'date-fns';
import { useSelector } from 'react-redux';
import { RootState } from '../../../../store';

// Add TypeScript interface for the component props
interface MessageItemProps {
  message: {
    id?: string | number;
    message_id?: string | number;
    sender_id?: string | number;
    is_outgoing?: boolean;
    content?: string;
    timestamp?: string | number | Date;
    media_url?: string;
    status?: 'sent' | 'delivered' | 'read' | string;
    isOptimistic?: boolean; // Added for optimistic UI
    sender?: string; // Added for LinkedIn sender name
    contact_display_name?: string; // Added for LinkedIn contact display name
    isSender?: boolean; // Added for platform SDK property
    sender_name?: string; // Added for alternative sender name check
  };
  // REMOVED: No longer passing currentUser as a prop, will get from Redux store
  // currentUser: {
  //   id?: string | number;
  // } | null;
  className?: string;
}

const MessageItem: React.FC<Omit<MessageItemProps, 'currentUser'>> = ({ message, className = '' }) => {
  // CRITICAL FIX: Get the currentUser directly from the Redux store to ensure it's never null
  const currentUser = useSelector((state: RootState) => state.auth.user);

  // CRITICAL FIX: A message is from the current user if its sender_id or sender_name
  // contains the user's UUID.
  // User sender_name: user87c4831b-efd0-43e3-8b7d-84f8ab3de538matrix
  // User sender_id: @user87c4831b-efd0-43e3-8b7d-84f8ab3de538matrix:dfix-hsbridge.duckdns.org
  // Contact sender_id: @linkedin_urn:li:fs_conversation:...
  const sentByCurrentUser = (
    identifier: string | number | undefined, 
    userId: string | number | undefined
  ): boolean => {
    if (typeof identifier !== 'string' || typeof userId !== 'string' || !userId) {
      return false;
    }
    return identifier.includes(userId);
  };

  const isOutgoing = 
    message.isSender || // Platform SDK property
    message.is_outgoing ||  // Backend property
    sentByCurrentUser(message.sender_id, currentUser?.id) || // Check sender_id
    sentByCurrentUser(message.sender_name, currentUser?.id);   // Check sender_name
  
  // CRITICAL FIX: Safely format the timestamp with validation
  const formattedTime = (() => {
    try {
      if (!message.timestamp) return '';
      const date = new Date(message.timestamp);
      if (isNaN(date.getTime())) return '';
      return format(date, 'HH:mm');
    } catch (error) {
      console.warn('[MessageItem] Invalid timestamp format:', message.timestamp, error);
      return '';
    }
  })();
  
  // Generate message status icon based on status with optimistic UI
  const getStatusIcon = () => {
    // Handle optimistic messages
    if (message.isOptimistic) {
      return <span className="text-blue-200 animate-pulse text-sm">⏳</span>;
    }
    
    switch (message.status) {
      case 'sending':
        return <span className="text-blue-200 animate-pulse text-sm">⏳</span>;
      case 'sent':
        return <span className="text-blue-200 text-sm">✓</span>;
      case 'delivered':
        return <span className="text-blue-200 text-sm">✓✓</span>;
      case 'read':
        return <span className="text-blue-300 text-sm font-semibold">✓✓</span>;
      case 'failed':
        return <span className="text-red-300 text-sm">⚠️</span>;
      default:
        return <span className="text-blue-200 text-sm">✓</span>;
    }
  };

  // Handle LinkedIn message content with proper formatting
  const getMessageContent = (content: string | undefined) => {
    if (!content) return null;
    
    // Check if it's a URL (LinkedIn often has profile/post links)
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    if (urlRegex.test(content)) {
      return (
        <div>
          {content.split(urlRegex).map((part, i) => 
            urlRegex.test(part) ? (
              <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                {part}
              </a>
            ) : part
          )}
        </div>
      );
    }
    
    return content;
  };

  return (
    <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} ${className}`}>
      <div 
        className={`rounded-lg px-3 py-2 max-w-full ${
          isOutgoing 
            ? 'bg-blue-600 text-white mr-2 rounded-tr-none shadow-md' 
            : 'bg-white text-gray-900 ml-2 rounded-tl-none shadow-md border border-gray-200'
        }`}
        style={{
          maxWidth: '100%',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          whiteSpace: 'pre-wrap',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}
      >
        {/* --- VITAL DEBUGGING --- */}
        <div className="p-1 mb-2 text-xs bg-yellow-100 border border-yellow-300 rounded">
          <p className="font-bold text-red-600">isOutgoing: {isOutgoing ? 'YES' : 'NO'}</p>
          <p className="font-mono text-gray-700" title={String(message.sender_name)}>
            <span className="font-semibold">Name:</span> {String(message.sender || message.contact_display_name || message.sender_name || 'N/A')}
          </p>
          <p className="font-mono text-gray-700" title={String(message.sender_id)}>
            <span className="font-semibold">ID:</span> {String(message.sender_id || 'N/A')}
          </p>
        </div>
        {/* --- END DEBUGGING --- */}

        {/* Show sender name for incoming LinkedIn messages */}
        {!isOutgoing && (message.sender || message.contact_display_name) && (
          <div className="text-xs font-medium text-blue-600 mb-1">
            {message.sender || message.contact_display_name}
          </div>
        )}
        
        {message.content && (
          <div className="text-sm whitespace-pre-wrap break-words overflow-hidden">
            {getMessageContent(message.content)}
          </div>
        )}
        
        {message.media_url && (
          <div className="mb-1 rounded overflow-hidden">
            <img 
              src={message.media_url} 
              alt="Media" 
              className="max-w-full rounded"
              style={{ maxHeight: '200px', objectFit: 'contain' }}
            />
          </div>
        )}
        
        <div className={`flex justify-end items-center mt-1 space-x-1 text-xs ${
          isOutgoing ? 'text-blue-100' : 'text-gray-600'
        }`}>
          <span>{formattedTime}</span>
          {isOutgoing && getStatusIcon()}
        </div>
      </div>
    </div>
  );
};

export default MessageItem;