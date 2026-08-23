import { execFile, spawn, ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  AntigravityRunResult,
  AntigravityStatus,
} from '../../types/editor'

const execFileAsync = promisify(execFile)
const MINIMUM_VERSION = [1, 1, 7] as const
const activeRuns = new Map<string, ChildProcessWithoutNullStreams>()
let lastKnownAccount: { accountEmail?: string; accountPlan?: string } = {}

export const DEFAULT_ANTIGRAVITY_MODELS = [
  'Gemini 3.7 Flash (High)',
  'Gemini 3.7 Flash (Medium)',
  'Gemini 3.7 Flash (Low)',
  'Gemini 3.6 Flash (High)',
  'Gemini 3.6 Flash (Medium)',
  'Gemini 3.6 Flash (Low)',
  'Gemini 3.5 Flash (High)',
  'Gemini 3.5 Flash (Medium)',
  'Gemini 3.5 Flash (Low)',
  'Gemini 3.1 Pro (High)',
  'Gemini 3.1 Pro (Low)',
  'Claude Sonnet 4.6 (Thinking)',
  'Claude Opus 4.6 (Thinking)',
  'GPT-OSS 120B (Medium)',
] as const

function accountVisibleEnvironment() {
  const environment = { ...process.env }
  delete environment.AGY_CLI_HIDE_ACCOUNT_INFO
  return environment
}

async function existingFile(candidate: string | undefined) {
  if (!candidate) return null
  try {
    await fs.access(candidate)
    return candidate
  } catch {
    return null
  }
}

export async function resolveAntigravityExecutable() {
  const configured = await existingFile(process.env.ANTIGRAVITY_CLI_PATH)
  if (configured) return configured

  const platformCandidate =
    process.platform === 'win32'
      ? await existingFile(
          process.env.LOCALAPPDATA
            ? path.join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe')
            : undefined
        )
      : await existingFile(
          process.env.HOME ? path.join(process.env.HOME, '.local', 'bin', 'agy') : undefined
        )
  if (platformCandidate) return platformCandidate

  try {
    const command = process.platform === 'win32' ? 'where.exe' : 'which'
    const { stdout } = await execFileAsync(command, ['agy'], {
      windowsHide: true,
      timeout: 5_000,
    })
    return stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null
  } catch {
    return null
  }
}

function versionNumbers(value: string) {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

function meetsMinimumVersion(value: string) {
  const version = versionNumbers(value)
  if (!version) return false
  for (let index = 0; index < MINIMUM_VERSION.length; index += 1) {
    if (version[index] > MINIMUM_VERSION[index]) return true
    if (version[index] < MINIMUM_VERSION[index]) return false
  }
  return true
}

function accountDetailsFromOutput(raw: string) {
  const parsed: Record<string, unknown>[] = []
  for (const line of raw.split(/\r?\n/)) {
    try {
      const value = JSON.parse(line)
      if (value && typeof value === 'object') parsed.push(value)
    } catch {
      // Account information can also be present in the CLI's human-readable header.
    }
  }

  const accountEmail = parsed
    .flatMap((value) => recursivelyFind(value, /^(account_?email|user_?email|email)$/i))
    .find((value): value is string =>
      typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
    )?.trim()

  const accountPlan = parsed
    .flatMap((value) => recursivelyFind(value, /^(account_?plan|plan_?tier|subscription_?tier|tier)$/i))
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim()

  const accountLines = raw
    .split(/\r?\n/)
    .filter((line) => /\b(account|signed in|email|plan|tier)\b/i.test(line))
    .join('\n')
  const bannerEmail = accountLines.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
  const bannerPlan = accountLines
    .match(/\b(?:plan|tier)\s*[:·|\-]\s*([^\n|·]+)/i)?.[1]
    ?.trim()

  return {
    accountEmail: accountEmail || bannerEmail,
    accountPlan: accountPlan || bannerPlan,
  }
}

function rememberAccount(raw: string) {
  const discovered = accountDetailsFromOutput(raw)
  if (discovered.accountEmail || discovered.accountPlan) {
    lastKnownAccount = { ...lastKnownAccount, ...discovered }
  }
  return lastKnownAccount
}

export async function getAntigravityStatus(): Promise<AntigravityStatus> {
  const executablePath = await resolveAntigravityExecutable()
  if (!executablePath) {
    return {
      installed: false,
      minimumVersionMet: false,
      authOwner: 'system-keyring',
      models: [...DEFAULT_ANTIGRAVITY_MODELS],
      message: 'Install Antigravity CLI 1.1.7 or newer to use agent chat.',
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync(executablePath, ['--version'], {
      windowsHide: true,
      timeout: 8_000,
      env: accountVisibleEnvironment(),
    })
    const version = `${stdout}\n${stderr}`.trim()
    rememberAccount(version)
    const minimumVersionMet = meetsMinimumVersion(version)
    return {
      installed: true,
      executablePath,
      version,
      ...lastKnownAccount,
      minimumVersionMet,
      authOwner: 'system-keyring',
      models: [...DEFAULT_ANTIGRAVITY_MODELS],
      message: minimumVersionMet
        ? 'OAuth is managed by Antigravity CLI and your system keyring.'
        : 'Update Antigravity CLI to 1.1.7 or newer for structured headless output.',
    }
  } catch (error) {
    return {
      installed: true,
      executablePath,
      ...lastKnownAccount,
      minimumVersionMet: false,
      authOwner: 'system-keyring',
      models: [...DEFAULT_ANTIGRAVITY_MODELS],
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function launchAntigravityLogin() {
  const executablePath = await resolveAntigravityExecutable()
  if (!executablePath) throw new Error('Antigravity CLI is not installed.')

  const child = spawn(executablePath, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    env: accountVisibleEnvironment(),
  })
  child.unref()
}

function recursivelyFind(
  value: unknown,
  keyPattern: RegExp,
  results: unknown[] = []
): unknown[] {
  if (!value || typeof value !== 'object') return results
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (keyPattern.test(key)) results.push(nested)
    if (nested && typeof nested === 'object') recursivelyFind(nested, keyPattern, results)
  }
  return results
}

function extractErrorMessage(stdout: string, stderr: string): string {
  const trimmedStderr = stderr.trim()
  if (trimmedStderr) return trimmedStderr

  for (const line of stdout.split(/\r?\n/).reverse()) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed?.result?.error && typeof parsed.result.error === 'string') {
        return parsed.result.error
      }
      if (parsed?.error?.message && typeof parsed.error.message === 'string') {
        return parsed.error.message
      }
      if (parsed?.error && typeof parsed.error === 'string') {
        return parsed.error
      }
      if (parsed?.message && typeof parsed.message === 'string') {
        return parsed.message
      }
    } catch {
      // Line is not JSON
    }
  }

  return (
    stdout.trim() ||
    'Antigravity stopped before producing a response. Sign in from Connect and try again.'
  )
}

function parseHeadlessOutput(raw: string): AntigravityRunResult {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim())
  const parsed: Record<string, unknown>[] = []
  const plain: string[] = []

  for (const line of lines) {
    try {
      const value = JSON.parse(line)
      if (value && typeof value === 'object') parsed.push(value)
    } catch {
      plain.push(line)
    }
  }

  const conversationId = parsed
    .flatMap((value) => recursivelyFind(value, /^(conversation_?id|session_?id)$/i))
    .find((value): value is string => typeof value === 'string' && value.length > 4)

  const usageValue = parsed
    .flatMap((value) => recursivelyFind(value, /^usage$/i))
    .find((value): value is Record<string, number> => Boolean(value && typeof value === 'object'))

  const finalTexts: string[] = []
  const deltaTexts: string[] = []
  for (const event of parsed) {
    const type = String(event.type || event.event || '').toLowerCase()
    const role = String(event.role || '').toLowerCase()
    const textValues = recursivelyFind(event, /^(text|content|result|response|output)$/i)
      .filter((value): value is string => typeof value === 'string')
    if (type.includes('result') || type.includes('final') || role === 'assistant') {
      finalTexts.push(...textValues)
    } else if (type.includes('delta') || type.includes('message')) {
      deltaTexts.push(...textValues)
    }
  }

  const text =
    [...finalTexts].reverse().find((value) => value.trim().length > 0) ||
    deltaTexts.join('') ||
    plain.join('\n') ||
    raw.trim()

  return {
    text: text.trim(),
    conversationId,
    usage: usageValue,
    ...rememberAccount(raw),
  }
}

export async function runAntigravity(
  requestId: string,
  prompt: string,
  cwd: string,
  conversationId: string | undefined,
  onChunk: (stream: 'stdout' | 'stderr', chunk: string) => void,
  model?: string
) {
  if (activeRuns.has(requestId)) throw new Error('This Antigravity request is already running.')
  if (!prompt.trim()) throw new Error('Prompt cannot be empty.')
  if (prompt.length > 120_000) throw new Error('Prompt is too large for a desktop agent turn.')

  const status = await getAntigravityStatus()
  if (!status.installed || !status.executablePath) throw new Error(status.message)
  if (!status.minimumVersionMet) throw new Error(status.message)

  const args = [
    '--dangerously-skip-permissions',
    '--print',
    prompt,
    '--output-format',
    'stream-json',
    '--print-timeout',
    '20m',
  ]
  if (conversationId) args.push('--conversation', conversationId)
  if (model?.trim()) args.push('--model', model.trim())

  return await new Promise<AntigravityRunResult>((resolve, reject) => {
    const child = spawn(status.executablePath!, args, {
      cwd,
      windowsHide: true,
      env: accountVisibleEnvironment(),
    })
    activeRuns.set(requestId, child)
    let stdout = ''
    let stderr = ''

    const timeout = setTimeout(() => child.kill(), 20 * 60 * 1_000)
    let sawInitPermissionMode = false
    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString('utf8')
      if (!sawInitPermissionMode && chunk.includes('"event":"init"')) {
        sawInitPermissionMode = true
        const match = chunk.match(/"permission_mode":"([^"]+)"/)
        if (match && match[1] !== 'always-proceed') {
          console.warn(
            `[antigravity] CLI started with permission_mode "${match[1]}"; ` +
              'expected "always-proceed". Tool permission denials will abort headless runs.'
          )
        }
      }
      stdout += chunk
      onChunk('stdout', chunk)
    })
    child.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString('utf8')
      stderr += chunk
      onChunk('stderr', chunk)
    })
    child.once('error', (error) => {
      clearTimeout(timeout)
      activeRuns.delete(requestId)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      activeRuns.delete(requestId)
      rememberAccount(`${stdout}\n${stderr}`)
      if (code !== 0) {
        reject(new Error(extractErrorMessage(stdout, stderr)))
        return
      }
      resolve(parseHeadlessOutput(stdout))
    })
  })
}

export function cancelAntigravity(requestId: string) {
  const child = activeRuns.get(requestId)
  if (!child) return false
  child.kill()
  activeRuns.delete(requestId)
  return true
}
