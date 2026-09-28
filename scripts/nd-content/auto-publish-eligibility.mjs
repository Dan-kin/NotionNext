import { canonicalTopic, fold, normalizeUrl } from './collector.mjs'

const DAY = 24 * 60 * 60 * 1000
const DATABASE_ID = 'b90eac61-6405-4c7e-a9f7-76199f826424'

function words(value) {
  return new Set(canonicalTopic(value).split(' ').filter(word => word.length > 2))
}

export function titlesAgree(listingTitle, detailTitle) {
  const left = words(listingTitle)
  const right = words(detailTitle)
  if (left.size < 2 || right.size < 2) return false
  const overlap = [...left].filter(word => right.has(word)).length
  return overlap >= 2 && overlap / Math.min(left.size, right.size) >= 0.7
}

/** Accept only a fresh, complete snapshot of every Notion status. */
export function buildExistingIndex(snapshot, now = new Date()) {
  if (snapshot?.databaseId !== DATABASE_ID || snapshot.complete !== true) {
    throw new Error('incomplete_or_wrong_notion_index')
  }
  const statuses = new Set(snapshot.statusesQueried)
  if (!['Published', 'Draft', 'Invisible'].every(status => statuses.has(status))) {
    throw new Error('notion_statuses_missing')
  }
  const queriedAt = new Date(snapshot.queriedAt)
  if (Number.isNaN(queriedAt.getTime()) || Math.abs(now - queriedAt) > DAY) {
    throw new Error('stale_notion_index')
  }
  if (!Array.isArray(snapshot.pages) || snapshot.pages.length < 80 || snapshot.totalPages !== snapshot.pages.length) {
    throw new Error('notion_index_page_count_mismatch')
  }
  const ids = new Set()
  const existingSourceUrls = new Set()
  const existingTopics = new Set()
  for (const page of snapshot.pages) {
    if (!page.id || ids.has(page.id) || !page.title || !statuses.has(page.status)) {
      throw new Error('invalid_notion_index_page')
    }
    ids.add(page.id)
    const topic = canonicalTopic(page.title)
    if (topic) existingTopics.add(topic)
    const url = page.source_url && normalizeUrl(page.source_url)
    if (page.source_url && !url) throw new Error('invalid_notion_source_url')
    if (url) existingSourceUrls.add(url)
  }
  return { existingSourceUrls, existingTopics }
}

/** A fail-closed gate for short, factual event notices only. Scores never grant publication. */
export function autoPublicationBlockers(candidate, source, context = {}) {
  const reasons = []
  const now = context.now || new Date()
  const existingSourceUrls = context.existingSourceUrls
  const existingTopics = context.existingTopics

  if (source?.sourceRole !== 'official_publication') reasons.push('not_primary_source')
  if (source?.defaultColumn !== '本周去看' || candidate.column !== '本周去看') {
    reasons.push('not_event_notice')
  }
  if (candidate.exclusionReasons?.length) reasons.push('failed_review_filter')
  if (!candidate.detailFetched) reasons.push('detail_unavailable')
  if (!titlesAgree(candidate.listingTitle, candidate.title)) reasons.push('title_mismatch')
  if (!candidate.schemaType || !/event|exhibition/i.test(String(candidate.schemaType))) {
    reasons.push('no_structured_event')
  }
  if (candidate.dateEvidence !== 'structured') reasons.push('unverified_date')
  if (!candidate.startDate || !candidate.endDate) reasons.push('missing_date_range')
  if (!candidate.location) reasons.push('missing_venue')
  if (!candidate.url || !candidate.url.startsWith(`${new URL(source?.homepage || 'https://invalid.local').origin}/`)) {
    reasons.push('source_url_mismatch')
  }
  if (!(existingSourceUrls instanceof Set) || !(existingTopics instanceof Set)) {
    reasons.push('duplicate_check_unavailable')
  } else if (
    existingSourceUrls.has(normalizeUrl(candidate.url)) ||
    existingTopics.has(canonicalTopic(candidate.title))
  ) {
    reasons.push('already_published')
  }

  const start = candidate.startDate && new Date(candidate.startDate)
  const end = candidate.endDate && new Date(candidate.endDate)
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    const daysUntilStart = (start.getTime() - now.getTime()) / DAY
    if (end <= start || end <= now || daysUntilStart > 14 || daysUntilStart < -14) {
      reasons.push('outside_event_window')
    }
  }
  if (/\b(annul|reporte|cancelled|canceled|postponed)/.test(fold(`${candidate.title} ${candidate.description}`))) {
    reasons.push('possible_cancellation')
  }
  return reasons
}
