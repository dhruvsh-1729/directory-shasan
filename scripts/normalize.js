#!/usr/bin/env node
 

/**
 * Proper-case migration for Contact collection (Prisma + MongoDB).
 *
 * - Title-cases common human-readable fields (name, city, state, country, etc.)
 * - Skips emails, URLs, phone numbers, ObjectId-like fields, and free-form notes by default
 * - Handles arrays like alternateNames and (optionally) tags
 * - Batch processing with minimal writes (only updates when value actually changes)
 *
 * ENV:
 *   DRY_RUN=true    -> do not write changes, only log
 *   BATCH_SIZE=500  -> change batch size
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DRY_RUN = String(process.env.DRY_RUN || 'false').toLowerCase() === 'true';
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 500);

// === CONFIG: which fields to change ===
// Contact scalar string fields to title-case:
const CONTACT_FIELDS_TO_TITLE = [
  'name',
  // 'status',
  'address',
  'suburb',
  'city',
  // 'pincode', // usually numeric; leave as-is
  'state',
  'country',
  // 'category',
  'officeAddress',
  'address2',
  // 'duplicateGroup', // internal grouping key; usually skip
  // 'notes',          // free text; usually skip
  // 'avatarUrl', 'avatarPublicId' // URLs/ids; skip
];

// Arrays of strings to title-case:
const CONTACT_STRING_ARRAY_FIELDS = [
  'alternateNames',
  // 'tags', // flip to true below if you want title-cased tags
]; 

const TITLE_CASE_TAGS = false; // set to true if you want tags Title Cased
if (TITLE_CASE_TAGS && !CONTACT_STRING_ARRAY_FIELDS.includes('tags')) {
  CONTACT_STRING_ARRAY_FIELDS.push('tags');
}

// Embedded: Phone
const PHONE_FIELDS_TO_TITLE = [
  'label',   // e.g., "work" -> "Work"
  'country', // e.g., "india" -> "India"
  'region',  // e.g., "maharashtra" -> "Maharashtra"
  // number -> DO NOT change
];

// Embedded: Email
// address -> DO NOT change (emails should remain lowercase)

// Embedded: ContactRelationship
const REL_FIELDS_TO_TITLE = [
  // 'description', // OPTIONAL: simple title-case; comment out if you want untouched
];

/**
 * Title case that’s robust for names/addresses:
 * - Trims and collapses whitespace
 * - Preserves case after punctuation like hyphen/’/./&
 * - Leaves all-caps acronyms (>=2 letters, no vowels) and mixed-number tokens as-is
 * - Keeps common short words in lowercase unless they start the field (of, and, the, etc.)
 */
function titleCaseHuman(input) {
  if (!input || typeof input !== 'string') return input;
  const s = input
    .trim()
    .replace(/\s+/g, ' ');

  if (!s) return s;

  const lowerSmall = new Set([
    'a','an','and','as','at','but','by','for','from','in','into','of','on','or','the','to','via','with'
  ]);

  return s
    .split(' ')
    .map((word, idx) => {
      // keep emails/urls untouched if somehow present
      if (/@/.test(word) || /^https?:\/\//i.test(word)) return word;

      // tokens containing digits or being all-caps acronyms: keep as-is
      const hasDigit = /\d/.test(word);
      const isAllCaps = /^[A-Z][A-Z0-9&.-]*$/.test(word);
      const looksAcronym = isAllCaps && !/[AEIOU]/.test(word); // crude heuristic
      if (hasDigit || looksAcronym) return word;

      // handle hyphen/’/./& separated parts separately (McDonald-style-ish)
      const parts = word.split(/([\-\/'.&])/); // keep delimiters
      const cased = parts.map((p, i) => {
        if (/[\-\/'.&]/.test(p)) return p; // delimiter
        if (!p) return p;

        const lower = p.toLowerCase();
        const isSmall = lowerSmall.has(lower);
        const makeTitle = (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase();

        // First word in the field: always title
        if (idx === 0) return makeTitle(lower);
        // If surrounded by punctuation (e.g., after hyphen) -> title
        if (i > 0 && /[\-\/'.&]/.test(parts[i - 1])) return makeTitle(lower);
        // Small words -> keep lowercase
        if (isSmall) return lower;
        // Default
        return makeTitle(lower);
      }).join('');

      return cased;
    })
    .join(' ');
}

function cleanString(val) {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim().replace(/\s+/g, ' ');
  // If it looks purely numeric (pincodes), don’t title-case
  if (/^\d[\d\s-]*$/.test(trimmed)) return trimmed.replace(/\s+/g, '');
  return titleCaseHuman(trimmed);
}

function transformContactStrings(c) {
  let changed = false;
  const updated = { ...c };

  // Scalar fields
  for (const f of CONTACT_FIELDS_TO_TITLE) {
    if (f in updated && typeof updated[f] === 'string' && updated[f] !== null) {
      const next = cleanString(updated[f]);
      if (next !== updated[f]) {
        updated[f] = next;
        changed = true;
      }
    }
  }

  // Arrays of strings
  for (const f of CONTACT_STRING_ARRAY_FIELDS) {
    if (Array.isArray(updated[f])) {
      const nextArr = updated[f].map((v) => (typeof v === 'string' ? cleanString(v) : v));
      // check if changed
      const different = nextArr.some((v, i) => v !== updated[f][i]);
      if (different) {
        updated[f] = nextArr;
        changed = true;
      }
    }
  }

  // Phones (embedded)
  // if (Array.isArray(updated.phones)) {
  //   const nextPhones = updated.phones.map((p) => {
  //     const np = { ...p };
  //     for (const pf of PHONE_FIELDS_TO_TITLE) {
  //       if (np[pf] && typeof np[pf] === 'string') {
  //         const nv = cleanString(np[pf]);
  //         if (nv !== np[pf]) np[pf] = nv;
  //       }
  //     }
  //     // DO NOT mutate number
  //     return np;
  //   });
  //   const different = JSON.stringify(nextPhones) !== JSON.stringify(updated.phones);
  //   if (different) {
  //     updated.phones = nextPhones;
  //     changed = true;
  //   }
  // }

  // Emails: skip address casing on purpose
  // (You can still normalize to lowercase elsewhere in your code)

  // Relationships (embedded)
  if (Array.isArray(updated.relationships)) {
    const nextRels = updated.relationships.map((r) => {
      const nr = { ...r };
      for (const rf of REL_FIELDS_TO_TITLE) {
        if (nr[rf] && typeof nr[rf] === 'string') {
          const nv = cleanString(nr[rf]);
          if (nv !== nr[rf]) nr[rf] = nv;
        }
      }
      return nr;
    });
    const different = JSON.stringify(nextRels) !== JSON.stringify(updated.relationships);
    if (different) {
      updated.relationships = nextRels;
      changed = true;
    }
  }

  return { changed, updated };
}

async function main() {
  console.log(`== Proper-case migration start ==`);
  console.log(`DRY_RUN=${DRY_RUN}  BATCH_SIZE=${BATCH_SIZE}`);

  let processed = 0;
  let updatedCount = 0;
  let cursor = null;

  // We only need ids to paginate; we’ll refetch records in batches
  while (true) {
    const page = await prisma.contact.findMany({
      select: { id: true },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
    });

    if (!page.length) break;

    // Fetch full docs for this batch
    const ids = page.map((x) => x.id);
    const docs = await prisma.contact.findMany({
      where: { id: { in: ids } },
    });

    for (const doc of docs) {
      const { changed, updated } = transformContactStrings(doc);
      if (changed) {
        updated.lastUpdated = new Date();
        if (!DRY_RUN) {
            await prisma.contact.update({
            where: { id: doc.id },
            data: {
              ...(updated.name !== undefined && { name: updated.name }),
              ...(updated.address !== undefined && { address: updated.address }),
              ...(updated.suburb !== undefined && { suburb: updated.suburb }),
              ...(updated.city !== undefined && { city: updated.city }),
              ...(updated.state !== undefined && { state: updated.state }),
              ...(updated.country !== undefined && { country: updated.country }),
              ...(updated.officeAddress !== undefined && { officeAddress: updated.officeAddress }),
              ...(updated.address2 !== undefined && { address2: updated.address2 }),
              ...(updated.alternateNames !== undefined && { alternateNames: updated.alternateNames }),
              // ...(updated.tags !== undefined && { tags: updated.tags }),
              // ...(updated.relationships !== undefined && { relationships: updated.relationships }),
              lastUpdated: updated.lastUpdated,
            },
            });
        }
        updatedCount++;
      }
      processed++;
    }

    cursor = page[page.length - 1].id;
    console.log(
      `Processed: ${processed} (batch ${page.length}). Updated so far: ${updatedCount}${
        DRY_RUN ? ' [dry-run]' : ''
      }`
    );
  }

  console.log(`== Done. Processed ${processed}, Updated ${updatedCount} ${DRY_RUN ? '(dry-run)' : ''} ==`);
}

main()
  .catch((e) => {
    console.error('Migration error:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
