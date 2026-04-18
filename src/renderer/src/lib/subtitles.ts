import type { SubtitleEntry, SubtitleWord } from '../types'

const WORD_RE = /[^\s.,!?;:()"«»]+/gu

interface SubtitleToken {
  text: string
  isWord: boolean
  wordIndex: number | null
}

export function splitSubtitleTokens(text: string): SubtitleToken[] {
  const tokens: SubtitleToken[] = []
  let lastIndex = 0
  let wordIndex = 0

  for (const match of text.matchAll(WORD_RE)) {
    const start = match.index ?? 0
    const token = match[0]
    if (start > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, start), isWord: false, wordIndex: null })
    }
    tokens.push({ text: token, isWord: true, wordIndex })
    wordIndex += 1
    lastIndex = start + token.length
  }

  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex), isWord: false, wordIndex: null })
  }

  if (tokens.length === 0) {
    tokens.push({ text, isWord: false, wordIndex: null })
  }

  return tokens
}

export function buildSubtitleWordTimings(text: string, startTime: number, endTime: number): SubtitleWord[] {
  const tokens = splitSubtitleTokens(text)
  const words = tokens.filter((token) => token.isWord)
  if (words.length === 0) return []

  const totalDuration = Math.max(endTime - startTime, 0)
  const weightedLength = words.reduce((sum, word) => sum + Math.max(word.text.length, 1), 0)
  let cursor = startTime

  return words.map((word, index) => {
    const remaining = endTime - cursor
    const duration = index === words.length - 1
      ? Math.max(remaining, 0)
      : totalDuration * (Math.max(word.text.length, 1) / Math.max(weightedLength, 1))
    const nextCursor = Math.min(endTime, cursor + duration)
    const result = {
      text: word.text,
      startTime: Number(cursor.toFixed(3)),
      endTime: Number(nextCursor.toFixed(3)),
    }
    cursor = nextCursor
    return result
  })
}

export function normalizeSubtitleEntry(entry: SubtitleEntry): SubtitleEntry {
  return {
    ...entry,
    words: buildSubtitleWordTimings(entry.text, entry.startTime, entry.endTime),
  }
}

export function getActiveSubtitleWordIndex(subtitle: SubtitleEntry | null, time: number): number {
  if (!subtitle?.words?.length) return -1
  return subtitle.words.findIndex((word, index) => {
    if (index === subtitle.words!.length - 1) {
      return time >= word.startTime && time <= word.endTime
    }
    return time >= word.startTime && time < word.endTime
  })
}
