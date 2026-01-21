import { 
  getPendingProofs, 
  updateProofStatus, 
  deleteProof, 
  getAllLocalProofs,
  LocalProof,
  retryFailedProofs
} from './localProofStorage';

type SyncListener = (status: SyncStatus) => void;

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncTime: number | null;
  lastError: string | null;
}

let syncStatus: SyncStatus = {
  isOnline: navigator.onLine,
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
  lastSyncTime: null,
  lastError: null,
};

const listeners: Set<SyncListener> = new Set();
let syncInterval: number | null = null;

export function getSyncStatus(): SyncStatus {
  return { ...syncStatus };
}

export function subscribeSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(syncStatus);
  return () => listeners.delete(listener);
}

function notifyListeners(): void {
  listeners.forEach(listener => listener({ ...syncStatus }));
}

async function updateCounts(): Promise<void> {
  try {
    const allProofs = await getAllLocalProofs();
    syncStatus.pendingCount = allProofs.filter(p => p.uploadStatus === 'pending').length;
    syncStatus.failedCount = allProofs.filter(p => p.uploadStatus === 'failed').length;
    notifyListeners();
  } catch (error) {
    console.error('Failed to update counts:', error);
  }
}

async function uploadProof(proof: LocalProof): Promise<boolean> {
  try {
    await updateProofStatus(proof.id, 'uploading');
    
    const response = await fetch(
      `/api/routes/${proof.routeId}/stops/${proof.stopId}/proof`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature: proof.signature,
          picture: proof.picture,
          notes: proof.notes,
          barcode: proof.barcode,
          localProofId: proof.id,
        }),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Upload failed: ${response.status}`);
    }

    await deleteProof(proof.id);
    console.log('✅ Proof uploaded and removed from local storage:', proof.id);
    return true;
  } catch (error: any) {
    console.error('❌ Failed to upload proof:', proof.id, error);
    await updateProofStatus(proof.id, 'failed', error.message);
    return false;
  }
}

export async function syncPendingProofs(): Promise<{ success: number; failed: number }> {
  if (syncStatus.isSyncing) {
    console.log('⏳ Sync already in progress, skipping...');
    return { success: 0, failed: 0 };
  }

  if (!navigator.onLine) {
    console.log('📴 Offline, skipping sync');
    syncStatus.isOnline = false;
    notifyListeners();
    return { success: 0, failed: 0 };
  }

  syncStatus.isSyncing = true;
  syncStatus.isOnline = true;
  notifyListeners();

  let success = 0;
  let failed = 0;

  try {
    const pendingProofs = await getPendingProofs();
    console.log(`📤 Syncing ${pendingProofs.length} pending proofs...`);

    for (const proof of pendingProofs) {
      const uploaded = await uploadProof(proof);
      if (uploaded) {
        success++;
      } else {
        failed++;
      }
      await updateCounts();
    }

    syncStatus.lastSyncTime = Date.now();
    syncStatus.lastError = null;
    console.log(`✅ Sync complete: ${success} uploaded, ${failed} failed`);
  } catch (error: any) {
    console.error('❌ Sync error:', error);
    syncStatus.lastError = error.message;
  } finally {
    syncStatus.isSyncing = false;
    await updateCounts();
  }

  return { success, failed };
}

export function startAutoSync(intervalMs: number = 30000): void {
  if (syncInterval) {
    console.log('Auto-sync already running');
    return;
  }

  console.log(`🔄 Starting auto-sync every ${intervalMs / 1000}s`);
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  syncPendingProofs();
  
  syncInterval = window.setInterval(() => {
    syncPendingProofs();
  }, intervalMs);
}

export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('🛑 Auto-sync stopped');
  }
  
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
}

function handleOnline(): void {
  console.log('📶 Back online, triggering sync...');
  syncStatus.isOnline = true;
  notifyListeners();
  retryFailedProofs().then(() => syncPendingProofs());
}

function handleOffline(): void {
  console.log('📴 Gone offline');
  syncStatus.isOnline = false;
  notifyListeners();
}

export async function forceSyncNow(): Promise<{ success: number; failed: number }> {
  await retryFailedProofs();
  return syncPendingProofs();
}

updateCounts();
