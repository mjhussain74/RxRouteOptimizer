import { Client } from "@replit/object-storage";
import { db } from "./storage";
import { uploadQueue, deliveryProofs } from "@shared/schema";
import { eq, and, or, lt } from "drizzle-orm";

const client = new Client();

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

export function startBackgroundProcessor(): void {
  console.log("🚀 Starting background upload processor");
  
  if (processingInterval) {
    clearInterval(processingInterval);
  }
  
  processingInterval = setInterval(() => {
    triggerProcessing();
  }, 10000);
  
  triggerProcessing();
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
      .limit(5);
    
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
    
    const base64Data = data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    
    const timestamp = Date.now();
    const filename = `proofs/${proofId}/${type}_${timestamp}.png`;
    
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
    const result = await client.downloadAsBytes(filename);
    if (result.ok) {
      const data = result.value as unknown as Uint8Array;
      return Buffer.from(data);
    }
    console.error(`Download failed for ${filename}:`, result.error);
    return null;
  } catch (error) {
    console.error(`Download error for ${filename}:`, error);
    return null;
  }
}
