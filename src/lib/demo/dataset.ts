import type {
  ActivityLog,
  CallLog,
  ChecklistItem,
  Profile,
  Task,
  TaskCategory,
  TaskHandoff,
  TaskRoutine,
} from '@/lib/types'
import { addDaysKey, toDayKey, todayKey } from '@/lib/utils'

export interface DemoDataset {
  profiles: Profile[]
  categories: TaskCategory[]
  tasks: Task[]
  activity: ActivityLog[]
  handoffs: TaskHandoff[]
  routines: TaskRoutine[]
  calls: CallLog[]
}

/** Seeds omit the fields that get sensible defaults, to keep this file readable. */
type SeedTask = Omit<
  Task,
  'sop' | 'estimated_minutes' | 'category_id' | 'horizon' | 'original_due_date' | 'rollover_count' | 'call_log_id'
> &
  Partial<
    Pick<
      Task,
      'sop' | 'estimated_minutes' | 'category_id' | 'horizon' | 'original_due_date' | 'rollover_count' | 'call_log_id'
    >
  >

/** An instant `dayOffset` days from today at local wall-clock `time`. */
function at(dayOffset: number, time: string): string {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  const [h, m] = time.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

function check(prefix: string, items: Array<[string, boolean]>): ChecklistItem[] {
  return items.map(([label, done], i) => ({ id: `${prefix}-c${i + 1}`, label, done }))
}

export const DEMO_OWNER_ID = 'p-rajesh'
export const DEMO_EMPLOYEE_ID = 'p-arjun'

const PROFILES: Profile[] = [
  {
    id: DEMO_OWNER_ID,
    role: 'admin',
    full_name: 'Rajesh Mehta',
    job_title: 'Owner',
    reports_to: null,
    created_at: at(-400, '09:00'),
  },
  {
    // A second owner. Family firms usually have more than one — the chart
    // supports any number of people with nobody above them.
    id: 'p-anil',
    role: 'admin',
    full_name: 'Anil Mehta',
    job_title: 'Managing Partner',
    reports_to: null,
    created_at: at(-395, '09:00'),
  },
  {
    id: 'p-priya',
    role: 'admin',
    full_name: 'Priya Shah',
    job_title: 'Production Manager',
    reports_to: DEMO_OWNER_ID,
    created_at: at(-380, '09:00'),
  },
  {
    id: 'p-neha',
    role: 'employee',
    full_name: 'Neha Kulkarni',
    job_title: 'Sales Manager',
    reports_to: DEMO_OWNER_ID,
    created_at: at(-370, '09:00'),
  },
  {
    id: 'p-vikram',
    role: 'employee',
    full_name: 'Vikram Rao',
    job_title: 'Accounts Manager',
    reports_to: 'p-anil',
    created_at: at(-360, '09:00'),
  },
  {
    id: 'p-imran',
    role: 'employee',
    full_name: 'Imran Qureshi',
    job_title: 'Cutting Master',
    reports_to: 'p-priya',
    created_at: at(-320, '09:00'),
  },
  {
    id: 'p-kavita',
    role: 'employee',
    full_name: 'Kavita Patil',
    job_title: 'Stock Coordinator',
    reports_to: 'p-priya',
    created_at: at(-300, '09:00'),
  },
  {
    id: 'p-suresh',
    role: 'employee',
    full_name: 'Suresh Yadav',
    job_title: 'Dyeing & Dispatch In-charge',
    reports_to: 'p-priya',
    created_at: at(-280, '09:00'),
  },
  {
    id: DEMO_EMPLOYEE_ID,
    role: 'employee',
    full_name: 'Arjun Desai',
    job_title: 'Sales Executive',
    reports_to: 'p-neha',
    created_at: at(-260, '09:00'),
  },
  {
    id: 'p-farida',
    role: 'employee',
    full_name: 'Farida Sheikh',
    job_title: 'Sales Executive',
    reports_to: 'p-neha',
    created_at: at(-240, '09:00'),
  },
  {
    id: 'p-meena',
    role: 'employee',
    full_name: 'Meena Joshi',
    job_title: 'Data Entry Operator',
    reports_to: 'p-vikram',
    created_at: at(-200, '09:00'),
  },
]

function buildCategories(): TaskCategory[] {
  return [
    {
      id: 'c-dispatch',
      name: 'Dispatch run',
      base_type: 'order',
      color: 'orange',
      icon: 'truck',
      checklist: check('c-dispatch', [
        ['Confirm the vehicle and driver', false],
        ['Load and count the cartons', false],
        ['Take the challan number', false],
      ]),
      sop: [
        '1. Check the lot is finished and passed before booking a vehicle.',
        '2. Count cartons twice — once at the table, once at the gate.',
        '3. Photograph the loaded vehicle before it leaves.',
        '4. Write the challan number into the dispatch register the same day.',
        '5. Message the customer the vehicle number and expected arrival.',
      ].join('\n'),
      estimated_minutes: 90,
      active: true,
      created_by: DEMO_OWNER_ID,
      created_at: at(-90, '09:00'),
    },
    {
      id: 'c-factory-visit',
      name: 'Factory visit',
      base_type: 'meeting',
      color: 'cyan',
      icon: 'factory',
      checklist: check('c-factory-visit', [
        ['Agree the time with the unit', false],
        ['Walk the floor and check quality', false],
        ['Write down what was agreed', false],
      ]),
      sop: [
        '1. Call ahead so the supervisor is on the floor when you arrive.',
        '2. Check three pieces at random from each running lot.',
        '3. Raise any quality problem there and then, not by phone afterwards.',
        '4. Note the agreed fix and the date it will be done by.',
      ].join('\n'),
      estimated_minutes: 150,
      active: true,
      created_by: DEMO_OWNER_ID,
      created_at: at(-80, '09:00'),
    },
    {
      id: 'c-payment',
      name: 'Payment follow-up',
      base_type: 'call',
      color: 'green',
      icon: 'wallet',
      checklist: check('c-payment', [
        ['Check the outstanding amount', false],
        ['Call and ask for a date', false],
        ['Record the promised date', false],
      ]),
      sop: [
        '1. Open the ledger and confirm the exact outstanding figure first.',
        '2. Ask for a specific date, not "soon".',
        '3. Repeat the date back so both sides agree it.',
        '4. Record the date here — anything not written down did not happen.',
      ].join('\n'),
      estimated_minutes: 25,
      active: true,
      created_by: 'p-vikram',
      created_at: at(-70, '09:00'),
    },
  ]
}

function buildTasks(): SeedTask[] {
  return [
    {
      id: 't-fabric-stock',
      title: 'Verify fabric stock levels',
      description:
        'Walk the godown and check the lycra and cotton rolls against the register. Flag anything below 40 kg.',
      status: 'in_progress',
      assigned_to: 'p-kavita',
      created_by: 'p-priya',
      due_date: at(0, '17:00'),
      is_blocked: false,
      status_changed_at: at(0, '10:20'),
      completed_at: null,
      task_type: 'entry',
      checklist: check('t-fabric-stock', [
        ['Count rolls in the main godown', true],
        ['Match against the stock register', true],
        ['List anything under 40 kg', false],
      ]),
      routine_id: null,
      routine_on: null,
      created_at: at(0, '09:05'),
    },
    {
      id: 't-boys-patterns',
      title: 'Approve new boys’ collection patterns',
      description: 'Six patterns are cut and pinned. Check fit on the 8-year and 12-year sizes before we grade the set.',
      status: 'review',
      assigned_to: 'p-priya',
      created_by: 'p-rajesh',
      due_date: at(0, '18:30'),
      is_blocked: false,
      status_changed_at: at(0, '14:10'),
      completed_at: null,
      task_type: 'long',
      checklist: check('t-boys-patterns', [
        ['Plan the steps', true],
        ['Check fit on both sizes', true],
        ['Note where it stands at day end', false],
      ]),
      routine_id: null,
      routine_on: null,
      created_at: at(-2, '11:00'),
    },
    {
      id: 't-sales-visits',
      title: 'Schedule daily sales visits',
      description: 'Fix tomorrow’s route across the Ring Road shops. Keep it to six stops so each visit is unhurried.',
      status: 'in_progress',
      assigned_to: 'p-arjun',
      created_by: 'p-neha',
      due_date: at(0, '16:00'),
      is_blocked: false,
      status_changed_at: at(0, '11:45'),
      completed_at: null,
      task_type: 'growth',
      checklist: check('t-sales-visits', [
        ['Decide who to approach', true],
        ['Reach out', false],
        ['Write down the response', false],
      ]),
      routine_id: null,
      routine_on: null,
      created_at: at(0, '09:15'),
    },
    {
      id: 't-dyeing-dispatch',
      title: 'Confirm dyeing-unit dispatch',
      description: 'Lot 4471 was promised for this evening. Confirm the vehicle and get the challan number.',
      status: 'todo',
      assigned_to: 'p-suresh',
      created_by: 'p-priya',
      due_date: at(0, '19:00'),
      is_blocked: true,
      status_changed_at: at(0, '12:00'),
      completed_at: null,
      task_type: 'order',
      checklist: check('t-dyeing-dispatch', [
        ['Confirm item and quantity', true],
        ['Place the order', false],
        ['Record expected delivery', false],
      ]),
      routine_id: null,
      routine_on: null,
      created_at: at(-1, '15:30'),
    },
    {
      id: 't-retailer-payments',
      title: 'Collect retailer payment updates',
      description: 'Ring the four retailers who are past 30 days and note what each one promises.',
      status: 'done',
      assigned_to: 'p-farida',
      created_by: 'p-vikram',
      due_date: at(0, '13:00'),
      is_blocked: false,
      status_changed_at: at(0, '12:40'),
      completed_at: at(0, '12:40'),
      task_type: 'call',
      checklist: check('t-retailer-payments', [
        ['Make the call', true],
        ['Record what was discussed', true],
        ['Add any follow-up date', true],
      ]),
      routine_id: null,
      routine_on: null,
      created_at: at(0, '09:00'),
    },
    {
      id: 't-repeat-order-call',
      title: 'Call customer about repeat order',
      description: 'Sunrise Garments asked about repeating the navy joggers. Confirm sizes and quantity.',
      status: 'in_progress',
      assigned_to: 'p-arjun',
      created_by: 'p-neha',
      due_date: at(0, '15:30'),
      is_blocked: false,
      status_changed_at: at(0, '13:05'),
      completed_at: null,
      task_type: 'call',
      checklist: check('t-repeat-order-call', [
        ['Make the call', true],
        ['Record what was discussed', false],
        ['Add any follow-up date', false],
      ]),
      routine_id: null,
      routine_on: null,
      created_at: at(0, '09:30'),
    },
    {
      id: 't-record-discussion',
      title: 'Record the customer discussion',
      description: 'Write down what Sunrise Garments agreed so the office can raise the order sheet.',
      status: 'todo',
      assigned_to: 'p-arjun',
      created_by: 'p-neha',
      due_date: at(0, '18:00'),
      is_blocked: false,
      status_changed_at: at(0, '09:30'),
      completed_at: null,
      task_type: 'entry',
      checklist: check('t-record-discussion', [
        ['Collect the day’s figures', false],
        ['Enter them into the sheet', false],
        ['Check the totals match', false],
      ]),
      routine_id: null,
      routine_on: null,
      created_at: at(0, '09:30'),
    },
    {
      id: 't-growth-meeting',
      title: 'Weekly sales growth meeting',
      description: 'Review last week’s numbers and pick the two shops we push hardest this week.',
      status: 'todo',
      assigned_to: 'p-neha',
      created_by: 'p-rajesh',
      due_date: at(0, '17:30'),
      is_blocked: false,
      status_changed_at: at(0, '08:30'),
      completed_at: null,
      task_type: 'meeting',
      checklist: check('t-growth-meeting', [
        ['Prepare agenda', true],
        ['Attend meeting', false],
        ['Record decisions and owners', false],
      ]),
      routine_id: null,
      routine_on: null,
      created_at: at(-1, '17:00'),
    },
    {
      id: 't-stock-movement',
      title: 'Enter daily stock movement',
      description: 'Record everything that went out to the dyeing unit and everything that came back.',
      status: 'in_progress',
      assigned_to: 'p-meena',
      created_by: 'p-vikram',
      due_date: at(0, '18:45'),
      is_blocked: false,
      status_changed_at: at(0, '15:00'),
      completed_at: null,
      task_type: 'entry',
      checklist: check('t-stock-movement', [
        ['Collect the day’s figures', true],
        ['Enter them into the sheet', false],
        ['Check the totals match', false],
      ]),
      routine_id: 'r-stock-movement',
      routine_on: toDayKey(new Date()),
      created_at: at(0, '08:00'),
    },
    {
      id: 't-cutting-plan',
      title: 'Cut 300 pieces of the striped tee',
      description: 'Lay and cut the 300-piece run. Keep the wastage note for the evening report.',
      status: 'in_progress',
      assigned_to: 'p-imran',
      created_by: 'p-priya',
      due_date: at(-1, '18:00'),
      is_blocked: false,
      status_changed_at: at(-1, '11:00'),
      completed_at: null,
      task_type: 'long',
      checklist: check('t-cutting-plan', [
        ['Plan the steps', true],
        ['Do the work', false],
        ['Note where it stands at day end', false],
      ]),
      routine_id: null,
      routine_on: null,
      created_at: at(-3, '09:00'),
    },
    {
      id: 't-trim-order',
      title: 'Order elastic and drawcords',
      description: 'We are down to two cartons of 30 mm elastic. Order enough for the next three lots.',
      status: 'todo',
      assigned_to: 'p-kavita',
      created_by: 'p-priya',
      due_date: at(1, '11:00'),
      is_blocked: false,
      status_changed_at: at(0, '16:10'),
      completed_at: null,
      task_type: 'order',
      checklist: check('t-trim-order', [
        ['Confirm item and quantity', false],
        ['Place the order', false],
        ['Record expected delivery', false],
      ]),
      routine_id: null,
      routine_on: null,
      created_at: at(0, '16:10'),
    },
    {
      id: 't-new-shop-visit',
      title: 'Visit two new shops in Kalupur',
      description: 'Both stock a similar range. Show the boys’ collection catalogue and leave two samples.',
      status: 'todo',
      assigned_to: 'p-farida',
      created_by: 'p-neha',
      due_date: at(1, '15:00'),
      is_blocked: false,
      status_changed_at: at(0, '10:00'),
      completed_at: null,
      task_type: 'growth',
      checklist: check('t-new-shop-visit', [
        ['Decide who to approach', true],
        ['Reach out', false],
        ['Write down the response', false],
      ]),
      routine_id: null,
      routine_on: null,
      created_at: at(0, '10:00'),
    },
    {
      id: 't-supplier-call',
      title: 'Call the dyeing unit about lot 4471',
      description: 'Ask why the lot slipped and whether the next two lots are still on schedule.',
      status: 'todo',
      assigned_to: 'p-suresh',
      created_by: 'p-priya',
      due_date: at(0, '17:45'),
      is_blocked: false,
      status_changed_at: at(0, '14:30'),
      completed_at: null,
      task_type: 'call',
      checklist: check('t-supplier-call', [
        ['Make the call', false],
        ['Record what was discussed', false],
        ['Add any follow-up date', false],
      ]),
      routine_id: null,
      routine_on: null,
      created_at: at(0, '14:30'),
    },
    {
      id: 't-yesterday-audit',
      title: 'Match yesterday’s dispatch register',
      description: 'Cross-check the challans against what actually left the gate.',
      status: 'done',
      assigned_to: 'p-meena',
      created_by: 'p-vikram',
      due_date: at(-1, '18:00'),
      is_blocked: false,
      status_changed_at: at(-1, '17:20'),
      completed_at: at(-1, '17:20'),
      task_type: 'entry',
      checklist: check('t-yesterday-audit', [
        ['Collect the day’s figures', true],
        ['Enter them into the sheet', true],
        ['Check the totals match', true],
      ]),
      routine_id: null,
      routine_on: null,
      created_at: at(-1, '08:30'),
    },
    {
      id: 't-morning-call',
      title: 'Morning call to the three big retailers',
      description: 'Standing routine — check what sold yesterday and whether they need a top-up.',
      status: 'done',
      assigned_to: 'p-arjun',
      created_by: 'p-rajesh',
      due_date: at(0, '11:00'),
      is_blocked: false,
      status_changed_at: at(0, '10:55'),
      completed_at: at(0, '10:55'),
      task_type: 'call',
      checklist: check('t-morning-call', [
        ['Make the call', true],
        ['Record what was discussed', true],
        ['Add any follow-up date', true],
      ]),
      routine_id: 'r-morning-call',
      routine_on: toDayKey(new Date()),
      created_at: at(0, '08:00'),
    },
  ]
}

function buildActivity(): ActivityLog[] {
  return [
    {
      id: 'a-1',
      task_id: 't-fabric-stock',
      user_id: 'p-kavita',
      content: 'Counted the main godown. Lycra is fine, cotton looks thin on the light shades.',
      created_at: at(0, '10:25'),
    },
    {
      id: 'a-2',
      task_id: 't-fabric-stock',
      user_id: 'p-priya',
      content: 'Please put the exact kilos against each shade so I can decide what to reorder tonight.',
      created_at: at(0, '10:40'),
    },
    {
      id: 'a-3',
      task_id: 't-dyeing-dispatch',
      user_id: 'p-suresh',
      content: 'Marked as blocked — the unit has not confirmed a vehicle. Waiting on their supervisor to call back.',
      created_at: at(0, '12:00'),
    },
    {
      id: 'a-4',
      task_id: 't-retailer-payments',
      user_id: 'p-farida',
      content:
        'Spoke to all four. Sunrise will clear the full amount on Friday. Krishna Textiles asked for one more week and will pay half now. Ganesh Stores has already transferred — will send the slip. Modern Kids says the 15th, no earlier.',
      created_at: at(0, '12:35'),
    },
    {
      id: 'a-5',
      task_id: 't-repeat-order-call',
      user_id: 'p-arjun',
      content:
        'Sunrise Garments want the navy joggers again — 240 pieces, sizes 26 to 34. They asked whether we can hold the same rate as last time.',
      created_at: at(0, '13:10'),
    },
    {
      id: 'a-6',
      task_id: 't-morning-call',
      user_id: 'p-arjun',
      content:
        'All three called. Ring Road shop sold 18 pieces yesterday and wants a top-up of the grey set. The other two are steady and need nothing today.',
      created_at: at(0, '10:50'),
    },
    {
      id: 'a-7',
      task_id: 't-cutting-plan',
      user_id: 'p-imran',
      content: 'Laid 180 pieces so far. The rest goes tomorrow morning once the second table is free.',
      created_at: at(-1, '17:40'),
    },
    {
      id: 'a-8',
      task_id: 't-boys-patterns',
      user_id: 'p-priya',
      content: 'Four of six are approved. The 12-year kurta needs 1 cm more at the chest before I sign it off.',
      created_at: at(0, '14:15'),
    },
    {
      id: 'a-9',
      task_id: 't-supplier-call',
      user_id: 'p-priya',
      content: 'Suresh, please make this call before you leave — I need an answer for tomorrow’s planning.',
      created_at: at(0, '14:35'),
    },
    {
      id: 'a-10',
      task_id: 't-stock-movement',
      user_id: 'p-meena',
      content: 'Outward is entered. Inward from the dyeing unit is pending because the challan has not reached me.',
      created_at: at(0, '15:05'),
    },
  ]
}

function buildHandoffs(): TaskHandoff[] {
  return [
    {
      id: 'h-1',
      task_id: 't-cutting-plan',
      from_user_id: 'p-priya',
      to_user_id: 'p-imran',
      note: 'Passing the cutting run to Imran — I am on the pattern approvals all afternoon and cannot stand at the table.',
      created_at: at(-1, '11:00'),
    },
    {
      id: 'h-2',
      task_id: 't-record-discussion',
      from_user_id: 'p-farida',
      to_user_id: 'p-arjun',
      note: 'Arjun took the Sunrise call himself, so he should write the discussion down rather than me repeating it second hand.',
      created_at: at(0, '13:20'),
    },
    {
      id: 'h-3',
      task_id: 't-trim-order',
      from_user_id: 'p-suresh',
      to_user_id: 'p-kavita',
      note: 'Handing the elastic order to Kavita — she keeps the trims register and knows the exact carton count we are down to.',
      created_at: at(0, '16:10'),
    },
  ]
}

function buildRoutines(): TaskRoutine[] {
  const today = toDayKey(new Date())
  return [
    {
      id: 'r-morning-call',
      title: 'Morning call to the three big retailers',
      task_type: 'call',
      assigned_to: 'p-arjun',
      created_by: 'p-rajesh',
      due_time: '11:00',
      checklist: check('r-morning-call', [
        ['Make the call', false],
        ['Record what was discussed', false],
        ['Add any follow-up date', false],
      ]),
      sop: [
        '1. Call before 11am — after that the shops get busy with customers.',
        '2. Ask what sold yesterday, by set, not just a total.',
        '3. Ask directly whether anything needs a top-up.',
        '4. Write the answers down here before making the next call.',
      ].join('\n'),
      estimated_minutes: 30,
      category_id: null,
      cadence: 'daily',
      active: true,
      last_generated_on: today,
      created_at: at(-60, '09:00'),
    },
    {
      id: 'r-stock-movement',
      title: 'Enter daily stock movement',
      task_type: 'entry',
      assigned_to: 'p-meena',
      created_by: 'p-vikram',
      due_time: '18:45',
      checklist: check('r-stock-movement', [
        ['Collect the day’s figures', false],
        ['Enter them into the sheet', false],
        ['Check the totals match', false],
      ]),
      sop: [
        '1. Collect the outward challans and the inward gate slips together.',
        '2. Enter outward first, then inward — never mix the two passes.',
        '3. Totals must match the gate register before you close the sheet.',
      ].join('\n'),
      estimated_minutes: 45,
      category_id: null,
      cadence: 'daily',
      active: true,
      last_generated_on: today,
      created_at: at(-45, '09:00'),
    },
    {
      id: 'r-godown-round',
      title: 'Evening round of the godown',
      task_type: 'general',
      assigned_to: 'p-kavita',
      created_by: 'p-priya',
      due_time: '19:30',
      checklist: check('r-godown-round', [
        ['Start the work', false],
        ['Finish the work', false],
        ['Note the outcome', false],
      ]),
      sop: null,
      estimated_minutes: 20,
      category_id: null,
      cadence: 'weekly',
      active: false,
      last_generated_on: null,
      created_at: at(-30, '09:00'),
    },
  ]
}

function buildCalls(): CallLog[] {
  return [
    {
      id: 'call-sunrise',
      task_id: 't-repeat-order-call',
      counterparty: 'Sunrise Garments — Mr. Bhavesh',
      recorded_by: DEMO_EMPLOYEE_ID,
      duration_seconds: 412,
      transcript: [
        'Arjun: Bhavesh bhai, namaste. Calling about the navy joggers — you had asked about repeating them.',
        'Bhavesh: Yes yes. We need the same lot again. 240 pieces, sizes 26 to 34, same ratio as last time.',
        'Arjun: Understood. Same rate as last time?',
        'Bhavesh: That is the thing. Last time it was 385. Now Krishna Textiles is quoting me 360 for something similar. See if you can do something.',
        'Arjun: I cannot confirm the rate on the call, I will check with sir and revert.',
        'Bhavesh: Fine. But do it fast, I have to close this by month end.',
        'Arjun: Noted. One more thing, the last delivery — everything was fine?',
        'Bhavesh: Mostly. Two pieces in the grey set had loose stitching at the waistband. Small thing, we managed. But please tell the tailor.',
        'Arjun: I am sorry about that, I will pass it on today itself.',
        'Bhavesh: Also I am coming to Ahmedabad on the 28th. I will visit the factory in the morning, around 11. Keep the new samples ready.',
        'Arjun: Perfect, I will note it down. And the payment for the last two bills?',
        'Bhavesh: I will release it on Friday. Full amount.',
        'Arjun: Thank you Bhavesh bhai. I will call back once I have the rate.',
      ].join('\n'),
      summary:
        'Sunrise Garments want to repeat the navy joggers — 240 pieces, sizes 26 to 34, same ratio. They are pushing on rate: last time was ₹385, and Krishna Textiles has quoted them ₹360 for something comparable. Arjun did not commit to a rate and will revert. Bhavesh also flagged loose stitching on two pieces in the grey set from the last delivery, said he will release the full payment for the last two bills on Friday, and will visit the factory on the 28th at about 11am to see the new samples. He wants the order closed by month end.',
      commitments: [
        {
          id: 'cm-1',
          title: 'Factory visit — Bhavesh, Sunrise Garments (keep new samples ready)',
          kind: 'visit',
          due_date: addDaysKey(todayKey(), 8),
          due_time: '11:00',
          certainty: 'stated',
          quote: 'I am coming to Ahmedabad on the 28th. I will visit the factory in the morning, around 11.',
          task_id: null,
        },
        {
          id: 'cm-2',
          title: 'Collect payment from Sunrise Garments — last two bills, full amount',
          kind: 'payment',
          due_date: addDaysKey(todayKey(), 2),
          due_time: '11:00',
          certainty: 'stated',
          quote: 'I will release it on Friday. Full amount.',
          task_id: null,
        },
        {
          id: 'cm-3',
          title: 'Call Bhavesh back with the confirmed rate on the navy joggers',
          kind: 'callback',
          due_date: addDaysKey(todayKey(), 1),
          due_time: '16:00',
          certainty: 'implied',
          quote: 'I will call back once I have the rate. / But do it fast, I have to close this by month end.',
          task_id: null,
        },
      ],
      intel: [
        {
          id: 'in-1',
          kind: 'competitor',
          note: 'Krishna Textiles has quoted Sunrise ₹360 against our ₹385 for a comparable joggers lot.',
          quote: 'Now Krishna Textiles is quoting me 360 for something similar.',
        },
        {
          id: 'in-2',
          kind: 'complaint',
          note: 'Two pieces in the grey set had loose stitching at the waistband. Customer absorbed it but wants the tailor told.',
          quote: 'Two pieces in the grey set had loose stitching at the waistband.',
        },
        {
          id: 'in-3',
          kind: 'price',
          note: 'Rate pressure of about ₹25 per piece. A decision is needed before month end or the order may move.',
          quote: 'See if you can do something. / I have to close this by month end.',
        },
      ],
      created_at: at(0, '13:12'),
    },
  ]
}

/** SOPs for a few of the seeded jobs, so the feature is visible on load. */
const SEED_SOPS: Record<string, { sop?: string; minutes?: number; category?: string }> = {
  't-fabric-stock': {
    minutes: 75,
    sop: [
      '1. Start at the main godown, left rack to right rack — never jump around.',
      '2. Weigh anything that looks part-used rather than estimating it.',
      '3. Match every shade against the register before moving to the next rack.',
      '4. Anything under 40 kg goes on the reorder list the same evening.',
    ].join('\n'),
  },
  't-repeat-order-call': {
    minutes: 20,
    category: 'c-payment',
    sop: [
      '1. Open the customer’s last order before dialling, so sizes are in front of you.',
      '2. Confirm quantity and size break-up, and repeat them back.',
      '3. Never confirm a rate on the call — say you will check and revert.',
      '4. Write the discussion down here immediately after hanging up.',
    ].join('\n'),
  },
  't-dyeing-dispatch': { minutes: 90, category: 'c-dispatch' },
  't-cutting-plan': {
    minutes: 240,
    sop: [
      '1. Check the marker against the size ratio before laying a single ply.',
      '2. Keep lay height under 60 plies for this fabric or the edges drift.',
      '3. Bundle and ticket every size as it comes off the table.',
      '4. Record the wastage percentage for the evening report.',
    ].join('\n'),
  },
  't-growth-meeting': { minutes: 60 },
  't-stock-movement': { minutes: 45 },
  't-morning-call': { minutes: 30 },
}

/** Work that belongs to the week or the month rather than to today. */
function buildPeriodWork(): SeedTask[] {
  const now = new Date().toISOString()
  const base = {
    status: 'todo' as const,
    is_blocked: false,
    status_changed_at: now,
    completed_at: null,
    routine_id: null,
    routine_on: null,
    created_at: now,
  }
  return [
    {
      ...base,
      id: 't-week-retailers',
      title: 'Sign up two new retailers in Kalupur',
      description: 'The week is not finished until two new shops have agreed to stock the boys’ collection.',
      assigned_to: 'p-neha',
      created_by: DEMO_OWNER_ID,
      due_date: null,
      task_type: 'growth',
      checklist: check('t-week-retailers', [
        ['List the shops worth approaching', true],
        ['Visit and show the catalogue', false],
        ['Get the first order confirmed', false],
      ]),
      horizon: 'week',
      estimated_minutes: 300,
    },
    {
      ...base,
      id: 't-week-wastage',
      title: 'Bring cutting wastage under 4%',
      description: 'Check the marker efficiency on every lot this week and note where the waste is going.',
      assigned_to: 'p-imran',
      created_by: 'p-priya',
      due_date: null,
      task_type: 'long',
      status: 'in_progress',
      checklist: check('t-week-wastage', [
        ['Measure wastage on each lot', true],
        ['Find the two worst markers', false],
        ['Re-lay and re-measure', false],
      ]),
      horizon: 'week',
      estimated_minutes: 240,
    },
    {
      ...base,
      id: 't-month-collection',
      title: 'Launch the winter boys’ collection',
      description: 'Twelve styles, sampled, costed and shown to the top ten retailers before the month closes.',
      assigned_to: 'p-priya',
      created_by: DEMO_OWNER_ID,
      due_date: null,
      task_type: 'growth',
      status: 'in_progress',
      checklist: check('t-month-collection', [
        ['Finalise the twelve styles', true],
        ['Get all samples stitched', false],
        ['Cost each style', false],
        ['Show to the top ten retailers', false],
      ]),
      horizon: 'month',
      estimated_minutes: 1200,
    },
    {
      ...base,
      id: 't-month-receivables',
      title: 'Clear everything outstanding over 60 days',
      description: 'Nothing older than 60 days should still be sitting on the books when the month ends.',
      assigned_to: 'p-vikram',
      created_by: 'p-anil',
      due_date: null,
      task_type: 'call',
      checklist: check('t-month-receivables', [
        ['List everything past 60 days', true],
        ['Call each one and get a date', false],
        ['Escalate whatever has no date', false],
      ]),
      horizon: 'month',
      estimated_minutes: 480,
    },
  ]
}

export function buildDemoDataset(): DemoDataset {
  const categories = buildCategories()
  const calls = buildCalls()

  const tasks: Task[] = [...buildTasks(), ...buildPeriodWork()].map((seed) => {
    const extra = SEED_SOPS[seed.id]
    return {
      ...seed,
      sop: seed.sop ?? extra?.sop ?? null,
      estimated_minutes: seed.estimated_minutes ?? extra?.minutes ?? null,
      category_id: seed.category_id ?? extra?.category ?? null,
      horizon: seed.horizon ?? 'day',
      original_due_date: seed.original_due_date ?? null,
      rollover_count: seed.rollover_count ?? 0,
      call_log_id: seed.call_log_id ?? null,
    }
  })

  // One task already carried forward, so the badge is visible on load.
  const carried = tasks.find((t) => t.id === 't-cutting-plan')
  if (carried) {
    carried.original_due_date = addDaysKey(todayKey(), -3)
    carried.rollover_count = 2
  }

  return {
    profiles: PROFILES,
    categories,
    tasks,
    activity: buildActivity(),
    handoffs: buildHandoffs(),
    routines: buildRoutines(),
    calls,
  }
}
