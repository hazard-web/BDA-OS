import { format } from 'date-fns'
import { formatElapsed } from '../utils/pulseCheckIn'
import { PulseTaskRows } from './PulseGlassBoard'

function greetingTitle(hour) {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function BeatLine() {
  return (
    <svg className="pulse-beat-line" viewBox="0 0 800 36" fill="none" aria-hidden="true">
      <path
        d="M0 22 H90 L104 22 L112 6 L124 30 L134 22 H250 L262 22 L270 8 L282 28 L292 22 H410 L422 22 L430 4 L444 32 L454 22 H570 L582 22 L590 10 L602 26 L612 22 H800"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  )
}

export default function PulseOverviewPortal({
  name,
  initial,
  hour,
  weekDays = [],
  checkedInAt,
  elapsed = 0,
  checkBusy,
  onCheckIn,
  approvals = [],
  weekHours = 0,
  leaveLeft = 0,
  mtdPct,
  notesPreview = [],
  onOpenLeave,
  onOpenTimesheet,
  onOpenNotes,
  onOpenApprovals,
}) {
  const doneDays = weekDays.filter((day) => day.present || day.status === 'Weekend' || day.status === 'Holiday').length
  const approvalDone = approvals.filter((row) => ['Approved', 'Done'].includes(row.status)).length
  const progress = mtdPct == null ? 0 : mtdPct
  const note = notesPreview[0]
  const lastActive = checkedInAt
    ? `In · ${format(new Date(checkedInAt), 'h:mm a')}`
    : elapsed > 0
      ? `Last · ${formatElapsed(elapsed)}`
      : 'Out for the day'

  const approvalRows = approvals.slice(0, 4).map((row, index) => ({
    key: row.key || row.id || `a-${index}`,
    task: row.subject || row.type || 'Request',
    owner: row.from || name,
    due: row.due || 'Today',
    status: row.status || 'Pending',
    done: ['Approved', 'Done', 'Complete'].includes(row.status),
  }))

  return (
    <div className="pov">
      <div className="pov-app pov-app-bare">
        <div className="pov-app-body">
          <header className="pov-top">
            <div>
              <p className="pov-kicker">{greetingTitle(hour)}, {name}</p>
              <h1>Today</h1>
            </div>
            <button
              type="button"
              className="pov-cta plive-top-cta plive-checkin"
              disabled={checkBusy}
              onClick={onCheckIn}
            >
              {checkedInAt ? 'Check out' : 'Check in'}
            </button>
          </header>

          <section className="pulse-beat" aria-label="This week">
            <BeatLine />
            <ol className="pulse-dayline">
              {weekDays.slice(0, 7).map((day) => (
                <li
                  key={day.key}
                  className={`${day.today ? 'is-now' : ''} ${day.present || day.status === 'Weekend' || day.status === 'Holiday' ? 'is-on' : ''}`}
                >
                  <b>{day.label}</b>
                  <em>{day.num}</em>
                  <small>
                    {day.status || (day.today ? (checkedInAt ? 'In' : 'Open') : day.present ? 'In' : 'Open')}
                  </small>
                </li>
              ))}
            </ol>
          </section>

          <div className="pov-grid">
            <div className="pov-main">
              <section className="pov-glass pov-tasks">
                <header className="pov-table-head">
                  <h3>Waiting on you</h3>
                  <span>{approvalDone} of {Math.max(approvals.length, 1)} closed · {doneDays} days logged · {weekHours || 0}h</span>
                </header>
                <PulseTaskRows rows={approvalRows} empty="Inbox is clear." />
                <button type="button" className="pov-link" onClick={onOpenApprovals}>All approvals</button>
                {' '}
                <button type="button" className="pov-link" onClick={onOpenTimesheet}>Hours</button>
              </section>
            </div>

            <aside className="pov-side">
              <section className="pov-glass pov-meet">
                <p className="pov-meet-time">{format(new Date(), 'EEEE d MMM')}</p>
                <h3>{checkedInAt ? formatElapsed(elapsed) : lastActive}</h3>
                <p className="pov-meet-copy">
                  {note ? String(note.text || '').slice(0, 88) : 'A line for later. Open notes.'}
                </p>
                <button type="button" className="pov-link" onClick={onOpenNotes}>Notes</button>
              </section>

              <section className="pov-glass pov-progress">
                <h3>Attendance</h3>
                <div className="pov-meter">
                  <div className="pov-meter-row">
                    <span>{initial}</span>
                    <strong>{mtdPct == null ? '—' : `${progress}%`}</strong>
                  </div>
                  <div className="pov-bar"><i style={{ width: `${progress}%` }} /></div>
                </div>
                <p className="pov-progress-foot">{leaveLeft} leave days left</p>
                <button type="button" className="pov-link" onClick={onOpenLeave}>Leave</button>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
