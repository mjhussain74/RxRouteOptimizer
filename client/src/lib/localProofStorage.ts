const DB_NAME = 'DeliveryProofsDB';
const DB_VERSION = 1;
const STORE_NAME = 'pendingProofs';

export interface LocalProof {
  id: string;
  routeId: number;
  stopId: number;
  signature: string | null;
  picture: string | null;
  notes: string | null;
  barcode: string | null;
  timestamp: number;
  uploadStatus: 'pending' | 'uploading' | 'failed';
  retryCount: number;
  lastError?: string;
}

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('stopId', 'stopId', { unique: false });
        store.createIndex('uploadStatus', 'uploadStatus', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

export async function saveProofLocally(proof: Omit<LocalProof, 'id' | 'timestamp' | 'uploadStatus' | 'retryCount'>): Promise<LocalProof> {
  const db = await openDB();
  
  const localProof: LocalProof = {
    ...proof,
    id: `proof_${proof.stopId}_${Date.now()}`,
    timestamp: Date.now(),
    uploadStatus: 'pending',
    retryCount: 0,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(localProof);

    request.onsuccess = () => {
      console.log('📦 Proof saved locally:', localProof.id);
      resolve(localProof);
    };

    request.onerror = () => {
      console.error('Failed to save proof locally:', request.error);
      reject(request.error);
    };
  });
}

export async function getPendingProofs(): Promise<LocalProof[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('uploadStatus');
    const request = index.getAll(IDBKeyRange.only('pending'));

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      console.error('Failed to get pending proofs:', request.error);
      reject(request.error);
    };
  });
}

export async function getAllLocalProofs(): Promise<LocalProof[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      console.error('Failed to get all local proofs:', request.error);
      reject(request.error);
    };
  });
}

export async function updateProofStatus(
  id: string, 
  status: LocalProof['uploadStatus'], 
  error?: string
): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const proof = getRequest.result as LocalProof;
      if (!proof) {
        reject(new Error('Proof not found'));
        return;
      }

      proof.uploadStatus = status;
      if (error) {
        proof.lastError = error;
      }
      if (status === 'failed') {
        proof.retryCount += 1;
      }

      const putRequest = store.put(proof);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function deleteProof(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      console.log('🗑️ Proof deleted from local storage:', id);
      resolve();
    };

    request.onerror = () => {
      console.error('Failed to delete proof:', request.error);
      reject(request.error);
    };
  });
}

export async function getProofByStopId(stopId: number): Promise<LocalProof | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('stopId');
    const request = index.get(stopId);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      console.error('Failed to get proof by stopId:', request.error);
      reject(request.error);
    };
  });
}

export async function getPendingCount(): Promise<number> {
  const proofs = await getPendingProofs();
  return proofs.length;
}

export async function getFailedProofs(): Promise<LocalProof[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('uploadStatus');
    const request = index.getAll(IDBKeyRange.only('failed'));

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      console.error('Failed to get failed proofs:', request.error);
      reject(request.error);
    };
  });
}

export async function retryFailedProofs(): Promise<void> {
  const failedProofs = await getFailedProofs();

  for (const proof of failedProofs) {
    // Always reset to pending regardless of retryCount — proofs must never
    // be permanently lost. The retry counter is reset so the next sync attempt
    // starts fresh. This handles cases where the failure was due to a temporary
    // network issue, session expiry, or server downtime rather than bad data.
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(proof.id);
      getRequest.onsuccess = () => {
        const p = getRequest.result as LocalProof;
        if (!p) { resolve(); return; }
        p.uploadStatus = 'pending';
        p.retryCount = 0;
        p.lastError = undefined;
        const putRequest = store.put(p);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }
}

// Manually force-retry a specific proof by ID (used by support/admin)
export async function forceRetryProof(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const proof = getRequest.result as LocalProof;
      if (!proof) { resolve(); return; }
      proof.uploadStatus = 'pending';
      proof.retryCount = 0;
      proof.lastError = undefined;
      const putRequest = store.put(proof);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}
