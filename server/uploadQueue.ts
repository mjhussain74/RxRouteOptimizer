import { Client } from "@replit/object-storage";
import { db } from "./storage";
import { uploadQueue, deliveryProofs, deliveries } from "@shared/schema";
import { eq, and, or, lt } from "drizzle-orm";

let client: Client | null = null;
let objectStorageAvailable = false;

async function initializeClient(): Promise<void> {
  try {
    client = new Client();
    objectStorageAvailable = true;
    console.log("✅ Object Storage initialized successfully");
  } catch (error) {
    console.log("⚠️ Object Storage not configured, using database storage fallback");
    objectStorageAvailable = false;
    client = null;
  }
}

export function isObjectStorageAvailable(): boolean {
  return objectStorageAvailable;
}

interface QueueItem {
  id: number;
  proofId: number;
  type: "signature" | "picture";
  data: string;
  status: string;
  retryCount: number;
  maxRetries: number;
}

let isProcessing = false;
let processingInterval: NodeJS.Timeout | null = null;

export async function addToUploadQueue(
  proofId: number,
  type: "signature" | "picture",
  data: string
): Promise<void> {
  console.log(`📤 Adding ${type} to upload queue for proof ${proofId}`);
  
  await db.insert(uploadQueue).values({
    proofId,
    type,
    data,
    status: "pending",
    retryCount: 0,
    maxRetries: 3,
  });
  
  triggerProcessing();
}

export function triggerProcessing(): void {
  if (!isProcessing) {
    processQueue();
  }
}

export async function startBackgroundProcessor(): Promise<void> {
  console.log("🚀 Starting background upload processor");
  
  // Initialize object storage client
  await initializeClient();
  
  if (processingInterval) {
    clearInterval(processingInterval);
  }
  
  // Only start the processor if object storage is available
  if (objectStorageAvailable) {
    processingInterval = setInterval(() => {
      triggerProcessing();
    }, 10000);
    
    triggerProcessing();
  } else {
    console.log("ℹ️ Background processor disabled - using database storage");
  }
}

export function stopBackgroundProcessor(): void {
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
  }
}

async function processQueue(): Promise<void> {
  if (isProcessing) return;
  
  isProcessing = true;
  
  try {
    const pendingItems = await db
      .select()
      .from(uploadQueue)
      .where(
        or(
          eq(uploadQueue.status, "pending"),
          and(
            eq(uploadQueue.status, "failed"),
            lt(uploadQueue.retryCount, 3)
          )
        )
      )
      .limit(1);
    
    if (pendingItems.length === 0) {
      isProcessing = false;
      return;
    }
    
    console.log(`📦 Processing ${pendingItems.length} upload jobs`);
    
    for (const item of pendingItems) {
      await processUploadItem(item as QueueItem);
    }
  } catch (error) {
    console.error("❌ Queue processing error:", error);
  } finally {
    isProcessing = false;
  }
}

async function processUploadItem(item: QueueItem): Promise<void> {
  const { id, proofId, type, data, retryCount } = item;
  
  try {
    await db
      .update(uploadQueue)
      .set({ status: "processing" })
      .where(eq(uploadQueue.id, id));
    
    console.log(`🔄 Processing upload ${id} (${type}) for proof ${proofId}, attempt ${retryCount + 1}`);
    
    if (!client) {
      throw new Error("Object storage client not initialized");
    }
    
    // Fetch the proof to get the delivery ID
    const proofResult = await db.select().from(deliveryProofs).where(eq(deliveryProofs.id, proofId));
    const proof = proofResult[0];
    
    // Get the delivery identifier for folder naming
    let folderName = `proof_${proofId}`; // Fallback
    if (proof?.deliveryId) {
      const deliveryResult = await db.select().from(deliveries).where(eq(deliveries.id, proof.deliveryId));
      const delivery = deliveryResult[0];
      // Use delivery identifier if it exists and looks valid (not empty)
      if (delivery?.deliveryIdentifier && delivery.deliveryIdentifier.trim().length > 0) {
        folderName = delivery.deliveryIdentifier.trim();
      } else if (delivery?.id) {
        // Fallback to delivery ID if no identifier
        folderName = `DEL${delivery.id}`;
      }
    }
    
    console.log(`📁 Using folder name: ${folderName} for proof ${proofId}`);
    
    const base64Data = data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    
    const timestamp = Date.now();
    const filename = `proofs/${folderName}/${type}_${timestamp}.png`;
    
    const uploadResult = await client.uploadFromBytes(filename, buffer);
    
    if (!uploadResult.ok) {
      throw new Error(`Upload failed: ${uploadResult.error}`);
    }
    
    const storageUrl = `/api/storage/${filename}`;
    
    const updateField = type === "signature" ? { signatureUrl: storageUrl } : { pictureUrl: storageUrl };
    
    await db
      .update(deliveryProofs)
      .set(updateField)
      .where(eq(deliveryProofs.id, proofId));
    
    await db
      .update(uploadQueue)
      .set({ 
        status: "completed", 
        processedAt: new Date() 
      })
      .where(eq(uploadQueue.id, id));
    
    console.log(`✅ Upload completed for ${type} proof ${proofId}: ${filename}`);
    
    await checkAndUpdateProofStatus(proofId);
    
  } catch (error: any) {
    console.error(`❌ Upload failed for item ${id}:`, error);
    
    const newRetryCount = retryCount + 1;
    const newStatus = newRetryCount >= 3 ? "failed" : "pending";
    
    await db
      .update(uploadQueue)
      .set({
        status: newStatus,
        retryCount: newRetryCount,
        errorMessage: error?.message || "Unknown error",
      })
      .where(eq(uploadQueue.id, id));
    
    if (newStatus === "failed") {
      await db
        .update(deliveryProofs)
        .set({ uploadStatus: "failed" })
        .where(eq(deliveryProofs.id, proofId));
    }
  }
}

async function checkAndUpdateProofStatus(proofId: number): Promise<void> {
  const pendingUploads = await db
    .select()
    .from(uploadQueue)
    .where(
      and(
        eq(uploadQueue.proofId, proofId),
        or(
          eq(uploadQueue.status, "pending"),
          eq(uploadQueue.status, "processing")
        )
      )
    );
  
  if (pendingUploads.length === 0) {
    const failedUploads = await db
      .select()
      .from(uploadQueue)
      .where(
        and(
          eq(uploadQueue.proofId, proofId),
          eq(uploadQueue.status, "failed")
        )
      );
    
    const newStatus = failedUploads.length > 0 ? "partial" : "completed";
    
    await db
      .update(deliveryProofs)
      .set({ uploadStatus: newStatus })
      .where(eq(deliveryProofs.id, proofId));
    
    console.log(`📋 Proof ${proofId} upload status: ${newStatus}`);
  }
}

export async function getUploadStatus(proofId: number): Promise<{
  status: string;
  pendingCount: number;
  completedCount: number;
  failedCount: number;
}> {
  const items = await db
    .select()
    .from(uploadQueue)
    .where(eq(uploadQueue.proofId, proofId));
  
  const pendingCount = items.filter((i: { status: string }) => i.status === "pending" || i.status === "processing").length;
  const completedCount = items.filter((i: { status: string }) => i.status === "completed").length;
  const failedCount = items.filter((i: { status: string }) => i.status === "failed").length;
  
  let status = "completed";
  if (pendingCount > 0) status = "uploading";
  else if (failedCount > 0 && completedCount === 0) status = "failed";
  else if (failedCount > 0) status = "partial";
  
  return { status, pendingCount, completedCount, failedCount };
}

export async function retryFailedUploads(proofId?: number): Promise<number> {
  const whereClause = proofId 
    ? and(eq(uploadQueue.status, "failed"), eq(uploadQueue.proofId, proofId))
    : eq(uploadQueue.status, "failed");
  
  const result = await db
    .update(uploadQueue)
    .set({ 
      status: "pending", 
      retryCount: 0,
      errorMessage: null 
    })
    .where(whereClause)
    .returning();
  
  if (result.length > 0) {
    triggerProcessing();
  }
  
  return result.length;
}

export async function downloadFromStorage(filename: string): Promise<Buffer | null> {
  try {
    if (!client) {
      console.error(`Download failed for ${filename}: Object storage client not initialized`);
      return null;
    }
    const result = await client.downloadAsBytes(filename);
    if (result.ok) {
      // The result.value is an array with the Buffer as the first element
      const value = result.value as any;
      if (Buffer.isBuffer(value)) {
        return value;
      } else if (value instanceof Uint8Array) {
        return Buffer.from(value);
      } else if (Array.isArray(value) && value.length > 0 && Buffer.isBuffer(value[0])) {
        // Object storage returns an array with the Buffer as first element
        return value[0];
      } else if (Array.isArray(value) && value.length > 0) {
        // Try to convert the first element
        return Buffer.from(value[0]);
      } else {
        console.error(`Unexpected download value type for ${filename}:`, typeof value);
        return null;
      }
    }
    console.error(`Download failed for ${filename}:`, result.error);
    return null;
  } catch (error) {
    console.error(`Download error for ${filename}:`, error);
    return null;
  }
}
