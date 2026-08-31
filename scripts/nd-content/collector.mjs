import { createHash } from 'node:crypto'

const TRACKING_PARAMETERS = [
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'source'
]

const OPPORTUNITY_KEYWORDS = [
  'appel a candidatures',
  'appel a projets',
  'appel ouvert',
  'bourse',
  'candidature',
  'concours',
  'deadline',
  'financement',
  'mobilite',
  'open call',
  'prix',
  'residence',
  'residency'
]

const CHINA_FRANCE_KEYWORDS = [
  'chine',
  'chinois',
  'chinoise',
  'franco-chinois',
  'franco chinoise',
  '中国',
  '中法',
  '华人'
]

const ART_PATH_KEYWORDS = [
  'ecole',
  'etudes',
  'formation',
  'metier',
  'portfolio',
  'profession',
  'statut artiste',
  '工作',
  '教育',
  '留学',
  '职业'
]

const CULTURE_KEYWORDS = [
  'art',
  'artiste',
  'culture',
  'danse',
  'design',
  'exposition',
  'festival',
  'galerie',
  'museum',
  'musee',
  'musique',
  'patrimoine',
  'photographie',
  'spectacle',
  'theatre',
  '展览',
  '文化',
  '艺术'
]

export function decodeHtml(value = '') {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    hellip: '…',
    laquo: '«',
    lt: '<',
    nbsp: ' ',
    quot: '"',
    raquo: '»',
    rsquo: '’'
  }

  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&([a-z]+);/gi, (entity, key) => named[key] ?? entity)
}

export function plainText(value = '') {
  return decodeHtml(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

export function fold(value = '') {
  return plainText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function canonicalTopic(value = '') {
  return fold(value)
    .replace(/\b(l|le|la|les|un|une|des|de|du|the|a|an)\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    url.hash = ''
    for (const parameter of [...url.searchParams.keys()]) {
      if (
        parameter.toLowerCase().startsWith('utm_') ||
        TRACKING_PARAMETERS.includes(parameter.toLowerCase())
      ) {
        url.searchParams.delete(parameter)
      }
    }
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString()
  } catch {
    return null
  }
}

function attribute(tag, name) {
  const quoted = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i')
  )
  if (quoted) return decodeHtml(quoted[2])
  const bare = tag.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, 'i'))
  return bare ? decodeHtml(bare[1]) : ''
}

function metaContent(html, keys) {
  const wanted = new Set(keys.map(key => key.toLowerCase()))
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0]
    const key = (
      attribute(tag, 'property') || attribute(tag, 'name')
    ).toLowerCase()
    if (wanted.has(key)) return plainText(attribute(tag, 'content'))
  }
  return ''
}

function itemPropContent(html, key) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0]
    if (attribute(tag, 'itemprop').toLowerCase() === key.toLowerCase()) {
      return plainText(attribute(tag, 'content'))
    }
  }
  return ''
}

function microdataLocation(html) {
  const block = html.match(
    /<[^>]+itemprop=["']location["'][^>]*>([\s\S]{0,3000})/i
  )?.[1]
  if (!block) return ''
  const values = ['name', 'streetAddress', 'postalCode', 'addressLocality']
    .map(key => itemPropContent(block, key))
    .filter(Boolean)
  return [...new Set(values)].join(', ')
}

function canonicalLink(html, baseUrl) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0]
    if (attribute(tag, 'rel').toLowerCase() === 'canonical') {
      return normalizeUrl(attribute(tag, 'href'), baseUrl)
    }
  }
  return null
}

function jsonLdObjects(html) {
  const objects = []
  const scripts = html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )

  const visit = value => {
    if (!value) return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (typeof value !== 'object') return
    objects.push(value)
    if (Array.isArray(value['@graph'])) value['@graph'].forEach(visit)
  }

  for (const match of scripts) {
    try {
      visit(JSON.parse(match[1].trim()))
    } catch {
      // Malformed third-party JSON-LD is ignored; other metadata remains usable.
    }
  }
  return objects
}

function schemaType(value) {
  return (Array.isArray(value) ? value : [value])
    .filter(Boolean)
    .map(type => String(type).toLowerCase())
}

function locationText(location) {
  if (!location) return ''
  if (typeof location === 'string') return plainText(location)
  const address = location.address
  const parts = [location.name]
  if (typeof address === 'string') parts.push(address)
  if (address && typeof address === 'object') {
    parts.push(
      address.streetAddress,
      address.postalCode,
      address.addressLocality,
      address.addressCountry
    )
  }
  return parts.filter(Boolean).map(plainText).join(', ')
}

function isoDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const FRENCH_MONTHS = {
  janvier: 0,
  fevrier: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11
}

const ENGLISH_MONTHS = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11
}

function calendarDate(year, month, day) {
  return new Date(Date.UTC(Number(year), month, Number(day), 12)).toISOString()
}

function humanDates(html, title, description) {
  const text = fold(html).slice(0, 120000)
  const frenchMonths = Object.keys(FRENCH_MONTHS).join('|')
  const range = text.match(
    new RegExp(
      `(\\d{1,2})\\s+(${frenchMonths})(?:\\s+(\\d{4}))?\\s*(?:→|au|a|-|–)\\s*(\\d{1,2})\\s+(${frenchMonths})\\s+(\\d{4})`,
      'i'
    )
  )
  let startDate = null
  let endDate = null
  if (range) {
    const year = range[3] || range[6]
    startDate = calendarDate(year, FRENCH_MONTHS[range[2]], range[1])
    endDate = calendarDate(range[6], FRENCH_MONTHS[range[5]], range[4])
  }

  let deadline = null
  const opportunityText = fold(
    `${title} ${description} ${text.slice(0, 30000)}`
  )
  if (containsAny(opportunityText, OPPORTUNITY_KEYWORDS)) {
    const frenchDeadlineContext = text.match(
      new RegExp(
        `(?:date limite|candidatures?[^.]{0,50}(?:jusqu|avant)|deadline)[^.]{0,220}`,
        'i'
      )
    )?.[0]
    const frenchDates = frenchDeadlineContext
      ? [
          ...frenchDeadlineContext.matchAll(
            new RegExp(`(\\d{1,2})\\s+(${frenchMonths})\\s+(\\d{4})`, 'gi')
          )
        ].map(match =>
          calendarDate(match[3], FRENCH_MONTHS[match[2]], match[1])
        )
      : []
    if (frenchDates.length > 0) {
      deadline = frenchDates.sort().at(-1)
    } else {
      const englishMonths = Object.keys(ENGLISH_MONTHS).join('|')
      const englishDeadlineContext = text.match(/deadline[^.]{0,220}/i)?.[0]
      const englishDates = englishDeadlineContext
        ? [
            ...englishDeadlineContext.matchAll(
              new RegExp(`(\\d{1,2})\\s+(${englishMonths})\\s+(\\d{4})`, 'gi')
            )
          ].map(match =>
            calendarDate(match[3], ENGLISH_MONTHS[match[2]], match[1])
          )
        : []
      if (englishDates.length > 0) {
        deadline = englishDates.sort().at(-1)
      }
    }
  }
  return { startDate, endDate, deadline }
}

function cleanTitle(title, suffixes = []) {
  let result = plainText(title)
  for (const suffix of suffixes) {
    result = result.replace(
      new RegExp(`\\s*[|–—-]\\s*${escapeRegExp(suffix)}\\s*$`, 'i'),
      ''
    )
  }
  return result.trim()
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function extractDocumentMeta(html, pageUrl, source, fallbackTitle = '') {
  const structured = jsonLdObjects(html)
  const preferred = structured.find(item =>
    schemaType(item['@type']).some(type =>
      /(event|exhibition|jobposting|course)/.test(type)
    )
  )

  const documentTitle = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const title = cleanTitle(
    preferred?.name ||
      preferred?.headline ||
      metaContent(html, ['og:title', 'twitter:title']) ||
      documentTitle ||
      fallbackTitle,
    source.titleSuffixes
  )
  const description = plainText(
    preferred?.description ||
      metaContent(html, [
        'og:description',
        'twitter:description',
        'description'
      ])
  ).slice(0, 600)
  const fallbackDates = humanDates(html, title, description)
  const startDate = isoDate(
    preferred?.startDate ||
      metaContent(html, ['event:start_time']) ||
      itemPropContent(html, 'startDate') ||
      fallbackDates.startDate
  )
  const endDate = isoDate(
    preferred?.endDate ||
      metaContent(html, ['event:end_time']) ||
      itemPropContent(html, 'endDate') ||
      fallbackDates.endDate
  )
  const deadline = isoDate(
    preferred?.validThrough ||
      preferred?.applicationDeadline ||
      preferred?.deadline ||
      itemPropContent(html, 'validThrough') ||
      fallbackDates.deadline
  )

  return {
    title,
    description,
    canonicalUrl: canonicalLink(html, pageUrl) || normalizeUrl(pageUrl),
    startDate,
    endDate,
    deadline,
    location: locationText(preferred?.location) || microdataLocation(html),
    schemaType: preferred?.['@type'] || null
  }
}

function matchesAny(value, patterns = []) {
  return patterns.some(pattern => new RegExp(pattern, 'i').test(value))
}

export function extractSourceLinks(html, listingUrl, source) {
  const listing = new URL(listingUrl)
  const allowedHosts = new Set([
    listing.hostname,
    ...(source.allowedHosts || [])
  ])
  const seen = new Set()
  const links = []

  for (const match of html.matchAll(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  )) {
    const url = normalizeUrl(match[1], listingUrl)
    if (!url || seen.has(url) || url === normalizeUrl(listingUrl)) continue
    const parsed = new URL(url)
    if (!allowedHosts.has(parsed.hostname)) continue
    if (!matchesAny(parsed.pathname, source.includePathPatterns)) continue
    if (matchesAny(parsed.pathname, source.excludePathPatterns)) continue
    const title = plainText(match[2])
    if (title.length < 3) continue
    if (
      source.includeTitleKeywords?.length &&
      !containsAny(fold(title), source.includeTitleKeywords)
    ) {
      continue
    }
    seen.add(url)
    links.push({ url, title })
  }
  return links
}

function containsAny(text, keywords) {
  return keywords.some(keyword => {
    const normalized = fold(keyword)
    if (/[^\x00-\x7f]/.test(normalized)) return text.includes(normalized)
    return new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(normalized)}(?:$|[^\\p{L}\\p{N}])`,
      'u'
    ).test(text)
  })
}

export function classifyCandidate(candidate, source) {
  const text = fold(`${candidate.title} ${candidate.description}`)
  if (containsAny(text, OPPORTUNITY_KEYWORDS)) return '机会雷达'
  if (containsAny(text, CHINA_FRANCE_KEYWORDS)) return '中法连接'
  if (containsAny(text, ART_PATH_KEYWORDS)) return '艺术路径'
  return source.defaultColumn || '本周去看'
}

export function scoreCandidate(candidate, source, now = new Date()) {
  const text = fold(`${candidate.title} ${candidate.description}`)
  const hasOpportunityAction = containsAny(text, OPPORTUNITY_KEYWORDS)
  const isChinaFrance = containsAny(text, CHINA_FRANCE_KEYWORDS)
  const isCulture = containsAny(text, CULTURE_KEYWORDS)
  const relevantDate =
    candidate.deadline || candidate.endDate || candidate.startDate
  const date = relevantDate ? new Date(relevantDate) : null
  const dateKey =
    date && !Number.isNaN(date.getTime()) ? parisDateKey(date) : null
  const todayKey = parisDateKey(now)

  let actionability = 0
  if (candidate.startDate || candidate.deadline) actionability += 1
  if (candidate.location) actionability += 1
  if (hasOpportunityAction) actionability += 1

  let audienceRelevance = isCulture ? 1 : 0
  if (hasOpportunityAction || candidate.column === '艺术路径') {
    audienceRelevance = Math.max(audienceRelevance, 2)
  }
  if (isChinaFrance) audienceRelevance = 3

  let freshness = 1
  if (dateKey) {
    freshness = dateKey >= todayKey ? 2 : 0
  }

  const completeness = candidate.title && candidate.description ? 1 : 0
  const breakdown = {
    sourceReliability: Math.min(3, Math.max(1, source.reliabilityScore)),
    actionability: Math.min(3, actionability),
    audienceRelevance,
    freshness,
    completeness
  }

  return {
    total: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
    breakdown,
    expired: Boolean(dateKey && dateKey < todayKey)
  }
}

export function deduplicateCandidates(candidates, existingTitles = []) {
  const urlIndex = new Map()
  const topicIndex = new Map()
  const existing = new Set(existingTitles.map(canonicalTopic).filter(Boolean))

  return candidates.map(candidate => {
    const topic = canonicalTopic(candidate.title)
    const duplicate =
      urlIndex.get(candidate.url) || topicIndex.get(topic) || null
    const duplicateExisting = existing.has(topic)
    const result = {
      ...candidate,
      canonicalTopic: topic,
      duplicateOf: duplicate?.id || null,
      duplicateExisting
    }
    if (!duplicate) {
      urlIndex.set(candidate.url, result)
      if (topic) topicIndex.set(topic, result)
    }
    return result
  })
}

export function extractExistingTitles(html, archiveUrl) {
  const origin = new URL(archiveUrl).origin
  const excluded = /^\/(archive|category|tag|page|about|links)(\/|$)/i
  const titles = []
  const seen = new Set()
  for (const match of html.matchAll(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  )) {
    const url = normalizeUrl(match[1], archiveUrl)
    const title = plainText(match[2])
    if (
      !url ||
      new URL(url).origin !== origin ||
      excluded.test(new URL(url).pathname)
    ) {
      continue
    }
    if (title.length < 6 || title.length > 180) continue
    const topic = canonicalTopic(title)
    if (!topic || seen.has(topic)) continue
    seen.add(topic)
    titles.push(title)
  }
  return titles
}

export async function fetchHtml(url, request = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    request.timeoutMs || 15000
  )
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.7',
        'user-agent':
          request.userAgent ||
          'NouveauDepartEditorialResearch/1.0 (+https://nd.acmfc.fr)'
      }
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('html')) {
      throw new Error(`Unsupported content type: ${contentType || 'unknown'}`)
    }
    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

function wait(milliseconds) {
  if (!milliseconds) return Promise.resolve()
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function candidateId(url) {
  return createHash('sha256').update(url).digest('hex').slice(0, 16)
}

export async function collectSource(source, options = {}) {
  const fetcher = options.fetcher || fetchHtml
  const request = options.request || {}
  const maxItems = Math.min(
    Number(options.limitPerSource || source.maxItems || 10),
    source.maxItems || 10
  )
  const discovered = new Map()
  const errors = []

  for (const listingUrl of source.listingUrls) {
    try {
      const html = await fetcher(listingUrl, request)
      for (const link of extractSourceLinks(html, listingUrl, source)) {
        if (!discovered.has(link.url)) discovered.set(link.url, link)
      }
    } catch (error) {
      errors.push({ url: listingUrl, error: error.message })
    }
  }

  const candidates = []
  for (const link of [...discovered.values()].slice(0, maxItems)) {
    let meta = {
      title: link.title,
      description: '',
      canonicalUrl: link.url,
      startDate: null,
      endDate: null,
      deadline: null,
      location: '',
      schemaType: null
    }
    try {
      await wait(request.delayMs)
      const html = await fetcher(link.url, request)
      meta = extractDocumentMeta(html, link.url, source, link.title)
    } catch (error) {
      errors.push({ url: link.url, error: error.message })
    }

    const url = normalizeUrl(meta.canonicalUrl || link.url) || link.url
    const base = {
      id: candidateId(url),
      status: 'candidate_review',
      sourceId: source.id,
      sourceName: source.name,
      sourceRole: source.sourceRole,
      requiresPrimaryVerification: source.requiresPrimaryVerification,
      url,
      title: meta.title || link.title,
      description: meta.description,
      startDate: meta.startDate,
      endDate: meta.endDate,
      deadline: meta.deadline,
      location: meta.location,
      schemaType: meta.schemaType,
      discoveredAt: options.now?.toISOString() || new Date().toISOString()
    }
    base.column = classifyCandidate(base, source)
    const score = scoreCandidate(base, source, options.now)
    candidates.push({
      ...base,
      score: score.total,
      scoreBreakdown: score.breakdown,
      expired: score.expired
    })
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
    listingCount: source.listingUrls.length,
    discoveredCount: discovered.size,
    collectedCount: candidates.length,
    candidates,
    errors
  }
}

export async function collectAll(config, options = {}) {
  const fetcher = options.fetcher || fetchHtml
  const selectedSources = config.sources.filter(
    source => source.active && (!options.source || source.id === options.source)
  )
  if (options.source && selectedSources.length === 0) {
    throw new Error(`Unknown or inactive source: ${options.source}`)
  }

  let existingTitles = []
  let existingContentError = null
  if (!options.skipExistingCheck && config.existingContentUrl) {
    try {
      const archive = await fetcher(config.existingContentUrl, config.request)
      existingTitles = extractExistingTitles(archive, config.existingContentUrl)
    } catch (error) {
      existingContentError = error.message
    }
  }

  const sourceResults = []
  for (const source of selectedSources) {
    sourceResults.push(
      await collectSource(source, {
        fetcher,
        request: config.request,
        limitPerSource: options.limitPerSource,
        now: options.now
      })
    )
  }

  const candidates = deduplicateCandidates(
    sourceResults.flatMap(result => result.candidates),
    existingTitles
  )
  const reviewCandidates = candidates
    .filter(
      candidate =>
        !candidate.expired &&
        !candidate.duplicateOf &&
        !candidate.duplicateExisting &&
        candidate.score >= config.minimumReviewScore
    )
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'fr'))

  const excludedCandidates = candidates.filter(
    candidate => !reviewCandidates.some(review => review.id === candidate.id)
  )

  return {
    schemaVersion: 1,
    generatedAt: options.now?.toISOString() || new Date().toISOString(),
    configVersion: config.version,
    minimumReviewScore: config.minimumReviewScore,
    existingContentCheck: {
      url: config.existingContentUrl,
      titleCount: existingTitles.length,
      error: existingContentError
    },
    sourceResults: sourceResults.map(({ candidates: _, ...result }) => result),
    reviewCandidates,
    excludedCandidates,
    totals: {
      sources: selectedSources.length,
      discovered: sourceResults.reduce(
        (sum, result) => sum + result.discoveredCount,
        0
      ),
      collected: candidates.length,
      review: reviewCandidates.length,
      excluded: excludedCandidates.length,
      errors: sourceResults.reduce(
        (sum, result) => sum + result.errors.length,
        0
      )
    }
  }
}

function markdownText(value = '') {
  return plainText(String(value))
    .replace(/\\/g, '\\\\')
    .replace(/([\[\]|])/g, '\\$1')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function parisDateKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${fields.year}-${fields.month}-${fields.day}`
}

function shortDate(value) {
  return value ? parisDateKey(value) || '待核实' : '待核实'
}

export function createMarkdownReport(report) {
  const lines = [
    '# Nouveau Départ 候选内容 REVIEW',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    `本次检查 ${report.totals.sources} 个来源，发现 ${report.totals.discovered} 个链接，采集 ${report.totals.collected} 条；${report.totals.review} 条进入 REVIEW，${report.totals.excluded} 条因低分、过期或重复被排除。`,
    '',
    '> 本报告不是发布队列。日期、地点、资格、费用和截止时间必须按 REVIEW 清单核验；通过后只建立 Notion Draft。',
    ''
  ]

  if (report.existingContentCheck.error) {
    lines.push(
      `> ⚠️ 未能读取现有 archive，跨站点重复检查不完整：${markdownText(report.existingContentCheck.error)}`,
      ''
    )
  }

  for (const column of ['机会雷达', '中法连接', '本周去看', '艺术路径']) {
    const candidates = report.reviewCandidates.filter(
      candidate => candidate.column === column
    )
    if (candidates.length === 0) continue
    lines.push(`## ${column}`, '')
    lines.push(
      '| 分数 | 候选 | 来源 | 日期/截止 | 地点 | 核验 |',
      '| ---: | --- | --- | --- | --- | --- |'
    )
    for (const candidate of candidates) {
      const relevantDate =
        candidate.deadline || candidate.startDate || candidate.endDate
      lines.push(
        `| ${candidate.score} | [${markdownText(candidate.title)}](${candidate.url}) | ${markdownText(candidate.sourceName)} | ${shortDate(relevantDate)} | ${markdownText(candidate.location || '待核实')} | ${candidate.requiresPrimaryVerification ? '须回到主办方官网' : '关键字段人工复核'} |`
      )
    }
    lines.push('')
  }

  if (report.reviewCandidates.length === 0) {
    lines.push('本次没有达到 REVIEW 门槛且未重复、未过期的候选。', '')
  }

  const sourceErrors = report.sourceResults.flatMap(result =>
    result.errors.map(error => ({ source: result.sourceName, ...error }))
  )
  if (sourceErrors.length > 0) {
    lines.push('## 来源错误', '')
    for (const error of sourceErrors) {
      lines.push(
        `- ${markdownText(error.source)}：${markdownText(error.url)} — ${markdownText(error.error)}`
      )
    }
    lines.push('')
  }

  lines.push(
    '## 下一步',
    '',
    '1. 按 `docs/nd-content-system/REVIEW-CHECKLIST.md` 核验候选。',
    '2. 只有通过核验的内容才人工建立 Notion `Draft`。',
    '3. 由 Dan 决定是否把 `Draft` 改为 `Published`。',
    ''
  )
  return `${lines.join('\n')}\n`
}
