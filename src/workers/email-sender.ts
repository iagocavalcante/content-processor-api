import { defineWorker, WorkerResults, type Job } from '../lib/izi-queue/index.js';
import { config } from '../config/index.js';

interface EmailJobArgs {
  to: string | string[];
  from?: string;
  subject: string;
  html?: string;
  text?: string;
  template?: {
    name: string;
    data: Record<string, unknown>;
  };
  attachments?: Array<{
    filename: string;
    url: string;
  }>;
  tenantId: string;
  messageId?: string;
}

/**
 * Email Sending Worker
 * Handles transactional and bulk email delivery
 */
export const emailSenderWorker = defineWorker<EmailJobArgs>(
  'SendEmail',
  async (job: Job<EmailJobArgs>) => {
    const { to, from, subject, html, text, template, attachments, tenantId, messageId } = job.args;

    const recipients = Array.isArray(to) ? to : [to];
    const emailId = messageId || `email-${Date.now()}-${job.id}`;

    try {
      console.log(`[SendEmail] Sending email ${emailId} to ${recipients.join(', ')}`);
      console.log(`[SendEmail] Subject: ${subject}`);
      console.log(`[SendEmail] Tenant: ${tenantId}`);

      // Step 1: Render template if provided
      let emailHtml = html;
      let emailText = text;

      if (template) {
        console.log(`[SendEmail] Rendering template: ${template.name}`);
        await simulateAsyncOperation(300);
        emailHtml = `<html><body>Rendered: ${template.name}</body></html>`;
        emailText = `Rendered: ${template.name}`;
      }

      // Step 2: Download attachments if any
      if (attachments && attachments.length > 0) {
        console.log(`[SendEmail] Processing ${attachments.length} attachment(s)`);
        await simulateAsyncOperation(500);
      }

      // Step 3: Send via SMTP
      console.log(`[SendEmail] Sending via SMTP...`);
      await simulateAsyncOperation(1000);

      // Simulate occasional transient failures (rate limits, connection issues)
      if (Math.random() < 0.05 && job.attempt < 2) {
        throw new Error('SMTP connection timeout (temporary)');
      }

      console.log(`[SendEmail] Email ${emailId} sent successfully to ${recipients.length} recipient(s)`);

      return WorkerResults.ok({
        emailId,
        recipients: recipients.length,
        sentAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[SendEmail] Failed to send email ${emailId}:`, error);

      // Retry on transient errors
      if (error instanceof Error && error.message.includes('temporary')) {
        return WorkerResults.error(error);
      }

      // Discard on permanent errors (invalid recipient, etc.)
      if (error instanceof Error && error.message.includes('invalid recipient')) {
        return WorkerResults.cancel(`Invalid recipient: ${error.message}`);
      }

      // Default to retry
      return WorkerResults.error(error instanceof Error ? error : new Error(String(error)));
    }
  },
  {
    queue: 'emails',
    maxAttempts: 5,
    timeout: config.workers.emailTimeout,
    priority: 2,
    // Custom exponential backoff for emails
    backoff: (job) => {
      const baseDelay = 1000; // 1 second
      const maxDelay = 300000; // 5 minutes
      const delay = Math.min(baseDelay * Math.pow(2, job.attempt - 1), maxDelay);
      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 1000;
      return delay + jitter;
    },
  }
);

function simulateAsyncOperation(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
