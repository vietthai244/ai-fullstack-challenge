// backend/src/lib/queue.ts
//
// Phase 5: BullMQ Queue + Worker for campaign send/schedule.
//
// Two separate IORedis connections — NEVER share between Queue and Worker.
// BullMQ uses blocking Redis commands on the worker connection; sharing
// causes command interference and silent job stalls (C5, QUEUE-01).
//
// Both connections must have the per-request retry limit disabled (C5).
// The auth redis client in lib/redis.ts intentionally keeps the default
// retry limit — DO NOT pass the auth client here.

import { Queue, Worker, type Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { config } from '../config/env.js';
import { logger } from '../util/logger.js';
import { processSendJob } from '../services/sendWorker.js';

// Separate connections — Queue vs Worker (QUEUE-01)
const queueConn = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
const workerConn = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });

queueConn.on('error', (err: Error) => logger.error({ err }, 'queue redis error'));
workerConn.on('error', (err: Error) => logger.error({ err }, 'worker redis error'));

export const sendQueue = new Queue('send-campaign', { connection: queueConn });

export const sendWorker = new Worker('send-campaign', processSendJob, {
  connection: workerConn,
});

// Mandatory event listeners (QUEUE-04)
sendWorker.on('failed', (job: Job | undefined, err: Error) => {
  logger.error({ jobId: job?.id, campaignId: job?.data?.campaignId, err }, 'send job failed');
});
sendWorker.on('error', (err: Error) => {
  logger.error({ err }, 'send worker connection error');
});
