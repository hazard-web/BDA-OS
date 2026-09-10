import '../pages/pulse-overview-portal.css'
import '../pages/pulse-live.css'

export function statusTone(status) {
  const value = String(status || '').toLowerCase()
  if (['done', 'approved', 'present', 'checked in', 'complete', 'paid', 'issued'].includes(value)) return 'done'
  if (['on track', 'accepted', 'in progress', 'open', 'submitted'].includes(value)) return 'track'
  if (['waiting', 'pending', 'action', 'absent', 'overdue'].includes(value)) return 'wait'
  if (['draft', 'automated', 'weekend', 'holiday', 'on leave', 'scheduled'].includes(value)) return 'auto'
  return 'track'
}

export function statusLabel(status) {
  const value = String(status || '')
  if (value === 'Pending') return 'Waiting'
  if (value === 'Draft') return 'Automated'
  if (value === 'Approved') return 'Done'
  return value || 'On track'
}

function ownerInitial(name) {
  return String(name || 'P').trim().charAt(0).toUpperCase()
}

function ownerTone(name) {
  const code = String(name || 'P').charCodeAt(0) % 5
  return ['a', 'b', 'c', 'd', 'e'][code]
}

export function PulseTaskRows({ rows, empty, onRow, taskLabel = 'Task', dueLabel = 'Due date' }) {
  if (!rows?.length) return <p className="pov-empty">{empty || 'Nothing here yet.'}</p>
  return (
    <div className="pov-table-wrap">
      <table className="pov-table">
        <thead>
          <tr>
            <th>{taskLabel}</th>
            <th>Owner</th>
            <th>{dueLabel}</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tone = statusTone(row.status)
            return (
              <tr key={row.key}>
                <td>
                  <button
                    type="button"
                    className="pov-task"
                    style={{ background: 'none', border: 0, padding: 0, cursor: onRow ? 'pointer' : 'default', font: 'inherit', color: 'inherit', textAlign: 'left' }}
                    onClick={() => onRow?.(row)}
                  >
                    <span className={`pov-check${row.done ? ' is-on' : ''}`} aria-hidden="true" />
                    <span>{row.task}</span>
                  </button>
                </td>
                <td>
                  <span className="pov-owner">
                    <i className={`is-${row.tone || ownerTone(row.owner)}`} aria-hidden="true">{ownerInitial(row.owner)}</i>
                    <em>{row.owner}</em>
                  </span>
                </td>
                <td>{row.due}</td>
                <td>
                  <span className={`pov-status is-${tone}`}>
                    <span className="pov-meterette" aria-hidden="true"><i /></span>
                    {statusLabel(row.status)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function PulseGlassBoard({
  title,
  kicker,
  lead,
  ctaLabel,
  onCta,
  checkIn,
  metrics = [],
  groups,
  rows,
  empty,
  onRow,
  extra,
  taskLabel,
  dueLabel,
}) {
  return (
    <div className="pov">
      <div className="pov-app pov-app-bare">
        <div className="pov-app-body">
          {(title || kicker || lead || ctaLabel) ? (
            <header className="pov-top">
              <div>
                {lead}
                {kicker ? <p className="pov-kicker">{kicker}</p> : null}
                {title ? <h1>{title}</h1> : null}
              </div>
              {ctaLabel ? (
                <button
                  type="button"
                  className={`pov-cta plive-top-cta${checkIn ? ' plive-checkin' : ''}`}
                  onClick={onCta}
                >
                  {ctaLabel}
                </button>
              ) : null}
            </header>
          ) : null}

          {metrics.length ? (
            <div className="plive-metrics">
              {metrics.map((item) => (
                <article key={item.label} className="pov-glass plive-metric">
                  <p>{item.label}</p>
                  <strong>{item.value}</strong>
                  <span>{item.hint}</span>
                </article>
              ))}
            </div>
          ) : null}

          {groups?.length ? (
            <section className="pov-glass pov-tasks">
              {groups.map((group) => (
                <div key={group.title} className="pov-group">
                  <div className="pov-group-head">
                    <h4>{group.title}</h4>
                    <span>{group.hint}</span>
                  </div>
                  <PulseTaskRows
                    rows={group.rows}
                    empty={group.empty}
                    onRow={onRow}
                    taskLabel={group.taskLabel || taskLabel}
                    dueLabel={group.dueLabel || dueLabel}
                  />
                </div>
              ))}
            </section>
          ) : rows ? (
            <section className="pov-glass pov-tasks">
              <PulseTaskRows rows={rows} empty={empty} onRow={onRow} taskLabel={taskLabel} dueLabel={dueLabel} />
            </section>
          ) : null}

          {extra}
        </div>
      </div>
    </div>
  )
}
