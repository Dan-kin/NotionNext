import assert from 'node:assert/strict'
import test from 'node:test'
import { autoPublicationBlockers, buildExistingIndex, titlesAgree } from './auto-publish-eligibility.mjs'

const source = {
  sourceRole: 'official_publication',
  defaultColumn: '本周去看',
  homepage: 'https://www.paris.fr/quefaire'
}
const candidate = {
  column: '本周去看',
  url: 'https://www.paris.fr/evenements/exposition-123',
  listingTitle: 'Exposition Soraya Meunier',
  title: 'Exposition Soraya Meunier',
  description: 'Exposition de photographie.',
  detailFetched: true,
  schemaType: 'Event',
  dateEvidence: 'structured',
  startDate: '2026-10-01T10:00:00.000Z',
  endDate: '2026-10-10T18:00:00.000Z',
  location: 'Bibliothèque, Paris',
  exclusionReasons: []
}
const context = {
  now: new Date('2026-09-28T12:00:00.000Z'),
  existingSourceUrls: new Set(),
  existingTopics: new Set()
}

const notionIndex = {
  databaseId: 'b90eac61-6405-4c7e-a9f7-76199f826424',
  complete: true,
  statusesQueried: ['Published', 'Draft', 'Invisible'],
  queriedAt: '2026-09-28T11:00:00.000Z',
  totalPages: 80,
  pages: Array.from({ length: 80 }, (_, i) => ({
    id: `page-${i}`,
    title: `Existing article ${i}`,
    status: i % 3 === 0 ? 'Published' : i % 3 === 1 ? 'Draft' : 'Invisible',
    source_url: i === 0 ? 'https://www.paris.fr/evenements/exposition-123?utm_source=x' : null
  }))
}

test('accepts only a fully evidenced, unique first-party event notice', () => {
  assert.deepEqual(autoPublicationBlockers(candidate, source, context), [])
})

test('blocks the title/link mismatch seen in the weekly report', () => {
  assert.equal(titlesAgree('Festival des jardins partagés', 'Anthropologie urbaine'), false)
  assert.ok(autoPublicationBlockers({ ...candidate, title: 'Anthropologie urbaine' }, source, context).includes('title_mismatch'))
})

test('fails closed when prior source URLs cannot be checked', () => {
  const reasons = autoPublicationBlockers(candidate, source, { now: context.now })
  assert.ok(reasons.includes('duplicate_check_unavailable'))
})

test('accepts a complete fresh Notion index and normalizes source URLs', () => {
  const index = buildExistingIndex(notionIndex, context.now)
  assert.ok(index.existingSourceUrls.has(candidate.url))
  assert.ok(autoPublicationBlockers(candidate, source, { ...context, ...index }).includes('already_published'))
})

test('rejects incomplete, stale, or truncated Notion indexes', () => {
  assert.throws(() => buildExistingIndex({ ...notionIndex, complete: false }, context.now))
  assert.throws(() => buildExistingIndex({ ...notionIndex, queriedAt: '2026-09-26T11:00:00.000Z' }, context.now))
  assert.throws(() => buildExistingIndex({ ...notionIndex, totalPages: 81 }, context.now))
})

test('rejects secondary sources and expired events regardless of score', () => {
  const reasons = autoPublicationBlockers({ ...candidate, endDate: '2026-09-20T18:00:00.000Z', score: 12 }, { ...source, sourceRole: 'discovery' }, context)
  assert.ok(reasons.includes('not_primary_source'))
  assert.ok(reasons.includes('outside_event_window'))
})
