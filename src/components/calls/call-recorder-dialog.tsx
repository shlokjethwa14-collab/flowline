'use client'

import {
  AlertTriangle,
  BadgeIndianRupee,
  CalendarPlus,
  CheckCircle2,
  Loader2,
  Mic,
  Play,
  Save,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAiStatus } from '@/hooks/use-ai-status'
import { toast } from 'sonner'
import { PersonAvatar } from '@/components/shared/person-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentUser } from '@/hooks/use-flowline'
import { useAnalyseCall, useProfiles, useSaveCall } from '@/lib/data/queries'
import {
  formatDuration,
  getSpeechRecognition,
  recordingSupported,
  speechSupported,
  type SpeechRecognitionErrorEventLike,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
} from '@/lib/speech'
import type { CallCommitment, CallIntel } from '@/lib/types'
import { cn, formatDate, uid } from '@/lib/utils'

const INTEL_ICONS: Record<CallIntel['kind'], typeof ThumbsUp> = {
  complaint: ThumbsDown,
  praise: ThumbsUp,
  competitor: Users,
  price: BadgeIndianRupee,
  risk: AlertTriangle,
  opportunity: TrendingUp,
  other: Sparkles,
}

const INTEL_TONE: Record<CallIntel['kind'], string> = {
  complaint: 'danger',
  praise: 'success',
  competitor: 'warning',
  price: 'warning',
  risk: 'danger',
  opportunity: 'primary',
  other: 'default',
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Set when the call is being logged against a specific task. */
  taskId?: string | null
  defaultCounterparty?: string
}

/**
 * Record a call, get it read back as a summary, and have every dated promise
 * inside it turned into real work on the right day.
 *
 * Live transcription uses the browser's own speech engine where available
 * (Chrome and Edge). Elsewhere — and whenever it mishears — the transcript is
 * a plain editable box, because a wrong transcript quietly producing wrong
 * tasks is worse than typing it out.
 */
/**
 * Keying the body on `open` makes React throw the previous instance away, so
 * every fresh recording starts from clean state without an effect resetting
 * a dozen values by hand.
 */
export function CallRecorderDialog(props: Props) {
  return <CallRecorderBody key={props.open ? 'open' : 'closed'} {...props} />
}

function CallRecorderBody({ open, onOpenChange, taskId = null, defaultCounterparty = '' }: Props) {
  const { profile } = useCurrentUser()
  const { data: profiles } = useProfiles()
  const analyse = useAnalyseCall()
  const save = useSaveCall()

  const [counterparty, setCounterparty] = useState(defaultCounterparty)
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [listening, setListening] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [summary, setSummary] = useState('')
  const [commitments, setCommitments] = useState<CallCommitment[]>([])
  const [intel, setIntel] = useState<CallIntel[]>([])
  const [keep, setKeep] = useState<Record<string, boolean>>({})
  const [assignTo, setAssignTo] = useState<string>('')
  const [analysed, setAnalysed] = useState(false)
  const [analyseError, setAnalyseError] = useState<string | null>(null)
  const ai = useAiStatus()

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)

  const canRecord = recordingSupported()
  const canTranscribe = speechSupported()

  const stopEverything = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    setListening(false)
    setInterim('')
  }, [])

  /**
   * Releasing the microphone on unmount is the only cleanup needed. The body
   * is keyed on `open`, so closing the dialog discards this instance and
   * runs this cleanup — no separate effect watching `open`, and no cascade
   * of setState calls resetting a dozen values by hand.
   */
  useEffect(() => stopEverything, [stopEverything])

  async function startListening() {
    try {
      // Asking for the mic gives the recording indicator and the duration,
      // even when the speech engine is unavailable.
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      toast.error('Microphone permission was refused.', {
        description: 'You can still type or paste what was said below.',
      })
      return
    }

    setListening(true)
    setSeconds(0)
    timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)

    const Recognition = getSpeechRecognition()
    if (!Recognition) {
      toast.info('This browser cannot transcribe automatically.', {
        description: 'The call is being timed — type the important parts below as you go.',
      })
      return
    }

    const recognition = new Recognition()
    recognition.lang = 'en-IN'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let settled = ''
      let pending = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) settled += `${text} `
        else pending += text
      }
      if (settled) setTranscript((prev) => (prev ? `${prev} ${settled.trim()}` : settled.trim()))
      setInterim(pending)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      toast.error('Transcription stopped.', { description: 'Whatever was captured is kept — carry on typing.' })
    }

    // Chrome ends the session periodically; restart while still recording.
    recognition.onend = () => {
      if (recognitionRef.current) {
        try {
          recognition.start()
        } catch {
          // Already restarting — nothing to do.
        }
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  function onAnalyse() {
    const text = transcript.trim()
    if (text.length < 20) {
      toast.error('There is not enough of the call to read yet.')
      return
    }
    stopEverything()
    analyse.mutate(
      { transcript: text, counterparty: counterparty.trim() },
      {
        onSuccess: (result) => {
          setSummary(result.summary)
          const withIds: CallCommitment[] = result.commitments.map((c) => ({
            id: uid(),
            title: c.title,
            kind: c.kind,
            due_date: c.due_date,
            due_time: c.due_time,
            certainty: c.certainty,
            quote: c.quote,
            task_id: null,
          }))
          setCommitments(withIds)
          setIntel(result.intel.map((i) => ({ id: uid(), kind: i.kind, note: i.note, quote: i.quote })))
          // Everything dated is kept by default — that is the "automatic"
          // part. Unticking is the escape hatch, not the default path.
          setKeep(Object.fromEntries(withIds.map((c) => [c.id, Boolean(c.due_date)])))
          setAnalysed(true)
          setAnalyseError(null)
          if (!result.ai) {
            toast.info('Saved without a summary.', { description: result.summary })
          }
        },
        /*
         * Without this the dialog was a dead end: a failed read left
         * `analysed` false, Save was gated on `analysed`, and the only way
         * out of a dialog holding a real transcript was to discard it.
         *
         * The failure is now shown in place with a retry, and Save no longer
         * depends on the AI at all — see its disabled condition below.
         */
        onError: (error) => {
          setAnalyseError(error instanceof Error ? error.message : 'The call could not be read.')
        },
      },
    )
  }

  const kept = useMemo(() => commitments.filter((c) => keep[c.id] && c.due_date), [commitments, keep])

  function onSave() {
    save.mutate(
      {
        task_id: taskId,
        counterparty: counterparty.trim() || 'Unnamed caller',
        duration_seconds: seconds > 0 ? seconds : null,
        transcript: transcript.trim(),
        summary: summary.trim() || 'No summary was written for this call.',
        commitments: kept,
        intel,
        assign_to: assignTo || null,
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  function updateCommitment(id: string, patch: Partial<CallCommitment>) {
    setCommitments((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-primary" />
            Record a call
          </DialogTitle>
          <DialogDescription>
            Record or paste what was said. Flowline writes the summary, finds every date that was promised, and puts
            the follow-up work on the calendar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="call-who">Who was the call with?</Label>
              <Input
                id="call-who"
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                placeholder="Sunrise Garments — Mr. Bhavesh"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="call-assign">Follow-up work goes to</Label>
              <Select value={assignTo} onValueChange={setAssignTo}>
                <SelectTrigger id="call-assign">
                  <SelectValue placeholder="Choose a teammate" />
                </SelectTrigger>
                <SelectContent>
                  {(profiles ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* --- Capture ------------------------------------------- */}
          <div className="glass-panel space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
              {listening ? (
                <Button variant="destructive" onClick={stopEverything} className="gap-2">
                  <Square className="!size-3.5" />
                  Stop
                </Button>
              ) : (
                <Button variant="glass" onClick={startListening} disabled={!canRecord} className="gap-2">
                  <Mic className={cn(canRecord && 'text-red-500')} />
                  {seconds > 0 ? 'Record more' : 'Start recording'}
                </Button>
              )}

              {listening && (
                <span className="inline-flex items-center gap-2 text-[13px] font-medium text-red-600">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                  </span>
                  Listening · {formatDuration(seconds)}
                </span>
              )}

              {!listening && seconds > 0 && (
                <Badge variant="outline">
                  <Play className="h-3 w-3" />
                  {formatDuration(seconds)} captured
                </Badge>
              )}

              <span className="ml-auto text-[11.5px] text-zinc-400">
                {canTranscribe
                  ? 'Speech is transcribed as you go — correct anything it mishears.'
                  : 'This browser cannot transcribe; type or paste below.'}
              </span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="call-transcript" className="sr-only">
                What was said
              </Label>
              <Textarea
                id="call-transcript"
                value={interim ? `${transcript} ${interim}`.trim() : transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder={
                  'Speak, or type what was said.\n\nBhavesh: We need 240 pieces again, same sizes.\nArjun: Same rate as last time?\nBhavesh: Krishna is quoting me 360. And I am coming on the 28th, around 11.'
                }
                className="min-h-[150px] text-[13px] leading-relaxed"
              />
              <p className="text-[11.5px] text-zinc-400">
                Dates said in passing count too — “Friday”, “the 28th”, “before month end” all become real work.
              </p>
            </div>

            <div className="space-y-2">
              <Button
                onClick={onAnalyse}
                disabled={
                  analyse.isPending || transcript.trim().length < 20 || ai.state !== 'ready'
                }
                aria-describedby={ai.state === 'unavailable' ? 'ai-unavailable' : undefined}
                className="gap-2"
              >
                {analyse.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {analyse.isPending ? 'Reading the call…' : 'Read the call'}
              </Button>

              {/* Said before the button is pressed, not after. The old flow
                  let someone dictate a whole call and only then discover
                  there was no server to read it. */}
              {ai.state === 'unavailable' && (
                <p id="ai-unavailable" className="text-[12px] leading-relaxed text-ink-muted">
                  <span className="font-medium text-ink">Reading calls is turned off. </span>
                  {ai.reason} {ai.fix}
                  <br />
                  You can still write the summary yourself below and save the call.
                </p>
              )}

              {analyseError && (
                <div
                  role="alert"
                  className="surface rounded-2xl p-3 text-[12.5px] leading-relaxed text-ink-muted"
                >
                  <p className="font-medium text-ink">The call could not be read.</p>
                  <p className="mt-0.5">{analyseError}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="glass" onClick={onAnalyse} disabled={analyse.isPending}>
                      Try again
                    </Button>
                    <Button
                      size="sm"
                      variant="glass"
                      onClick={() => {
                        setAnalyseError(null)
                        setAnalysed(true)
                      }}
                    >
                      Write it myself
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* --- Result -------------------------------------------- */}
          {/* Also shown after "Write it myself", so the summary box and the
              follow-up list stay reachable without the AI. */}
          {analysed && (
            <div className="space-y-5">
              <Separator />

              <section className="space-y-2">
                <Label htmlFor="call-summary">Summary</Label>
                <Textarea
                  id="call-summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="min-h-[110px] text-[13px] leading-relaxed"
                />
              </section>

              <section className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Promises with a date
                  </h3>
                  <Badge variant={kept.length > 0 ? 'primary' : 'outline'}>
                    {kept.length} will be scheduled
                  </Badge>
                </div>

                {commitments.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-4 text-center text-[12.5px] text-zinc-400">
                    Nothing with a date was promised on this call.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {commitments.map((c) => (
                      <li key={c.id} className="glass-panel p-3.5">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={Boolean(keep[c.id])}
                            disabled={!c.due_date}
                            onCheckedChange={(v) => setKeep((k) => ({ ...k, [c.id]: v === true }))}
                            className="mt-0.5"
                            aria-label={`Schedule: ${c.title}`}
                          />
                          <div className="min-w-0 flex-1 space-y-2">
                            <Input
                              value={c.title}
                              onChange={(e) => updateCommitment(c.id, { title: e.target.value })}
                              className="h-9 text-[13px] font-medium"
                              aria-label="Follow-up job"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                type="date"
                                value={c.due_date ?? ''}
                                onChange={(e) =>
                                  updateCommitment(c.id, { due_date: e.target.value || null })
                                }
                                className="h-8 w-[150px] text-[12.5px]"
                                aria-label="Date"
                              />
                              <Input
                                type="time"
                                value={c.due_time ?? ''}
                                onChange={(e) => updateCommitment(c.id, { due_time: e.target.value || null })}
                                className="h-8 w-[110px] text-[12.5px]"
                                aria-label="Time"
                              />
                              <Badge variant={c.certainty === 'stated' ? 'success' : 'warning'}>
                                {c.certainty === 'stated' ? 'said outright' : 'worked out from context'}
                              </Badge>
                              {c.due_date && (
                                <Badge variant="outline">
                                  <CalendarPlus className="h-3 w-3" />
                                  {formatDate(`${c.due_date}T12:00:00`)}
                                </Badge>
                              )}
                            </div>
                            <p className="border-l-2 border-primary/25 pl-2.5 text-[12px] italic leading-relaxed text-zinc-500">
                              “{c.quote}”
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  What was said about us
                </h3>
                {intel.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-4 text-center text-[12.5px] text-zinc-400">
                    Nothing was said about our work, prices or competitors.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {intel.map((i) => {
                      const Icon = INTEL_ICONS[i.kind]
                      return (
                        <li key={i.id} className="glass-panel flex items-start gap-3 p-3.5">
                          <Badge variant={INTEL_TONE[i.kind] as 'default'} className="mt-0.5 shrink-0 capitalize">
                            <Icon className="h-3 w-3" />
                            {i.kind}
                          </Badge>
                          <div className="min-w-0">
                            <p className="text-[13px] leading-relaxed text-zinc-700">{i.note}</p>
                            <p className="mt-1 text-[11.5px] italic text-zinc-400">“{i.quote}”</p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="glass" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {/* Gated on there being something to save, never on the AI having
              succeeded. A call that was recorded is worth keeping whether or
              not a model was available to read it. */}
          <Button
            onClick={onSave}
            disabled={save.isPending || transcript.trim().length === 0}
            className="gap-2"
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Save call
            {kept.length > 0 && ` · schedule ${kept.length}`}
          </Button>
        </DialogFooter>

        {profile && (
          <p className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <PersonAvatar profile={profile} className="h-4 w-4" />
            Logged by {profile.full_name}
            <CheckCircle2 className="ml-1 h-3 w-3 text-emerald-500" />
            Kept on this device only until you save
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
