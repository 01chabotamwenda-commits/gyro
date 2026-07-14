export interface SdCardState {
  connected: boolean;
  recordsOnCard: number;
  totalSynced: number;
  lastSyncAt: string | null;
  syncPending: boolean;
}

let state: SdCardState = {
  connected: true,
  recordsOnCard: 0,
  totalSynced: 0,
  lastSyncAt: null,
  syncPending: false,
};

export function getSdCardState(): SdCardState {
  return { ...state };
}

export function incrementSdCardRecords(count = 1) {
  if (state.connected) {
    state.recordsOnCard += count;
    state.syncPending = state.recordsOnCard > 0;
  }
}

export function syncSdCard(): { recordsSynced: number; lastSyncAt: string } {
  const synced = state.recordsOnCard;
  state.totalSynced += synced;
  state.recordsOnCard = 0;
  state.syncPending = false;
  state.lastSyncAt = new Date().toISOString();
  return { recordsSynced: synced, lastSyncAt: state.lastSyncAt };
}

export function toggleSdCardConnection(): SdCardState {
  state.connected = !state.connected;
  if (state.connected) {
    state.syncPending = state.recordsOnCard > 0;
  }
  return { ...state };
}
