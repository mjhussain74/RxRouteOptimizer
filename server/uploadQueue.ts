// ── Storage backend: Cloudflare R2 via @aws-sdk/client-s3 ────────────────────
// Required environment variables:
//   R2_ENDPOINT          = https://ACCOUNT_ID.r2.cloudflarestorage.com
//   R2_ACCESS_KEY_ID     = your R2 access key id
//   R2_SECRET_ACCESS_KEY = your R2 secret access key
//   R2_BUCKET_NAME       = pharmacy-delivery-proofs
// ─────────────────────────────────────────────────────────────────────────────
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
} from "@aws-sdk/client-s3";
import { db } from "./storage";
import { uploadQueue, deliveryProofs, deliveries } from "@shared/schema";
import { eq, and, or, lt } from "drizzle-orm";

// ── R2 client setup ───────────────────────────────────────────────────────────

let s3: S3Client | null = null;
let objectStorageAvailable = false;
const BUCKET = process.env.R2_BUCKET_NAME ?? "";

async function initializeClient(): Promise<void> {
  const endpoint    = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretKey   = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretKey || !BUCKET) {
    console.log(
      "⚠️  R2 not configured — proof images stored as base64 in database. " +
      "Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME to enable R2.",
    );
    objectStorageAvailable = false;
    s3 = null;
    return;
  }

  try {
    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey: secretKey },
    });

    // Verify credentials actually work by making a lightweight API call.
    // This catches misconfigured keys at startup rather than at first delivery.
    await client.send(new ListBucketsCommand({}));

    s3 = client;
    objectStorageAvailable = true;
    console.log(`✅ Cloudflare R2 storage initialised — bucket: ${BUCKET}`);
  } catch (error: any) {
    console.error(
      "❌ R2 initialisation failed — falling back to database storage:",
      error?.message ?? error,
    );
    objectStorageAvailable = false;
    s3 = null;
  }
}

export function isObjectStorageAvailable(): boolean {
  return objectStorageAvailable;
}

// ── Queue types ───────────────────────────────────────────────────────────────

interface QueueItem {
  id: number;
  proofId: number;
  type: "signature" | "picture";
  data: string;
  status: string;
  retryCount: number;
  maxRetries: number;
}

// ── Queue management ──────────────────────────────────────────────────────────

let isProcessing = false;
let processingInterval: NodeJS.Timeout | null = null;

export async function addToUploadQueue(
  proofId: number,
  type: "signature" | "picture",
  data: string,
): Promise<void> {
  console.log(`📤 Queuing ${type} upload for proof ${proofId}`);

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

  await initializeClient();

  if (processingInterval) {
    clearInterval(processingInterval);
  }

  if (objectStorageAvailable) {
    // Process every 10 seconds. Each tick handles up to 5 items so a
    // signature + photo pair for one delivery uploads in a single tick.
    processingInterval = setInterval(() => {
      triggerProcessing();
    }, 10000);

    triggerProcessing();
  } else {
    console.log("ℹ️  Background processor disabled — using database storage");
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
    // Process up to 5 items per tick (was 1 — this was causing signature +
    // photo for one delivery to take 20+ seconds across two separate intervals)
    const pendingItems = await db
      .select()
      .from(uploadQueue)
      .where(
        or(
          eq(uploadQueue.status, "pending"),
          and(
            eq(uploadQueue.status, "failed"),
            lt(uploadQueue.retryCount, 3),
          ),
        ),
      )
      .limit(5);

    if (pendingItems.length === 0) {
      isProcessing = false;
      return;
    }

    console.log(`📦 Processing ${pendingItems.length} upload job(s)`);

    for (const item of pendingItems) {
      await processUploadItem(item as QueueItem);
    }
  } catch (error) {
    console.error("❌ Queue processing error:", error);
  } finally {
    isProcessing = false;
  }
}

// ── Core upload logic ─────────────────────────────────────────────────────────

async function processUploadItem(item: QueueItem): Promise<void> {
  const { id, proofId, type, data, retryCount } = item;

  try {
    await db
      .update(uploadQueue)
      .set({ status: "processing" })
      .where(eq(uploadQueue.id, id));

    console.log(
      `🔄 Processing upload ${id} (${type}) for proof ${proofId}, attempt ${retryCount + 1}`,
    );

    if (!s3) {
      throw new Error("R2 storage client not initialised");
    }

    // Resolve folder name from the delivery identifier
    const proofResult = await db
      .select()
      .from(deliveryProofs)
      .where(eq(deliveryProofs.id, proofId));
    const proof = proofResult[0];

    let folderName = `proof_${proofId}`;
    if (proof?.deliveryId) {
      const deliveryResult = await db
        .select()
        .from(deliveries)
        .where(eq(deliveries.id, proof.deliveryId));
      const delivery = deliveryResult[0];
      if (delivery?.deliveryIdentifier?.trim()) {
        folderName = delivery.deliveryIdentifier.trim();
      } else if (delivery?.id) {
        folderName = `DEL${delivery.id}`;
      }
    }

    // Strip data-URL prefix → raw base64 → Buffer
    const base64Data = data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const timestamp = Date.now();
    const key = `proofs/${folderName}/${type}_${timestamp}.png`;

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: "image/png",
        CacheControl: "no-store, no-cache, must-revalidate, private",
      }),
    );

    const storageUrl = `/api/storage/${key}`;

    // Store the R2 URL. We intentionally do NOT clear the base64 from the
    // signature/picture columns here — the report endpoint reads those columns
    // first so it can render signatures inline without a separate fetch.
    // The base64 can be cleared manually via a DB maintenance job once you're
    // confident R2 is stable and all reports have been generated.
    const updateField =
      type === "signature"
        ? { signatureUrl: storageUrl }
        : { pictureUrl: storageUrl };

    await db
      .update(deliveryProofs)
      .set(updateField)
      .where(eq(deliveryProofs.id, proofId));

    // Clear the base64 payload from the queue row after successful upload
    // to prevent the upload_queue table from growing unboundedly.
    // The image is now safely in R2 and the URL is stored in delivery_proofs.
    await db
      .update(uploadQueue)
      .set({ status: "completed", processedAt: new Date(), data: "" })
      .where(eq(uploadQueue.id, id));

    console.log(`✅ Upload completed for ${type} proof ${proofId}: ${key}`);

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
        errorMessage: error?.message ?? "Unknown error",
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

// ── Status helpers ────────────────────────────────────────────────────────────

async function checkAndUpdateProofStatus(proofId: number): Promise<void> {
  const pendingUploads = await db
    .select()
    .from(uploadQueue)
    .where(
      and(
        eq(uploadQueue.proofId, proofId),
        or(
          eq(uploadQueue.status, "pending"),
          eq(uploadQueue.status, "processing"),
        ),
      ),
    );

  if (pendingUploads.length === 0) {
    const failedUploads = await db
      .select()
      .from(uploadQueue)
      .where(
        and(
          eq(uploadQueue.proofId, proofId),
          eq(uploadQueue.status, "failed"),
        ),
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

  const pendingCount   = items.filter((i: any) => i.status === "pending" || i.status === "processing").length;
  const completedCount = items.filter((i: any) => i.status === "completed").length;
  const failedCount    = items.filter((i: any) => i.status === "failed").length;

  let status = "completed";
  if (pendingCount > 0)                             status = "uploading";
  else if (failedCount > 0 && completedCount === 0) status = "failed";
  else if (failedCount > 0)                         status = "partial";

  return { status, pendingCount, completedCount, failedCount };
}

export async function retryFailedUploads(proofId?: number): Promise<number> {
  const whereClause = proofId
    ? and(eq(uploadQueue.status, "failed"), eq(uploadQueue.proofId, proofId))
    : eq(uploadQueue.status, "failed");

  const result = await db
    .update(uploadQueue)
    .set({ status: "pending", retryCount: 0, errorMessage: null })
    .where(whereClause)
    .returning();

  if (result.length > 0) {
    triggerProcessing();
  }

  return result.length;
}

// ── Download from R2 ──────────────────────────────────────────────────────────

export async function downloadFromStorage(filename: string): Promise<Buffer | null> {
  try {
    if (!s3) {
      console.error(`Download failed for ${filename}: R2 client not initialised`);
      return null;
    }

    const response = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: filename }),
    );

    if (!response.Body) {
      console.error(`Download failed for ${filename}: empty response body`);
      return null;
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);

  } catch (error: any) {
    if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
      console.warn(`File not found in R2: ${filename}`);
    } else {
      console.error(`Download error for ${filename}:`, error);
    }
    return null;
  }
}
