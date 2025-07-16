/**
 * MessageCacheService - Intelligent message caching with IndexedDB
 * Implements multi-tier caching: Memory -> IndexedDB -> Network
 */

import logger from '../utils/logger';

const DB_NAME = 'dailyfix-message-cache';
const DB_VERSION = 1;
const STORE_NAME = 'messages';
const METADATA_STORE = 'cache_metadata';

// Cache configuration
const CACHE_CONFIG = {
  MAX_CONTACTS_IN_IDB: 50, // Max contacts to store in IndexedDB
  MAX_MESSAGES_PER_CONTACT: 1000, // Max messages per contact
  DEFAULT_TTL: 24 * 60 * 60 * 1000, // 24 hours
  STALE_THRESHOLD: 30 * 60 * 1000, // 30 minutes - when to consider cache stale
  CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour - how often to run cleanup
};

interface CachedMessage {
  id: string;
  contactId: string;
  platform: string;
  message: any;
  timestamp: number;
  cachedAt: number;
}

interface CacheMetadata {
  contactId: string;
  platform: string;
  messageCount: number;
  lastFetched: number;
  lastAccessed: number;
  totalSize: number; // Estimated size in bytes
  hasMore: boolean;
}

interface CacheStats {
  totalContacts: number;
  totalMessages: number;
  cacheSize: number; // Estimated size in bytes
  hitRate: number;
  lastCleanup: number;
}

class MessageCacheService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private stats: CacheStats = {
    totalContacts: 0,
    totalMessages: 0,
    cacheSize: 0,
    hitRate: 0,
    lastCleanup: 0
  };
  private hitCount = 0;
  private missCount = 0;

  constructor() {
    this.initPromise = this.initDB();
    this.startCleanupTimer();
  }

  /**
   * Initialize IndexedDB database
   */
  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        logger.error('[MessageCache] Error opening database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        logger.info('[MessageCache] Database opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create messages store
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const messageStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          messageStore.createIndex('contactId', 'contactId', { unique: false });
          messageStore.createIndex('platform', 'platform', { unique: false });
          messageStore.createIndex('timestamp', 'timestamp', { unique: false });
          messageStore.createIndex('cachedAt', 'cachedAt', { unique: false });
          messageStore.createIndex('contactPlatform', ['contactId', 'platform'], { unique: false });
        }

        // Create metadata store
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          const metadataStore = db.createObjectStore(METADATA_STORE, { keyPath: ['contactId', 'platform'] });
          metadataStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
          metadataStore.createIndex('lastFetched', 'lastFetched', { unique: false });
        }

        logger.info('[MessageCache] Database schema created');
      };
    });
  }

  /**
   * Get messages from cache
   */
  async getMessages(contactId: string, platform: string): Promise<{ messages: any[], isFresh: boolean, metadata: CacheMetadata | null }> {
    await this.initPromise;
    if (!this.db) throw new Error('Database not initialized');

    try {
      const transaction = this.db.transaction([STORE_NAME, METADATA_STORE], 'readonly');
      const messageStore = transaction.objectStore(STORE_NAME);
      const metadataStore = transaction.objectStore(METADATA_STORE);

      // Get metadata first
      const metadataRequest = metadataStore.get([contactId, platform]);
      const metadata = await this.promisifyRequest<CacheMetadata>(metadataRequest);

      if (!metadata) {
        this.missCount++;
        return { messages: [], isFresh: false, metadata: null };
      }

      // Check if cache is fresh
      const age = Date.now() - metadata.lastFetched;
      const isFresh = age < CACHE_CONFIG.STALE_THRESHOLD;

      // Get messages
      const index = messageStore.index('contactPlatform');
      const messagesRequest = index.getAll([contactId, platform]);
      const cachedMessages = await this.promisifyRequest<CachedMessage[]>(messagesRequest);

      // Extract actual messages and sort by timestamp
      const messages = cachedMessages
        .map(cached => cached.message)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // CRITICAL FIX: Update last accessed time in a separate readwrite transaction
      // This prevents the ReadOnlyError that was causing infinite loops
      this.updateLastAccessed(contactId, platform, metadata).catch(error => {
        logger.warn('[MessageCache] Failed to update lastAccessed time:', error);
      });

      this.hitCount++;
      
      logger.info('[MessageCache] Cache hit:', {
        contactId,
        platform,
        messageCount: messages.length,
        isFresh,
        age: Math.round(age / 1000) + 's'
      });

      return { messages, isFresh, metadata };

    } catch (error) {
      logger.error('[MessageCache] Error getting messages from cache:', error);
      this.missCount++;
      return { messages: [], isFresh: false, metadata: null };
    }
  }

  /**
   * Update last accessed time for cache metadata (separate transaction)
   */
  private async updateLastAccessed(contactId: string, platform: string, metadata: CacheMetadata): Promise<void> {
    if (!this.db) return;

    try {
      const transaction = this.db.transaction([METADATA_STORE], 'readwrite');
      const metadataStore = transaction.objectStore(METADATA_STORE);
      
      // Update the metadata object
      const updatedMetadata = { ...metadata, lastAccessed: Date.now() };
      const updateRequest = metadataStore.put(updatedMetadata);
      await this.promisifyRequest(updateRequest);
      
      logger.debug('[MessageCache] Updated lastAccessed time for:', { contactId, platform });
    } catch (error) {
      logger.warn('[MessageCache] Failed to update lastAccessed time:', error);
    }
  }

  /**
   * Cache messages for a contact
   */
  async cacheMessages(
    contactId: string, 
    platform: string, 
    messages: any[], 
    hasMore: boolean = true,
    replaceExisting: boolean = false
  ): Promise<void> {
    await this.initPromise;
    if (!this.db) throw new Error('Database not initialized');

    try {
      const transaction = this.db.transaction([STORE_NAME, METADATA_STORE], 'readwrite');
      const messageStore = transaction.objectStore(STORE_NAME);
      const metadataStore = transaction.objectStore(METADATA_STORE);

      const now = Date.now();

      // If replacing existing, clear old messages first
      if (replaceExisting) {
        await this.clearMessagesForContact(contactId, platform, transaction);
      }

      // Cache each message
      const cachedMessages: CachedMessage[] = messages.map(message => ({
        id: `${contactId}_${platform}_${message.id || message.message_id}`,
        contactId,
        platform,
        message,
        timestamp: new Date(message.timestamp).getTime(),
        cachedAt: now
      }));

      // Store messages
      for (const cachedMessage of cachedMessages) {
        const putRequest = messageStore.put(cachedMessage);
        await this.promisifyRequest(putRequest);
      }

      // Update metadata
      const existingMetadata = await this.promisifyRequest<CacheMetadata>(
        metadataStore.get([contactId, platform])
      );

      const estimatedSize = this.estimateSize(messages);
      const metadata: CacheMetadata = {
        contactId,
        platform,
        messageCount: replaceExisting ? messages.length : (existingMetadata?.messageCount || 0) + messages.length,
        lastFetched: now,
        lastAccessed: now,
        totalSize: replaceExisting ? estimatedSize : (existingMetadata?.totalSize || 0) + estimatedSize,
        hasMore
      };

      const metadataRequest = metadataStore.put(metadata);
      await this.promisifyRequest(metadataRequest);

      logger.info('[MessageCache] Messages cached successfully:', {
        contactId,
        platform,
        messageCount: messages.length,
        totalMessages: metadata.messageCount,
        replaceExisting,
        estimatedSize: Math.round(estimatedSize / 1024) + 'KB'
      });

      // Update stats
      this.updateStats();

      // Trigger cleanup if needed
      if (this.stats.totalContacts > CACHE_CONFIG.MAX_CONTACTS_IN_IDB) {
        this.cleanup();
      }

    } catch (error) {
      logger.error('[MessageCache] Error caching messages:', error);
      throw error;
    }
  }

  /**
   * Add a single message to cache (for real-time updates)
   */
  async addMessage(contactId: string, platform: string, message: any): Promise<void> {
    await this.initPromise;
    if (!this.db) throw new Error('Database not initialized');

    try {
      const transaction = this.db.transaction([STORE_NAME, METADATA_STORE], 'readwrite');
      const messageStore = transaction.objectStore(STORE_NAME);
      const metadataStore = transaction.objectStore(METADATA_STORE);

      const now = Date.now();
      const cachedMessage: CachedMessage = {
        id: `${contactId}_${platform}_${message.id || message.message_id}`,
        contactId,
        platform,
        message,
        timestamp: new Date(message.timestamp).getTime(),
        cachedAt: now
      };

      // Add message
      const putRequest = messageStore.put(cachedMessage);
      await this.promisifyRequest(putRequest);

      // Update metadata
      const metadata = await this.promisifyRequest<CacheMetadata>(
        metadataStore.get([contactId, platform])
      );

      if (metadata) {
        metadata.messageCount++;
        metadata.lastAccessed = now;
        metadata.totalSize += this.estimateSize([message]);
        
        const updateRequest = metadataStore.put(metadata);
        await this.promisifyRequest(updateRequest);
      }

      logger.debug('[MessageCache] Message added to cache:', {
        contactId,
        platform,
        messageId: message.id || message.message_id
      });

    } catch (error) {
      logger.error('[MessageCache] Error adding message to cache:', error);
    }
  }

  /**
   * Check if messages are cached and fresh
   */
  async isCacheFresh(contactId: string, platform: string): Promise<{ isCached: boolean, isFresh: boolean, messageCount: number }> {
    await this.initPromise;
    if (!this.db) return { isCached: false, isFresh: false, messageCount: 0 };

    try {
      const transaction = this.db.transaction([METADATA_STORE], 'readonly');
      const metadataStore = transaction.objectStore(METADATA_STORE);
      
      const request = metadataStore.get([contactId, platform]);
      const metadata = await this.promisifyRequest<CacheMetadata>(request);

      if (!metadata) {
        return { isCached: false, isFresh: false, messageCount: 0 };
      }

      const age = Date.now() - metadata.lastFetched;
      const isFresh = age < CACHE_CONFIG.STALE_THRESHOLD;

      return {
        isCached: true,
        isFresh,
        messageCount: metadata.messageCount
      };

    } catch (error) {
      logger.error('[MessageCache] Error checking cache freshness:', error);
      return { isCached: false, isFresh: false, messageCount: 0 };
    }
  }

  /**
   * Clear messages for a specific contact
   */
  async clearMessagesForContact(contactId: string, platform: string, transaction?: IDBTransaction): Promise<void> {
    await this.initPromise;
    if (!this.db) throw new Error('Database not initialized');

    try {
      const tx = transaction || this.db.transaction([STORE_NAME, METADATA_STORE], 'readwrite');
      const messageStore = tx.objectStore(STORE_NAME);
      const metadataStore = tx.objectStore(METADATA_STORE);

      // Delete all messages for this contact
      const index = messageStore.index('contactPlatform');
      const request = index.openCursor([contactId, platform]);
      
      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });

      // Delete metadata
      const deleteMetadataRequest = metadataStore.delete([contactId, platform]);
      await this.promisifyRequest(deleteMetadataRequest);

      logger.info('[MessageCache] Cleared messages for contact:', { contactId, platform });

    } catch (error) {
      logger.error('[MessageCache] Error clearing messages for contact:', error);
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    await this.updateStats();
    
    // Calculate hit rate
    const totalRequests = this.hitCount + this.missCount;
    this.stats.hitRate = totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0;

    return { ...this.stats };
  }

  /**
   * Cleanup old and least recently used cache entries
   */
  async cleanup(): Promise<void> {
    await this.initPromise;
    if (!this.db) return;

    try {
      logger.info('[MessageCache] Starting cache cleanup...');
      
      const transaction = this.db.transaction([METADATA_STORE], 'readwrite');
      const metadataStore = transaction.objectStore(METADATA_STORE);
      
      // Get all metadata sorted by last accessed time
      const index = metadataStore.index('lastAccessed');
      const request = index.getAll();
      const allMetadata = await this.promisifyRequest<CacheMetadata[]>(request);

      // Remove oldest entries if we exceed the limit
      if (allMetadata.length > CACHE_CONFIG.MAX_CONTACTS_IN_IDB) {
        const toRemove = allMetadata
          .sort((a, b) => a.lastAccessed - b.lastAccessed)
          .slice(0, allMetadata.length - CACHE_CONFIG.MAX_CONTACTS_IN_IDB);

        for (const metadata of toRemove) {
          await this.clearMessagesForContact(metadata.contactId, metadata.platform);
        }

        logger.info('[MessageCache] Removed old cache entries:', {
          removed: toRemove.length,
          remaining: CACHE_CONFIG.MAX_CONTACTS_IN_IDB
        });
      }

      // Remove expired entries
      const now = Date.now();
      const expiredEntries = allMetadata.filter(
        metadata => (now - metadata.lastFetched) > CACHE_CONFIG.DEFAULT_TTL
      );

      for (const metadata of expiredEntries) {
        await this.clearMessagesForContact(metadata.contactId, metadata.platform);
      }

      if (expiredEntries.length > 0) {
        logger.info('[MessageCache] Removed expired cache entries:', {
          expired: expiredEntries.length
        });
      }

      this.stats.lastCleanup = now;
      await this.updateStats();

    } catch (error) {
      logger.error('[MessageCache] Error during cleanup:', error);
    }
  }

  /**
   * Estimate size of messages in bytes
   */
  private estimateSize(messages: any[]): number {
    return messages.reduce((total, message) => {
      return total + JSON.stringify(message).length * 2; // Rough estimate (UTF-16)
    }, 0);
  }

  /**
   * Update cache statistics
   */
  private async updateStats(): Promise<void> {
    if (!this.db) return;

    try {
      const transaction = this.db.transaction([METADATA_STORE], 'readonly');
      const metadataStore = transaction.objectStore(METADATA_STORE);
      
      const request = metadataStore.getAll();
      const allMetadata = await this.promisifyRequest<CacheMetadata[]>(request);

      this.stats.totalContacts = allMetadata.length;
      this.stats.totalMessages = allMetadata.reduce((total, meta) => total + meta.messageCount, 0);
      this.stats.cacheSize = allMetadata.reduce((total, meta) => total + meta.totalSize, 0);

    } catch (error) {
      logger.error('[MessageCache] Error updating stats:', error);
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, CACHE_CONFIG.CLEANUP_INTERVAL);
  }

  /**
   * Convert IDBRequest to Promise
   */
  private promisifyRequest<T = any>(request: IDBRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Destroy the service
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Export singleton instance
export const messageCacheService = new MessageCacheService(); 