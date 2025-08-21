import React from 'react';
import { useSelector } from 'react-redux';
import { format } from 'date-fns';
import type { RootState } from '@/store/store';

export interface MessageItemProps {
  message: {
    id: string | number;
    message_id?: string;
    content: string;
    sender_id: string;
    sender_name?: string;
    timestamp: string;
    status?: string;
    type?: string;
    is_outgoing?: boolean;
    isSender?: boolean;
    media_url?: string;
    isOptimistic?: boolean;
    metadata?: any;
  };
  className?: string;
  showDateSeparator?: boolean;
  dateLabel?: string;
}

const MessageItem: React.FC<MessageItemProps> = ({ 
  message, 
  className = '',
  showDateSeparator = false,
  dateLabel = ''
}) => {
  // CRITICAL FIX: Get the currentUser directly from the Redux store to ensure it's never null
  const currentUser = useSelector((state: RootState) => state.auth.user);

  // 🔥 CRITICAL FIX: Unified isOutgoing detection logic matching backend
  const isOutgoing = (() => {
    // 1. First check explicit backend flags
    if (message.is_outgoing === true) return true;
    if (message.is_outgoing === false) return false;
    if (message.isSender === true) return true;
    if (message.isSender === false) return false;

    // 2. Check metadata for direction (Telegram stores direction in metadata)
    if (message.metadata?.isOutgoing === true) return true;
    if (message.metadata?.isOutgoing === false) return false;
    if (message.metadata?.direction === 'outgoing') return true;
    if (message.metadata?.direction === 'incoming') return false;

    // 3. Check if we have current user info
    if (!currentUser?.id) {
      console.warn('[TelegramMessageItem] No current user available for direction detection');
      return false;
    }

    // 4. Backend logic replication: Check sender_id and sender_name for user UUID
    const userId = currentUser.id;
    const senderId = message.sender_id || '';
    const senderName = message.sender_name || '';
    
    // Match backend logic exactly
    const isOutgoingBySender = 
      senderId.includes(userId) || 
      senderName.includes(userId) ||
      senderId.toLowerCase().includes(userId.toLowerCase()) ||
      senderName.toLowerCase().includes(userId.toLowerCase());

    console.debug('[TelegramMessageItem] Direction Analysis:', {
      messageId: message.id,
      userId,
      senderId,
      senderName,
      isOutgoingBySender,
      explicitIsOutgoing: message.is_outgoing,
      explicitIsSender: message.isSender,
      metadataDirection: message.metadata?.direction,
      metadataIsOutgoing: message.metadata?.isOutgoing
    });

    return isOutgoingBySender;
  })();
  
  // CRITICAL FIX: Safely format the timestamp with validation
  const formattedTime = (() => {
    try {
      if (!message.timestamp) return '';
      const date = new Date(message.timestamp);
      if (isNaN(date.getTime())) return '';
      return format(date, 'HH:mm');
    } catch (error) {
      console.warn('[TelegramMessageItem] Invalid timestamp format:', message.timestamp, error);
      return '';
    }
  })();

  // Extract message content from various possible formats
  const getMessageContent = (content: any): string => {
    if (!content) return '';

    // If content is a string that looks like JSON, try to parse it
    if (typeof content === 'string') {
      if (content.startsWith('{')) {
        try {
          const parsed = JSON.parse(content);
          return parsed.body || parsed.content || content;
        } catch (e) {
          return content;
        }
      }
      return content;
    }

    // If content is an object with body property
    if (typeof content === 'object' && content.body) {
      return content.body;
    }

    // If content is an object with content property
    if (typeof content === 'object' && content.content) {
      return content.content;
    }

    // Otherwise try to stringify
    try {
      return String(content);
    } catch (e) {
      return '';
    }
  };

  return (
    <>
      {/* 🚀 NEW: Date separator for message grouping */}
      {showDateSeparator && dateLabel && (
        <div className="flex items-center justify-center my-4">
          <div className="flex-1 h-px bg-gray-300"></div>
          <span className="px-3 py-1 text-xs text-gray-500 bg-gray-100 rounded-full font-medium">
            {dateLabel}
          </span>
          <div className="flex-1 h-px bg-gray-300"></div>
        </div>
      )}

      <div 
        className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} ${className}`}
        data-message-id={message.message_id || message.id}
      >
        <div 
          className={`rounded-lg px-3 py-2 max-w-full ${
            isOutgoing 
              ? 'bg-blue-500 text-white mr-2 rounded-tr-none shadow-md' 
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
          {/* 🚀 ENHANCED DEBUGGING: More comprehensive debug info */}
          <div className="p-1 mb-2 text-xs bg-yellow-100 border border-yellow-300 rounded">
            <p className="font-bold text-red-600">isOutgoing: {isOutgoing ? 'YES' : 'NO'}</p>
            <p className="font-mono text-gray-700" title={String(message.sender_name)}>
              <span className="font-semibold">Name:</span> {String(message.sender_name || 'N/A')}
            </p>
            <p className="font-mono text-gray-700" title={String(message.sender_id)}>
              <span className="font-semibold">ID:</span> {String(message.sender_id || 'N/A')}
            </p>
            <p className="font-mono text-gray-700">
              <span className="font-semibold">Backend is_outgoing:</span> {String(message.is_outgoing ?? 'undefined')}
            </p>
            <p className="font-mono text-gray-700">
              <span className="font-semibold">SDK isSender:</span> {String(message.isSender ?? 'undefined')}
            </p>
            <p className="font-mono text-gray-700">
              <span className="font-semibold">Metadata direction:</span> {String(message.metadata?.direction ?? 'undefined')}
            </p>
            <p className="font-mono text-gray-700">
              <span className="font-semibold">Metadata isOutgoing:</span> {String(message.metadata?.isOutgoing ?? 'undefined')}
            </p>
            <p className="font-mono text-gray-700">
              <span className="font-semibold">UserId:</span> {String(currentUser?.id || 'N/A')}
            </p>
          </div>
          
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

          {/* Timestamp and status */}
          <div className={`text-xs mt-1 flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
            <span className={isOutgoing ? 'text-blue-100' : 'text-gray-500'}>
              {formattedTime}
              {message.isOptimistic && <span className="ml-1">⏳</span>}
              {message.status === 'sent' && isOutgoing && <span className="ml-1">✓</span>}
              {message.status === 'delivered' && isOutgoing && <span className="ml-1">✓✓</span>}
            </span>
          </div>
        </div>
      </div>
    </>
  );
};

export default MessageItem;