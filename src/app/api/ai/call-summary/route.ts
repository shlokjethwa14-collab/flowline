import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod/v4'
import { hasSupabaseConfig } from '@/lib/supabase/env'
import { getServerProfile } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const bodySchema = z.object({
  transcript: z.string().trim().min(20).max(120_000),
  counterparty: z.string().trim().max(160).optional(),
  /** Today, in the caller's own timezone, so relative dates resolve correctly. */
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const CallAnalysis = z.object({
  summary: z
    .string()
    .describe(
      'What happened on the call, in 3 to 6 plain sentences. Lead with what was decided or asked for. Written for the business owner to read at the end of the day.',
    ),
  commitments: z
    .array(
      z.object({
        title: z
          .string()
          .describe('The follow-up job, phrased as an instruction to a person. Under 90 characters.'),
        kind: z.enum(['meeting', 'order', 'payment', 'delivery', 'callback', 'visit', 'other']),
        due_date: z
          .string()
          .describe(
            'Resolved calendar date as YYYY-MM-DD. Resolve relative references such as "Friday", "the 28th", "next week", "month end" against the supplied today. Empty string only when no date can be reasonably inferred.',
          ),
        due_time: z.string().describe('24-hour HH:MM when a time was given or clearly implied, else empty string.'),
        certainty: z
          .enum(['stated', 'implied'])
          .describe('stated when the date was said outright; implied when you inferred it from context.'),
        quote: z.string().describe('The words from the transcript this came from, copied exactly.'),
      }),
    )
    .describe(
      'Every dated promise or expectation, from either side. Include indirect ones — "before month end", "when you are next in town", "after Diwali" — resolved to a real date.',
    ),
  intel: z
    .array(
      z.object({
        kind: z.enum(['complaint', 'praise', 'competitor', 'price', 'risk', 'opportunity', 'other']),
        note: z.string().describe('One sentence the owner can act on.'),
        quote: z.string().describe('The words from the transcript this came from, copied exactly.'),
      }),
    )
    .describe(
      'Anything about our company, our products, our people, our prices or our competitors that the owner would want to know — even when said in passing and even when it was not the point of the call.',
    ),
})

const SYSTEM = `You read recordings of business calls for a garment manufacturer in India and pull out what the owner needs to act on.

Calls are informal and often mix English with Hindi or Gujarati. People rarely state dates cleanly — they say "Friday", "the 28th", "after Diwali", "month end", "when I am next in town". Resolve every one of these into a real calendar date using the today's date you are given. If a weekday is named with no week, take the next occurrence.

Two things matter most:

1. COMMITMENTS. Any promise, expectation or plan with a date attached — theirs or ours. A visit, an order, a payment, a callback, a delivery. Capture the indirect ones too: "I have to close this by month end" is a deadline. Mark it 'implied' rather than 'stated' when you inferred the date, so the owner knows to check it.

2. WHAT WAS SAID ABOUT US. Complaints about quality, comments on our rates, mentions of what a competitor is quoting, praise, hints that business may move elsewhere. These are usually said in passing and are the easiest thing to lose. Capture them even when the call was about something else entirely.

Rules:
- Quote exactly from the transcript. Never invent a quote.
- Never invent a date. If nothing can be inferred, return an empty due_date.
- Write titles as instructions: "Call Bhavesh with the confirmed rate", not "Rate discussion".
- Plain language throughout. The reader runs a factory, not a software team.`

function empty(reason: string) {
  return {
    summary: reason,
    commitments: [],
    intel: [],
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
    return NextResponse.json({ error: 'There is not enough of the call to work from yet.' }, { status: 422 })
  }
  const { transcript, counterparty, today } = parsed.data

  // Anyone signed in may log their own calls; there is nothing admin-only here.
  if (hasSupabaseConfig()) {
    const caller = await getServerProfile()
    if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json(
      empty(
        'No AI key is configured, so the call was saved without a summary. Add ANTHROPIC_API_KEY to have calls read and summarised automatically.',
      ),
    )
  }

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 8000,
      system: SYSTEM,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: zodOutputFormat(CallAnalysis) },
      messages: [
        {
          role: 'user',
          content: [
            `Today is ${today}.`,
            counterparty ? `The call was with: ${counterparty}` : 'The other party was not named.',
            '',
            'Transcript:',
            transcript,
          ].join('\n'),
        },
      ],
    })

    const result = response.parsed_output
    if (!result) return NextResponse.json(empty('The call could not be read. The transcript has been saved as it is.'))

    return NextResponse.json({
      summary: result.summary,
      // Normalise the model's empty-string convention to nulls for the client.
      commitments: result.commitments.map((c) => ({
        ...c,
        due_date: c.due_date?.trim() ? c.due_date.trim() : null,
        due_time: c.due_time?.trim() ? c.due_time.trim() : null,
      })),
      intel: result.intel,
      ai: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.error('[ai/call-summary]', message)
    return NextResponse.json(empty('The call could not be read just now. The transcript has been saved as it is.'))
  }
}
