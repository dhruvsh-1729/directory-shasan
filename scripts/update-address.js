#!/usr/bin/env node
 
/**
 * Sync child contact address fields from their parent contact.
 *
 * - Targets contacts where parentContactId != null
 * - Fields synced: address, suburb, city, state, country, pincode
 * - Default: dry-run (prints what would change)
 * - --apply : perform updates
 * - --force : overwrite child's non-empty values with parent's values
 * - --concurrency N : number of parallel workers (default 8)
 *
 * Usage:
 *   node scripts/sync-addresses.js
 *   node scripts/sync-addresses.js --apply
 *   node scripts/sync-addresses.js --apply --force --concurrency 12
 */

const { PrismaClient } = require('@prisma/client');
const os = require('os');

const prisma = new PrismaClient();

// --- simple argv parsing ---
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const FORCE = argv.includes('--force');
const concIndex = argv.findIndex(a => a === '--concurrency');
const CONCURRENCY = (() => {
  if (concIndex >= 0 && argv[concIndex + 1]) {
    const n = parseInt(argv[concIndex + 1], 10);
    return Number.isFinite(n) && n > 0 ? n : 8;
  }
  return 8;
})() || Math.max(4, Math.min(16, os.cpus().length));

/** Treat empty strings or null/undefined as "empty" */
const isEmpty = v => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** Only the address fields we care about */
const FIELDS = ['address', 'suburb', 'city', 'state', 'country', 'pincode'];

/** Build update payload for a child given the parent */
function computeAddressPatch(child, parent, { force = false } = {}) {
  const patch = {};
  let changes = 0;

  for (const key of FIELDS) {
    const childVal = child[key];
    const parentVal = parent ? parent[key] : undefined;

    if (force) {
      // Overwrite if parent has a value and it's different
      if (!isEmpty(parentVal) && parentVal !== childVal) {
        patch[key] = parentVal;
        changes++;
      }
    } else {
      // Fill only if child is empty and parent has a value
      if (isEmpty(childVal) && !isEmpty(parentVal)) {
        patch[key] = parentVal;
        changes++;
      }
    }
  }

  return { patch, changes };
}

async function* contactIterator(batchSize = 500) {
  let cursor = null;
  while (true) {
    const where = {
      NOT: { parentContactId: null }, // parentContactId != null
    };
    const contacts = await prisma.contact.findMany({
      where,
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        parentContactId: true,
        isMainContact: true,
        address: true,
        suburb: true,
        city: true,
        state: true,
        country: true,
        pincode: true,
      },
    });

    if (!contacts.length) break;

    for (const c of contacts) yield c;

    cursor = contacts[contacts.length - 1].id;
  }
}

/** Basic concurrency runner without external deps */
async function runPool(itemsAsyncIterable, worker, concurrency) {
  const workers = [];
  const iterator = itemsAsyncIterable[Symbol.asyncIterator]();

  async function loop() {
    while (true) {
      const { value, done } = await iterator.next();
      if (done) return;
      await worker(value);
    }
  }

  for (let i = 0; i < concurrency; i++) workers.push(loop());
  await Promise.all(workers);
}

/** Small retry wrapper (for transient write conflicts) */
async function withRetry(fn, { retries = 3, baseDelayMs = 250 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 100);
      console.warn(`  Retry #${attempt} in ${delay}ms due to: ${err?.message || err}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

(async () => {
  const started = Date.now();
  let scanned = 0;
  let eligible = 0;
  let updated = 0;
  let skippedNoParent = 0;
  let skippedNoChange = 0;

  console.log(`\n🔧 Syncing child contact addresses from parents`);
  console.log(`Mode: ${APPLY ? 'APPLY (writes enabled)' : 'DRY-RUN (no writes)'}`);
  console.log(`Force overwrite: ${FORCE ? 'YES' : 'NO (fill blanks only)'}`);
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  // Build a small in-memory cache of parents by id to avoid duplicate lookups
  const parentCache = new Map();

  await runPool(contactIterator(500), async (child) => {
    scanned++;

    // Defensive: skip if somehow parentContactId is null (shouldn't happen due to where)
    if (!child.parentContactId) {
      skippedNoParent++;
      return;
    }

    // Load parent (cache first)
    let parent = parentCache.get(child.parentContactId);
    if (!parent) {
      parent = await prisma.contact.findUnique({
        where: { id: child.parentContactId },
        select: {
          id: true,
          name: true,
          address: true,
          suburb: true,
          city: true,
          state: true,
          country: true,
          pincode: true,
        },
      });
      if (parent) parentCache.set(child.parentContactId, parent);
    }

    if (!parent) {
      // Parent record missing; nothing to sync
      skippedNoParent++;
      return;
    }

    const { patch, changes } = computeAddressPatch(child, parent, { force: FORCE });

    if (changes === 0) {
      skippedNoChange++;
      return;
    }

    eligible++;

    // Log a concise diff
    const diffPreview = FIELDS
      .filter(k => Object.prototype.hasOwnProperty.call(patch, k))
      .map(k => `${k}: "${child[k] || ''}" → "${patch[k] || ''}"`)
      .join(' | ');

    if (!APPLY) {
      console.log(`🧪 [DRY] ${child.name} (${child.id}) <= Parent: ${parent.name} (${parent.id}) | ${diffPreview}`);
      return;
    }

    await withRetry(() =>
      prisma.contact.update({
        where: { id: child.id },
        data: {
          ...patch,
          lastUpdated: new Date(),
        },
        select: { id: true },
      })
    );

    updated++;
    console.log(`✅ Updated ${child.name} (${child.id}) | ${diffPreview}`);
  }, CONCURRENCY);

  const ms = Date.now() - started;
  console.log('\n—— Summary ——');
  console.log(`Scanned:          ${scanned}`);
  console.log(`Eligible changes: ${eligible}`);
  console.log(`Updated:          ${updated} ${APPLY ? '' : '(dry-run)'}`);
  console.log(`No parent:        ${skippedNoParent}`);
  console.log(`No change:        ${skippedNoChange}`);
  console.log(`Elapsed:          ${(ms / 1000).toFixed(1)}s\n`);
})()
  .catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
