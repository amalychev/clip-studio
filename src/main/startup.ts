/**
 * Startup manager — runs BEFORE the main UI appears.
 *
 * Requirements on the user's machine: NOTHING (not even Python).
 *
 * What happens on first launch:
 *  1. Download uv (~15 MB one-time)   — fast Python/package manager
 *  2. uv python install 3.13          — downloads Python (~30 MB, once)
 *  3. uv venv + uv pip install        — installs all deps (torch etc.)
 *  4. Start FastAPI backend
 *
 * Subsequent launches skip steps 1-3 (already done).
 */

import { BrowserWindow } from 'electron'
import { execSync, spawn, ChildProcess, SpawnOptions } from 'child_process'
import { existsSync, mkdirSync, chmodSync, createWriteStream, renameSync } from 'fs'
import { join, dirname } from 'path'
import { homedir, platform, arch } from 'os'
import * as https from 'https'
import * as http from 'http'

// ─── Constants ────────────────────────────────────────────────────────────────

export const BACKEND_PORT = 8765
const IS_WIN = platform() === 'win32'

/** All runtime data lives under ~/.clip-studio/ */
const RUNTIME_DIR = join(homedir(), '.clip-studio', 'runtime')
const UV_DIR      = join(RUNTIME_DIR, 'uv')
const UV_BIN      = join(UV_DIR, IS_WIN ? 'uv.exe' : 'uv')
const VENV_DIR    = join(RUNTIME_DIR, 'venv')

const VENV_PYTHON = join(VENV_DIR, IS_WIN ? 'Scripts' : 'bin', IS_WIN ? 'python.exe' : 'python3')
const VENV_UVICORN = join(VENV_DIR, IS_WIN ? 'Scripts' : 'bin', IS_WIN ? 'uvicorn.exe' : 'uvicorn')

export let backendProcess: ChildProcess | null = null
export let startupState: Progress = { stage: 'init', message: 'Инициализация...', percent: 0 }
export let startupDone = false
export let startupError: string | null = null

// ─── Types ────────────────────────────────────────────────────────────────────

type Progress = { stage: string; message: string; percent: number; log?: string }
type Send = (p: Progress) => void

// ─── uv download URL ─────────────────────────────────────────────────────────

function uvDownloadUrl(): { url: string; isZip: boolean } {
  const p  = platform()
  const a  = arch()
  const base = 'https://github.com/astral-sh/uv/releases/latest/download/'

  if (p === 'darwin' && a === 'arm64') return { url: base + 'uv-aarch64-apple-darwin.tar.gz', isZip: false }
  if (p === 'darwin' && a === 'x64')   return { url: base + 'uv-x86_64-apple-darwin.tar.gz',  isZip: false }
  if (p === 'win32')                   return { url: base + 'uv-x86_64-pc-windows-msvc.zip',   isZip: true  }
  if (p === 'linux' && a === 'arm64')  return { url: base + 'uv-aarch64-unknown-linux-gnu.tar.gz', isZip: false }
  return { url: base + 'uv-x86_64-unknown-linux-gnu.tar.gz', isZip: false }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true })
}

/** Download url → destFile, resolves with final path after redirects */
function download(url: string, destFile: string, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureDir(dirname(destFile))

    const follow = (u: string) => {
      const mod = u.startsWith('https') ? https : http
      mod.get(u, { headers: { 'User-Agent': 'clip-studio/0.1' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location!)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} — ${u}`))
          return
        }

        const total = parseInt(res.headers['content-length'] || '0', 10)
        let received = 0
        const out = createWriteStream(destFile + '.tmp')

        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          if (total && onProgress) onProgress(Math.round((received / total) * 100))
        })

        res.pipe(out)
        out.on('finish', () => {
          renameSync(destFile + '.tmp', destFile)
          resolve()
        })
        out.on('error', reject)
        res.on('error', reject)
      }).on('error', reject)
    }

    follow(url)
  })
}

/** Extract tar.gz → destDir */
function extractTarGz(file: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureDir(destDir)
    const proc = spawn('tar', ['xzf', file, '-C', destDir, '--strip-components=1'], { stdio: 'pipe' })
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`tar exit ${code}`)))
    proc.on('error', reject)
  })
}

/** Extract zip (Windows) → destDir using PowerShell */
function extractZip(file: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureDir(destDir)
    const ps = `Expand-Archive -Path '${file}' -DestinationPath '${destDir}' -Force`
    const proc = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'pipe' })
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`powershell exit ${code}`)))
    proc.on('error', reject)
  })
}

function runStream(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; onLine?: (l: string) => void }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: 'pipe',
    })
    const handle = (buf: Buffer) =>
      buf.toString().split('\n').filter(l => l.trim()).forEach(l => opts.onLine?.(l))
    proc.stdout.on('data', handle)
    proc.stderr.on('data', handle)
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`)))
    proc.on('error', reject)
  })
}

async function checkHealth(): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/healthz`, res => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(2000, () => { req.destroy(); resolve(false) })
  })
}

async function waitForHealth(ms = 60000): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await checkHealth()) return true
    await new Promise(r => setTimeout(r, 700))
  }
  return false
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runStartup(backendDir: string, win: BrowserWindow): Promise<void> {
  const send: Send = (data) => {
    startupState = data
    if (!win.isDestroyed()) win.webContents.send('startup:progress', data)
  }

  startupDone = false
  startupError = null

  // Already running?
  if (await checkHealth()) {
    send({ stage: 'done', message: 'Сервер уже запущен', percent: 100 })
    startupDone = true
    return
  }

  ensureDir(RUNTIME_DIR)

  // ── 1. uv ──────────────────────────────────────────────────────────────────
  if (!existsSync(UV_BIN)) {
    const { url, isZip } = uvDownloadUrl()
    const archiveName = isZip ? 'uv.zip' : 'uv.tar.gz'
    const archivePath = join(UV_DIR, archiveName)

    send({ stage: 'uv', message: 'Загрузка uv (менеджер пакетов, ~15 MB)...', percent: 3 })

    await download(url, archivePath, pct =>
      send({ stage: 'uv', message: `Загрузка uv: ${pct}%`, percent: Math.round(3 + pct * 0.12) })
    )

    send({ stage: 'uv', message: 'Распаковка uv...', percent: 16 })
    if (isZip) {
      await extractZip(archivePath, UV_DIR)
    } else {
      await extractTarGz(archivePath, UV_DIR)
    }

    if (!IS_WIN) chmodSync(UV_BIN, 0o755)
  }

  send({ stage: 'uv', message: 'uv готов', percent: 18 })

  // ── 2. Python 3.13 ─────────────────────────────────────────────────────────
  if (!existsSync(VENV_PYTHON)) {
    send({ stage: 'python', message: 'Установка Python 3.13 (~30 MB, один раз)...', percent: 20 })

    await runStream(UV_BIN, ['python', 'install', '3.13'], {
      onLine: l => send({ stage: 'python', message: l.slice(0, 90), percent: 25, log: l }),
    })

    send({ stage: 'python', message: 'Создание виртуального окружения...', percent: 30 })
    await runStream(UV_BIN, ['venv', '--python', '3.13', VENV_DIR], {
      onLine: l => send({ stage: 'python', message: l.slice(0, 80), percent: 32, log: l }),
    })
  }

  send({ stage: 'python', message: 'Python 3.13 готов', percent: 35 })

  // ── 3. Dependencies ────────────────────────────────────────────────────────
  // Check if deps are installed (torch = heaviest, good sentinel)
  const torchOk = existsSync(join(VENV_DIR, IS_WIN ? 'Lib/site-packages/torch' : 'lib'))
    && (() => {
      try {
        execSync(`"${VENV_PYTHON}" -c "import torch"`, { stdio: 'ignore', timeout: 5000 })
        return true
      } catch { return false }
    })()

  if (!torchOk) {
    send({
      stage: 'deps',
      message: 'Установка зависимостей (PyTorch + Silero ~300 MB, один раз)...',
      percent: 37,
    })

    let depPct = 37
    await runStream(UV_BIN, ['pip', 'install', '-e', backendDir, '--python', VENV_PYTHON], {
      onLine: l => {
        depPct = Math.min(depPct + 0.2, 74)
        const msg = l.includes('Downloading') ? `⬇ ${l.slice(0, 70)}`
          : l.includes('Installing') ? `📦 ${l.slice(0, 70)}`
          : l.slice(0, 80)
        send({ stage: 'deps', message: msg, percent: Math.floor(depPct), log: l })
      },
    })
  } else {
    // Quick update — always re-sync pyproject.toml deps (catches newly added packages)
    send({ stage: 'deps', message: 'Проверка зависимостей...', percent: 37 })
    await runStream(UV_BIN, ['pip', 'install', '-e', backendDir, '--python', VENV_PYTHON], {
      onLine: l => send({ stage: 'deps', message: l.slice(0, 80), percent: 50, log: l }),
    })

    // Explicit check for optional heavy deps that may have been added after initial install
    const whisperOk = (() => {
      try {
        execSync(`"${VENV_PYTHON}" -c "import whisper"`, { stdio: 'ignore', timeout: 10000 })
        return true
      } catch { return false }
    })()
    if (!whisperOk) {
      send({ stage: 'deps', message: 'Установка Whisper (распознавание речи)...', percent: 55 })
      await runStream(UV_BIN, ['pip', 'install', 'openai-whisper', '--python', VENV_PYTHON], {
        onLine: l => send({ stage: 'deps', message: l.slice(0, 80), percent: 60, log: l }),
      })
    }
  }

  send({ stage: 'deps', message: 'Зависимости установлены', percent: 78 })

  // ── 4. ffmpeg path ─────────────────────────────────────────────────────────
  // Resolve bundled ffmpeg-static binary
  let ffmpegBin: string
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const raw: string = require('ffmpeg-static')
    // In packaged app the binary is outside the asar
    ffmpegBin = raw.includes('app.asar')
      ? raw.replace('app.asar', 'app.asar.unpacked')
      : raw
  } catch {
    ffmpegBin = 'ffmpeg' // fallback to system PATH
  }

  // ── 5. Start backend ───────────────────────────────────────────────────────
  // Kill any stale process on the port before starting
  try {
    if (IS_WIN) {
      execSync(`for /f "tokens=5" %a in ('netstat -aon ^| findstr :${BACKEND_PORT}') do taskkill /F /PID %a`, { stdio: 'ignore' })
    } else {
      execSync(`lsof -ti :${BACKEND_PORT} | xargs kill -9`, { stdio: 'ignore' })
    }
  } catch { /* no process on port — that's fine */ }

  send({ stage: 'backend', message: 'Запуск бекенда...', percent: 82 })

  const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
  backendProcess = spawn(VENV_UVICORN, [
    'main:app',
    '--port', String(BACKEND_PORT),
    '--host', '127.0.0.1',
    ...(isDev ? ['--reload'] : []),
  ], {
    cwd: backendDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      FFMPEG_BIN: ffmpegBin,
      VIRTUAL_ENV: VENV_DIR,
    },
  })

  backendProcess.stdout?.on('data', d => console.log('[backend]', d.toString().trim()))
  backendProcess.stderr?.on('data', d => console.error('[backend]', d.toString().trim()))
  backendProcess.on('exit', code => console.log('[backend] exit:', code))

  // ── 6. Health check ────────────────────────────────────────────────────────
  send({ stage: 'backend', message: 'Ожидание готовности сервера...', percent: 90 })

  const ready = await waitForHealth()
  if (!ready) {
    backendProcess.kill()
    startupError = 'Бекенд не запустился в течение 60 секунд.\nОткройте подробный лог для диагностики.'
    throw new Error(
      'Бекенд не запустился в течение 60 секунд.\n' +
      'Откройте подробный лог для диагностики.'
    )
  }

  send({ stage: 'done', message: 'Готово! Запуск приложения...', percent: 100 })
  startupDone = true
}
