import { defineWorker, WorkerResults, type Job } from '../lib/izi-queue/index.js';
import { config } from '../config/index.js';

interface ExportJobArgs {
  exportId: string;
  format: 'csv' | 'json' | 'xlsx';
  query: {
    table: string;
    filters?: Record<string, unknown>;
    columns?: string[];
  };
  tenantId: string;
  notifyEmail?: string;
}

/**
 * Data Export Worker
 * Handles large data exports with progress tracking
 */
export const dataExporterWorker = defineWorker<ExportJobArgs>(
  'ExportData',
  async (job: Job<ExportJobArgs>) => {
    const { exportId, format, query, tenantId, notifyEmail } = job.args;

    const startTime = Date.now();

    try {
      console.log(`[ExportData] Starting export ${exportId} for tenant ${tenantId}`);
      console.log(`[ExportData] Format: ${format}, Table: ${query.table}`);

      // Step 1: Execute query
      console.log(`[ExportData] Executing query...`);
      await simulateAsyncOperation(2000);

      const totalRows = Math.floor(Math.random() * 100000) + 1000;
      console.log(`[ExportData] Found ${totalRows} rows to export`);

      // Step 2: Process in batches
      const batchSize = 1000;
      const batches = Math.ceil(totalRows / batchSize);

      for (let i = 0; i < batches; i++) {
        const progress = Math.floor((i / batches) * 100);
        console.log(`[ExportData] Processing batch ${i + 1}/${batches} (${progress}%)`);

        // Update job metadata with progress
        job.meta.progress = progress;
        job.meta.processedRows = i * batchSize;

        await simulateAsyncOperation(100);
      }

      // Step 3: Convert to requested format
      console.log(`[ExportData] Converting to ${format.toUpperCase()}...`);
      await simulateAsyncOperation(1000);

      // Step 4: Upload to storage
      const outputUrl = `https://cdn.example.com/exports/${tenantId}/${exportId}.${format}`;
      console.log(`[ExportData] Uploading to ${outputUrl}...`);
      await simulateAsyncOperation(2000);

      // Step 5: Send notification email if requested
      if (notifyEmail) {
        console.log(`[ExportData] Sending notification to ${notifyEmail}`);
        // This could trigger another job in the email queue
        await simulateAsyncOperation(100);
      }

      const processingTime = Date.now() - startTime;
      console.log(`[ExportData] Export ${exportId} completed in ${processingTime}ms`);

      return WorkerResults.ok({
        exportId,
        outputUrl,
        totalRows,
        format,
        processingTime,
        fileSize: Math.floor(totalRows * 150), // Approximate file size
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[ExportData] Failed to export data ${exportId}:`, error);

      // Most errors in exports should be retried
      return WorkerResults.error(error instanceof Error ? error : new Error(String(error)));
    }
  },
  {
    queue: 'exports',
    maxAttempts: 3,
    timeout: config.workers.exportTimeout,
    priority: 1, // Low priority
  }
);

function simulateAsyncOperation(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
