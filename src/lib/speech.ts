'use client'

/**
 * Minimal typings for the Web Speech API. It is not in lib.dom, and the whole
 * point of this project is that nothing is typed `any`, so the slice we use is
 * declared here.
 */
export interface SpeechAlternative {
  transcript: string
  confidence: number
}

export interface SpeechResult {
  readonly length: number
  isFinal: boolean
  [index: number]: SpeechAlternative
}

export interface SpeechResultList {
  readonly length: number
  [index: number]: SpeechResult
}

export interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: SpeechResultList
}

export interface SpeechRecognitionErrorEventLike extends Event {
  error: string
  message: string
}

export interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionCtor
  webkitSpeechRecognition?: SpeechRecognitionCtor
}

export function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as SpeechWindow
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function speechSupported(): boolean {
  return getSpeechRecognition() !== null
}

/** Recording works everywhere modern; live transcription does not. */
export function recordingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  )
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${`${s}`.padStart(2, '0')}`
}
