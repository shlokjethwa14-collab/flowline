import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { NextResponse, type NextRequest } from 'next/server'
// The SDK's zodOutputFormat helper is built against Zod 4, which zod@3.25
// ships under this subpath. The rest of the app stays on the v3 entry point.
import { z } from 'zod/v4'
import { checklistTemplate, taskTypeMeta } from '@/lib/task-meta'
import { hasSupabaseConfig } from '@/lib/supabase/env'
import { getServerProfile } from '@/lib/supabase/server'
import { TASK_TYPE_VALUES } from '@/lib/validators'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const bodySchema = z.object({
  title: z.string().trim().min(3).max(200),
  task_type: z.enum(TASK_TYPE_VALUES),
})

/** What we ask Claude for, and what we are willing to accept back. */
const DraftSchema = z.object({
  sop: z
    .string()
    .describe(
      'The standing procedure, as 3 to 6 numbered lines separated by newlines. Each line is one concrete action a person can follow without asking anyone.',
    ),
  checklist: z
    .array(z.string())
    .min(2)
    .max(6)
    .describe('Short tick-off steps, 3 to 5 words each, in the order they happen.'),
  estimated_minutes: z.number().int().min(5).max(600).describe('Realistic minutes for one person to finish this.'),
})

const SYSTEM = `You write standard operating procedures for a garment manufacturing and wholesale business in India.

The people reading these are skilled at their jobs but are not office workers. Write the way a good supervisor speaks:

- Plain, direct sentences. No business jargon, no management language.
- Every line is a concrete action, not a principle. "Count the cartons twice" not "ensure accuracy".
- Say what to check and when to stop, not just what to do.
- Never invent company-specific facts: no names, rates, phone numbers, or supplier names.
- Assume the reader has the relevant register, ledger or sheet in front of them.

Keep it to what actually matters. A procedure nobody reads is worse than none.`

/** Used when no API key is configured, so the button always does something. */
function localFallback(title: string, taskType: (typeof TASK_TYPE_VALUES)[number]) {
  const meta = taskTypeMeta(taskType)
  const steps = checklistTemplate(taskType).map((c) => c.label)
  return {
    sop: [
      `1. Before you start, check you have everything you need for: ${title}.`,
      `2. ${steps[0] ?? 'Begin the work'}.`,
      `3. ${steps[1] ?? 'Finish the work'}, and check it before moving on.`,
      `4. ${steps[2] ?? 'Record the outcome'} the same day — anything not written down did not happen.`,
    ].join('\n'),
    checklist: steps,
    estimated_minutes: meta.value === 'call' ? 20 : meta.value === 'meeting' ? 60 : 45,
    ai: false,
  }
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'That request could not be read.' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Give the job a name first.' }, { status: 422 })
  }
  const { title, task_type: taskType } = parsed.data

  // Only the owner creates work, so only the owner can spend tokens here.
  // In demo mode there is no session to check and no key to spend.
  if (hasSupabaseConfig()) {
    const caller = await getServerProfile()
    if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
    if (caller.role !== 'admin') {
      return NextResponse.json({ error: 'Only the owner can draft procedures.' }, { status: 403 })
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    // No key configured — hand back a usable local draft rather than an error.
    return NextResponse.json(localFallback(title, taskType))
  }

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 4000,
      system: SYSTEM,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'low',
        format: zodOutputFormat(DraftSchema),
      },
      messages: [
        {
          role: 'user',
          content: `Write the procedure for this job.\n\nJob: ${title}\nKind of work: ${taskTypeMeta(taskType).label}`,
        },
      ],
    })

    const draft = response.parsed_output
    if (!draft) {
      return NextResponse.json(localFallback(title, taskType))
    }

    return NextResponse.json({ ...draft, ai: true })
  } catch (error) {
    // A model outage must never block someone from assigning work.
    const message = error instanceof Error ? error.message : 'unknown error'
    console.error('[ai/draft] falling back to local template:', message)
    return NextResponse.json(localFallback(title, taskType))
  }
}
