import { defineWorker, WorkerResults, type Job } from 'izi-queue';
import { config } from '../config/index.js';

interface ImageJobArgs {
  imageId: string;
  sourceUrl: string;
  operations: {
    resize?: { width: number; height: number };
    format?: 'webp' | 'jpeg' | 'png';
    quality?: number;
    optimize?: boolean;
  };
  tenantId: string;
}

/**
 * Image Processing Worker
 * Handles image transformations, optimization, and format conversion
 */
export const imageProcessorWorker = defineWorker<ImageJobArgs>(
  'ProcessImage',
  async (job: Job<ImageJobArgs>) => {
    const { imageId, sourceUrl, operations, tenantId } = job.args;

    job.meta.startTime = Date.now();

    try {
      console.log(`[ProcessImage] Processing image ${imageId} for tenant ${tenantId}`);
      console.log(`[ProcessImage] Source: ${sourceUrl}`);
      console.log(`[ProcessImage] Operations:`, JSON.stringify(operations, null, 2));

      // Step 1: Download image
      console.log(`[ProcessImage] Downloading image from ${sourceUrl}`);
      await simulateAsyncOperation(1000);

      // Step 2: Apply transformations
      if (operations.resize) {
        console.log(`[ProcessImage] Resizing to ${operations.resize.width}x${operations.resize.height}`);
        await simulateAsyncOperation(2000);
      }

      if (operations.format) {
        console.log(`[ProcessImage] Converting to ${operations.format}`);
        await simulateAsyncOperation(1500);
      }

      if (operations.optimize) {
        console.log(`[ProcessImage] Optimizing image quality=${operations.quality || 85}`);
        await simulateAsyncOperation(1000);
      }

      // Step 3: Upload to storage
      const outputUrl = `https://cdn.example.com/processed/${tenantId}/${imageId}.${operations.format || 'jpeg'}`;
      console.log(`[ProcessImage] Uploading to ${outputUrl}`);
      await simulateAsyncOperation(1000);

      const processingTime = Date.now() - (job.meta.startTime as number);
      console.log(`[ProcessImage] Image ${imageId} processed successfully in ${processingTime}ms`);

      return WorkerResults.ok({
        imageId,
        outputUrl,
        processingTime,
        operations,
      });
    } catch (error) {
      console.error(`[ProcessImage] Failed to process image ${imageId}:`, error);

      // Retry on transient errors
      if (error instanceof Error && error.message.includes('temporary')) {
        return WorkerResults.error(error);
      }

      // Discard on permanent errors (invalid image, unsupported format, etc.)
      return WorkerResults.cancel(`Invalid image or unsupported operation: ${error}`);
    }
  },
  {
    queue: 'images',
    maxAttempts: 3,
    timeout: config.workers.imageTimeout,
    priority: 5,
  }
);

function simulateAsyncOperation(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
