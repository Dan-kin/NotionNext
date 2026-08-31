import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  canonicalTopic,
  classifyCandidate,
  deduplicateCandidates,
  extractDocumentMeta,
  extractSourceLinks,
  normalizeUrl,
  plainText,
  scoreCandidate
} from './collector.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
const source = {
  id: 'offi_exhibitions',
  name: "L'Officiel des spectacles — Expositions",
  defaultColumn: '本周去看',
  reliabilityScore: 1,
  includePathPatterns: ['^/expositions-musees/[^/]+-\\d+/[^/]+-\\d+\\.html$'],
  excludePathPatterns: [],
  titleSuffixes: ["L'Officiel des spectacles"]
}

test('normalizes tracking URLs and derives stable topics', () => {
  assert.equal(
    normalizeUrl('/event?utm_source=test&keep=1#top', 'https://example.org'),
    'https://example.org/event?keep=1'
  )
  assert.equal(
    canonicalTopic('L’exposition : Éclats de Chine !'),
    'exposition eclats chine'
  )
})

test('removes script and style bodies with spaced closing tags', () => {
  const html = `Safe<script>alert('unsafe')</script ><style>.hidden{}</style >text`
  assert.equal(plainText(html), 'Safe text')
})

test('extracts only matching, unique source links from a fixed fixture', async () => {
  const html = await readFile(
    path.join(directory, 'offi.listing.fixture.html'),
    'utf8'
  )
  const links = extractSourceLinks(
    html,
    'https://www.offi.fr/expositions-musees/prochainement.html',
    source
  )
  assert.deepEqual(links, [
    {
      url: 'https://www.offi.fr/expositions-musees/musee-exemple-42/dialogues-de-soie-12345.html',
      title: 'Dialogues de soie'
    }
  ])
})

test('extracts event JSON-LD without copying the page body', async () => {
  const html = await readFile(
    path.join(directory, 'offi.detail.fixture.html'),
    'utf8'
  )
  const meta = extractDocumentMeta(
    html,
    'https://www.offi.fr/expositions-musees/musee-exemple-42/dialogues-de-soie-12345.html',
    source
  )
  assert.equal(meta.title, 'Dialogues de soie')
  assert.equal(
    meta.description,
    "Une exposition d'art contemporain franco-chinoise."
  )
  assert.equal(meta.startDate, '2027-03-02T09:00:00.000Z')
  assert.match(meta.location, /Musée exemple/)
})

test('extracts a visible French event date range without structured dates', () => {
  const html = `
    <html><head>
      <meta property="og:title" content="Où sont nos thunes ? — Exposition">
      <meta name="description" content="Une exposition d'art contemporain.">
    </head><body><p>3 septembre → 24 octobre 2026</p></body></html>
  `
  const meta = extractDocumentMeta(html, 'https://example.org/evenement', {
    ...source,
    titleSuffixes: []
  })
  assert.equal(meta.startDate, '2026-09-03T12:00:00.000Z')
  assert.equal(meta.endDate, '2026-10-24T12:00:00.000Z')
})

test('uses the latest date when an opportunity has multiple deadlines', () => {
  const html = `
    <html><head>
      <meta property="og:title" content="International art residency open call">
      <meta name="description" content="Open call for artists.">
    </head><body><p>Deadline: 30 June 2026, 31 December 2026.</p></body></html>
  `
  const meta = extractDocumentMeta(html, 'https://example.org/open-call', {
    ...source,
    titleSuffixes: []
  })
  assert.equal(meta.deadline, '2026-12-31T12:00:00.000Z')
})

test('classifies and scores a China-France exhibition deterministically', () => {
  const candidate = {
    title: 'Dialogues de soie',
    description: "Une exposition d'art contemporain franco-chinoise.",
    startDate: '2027-03-02T09:00:00.000Z',
    endDate: '2027-06-30T16:00:00.000Z',
    deadline: null,
    location: 'Musée exemple, Paris'
  }
  candidate.column = classifyCandidate(candidate, source)
  const score = scoreCandidate(
    candidate,
    source,
    new Date('2026-08-30T00:00:00Z')
  )
  assert.equal(candidate.column, '中法连接')
  assert.equal(score.total, 9)
  assert.equal(score.expired, false)
})

test('keeps a deadline active for its full Paris calendar day', () => {
  const candidate = {
    title: 'Open call for artists',
    description: 'International art residency.',
    startDate: null,
    endDate: null,
    deadline: '2026-08-30T12:00:00.000Z',
    location: ''
  }
  candidate.column = classifyCandidate(candidate, source)
  const score = scoreCandidate(
    candidate,
    source,
    new Date('2026-08-30T21:00:00Z')
  )
  assert.equal(score.expired, false)
  assert.equal(score.breakdown.freshness, 2)
})

test('marks URL, topic and existing-site duplicates without deleting data', () => {
  const candidates = [
    { id: 'a', url: 'https://example.org/a', title: 'Éclats de Chine' },
    { id: 'b', url: 'https://example.org/a', title: 'Autre titre' },
    { id: 'c', url: 'https://example.org/c', title: 'Eclats de Chine' },
    { id: 'd', url: 'https://example.org/d', title: 'Article existant' }
  ]
  const results = deduplicateCandidates(candidates, ['Article existant'])
  assert.equal(results[1].duplicateOf, 'a')
  assert.equal(results[2].duplicateOf, 'a')
  assert.equal(results[3].duplicateExisting, true)
})
