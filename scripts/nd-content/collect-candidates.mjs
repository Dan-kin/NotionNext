#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectAll, createMarkdownReport } from './collector.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, '../..')

function parseArguments(values) {
  const options = {
    config: path.join(projectRoot, 'config/nd-content-sources.json'),
    output: path.join(projectRoot, '.nd-content-reports'),
    source: null,
    limitPerSource: null,
    skipExistingCheck: false
  }

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--config') options.config = path.resolve(values[++index])
    else if (value === '--output')
      options.output = path.resolve(values[++index])
    else if (value === '--source') options.source = values[++index]
    else if (value === '--limit-per-source') {
      options.limitPerSource = Number(values[++index])
    } else if (value === '--no-existing-check') {
      options.skipExistingCheck = true
    } else if (value === '--help') {
      console.log(`Usage: node scripts/nd-content/collect-candidates.mjs [options]

Options:
  --config <path>             Source configuration JSON
  --output <directory>        Report directory
  --source <id>               Collect one active source
  --limit-per-source <count>  Cap detail pages per source
  --no-existing-check         Skip public archive title comparison
  --help                      Show this help`)
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${value}`)
    }
  }

  if (
    options.limitPerSource !== null &&
    (!Number.isInteger(options.limitPerSource) || options.limitPerSource < 1)
  ) {
    throw new Error('--limit-per-source must be a positive integer')
  }
  return options
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const config = JSON.parse(await readFile(options.config, 'utf8'))
  const report = await collectAll(config, options)
  await mkdir(options.output, { recursive: true })
  await Promise.all([
    writeFile(
      path.join(options.output, 'candidates.json'),
      `${JSON.stringify(report, null, 2)}\n`
    ),
    writeFile(
      path.join(options.output, 'candidates.md'),
      createMarkdownReport(report)
    )
  ])

  console.log(
    `Collected ${report.totals.collected} candidates; ${report.totals.review} require REVIEW. Reports: ${options.output}`
  )
  if (
    report.totals.sources > 0 &&
    report.sourceResults.every(result => result.collectedCount === 0)
  ) {
    process.exitCode = 2
  }
}

main().catch(error => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
