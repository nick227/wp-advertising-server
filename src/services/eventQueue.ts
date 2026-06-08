import { Prisma } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';

export type QueuedEvent = {
  adId: string;
  sourceSiteId?: string;
  targetSiteId?: string;
  type: 'IMPRESSION' | 'CLICK';
  referrerDomain?: string;
  userAgentHash?: string;
  requestId?: string;
  createdAt: Date;
};

const queue: QueuedEvent[] = [];
let flushing = false;
let timer: NodeJS.Timeout | undefined;
let totalQueued = 0;
let totalDropped = 0;
let totalFlushed = 0;
let totalFlushFailures = 0;
let lastFlushAt: string | null = null;
let lastFlushMs: number | null = null;
let lastError: string | null = null;
let lastErrorLogAt = 0;

export const eventQueue = {
  start() {
    if (timer) return;
    timer = setInterval(() => {
      void flushEvents().catch(logFlushError);
    }, config.eventFlushIntervalMs);
    timer.unref();
  },
  stop() {
    if (timer) clearInterval(timer);
    timer = undefined;
  },
  push(event: QueuedEvent) {
    try {
      if (queue.length >= config.eventMaxQueue) {
        totalDropped += 1;
        return false;
      }
      queue.push(event);
      totalQueued += 1;
      if (queue.length >= config.eventFlushMaxBatch) {
        void flushEvents().catch(logFlushError);
      }
      return true;
    } catch (error) {
      totalDropped += 1;
      lastError = error instanceof Error ? error.message : 'Unknown event enqueue error';
      logFlushError(error);
      return false;
    }
  },
  async flush() {
    await flushEvents({ drain: true });
    return this.status();
  },
  status() {
    return {
      queued: queue.length,
      maxQueue: config.eventMaxQueue,
      flushing,
      flushIntervalMs: config.eventFlushIntervalMs,
      flushMaxBatch: config.eventFlushMaxBatch,
      totalQueued,
      totalDropped,
      totalFlushed,
      totalFlushFailures,
      lastFlushAt,
      lastFlushMs,
      lastError,
      rawEventsEnabled: config.rawEventsEnabled,
    };
  },
};

async function flushEvents(options: { drain?: boolean } = {}) {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const started = Date.now();
  const batchSize = options.drain ? queue.length : config.eventFlushMaxBatch;
  const batch = queue.splice(0, batchSize);
  try {
    await writeBatch(batch);
    totalFlushed += batch.length;
    lastFlushAt = new Date().toISOString();
    lastFlushMs = Date.now() - started;
    lastError = null;
  } catch (error) {
    totalFlushFailures += 1;
    lastFlushMs = Date.now() - started;
    lastError = error instanceof Error ? error.message : 'Unknown event flush error';
    // Keep the service alive. Requeue only if there is room; otherwise drop failed events.
    const room = Math.max(0, config.eventMaxQueue - queue.length);
    const requeue = batch.slice(0, room);
    queue.unshift(...requeue);
    totalDropped += batch.length - requeue.length;
    throw error;
  } finally {
    flushing = false;
  }

  if (options.drain && queue.length > 0) {
    await flushEvents(options);
  }
}

async function writeBatch(batch: QueuedEvent[]) {
  if (batch.length === 0) return;

  const rollups = new Map<string, { adId: string; sourceSiteId: string; type: 'IMPRESSION' | 'CLICK'; bucketMinute: Date; count: number }>();
  const clickCounts = new Map<string, number>();
  const servedCounts = new Map<string, number>();

  for (const event of batch) {
    const bucketMinute = truncateToMinute(event.createdAt);
    const source = event.sourceSiteId || '';
    const key = `${event.adId}:${source}:${event.type}:${bucketMinute.toISOString()}`;
    const existing = rollups.get(key) || { adId: event.adId, sourceSiteId: source, type: event.type, bucketMinute, count: 0 };
    existing.count += 1;
    rollups.set(key, existing);

    if (event.type === 'CLICK') clickCounts.set(event.adId, (clickCounts.get(event.adId) || 0) + 1);
    if (event.type === 'IMPRESSION') servedCounts.set(event.adId, (servedCounts.get(event.adId) || 0) + 1);
  }

  await prisma.$transaction(async (tx) => {
    if (config.rawEventsEnabled) {
      await tx.communityEvent.createMany({
        data: batch.map((event) => ({
          adId: event.adId,
          sourceSiteId: event.sourceSiteId,
          targetSiteId: event.targetSiteId,
          type: event.type,
          referrerDomain: event.referrerDomain,
          userAgentHash: event.userAgentHash,
          createdAt: event.createdAt,
        })),
        skipDuplicates: true,
      });
    }

    for (const rollup of rollups.values()) {
      await tx.communityEventRollup.upsert({
        where: {
          adId_sourceSiteId_type_bucketMinute: {
            adId: rollup.adId,
            sourceSiteId: rollup.sourceSiteId,
            type: rollup.type,
            bucketMinute: rollup.bucketMinute,
          },
        },
        create: rollup,
        update: { count: { increment: rollup.count } },
      });
    }

    for (const [adId, count] of servedCounts) {
      await tx.communityAd.update({ where: { id: adId }, data: { servedCount: { increment: count } } }).catch(ignoreMissing);
    }
    for (const [adId, count] of clickCounts) {
      await tx.communityAd.update({ where: { id: adId }, data: { clickCount: { increment: count } } }).catch(ignoreMissing);
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

function truncateToMinute(date: Date) {
  const copy = new Date(date);
  copy.setSeconds(0, 0);
  return copy;
}

function ignoreMissing() {
  return undefined;
}

function logFlushError(error: unknown) {
  const now = Date.now();
  if (now - lastErrorLogAt < config.eventFlushLogThrottleMs) return;
  lastErrorLogAt = now;
  console.error('event flush failed', error);
}
