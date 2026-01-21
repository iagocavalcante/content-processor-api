/**
 * Isolated Email Worker
 *
 * This worker runs in a separate thread (Worker Thread) for memory isolation.
 * It receives job data via parentPort and returns results back to the main thread.
 *
 * Benefits of isolation:
 * - Memory limits prevent a single job from crashing the entire process
 * - CPU-intensive work doesn't block other queues
 * - Failures are contained within the worker thread
 */
import { parentPort, workerData } from 'node:worker_threads';

// Worker receives job data through workerData or messages
parentPort?.on('message', async (message) => {
  if (message.type === 'execute') {
    const { job } = message;

    try {
      const result = await performEmailJob(job);
      parentPort?.postMessage({ type: 'result', result });
    } catch (error) {
      parentPort?.postMessage({
        type: 'error',
        error: {
          message: error.message,
          stack: error.stack
        }
      });
    }
  }
});

/**
 * Perform the email sending job
 * This is the actual worker logic that runs isolated in its own thread
 */
async function performEmailJob(job) {
  const { to, from, subject, html, text, template, attachments, tenantId, messageId } = job.args;

  const recipients = Array.isArray(to) ? to : [to];
  const emailId = messageId || `email-${Date.now()}-${job.id}`;

  console.log(`[IsolatedEmailWorker] Processing email ${emailId}`);
  console.log(`[IsolatedEmailWorker] Thread ID: ${process.pid}`);
  console.log(`[IsolatedEmailWorker] Recipients: ${recipients.join(', ')}`);
  console.log(`[IsolatedEmailWorker] Subject: ${subject}`);
  console.log(`[IsolatedEmailWorker] Tenant: ${tenantId}`);

  // Step 1: Render template if provided
  let emailHtml = html;
  let emailText = text;

  if (template) {
    console.log(`[IsolatedEmailWorker] Rendering template: ${template.name}`);
    await simulateAsyncOperation(300);
    emailHtml = `<html><body>Rendered: ${template.name}</body></html>`;
    emailText = `Rendered: ${template.name}`;
  }

  // Step 2: Download attachments if any
  if (attachments && attachments.length > 0) {
    console.log(`[IsolatedEmailWorker] Processing ${attachments.length} attachment(s)`);
    await simulateAsyncOperation(500);
  }

  // Step 3: Send via SMTP
  console.log(`[IsolatedEmailWorker] Sending via SMTP...`);
  await simulateAsyncOperation(1000);

  // Simulate occasional transient failures
  if (Math.random() < 0.05 && job.attempt < 2) {
    throw new Error('SMTP connection timeout (temporary)');
  }

  console.log(`[IsolatedEmailWorker] Email ${emailId} sent successfully`);

  return {
    status: 'ok',
    value: {
      emailId,
      recipients: recipients.length,
      sentAt: new Date().toISOString(),
      isolatedExecution: true,
    },
  };
}

function simulateAsyncOperation(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Signal that the worker is ready
parentPort?.postMessage({ type: 'ready' });
