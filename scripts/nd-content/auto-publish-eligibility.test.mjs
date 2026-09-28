import assert from 'node:assert/strict'
import test from 'node:test'
import { autoPublicationBlockers, titlesAgree } from './auto-publish-eligibility.mjs'

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
  existingSourceUrls: new Set()
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

test('rejects secondary sources and expired events regardless of score', () => {
  const reasons = autoPublicationBlockers({ ...candidate, endDate: '2026-09-20T18:00:00.000Z', score: 12 }, { ...source, sourceRole: 'discovery' }, context)
  assert.ok(reasons.includes('not_primary_source'))
  assert.ok(reasons.includes('outside_event_window'))
})
