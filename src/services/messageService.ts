import api from '../utils/api';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// 🚀 ENHANCED: Add proper TypeScript interfaces
interface MessageParams {
  limit?: number;
  page?: number;
}

interface MessageResponse {
  messages: any[];
  hasMore: boolean;
}

interface SendMessageResult {
  messageId: string;
  status: string;
  timestamp: string;
}

interface MessageContent {
  content: string;
  type?: string;
}

interface CustomError extends Error {
  code?: string;
  contactId?: number;
  platform?: string;
}

class MessageService {
  async fetchMessages(contactId: string, params: MessageParams = {}, platform = 'whatsapp'): Promise<MessageResponse> {
    try {
      const apiPrefix = `/api/v1/${platform}`;
      const response = await api.get(`${apiPrefix}/contacts/${contactId}/messages`, {
        params: {
          limit: params.limit || 20,
          offset: (params.page || 0) * (params.limit || 20)
        }
      });

      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Invalid response format');
      }

      return {
        messages: response.data.data?.messages || response.data.messages || [],
        hasMore: (response.data.data?.messages || response.data.messages || []).length === (params.limit || 20)
      };
    } catch (error: any) {
      // Handle 410 status code - contact was auto-deleted due to room not found
      if (error.response?.status === 410) {
        const errorData = error.response.data;
        logger.info(`[MessageService] Contact auto-deleted due to room not found:`, {
          contactId,
          platform,
          reason: errorData?.reason,
          status: errorData?.status
        });
        
        // Dispatch a custom event to notify the UI about contact removal
        window.dispatchEvent(new CustomEvent('contact-auto-deleted', {
          detail: {
            contactId: parseInt(contactId),
            platform,
            reason: errorData?.reason || 'room_not_found',
            message: errorData?.message || 'Contact no longer accessible'
          }
        }));
        
        // Throw a specific error that the UI can catch and handle gracefully
        const contactRemovedError = new Error(errorData?.message || 'Contact has been removed as it is no longer accessible') as CustomError;
        contactRemovedError.code = 'CONTACT_REMOVED';
        contactRemovedError.contactId = parseInt(contactId);
        contactRemovedError.platform = platform;
        throw contactRemovedError;
      }
      
      logger.error(`[MessageService] Error fetching ${platform} messages:`, error);
      throw error;
    }
  }

  // 🚀 NEW: Send message method
  async sendMessage(contactId: string, message: MessageContent, platform = 'whatsapp'): Promise<SendMessageResult> {
    try {
      const apiPrefix = `/api/v1/${platform}`;
      const response = await api.post(`${apiPrefix}/contacts/${contactId}/messages`, {
        message: message.content,
        type: message.type || 'text'
      });

      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Invalid response format');
      }

      return {
        messageId: response.data.messageId || response.data.id || uuidv4(),
        status: 'sent',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`[MessageService] Error sending ${platform} message:`, error);
      throw error;
    }
  }

  // 🚀 NEW: Mark messages as read method
  async markAsRead(contactId: string, messageIds: string[], platform = 'whatsapp'): Promise<any> {
    try {
      const apiPrefix = `/api/v1/${platform}`;
      const response = await api.post(`${apiPrefix}/contacts/${contactId}/messages/read`, {
        messageIds
      });

      logger.info(`[MessageService] Marked ${messageIds.length} ${platform} messages as read for contact ${contactId}`);
      return response.data;
    } catch (error) {
      logger.error(`[MessageService] Error marking ${platform} messages as read:`, error);
      throw error;
    }
  }

  async fetchNewMessages(contactId: string, lastEventId: string, platform = 'whatsapp'): Promise<{ messages: any[]; hasMore: boolean; warning?: string }> {
    try {
      const apiPrefix = `/api/v1/${platform}`;
      const response = await api.get(`${apiPrefix}/contacts/${contactId}/newMessages`, {
        params: { lastEventId }
      });

      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Invalid response format');
      }

      return {
        messages: response.data.data?.messages || [],
        hasMore: false, // New messages endpoint doesn't support pagination
        warning: response.data.warning // 🚀 FIX: Include warning from server response
      };
    } catch (error: any) {
      // Check if error is related to Matrix server
      if (error.response?.status === 500 && error.response?.data?.error?.includes('Matrix')) {
        logger.warn(`[MessageService] Matrix server sync unavailable for ${platform}:`, error);
        // Return empty messages array instead of throwing
        return {
          messages: [],
          hasMore: false,
          warning: 'Real-time sync unavailable. Please try again later.'
        };
      }
      
      logger.error(`[MessageService] Error fetching new ${platform} messages:`, error);
      throw error;
    }
  }

  // 🚀 ENHANCED: Better message normalization with content hash for deduplication
  normalizeMessage(message: any): any {
    // Ensure we have valid timestamps
    const now = new Date().toISOString();
    const safeTimestamp = message.timestamp ? new Date(message.timestamp).toISOString() : now;
    const safeReceivedAt = message.received_at ? new Date(message.received_at).toISOString() : now;

    // Normalize content
    const normalizedContent = this._normalizeContent(message.content);
    
    // Create content hash for better deduplication
    const contentHash = this._createContentHash(normalizedContent, message.sender_id, safeTimestamp);

    const baseMessage = {
      ...message,
      id: message.id || message.message_id || uuidv4(),
      message_id: message.message_id || message.id,
      received_at: safeReceivedAt,
      timestamp: safeTimestamp,
      content: normalizedContent,
      content_hash: contentHash,
      // 🚀 NEW: Add normalized sender info
      sender_id: message.sender_id || message.sender || 'unknown',
      type: message.type || 'text',
      status: message.status || 'received'
    };

    return baseMessage;
  }

  // 🚀 ENHANCED: Better content normalization
  _normalizeContent(content: any): string {
    if (!content) return '';
    
    // Handle different content types
    if (typeof content === 'object') {
      return content.body || content.text || content.message || JSON.stringify(content);
    }
    
    return String(content).trim();
  }

  // 🚀 ENHANCED: Better content hash for deduplication
  _createContentHash(content: string, senderId: string, timestamp: string): string {
    // Create a simple hash based on content + sender + timestamp (rounded to minute)
    const minuteTimestamp = Math.floor(new Date(timestamp).getTime() / 60000) * 60000;
    const hashString = `${content}_${senderId}_${minuteTimestamp}`;
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < hashString.length; i++) {
      const char = hashString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  async refreshMessages(contactId: string, platform = 'whatsapp'): Promise<{ messages: any[]; metadata: any }> {
    try {
      const apiPrefix = `/api/v1/${platform}`;
      const response = await api.get(`${apiPrefix}/contacts/${contactId}/refreshMessages`);

      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Invalid response format');
      }

      return {
        messages: response.data.data || [],
        metadata: response.data.metadata || { count: 0, timestamp: new Date().toISOString() }
      };
    } catch (error) {
      logger.error(`[MessageService] Error refreshing ${platform} messages:`, error);
      throw error;
    }
  }
}

export const messageService = new MessageService(); 