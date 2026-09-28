#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { autoPublicationBlockers } from './auto-publish-eligibility.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const reportPath = process.argv[2] || path.join(root, '.nd-content-reports/candidates.json')
const outputPath = process.argv[3] || path.join(root, '.nd-content-reports/auto-publication-screen.json')
const [report, config] = await Promise.all([
  readFile(reportPath, 'utf8').then(JSON.parse),
  readFile(path.join(root, 'config/nd-content-sources.json'), 'utf8').then(JSON.parse)
])
const sources = new Map(config.sources.map(source => [source.id, source]))

// The current Notion database has no source URL property. Until a complete,
// live Notion URL index is available, duplicate checks fail closed.
const screened = report.reviewCandidates.map(candidate => ({
  id: `C-${candidate.id.slice(0, 6).toUpperCase()}`,
  url: candidate.url,
  title: candidate.title,
  blockers: autoPublicationBlockers(candidate, sources.get(candidate.sourceId), {
    now: new Date(report.generatedAt)
  })
}))
const output = {
  generatedAt: report.generatedAt,
  eligible: screened.filter(item => item.blockers.length === 0),
  held: screened.filter(item => item.blockers.length > 0)
}
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(`Auto-publication screen: ${output.eligible.length} eligible; ${output.held.length} held. ${outputPath}`)
