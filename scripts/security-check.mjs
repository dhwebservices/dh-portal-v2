import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()

const ignoredDirs = new Set([
  '.git',
  'node_modules',
  'dist',
  '.wrangler',
  'coverage',
])

const scannedExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'])

const allowedDangerousHtmlFiles = new Set([
  'src/pages/ClientMgmt.jsx',
  'src/pages/MyProfile.jsx',
  'src/pages/StaffProfile.jsx',
  'src/pages/hr/HROnboarding.jsx',
])

const allowedLocalStorageFiles = new Set([
  'src/pages/Dashboard.jsx',
  'src/pages/HomeScreen.jsx',
  'src/pages/LoginPage.jsx',
  'src/pages/Search.jsx',
  'src/utils/portalPreferences.js',
])

const sensitiveStorageFiles = [
  'src/authConfig.js',
  'src/contexts/AuthContext.jsx',
  'src/utils/supabase.js',
]

const isolatedBrowserTables = [
  'audit_log',
  'email_log',
  'sms_logs',
  'microsoft_calendar_sync_jobs',
  'microsoft_calendar_connections',
  'microsoft_calendar_sync_links',
]

const secretPatterns = [
  { name: 'Stripe live secret', regex: /\bsk_live_[0-9A-Za-z]+\b/g },
  { name: 'Stripe restricted live secret', regex: /\brk_live_[0-9A-Za-z]+\b/g },
  { name: 'SendGrid API key', regex: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g },
  { name: 'Slack token', regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g },
  { name: 'Twilio auth token assignment', regex: /TWILIO_AUTH_TOKEN\s*[:=]\s*['"`][A-Za-z0-9]{24,}['"`]/g },
]

const secretAllowlistPatterns = [
  /example/i,
  /placeholder/i,
  /your[_-]?token/i,
  /process\.env/i,
  /import\.meta\.env/i,
]

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue
    const fullPath = path.join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      walk(fullPath, files)
      continue
    }
    files.push(fullPath)
  }
  return files
}

function rel(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/')
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split('\n').length
}

function formatFinding(file, line, message) {
  return `${file}:${line} ${message}`
}

const findings = []
const repoFiles = walk(rootDir)

for (const filePath of repoFiles) {
  const relativePath = rel(filePath)
  if (!scannedExtensions.has(path.extname(relativePath))) continue
  if (relativePath === 'scripts/security-check.mjs') continue
  const content = readFileSync(filePath, 'utf8')

  if (content.includes('dangerouslySetInnerHTML')) {
    if (!allowedDangerousHtmlFiles.has(relativePath)) {
      const index = content.indexOf('dangerouslySetInnerHTML')
      findings.push(formatFinding(relativePath, lineNumberAt(content, index), 'Unexpected dangerouslySetInnerHTML usage outside approved rendering files.'))
    }
  }

  if (content.includes('localStorage')) {
    if (!allowedLocalStorageFiles.has(relativePath)) {
      const index = content.indexOf('localStorage')
      findings.push(formatFinding(relativePath, lineNumberAt(content, index), 'Unexpected localStorage usage outside approved non-sensitive UI preference files.'))
    }
  }

  if (relativePath.startsWith('src/')) {
    for (const tableName of isolatedBrowserTables) {
      const directTablePattern = new RegExp(`from\\(['"\`]${tableName}['"\`]\\)`)
      const restTablePattern = new RegExp(`/rest/v1/${tableName}\\b`)
      const directMatch = content.match(directTablePattern)
      const restMatch = content.match(restTablePattern)
      if (directMatch) {
        const index = content.indexOf(directMatch[0])
        findings.push(formatFinding(relativePath, lineNumberAt(content, index), `Frontend must not access isolated table "${tableName}" directly.`))
      }
      if (restMatch) {
        const index = content.indexOf(restMatch[0])
        findings.push(formatFinding(relativePath, lineNumberAt(content, index), `Frontend must not call isolated table "${tableName}" via REST directly.`))
      }
    }
  }

  for (const pattern of secretPatterns) {
    for (const match of content.matchAll(pattern.regex)) {
      const matchedText = match[0]
      if (secretAllowlistPatterns.some((allow) => allow.test(matchedText))) continue
      findings.push(formatFinding(relativePath, lineNumberAt(content, match.index ?? 0), `Potential hardcoded secret detected (${pattern.name}).`))
    }
  }
}

for (const file of sensitiveStorageFiles) {
  const content = readFileSync(path.join(rootDir, file), 'utf8')
  if (content.includes('localStorage')) {
    findings.push(formatFinding(file, lineNumberAt(content, content.indexOf('localStorage')), 'Sensitive auth/data access file must not use localStorage.'))
  }
}

if (findings.length) {
  console.error('Security check failed:\n')
  for (const finding of findings) {
    console.error(`- ${finding}`)
  }
  process.exit(1)
}

console.log('Security check passed.')
