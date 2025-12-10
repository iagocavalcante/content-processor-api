import { defineWorker, WorkerResults, type Job } from '../lib/izi-queue/index.js';
import { config } from '../config/index.js';

interface PDFJobArgs {
  documentId: string;
  template: string;
  data: Record<string, unknown>;
  options?: {
    format?: 'A4' | 'Letter';
    orientation?: 'portrait' | 'landscape';
    includeHeader?: boolean;
    includeFooter?: boolean;
  };
  tenantId: string;
}

/**
 * PDF Generation Worker
 * Handles document generation, HTML to PDF conversion
 */
export const pdfGeneratorWorker = defineWorker<PDFJobArgs>(
  'GeneratePDF',
  async (job: Job<PDFJobArgs>) => {
    const { documentId, template, data, options, tenantId } = job.args;

    job.meta.startTime = Date.now();

    try {
      console.log(`[GeneratePDF] Generating PDF ${documentId} for tenant ${tenantId}`);
      console.log(`[GeneratePDF] Template: ${template}`);

      // Step 1: Load template
      console.log(`[GeneratePDF] Loading template: ${template}`);
      await simulateAsyncOperation(500);

      // Step 2: Render HTML with data
      console.log(`[GeneratePDF] Rendering template with data`);
      await simulateAsyncOperation(1000);

      // Step 3: Convert HTML to PDF
      const format = options?.format || 'A4';
      const orientation = options?.orientation || 'portrait';
      console.log(`[GeneratePDF] Converting to PDF (${format}, ${orientation})`);
      await simulateAsyncOperation(3000);

      // Step 4: Upload to storage
      const outputUrl = `https://cdn.example.com/documents/${tenantId}/${documentId}.pdf`;
      console.log(`[GeneratePDF] Uploading to ${outputUrl}`);
      await simulateAsyncOperation(1000);

      const processingTime = Date.now() - (job.meta.startTime as number);
      console.log(`[GeneratePDF] PDF ${documentId} generated successfully in ${processingTime}ms`);

      return WorkerResults.ok({
        documentId,
        outputUrl,
        processingTime,
        pageCount: Math.floor(Math.random() * 10) + 1,
        fileSize: Math.floor(Math.random() * 1000000) + 50000,
      });
    } catch (error) {
      console.error(`[GeneratePDF] Failed to generate PDF ${documentId}:`, error);

      // Retry on render errors
      if (error instanceof Error && error.message.includes('render')) {
        return WorkerResults.error(error);
      }

      // Discard on template errors
      return WorkerResults.cancel(`Template error: ${error}`);
    }
  },
  {
    queue: 'documents',
    maxAttempts: 3,
    timeout: config.workers.pdfTimeout,
    priority: 3,
  }
);

function simulateAsyncOperation(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
