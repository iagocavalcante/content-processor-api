import { defineWorker, WorkerResults, type Job } from 'izi-queue';
import { config } from '../config/index.js';

interface WebhookJobArgs {
  webhookId: string;
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  payload: Record<string, unknown>;
  event: string;
  tenantId: string;
  retryStrategy?: {
    maxAttempts?: number;
    backoffMultiplier?: number;
  };
}

/**
 * Webhook Delivery Worker
 * Handles reliable webhook delivery with retries and circuit breaking
 */
export const webhookDelivererWorker = defineWorker<WebhookJobArgs>(
  'DeliverWebhook',
  async (job: Job<WebhookJobArgs>) => {
    const { webhookId, url, method, headers, payload, event, tenantId } = job.args;

    const startTime = Date.now();

    try {
      console.log(`[DeliverWebhook] Delivering webhook ${webhookId} to ${url}`);
      console.log(`[DeliverWebhook] Event: ${event}, Tenant: ${tenantId}`);
      console.log(`[DeliverWebhook] Attempt: ${job.attempt}/${job.maxAttempts}`);

      // Step 1: Prepare request
      const requestHeaders = {
        'Content-Type': 'application/json',
        'User-Agent': 'ContentProcessor-Webhook/1.0',
        'X-Webhook-ID': webhookId,
        'X-Webhook-Event': event,
        'X-Webhook-Delivery': job.id.toString(),
        'X-Webhook-Attempt': job.attempt.toString(),
        ...headers,
      };

      // Step 2: Send HTTP request
      console.log(`[DeliverWebhook] Sending ${method} request to ${url}`);
      await simulateAsyncOperation(500);

      // Simulate HTTP responses
      const random = Math.random();
      let statusCode: number;
      let responseBody: string;

      if (random < 0.7) {
        // Success
        statusCode = 200;
        responseBody = JSON.stringify({ status: 'ok', received: true });
      } else if (random < 0.85) {
        // Temporary failure (should retry)
        statusCode = 503;
        responseBody = JSON.stringify({ error: 'Service temporarily unavailable' });
        throw new Error(`HTTP ${statusCode}: Service temporarily unavailable`);
      } else {
        // Client error (should not retry)
        statusCode = 400;
        responseBody = JSON.stringify({ error: 'Invalid payload' });
        throw new Error(`HTTP ${statusCode}: Invalid payload`);
      }

      const responseTime = Date.now() - startTime;
      console.log(`[DeliverWebhook] Webhook ${webhookId} delivered successfully (${statusCode}) in ${responseTime}ms`);

      return WorkerResults.ok({
        webhookId,
        statusCode,
        responseTime,
        responseBody,
        deliveredAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[DeliverWebhook] Failed to deliver webhook ${webhookId}:`, error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Extract status code from error message
      const statusCodeMatch = errorMessage.match(/HTTP (\d+)/);
      const statusCode = statusCodeMatch ? parseInt(statusCodeMatch[1], 10) : 0;

      // Retry on 5xx errors and network errors
      if (statusCode >= 500 || statusCode === 0 || errorMessage.includes('timeout')) {
        console.log(`[DeliverWebhook] Transient error, will retry (attempt ${job.attempt}/${job.maxAttempts})`);
        return WorkerResults.error(error instanceof Error ? error : new Error(errorMessage));
      }

      // 4xx errors are permanent - don't retry
      if (statusCode >= 400 && statusCode < 500) {
        console.log(`[DeliverWebhook] Permanent error (HTTP ${statusCode}), discarding`);
        return WorkerResults.cancel(`Client error: ${errorMessage}`);
      }

      // Default to retry
      return WorkerResults.error(error instanceof Error ? error : new Error(errorMessage));
    }
  },
  {
    queue: 'webhooks',
    maxAttempts: 10,
    timeout: config.workers.webhookTimeout,
    priority: 5,
    // Exponential backoff with longer delays for webhooks
    backoff: (job) => {
      const baseDelay = 2000; // 2 seconds
      const maxDelay = 3600000; // 1 hour
      const delay = Math.min(baseDelay * Math.pow(2, job.attempt - 1), maxDelay);
      const jitter = Math.random() * 1000;
      return delay + jitter;
    },
  }
);

function simulateAsyncOperation(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
