import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const metadataPath = path.join(repoRoot, 'docs', 'portal-status.json')
const readmePath = path.join(repoRoot, 'README.md')
const handoverPath = path.join(repoRoot, 'docs', 'DH_PORTAL_LIVE_HANDOVER.md')

const checkMode = process.argv.includes('--check')

function loadMetadata() {
  return JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
}

function bulletList(items = []) {
  return items.map((item) => `- ${item}`).join('\n')
}

function renderLinks(items = []) {
  return items.map((item) => `- ${item}`).join('\n')
}

function renderFeatureGroups(groups = []) {
  return groups.map((group) => `### ${group.title}\n${bulletList(group.items)}\n`).join('\n')
}

function renderPhases(phases = []) {
  return phases.map((phase) => `### ${phase.title}\n${bulletList(phase.items)}\n`).join('\n')
}

function renderRoadmap(roadmap = {}) {
  return ['near_next', 'after_that', 'later']
    .filter((key) => roadmap[key])
    .map((key) => `### ${roadmap[key].title}\n${bulletList(roadmap[key].items)}\n`)
    .join('\n')
}

function renderBuildSection(project) {
  return `## Build and Run
- Install:
  \`\`\`bash
  cd ${project.local_path}
  npm install
  \`\`\`
- Run locally:
  \`\`\`bash
  npm run dev
  \`\`\`
- Production build:
  \`\`\`bash
  npm run build
  \`\`\`
- Preview build:
  \`\`\`bash
  npm run preview
  \`\`\`
`
}

function renderDeploymentSection(project) {
  return `## Deployment Notes
- Frontend deploy target: Cloudflare Pages or current portal hosting flow
- Worker deploy is separate from this repo
- Git hooks for doc auto-generation:
  \`\`\`bash
  cd ${project.local_path}
  git config core.hooksPath .githooks
  \`\`\`
- After changes, do not commit:
  - \`dist/\`
  - \`node_modules/\`

Standard push flow:
\`\`\`bash
cd ${project.local_path}
git add .
git commit -m "Describe change"
git push origin main
\`\`\`
`
}

function renderReadme(metadata) {
  const { project, stack, integrations, feature_groups, completed_phases, next_roadmap, known_cautions, supporting_docs } = metadata
  return `# ${project.display_name}

> This file is auto-generated from \`docs/portal-status.json\`. Update the metadata file, then run \`npm run docs:generate\`.

## Project
- Name: \`${project.name}\`
- Local path: \`${project.local_path}\`
- GitHub: [dhwebservices/dh-portal-v2](${project.github_url})
- Live URL: [staff.dhwebsiteservices.co.uk](${project.live_url})
- Last updated: ${project.last_updated}
- Latest release summary: ${project.latest_release_summary}

## Stack
${bulletList(stack)}

## Core Integrations
${integrations.map((item) => `- ${item.label}: ${item.path ? `\`${item.path}\`` : item.value}`).join('\n')}

## Current Live Feature Set
${renderFeatureGroups(feature_groups)}

## Build Phases Completed
${renderPhases(completed_phases)}

## Rolling Roadmap
${renderRoadmap(next_roadmap)}

${renderBuildSection(project)}
${renderDeploymentSection(project)}

## Known Cautions
${bulletList(known_cautions)}

## Supporting Docs
${renderLinks(supporting_docs)}
`
}

function renderHandover(metadata) {
  const { project, stack, integrations, feature_groups, completed_phases, next_roadmap, operational_notes, known_cautions, supporting_docs } = metadata
  return `# ${project.display_name} Live Handover

> This file is auto-generated from \`docs/portal-status.json\`. Update the metadata file, then run \`npm run docs:generate\`.

## Project
- Name: \`${project.name}\`
- Local path: \`${project.local_path}\`
- GitHub: [dhwebservices/dh-portal-v2](${project.github_url})
- Live URL: [staff.dhwebsiteservices.co.uk](${project.live_url})
- Last updated: ${project.last_updated}
- Latest release summary: ${project.latest_release_summary}

## Stack
${bulletList(stack)}

## Core Integrations
${integrations.map((item) => `- ${item.label}: ${item.path ? `\`${item.path}\`` : item.value}`).join('\n')}

## Current Live Feature Set
${renderFeatureGroups(feature_groups)}

## Build Phases Completed
${renderPhases(completed_phases)}

## Current Operational Notes
${bulletList(operational_notes)}

${renderBuildSection(project)}
${renderDeploymentSection(project)}

## Rolling Roadmap
${renderRoadmap(next_roadmap)}

## Known Cautions
${bulletList(known_cautions)}

## Supporting Docs Already In Repo
${renderLinks(supporting_docs)}
`
}

function writeIfChanged(filePath, content) {
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null
  if (current === content) {
    return false
  }
  if (checkMode) {
    throw new Error(`${path.relative(repoRoot, filePath)} is out of date. Run npm run docs:generate.`)
  }
  fs.writeFileSync(filePath, content)
  return true
}

function main() {
  const metadata = loadMetadata()
  const readme = renderReadme(metadata)
  const handover = renderHandover(metadata)
  const changed = [
    writeIfChanged(readmePath, readme),
    writeIfChanged(handoverPath, handover),
  ].filter(Boolean)

  if (checkMode) {
    console.log('Documentation is up to date.')
    return
  }

  if (changed.length) {
    console.log('Generated docs: README.md, docs/DH_PORTAL_LIVE_HANDOVER.md')
  } else {
    console.log('Docs already up to date.')
  }
}

main()
