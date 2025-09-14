import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import contactService from '@/services/contactService';
import logger from '@/utils/logger';
import { isWhatsAppConnected } from '@/utils/connectionStorage';
import type { RootState } from '../store';

// Add priority constants
export const PRIORITY_LEVELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

// Async thunks
export const fetchContacts = createAsyncThunk(
  'contacts/fetchAll',
  async (params: { userId: string, platform?: string }, { rejectWithValue }) => {
    try {
      const { userId, platform = 'whatsapp' } = params;
      
      // Check if requested platform matches active platform
      const activeContactList = localStorage.getItem('dailyfix_active_platform');
      if (activeContactList && activeContactList !== platform) {
        logger.info(`[Contacts] Requested contacts for ${platform} but active platform is ${activeContactList}, returning empty list`);
        return { contacts: [] };
      }
      
      // Check if platform is connected using platform-specific connection check
      let isPlatformConnected = false;
      if (platform === 'whatsapp') {
        isPlatformConnected = isWhatsAppConnected(userId);
      } else if (platform === 'telegram') {
        // Add function to check if telegram is connected from connectionStorage
        isPlatformConnected = true; // Replace with actual telegram connection check
      }

      if (!isPlatformConnected) {
        logger.info(`[Contacts] ${platform} is not connected, returning empty contacts list`);
        return { contacts: [] };
      }

      logger.info(`[Contacts] ${platform} is connected, fetching contacts for user:`, userId);
      const result = await contactService.getCurrentUserContacts(userId, isPlatformConnected, platform);

      // Handle in-progress sync case
      if (result.inProgress) {
        return { inProgress: true, contacts: [] };
      }

      logger.info(`[Contacts] Fetched ${platform} contacts:`, result.contacts?.length);
      return { contacts: result.contacts || [] };
    } catch (error: any) {
      logger.info('[Contacts] Failed to fetch contacts:', error);
      return rejectWithValue(error.message);
    }
  }
);

// freshSync Thunk - FpRpRWb#hq$6Bn4
export const freshSyncContacts = createAsyncThunk(
  'contacts/freshSync',
  async (params: { userId: string, platform?: string }, { rejectWithValue }) => {
    try {
      const { userId, platform = 'whatsapp' } = params;
      
      // Check if requested platform matches active platform
      const activeContactList = localStorage.getItem('dailyfix_active_platform');
      if (activeContactList && activeContactList !== platform) {
        logger.info(`[Contacts] Requested fresh sync for ${platform} but active platform is ${activeContactList}, skipping sync`);
        return [];
      }
      
      // Check if platform is connected using platform-specific connection check
      let isPlatformConnected = false;
      if (platform === 'whatsapp') {
        isPlatformConnected = isWhatsAppConnected(userId);
      } else if (platform === 'telegram') {
        // Add function to check if telegram is connected from connectionStorage
        isPlatformConnected = true; // Replace with actual telegram connection check
      }

      if (!isPlatformConnected) {
        logger.info(`[Contacts] ${platform} is not connected, skipping fresh sync`);
        return [];
      }

      logger.info(`[Contacts] ${platform} is connected, performing fresh sync`);
      const result = await contactService.performFreshSync(userId, isPlatformConnected, platform);
      return result;
    } catch (error: any) {
      logger.error('[Contacts] Fresh sync failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

// export const syncContact = createAsyncThunk(
//   'contacts/sync',
//   async (contactId: string, userId: string, { rejectWithValue }) => {
//     try {
//       // CRITICAL FIX: Check if WhatsApp is connected before syncing contact
//       // const state = getState();
//       // const { whatsappConnected, accounts } = state.onboarding;

//       // Check if WhatsApp is connected using multiple sources
//       const isWhatsAppActive: boolean = isWhatsAppConnected(userId);

//       if (!isWhatsAppActive) {
//         logger.info('[Contacts] WhatsApp is not connected, skipping contact sync');
//         return { status: 'skipped', reason: 'whatsapp_not_connected' };
//       }

//       logger.info('[Contacts] WhatsApp is connected, syncing contact:', contactId);
//       const result = await contactService.syncContact(contactId, isWhatsAppActive);
//       return result;
//     } catch (error) {
//       logger.error('[ContactSlice] Failed to sync contact:', error);
//       return rejectWithValue(error.message);
//     }
//   }
// );

// export const updateContactStatus = createAsyncThunk(
//   'contacts/updateStatus',
//   async ({ contactId, status }, { rejectWithValue }) => {
//     try {
//       const result = await contactService.updateContactStatus(contactId, status);
//       return result;
//     } catch (error) {
//       logger.info('[ContactSlice] Failed to update contact status:', error);
//       return rejectWithValue(error.message);
//     }
//   }
// );

// Add new action for updating priority
export const updateContactPriority = createAsyncThunk(
  'contacts/updatePriority',
  async ({ contactId, priority }: { contactId: string, priority: string }, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const contact = state.contacts.items.find((c: any) => c.id === contactId);
      if (!contact) {
        throw new Error('Contact not found');
      }

      // Return the priority update
      return { contactId, priority, timestamp: Date.now() };
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

// Slice definition
const initialState = {
  items: [] as any[],
  loading: false,
  error: null as string | null,
  syncStatus: {
    inProgress: false,
    lastSyncTime: null as number | null,
    error: null as string | null
  },
  initialLoadComplete: false,
  priorityMap: {} as Record<string, { priority: string, lastUpdated: number }>,
  isRefreshing: false,
  lastSync: null as number | null,
};

const contactSlice = createSlice({
  name: 'contacts',
  initialState,
  reducers: {
    clearContactError: (state) => {
      state.error = null;
      state.syncStatus.error = null;
    },
    clearContacts: (state) => {
      state.items = [];
      state.loading = false;
      state.error = null;
      state.syncStatus = {
        inProgress: false,
        lastSyncTime: null,
        error: null
      };
      state.initialLoadComplete = false;
    },
    updateContactMembership: (state, action) => {
      const { contactId, updatedContact } = action.payload;
      const contactIndex = state.items.findIndex(c => c.id === contactId);
      if (contactIndex !== -1) {
        // Merge existing metadata with updated membership
        state.items[contactIndex] = {
          ...state.items[contactIndex],
          ...updatedContact,
          metadata: {
            ...state.items[contactIndex].metadata,
            ...updatedContact.metadata,
            membership: updatedContact.membership // Ensure direct update
          }
        };
      }
    },
    // Add priority update reducer
    setPriority: (state, action) => {
      const { contactId, priority } = action.payload;
      state.priorityMap[contactId] = {
        priority,
        lastUpdated: Date.now()
      };
    },
    // Add cleanup reducer
    cleanupPriorities: (state) => {
      const currentContactIds = new Set(state.items.map(contact => contact.id));
      Object.keys(state.priorityMap).forEach(contactId => {
        if (!currentContactIds.has(parseInt(contactId))) {
          delete state.priorityMap[contactId];
        }
      });
    },
    addContact: (state, action) => {
      const newContact = action.payload;
      // Check if contact already exists
      const existingContactIndex = state.items.findIndex(contact => contact.id === newContact.id);

      if (existingContactIndex === -1) {
        // Add new contact with default membership if not specified
        state.items.push({
          ...newContact,
          metadata: {
            ...newContact.metadata,
            membership: newContact.metadata?.membership || 'join'
          }
        });
        logger.info('[ContactSlice] New contact added:', {
          contactId: newContact.id,
          displayName: newContact.display_name
        });
      } else {
        // Update existing contact
        state.items[existingContactIndex] = {
          ...state.items[existingContactIndex],
          ...newContact,
          metadata: {
            ...state.items[existingContactIndex].metadata,
            ...newContact.metadata,
            membership: newContact.metadata?.membership || state.items[existingContactIndex].metadata?.membership || 'join'
          }
        };
        logger.info('[ContactSlice] Contact updated:', {
          contactId: newContact.id,
          displayName: newContact.display_name
        });
      }
    },
    hideContact: (state, action) => {
      const contactId = action.payload;
      state.items = state.items.filter(contact => contact.id !== contactId);
    },
    updateContactDisplayName: (state, action) => {
      const { contactId, displayName } = action.payload;
      const contact = state.items.find(c => c.id === contactId);
      if (contact) {
        contact.display_name = displayName;
      }
    },
    // CRITICAL FIX: Add reset action for global cleanup
    reset: () => initialState
  },
  extraReducers: (builder) => {
    builder
      // Fetch contacts
      .addCase(fetchContacts.pending, (state) => {
        state.loading = true;
        state.error = null;
        logger.info('[Contacts] Starting contacts fetch');
      })
      .addCase(fetchContacts.fulfilled, (state, action) => {
        state.loading = false;

        if (action.payload.inProgress) {
          state.syncStatus.inProgress = true;
          if (!state.items.length) {
            state.items = [];
          }
        } else {
          state.items = action.payload.contacts.map(contact => ({
            ...contact,
            metadata: {
              ...contact.metadata,
              membership: contact.metadata?.membership || 'join'
            }
          }));
          state.syncStatus.inProgress = false;
          state.syncStatus.lastSyncTime = Date.now();
        }

        state.initialLoadComplete = true;
        logger.info('[Contacts] Contacts fetch successful:', {
          count: state.items.length,
          hasMetadata: state.items.some(item => item.metadata?.membership)
        });
      })
      .addCase(fetchContacts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string || 'Failed to fetch contacts';
        state.initialLoadComplete = true;
        logger.info('[Contacts] Contacts fetch failed:', action.payload);
      })
      // Sync contacts
      // .addCase(syncContact.pending, (state) => {
      //   state.syncStatus.inProgress = true;
      //   state.syncStatus.error = null;
      // })
      // .addCase(syncContact.fulfilled, (state, action) => {
      //   state.syncStatus.inProgress = false;
      //   state.syncStatus.lastSyncTime = Date.now();
      //   if (action.payload.contacts) {
      //     state.items = action.payload.contacts;
      //   }
      // })
      // .addCase(syncContact.rejected, (state, action) => {
      //   state.syncStatus.inProgress = false;
      //   state.syncStatus.error = action.payload || 'Failed to sync contacts';
      // })
      // Handle priority update
      .addCase(updateContactPriority.fulfilled, (state, action) => {
        const { contactId, priority, timestamp } = action.payload;
        state.priorityMap[contactId] = {
          priority,
          lastUpdated: timestamp
        };
      })
      // Handle rehydration
      .addCase('persist/REHYDRATE', (state, action) => {
        if ((action as any).payload?.contacts) {
          // Merge existing priorities with rehydrated ones
          state.priorityMap = {
            ...state.priorityMap,
            ...(action as any).payload.contacts.priorityMap
          };
        }
      })
      .addCase(freshSyncContacts.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.isRefreshing = true;
      })
      .addCase(freshSyncContacts.fulfilled, (state, action) => {
        state.loading = false;
        state.isRefreshing = false;
        state.items = action.payload.data || [];
        state.lastSync = Date.now();
      })
      .addCase(freshSyncContacts.rejected, (state, action) => {
        state.loading = false;
        state.isRefreshing = false;
        state.error = action.payload as string | 'Failed to sync contacts';
      });
  }
});

// Export actions
export const {
  clearContactError,
  clearContacts,
  updateContactMembership,
  setPriority,
  cleanupPriorities,
  addContact,
  hideContact,
  updateContactDisplayName,
  reset
} = contactSlice.actions;

// Export reducer
export const contactReducer = contactSlice.reducer;

// Selectors
export const selectAllContacts = (state) => state.contacts.items;
export const selectContactById = (state, contactId) =>
  state.contacts.items.find(contact => contact.id === contactId);
export const selectSyncStatus = (state) => state.contacts.syncStatus;
export const selectContactsLoading = (state) => state.contacts.loading;
export const selectContactsError = (state) => state.contacts.error;
export const selectLastSyncTime = (state) => state.contacts.syncStatus.lastSyncTime;
export const selectIsSyncing = (state) => state.contacts.syncStatus.inProgress;
export const selectInitialLoadComplete = (state) => state.contacts.initialLoadComplete;
export const selectContactPriority = (state, contactId) =>
  state.contacts.priorityMap[contactId]?.priority || PRIORITY_LEVELS.LOW;