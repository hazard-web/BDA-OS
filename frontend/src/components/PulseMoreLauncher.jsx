import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Building2,
  CalendarDays,
  LineChart,
  ClipboardList,
  Clock3,
  FileText,
  FolderOpen,
  LayoutGrid,
  Plane,
  Rocket,
  Share2,
  Target,
  Timer,
  Users,
  Wallet,
} from 'lucide-react'
import PulseSlideClose from './PulseSlideClose'

/** Kept for search / module titles; not shown in the More slide. */
export const MORE_SERVICES = [
  { id: 'files', name: 'Files', Icon: FolderOpen, kind: 'service' },
  { id: 'engagement', name: 'Employee Engagement', Icon: Share2, kind: 'service' },
  { id: 'letters', name: 'HR Letters', Icon: FileText, kind: 'service' },
  { id: 'travel', name: 'Travel', Icon: Plane, kind: 'service' },
  { id: 'tasks', name: 'Tasks', Icon: ClipboardList, kind: 'service' },
  { id: 'compensation', name: 'Compensation', Icon: Wallet, kind: 'service' },
  { id: 'general', name: 'General', Icon: Building2, kind: 'service' },
  { id: 'okr', name: 'OKR', Icon: Target, kind: 'service' },
]

/** Company modules for admin / super admin in the More slide. */
export const COMPANY_MORE_ITEMS = [
  {
    id: 'onboarding',
    name: 'Onboarding',
    blurb: 'Invite and set up new hires',
    Icon: Rocket,
    tone: 'violet',
    kind: 'company',
    group: 'people',
  },
  {
    id: 'people',
    name: 'People',
    blurb: 'Directory and org roles',
    Icon: Users,
    tone: 'sky',
    kind: 'company',
    group: 'people',
  },
  {
    id: 'companyFiles',
    name: 'Files',
    blurb: 'Shared company documents',
    Icon: FolderOpen,
    tone: 'amber',
    kind: 'company',
    group: 'people',
  },
  {
    id: 'leaveTeam',
    name: 'Team leave',
    blurb: 'Approvals and absences',
    Icon: CalendarDays,
    tone: 'rose',
    kind: 'company',
    group: 'time',
  },
  {
    id: 'leaveHolidays',
    name: 'Holidays',
    blurb: 'Yearly holiday calendar',
    Icon: CalendarDays,
    tone: 'orange',
    kind: 'company',
    group: 'time',
  },
  {
    id: 'attendance',
    name: 'Attendance',
    blurb: 'Check-in across the team',
    Icon: Clock3,
    tone: 'indigo',
    kind: 'company',
    group: 'time',
  },
  {
    id: 'companyTime',
    name: 'Timesheet',
    blurb: 'Hours and submissions',
    Icon: Timer,
    tone: 'cyan',
    kind: 'company',
    group: 'time',
  },
  {
    id: 'companyPerformance',
    name: 'Performance',
    blurb: 'Scores and reviews',
    Icon: LineChart,
    tone: 'blue',
    kind: 'company',
    group: 'pay',
  },
  {
    id: 'companyPayroll',
    name: 'Payroll',
    blurb: 'Payslips and payouts',
    Icon: Wallet,
    tone: 'emerald',
    kind: 'company',
    group: 'pay',
  },
  {
    id: 'apps',
    name: 'App access',
    blurb: 'Tools assigned to people',
    Icon: LayoutGrid,
    tone: 'slate',
    kind: 'company',
    group: 'access',
  },
]

function ServiceIcon({ Icon, tone, reduce }) {
  return (
    <motion.span
      className={`ms-more-cta-ico is-${tone || 'slate'}`}
      aria-hidden="true"
      variants={
        reduce
          ? undefined
          : {
              rest: { scale: 1, rotate: 0 },
              hover: { scale: 1.08, rotate: -8 },
            }
      }
      transition={{ type: 'spring', stiffness: 420, damping: 18 }}
    >
      <Icon size={18} strokeWidth={1.75} />
    </motion.span>
  )
}

/** Slide-out More launcher — admin / super admin company modules. */
export default function PulseMoreLauncher({
  open,
  onClose,
  onSelect,
  showCompany = false,
}) {
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!showCompany || typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="ms-more-root"
          className="ms-more-root"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 1 }}
          transition={{ duration: 0.28 }}
        >
          <motion.button
            type="button"
            className="ms-more-scrim"
            aria-label="Close more"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
          />
          <div className="ms-more-clip">
            <motion.div
              className="ms-more-slide"
              initial={reduce ? { opacity: 0 } : { x: 'calc(-100% - 48px)' }}
              animate={{ x: 0, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { x: 'calc(-100% - 48px)' }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <aside className="ms-more" role="dialog" aria-modal="true" aria-label="Services">
                <div className="ms-more-body">
                  <ul className="ms-more-list">
                    {COMPANY_MORE_ITEMS.map((item, index) => {
                      const delay = reduce ? 0 : 0.04 + index * 0.03
                      return (
                        <motion.li
                          key={item.id}
                          initial={reduce ? false : { opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.28, delay, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <motion.button
                            type="button"
                            className="ms-more-cta"
                            aria-label={item.name}
                            onClick={() => onSelect(item)}
                            initial="rest"
                            whileHover="hover"
                            animate="rest"
                          >
                            <ServiceIcon Icon={item.Icon} tone={item.tone} reduce={reduce} />
                            <span className="ms-more-cta-label">{item.name}</span>
                          </motion.button>
                        </motion.li>
                      )
                    })}
                  </ul>
                </div>
              </aside>
              <PulseSlideClose open portal={false} onClose={onClose} width={340} from="start" />
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
