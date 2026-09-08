import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import {
  App,
  Button,
  DatePicker,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Progress,
  Select,
  Table,
  Tag,
  Upload,
} from 'antd'
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  CalendarOutlined,
  CloseOutlined,
  DownloadOutlined,
  DownOutlined,
  EllipsisOutlined,
  FilterOutlined,
  InfoCircleFilled,
  LeftOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
  UnorderedListOutlined,
  UpOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import api from '../api'
import leaveEmptyArt from '../assets/pulse-leave-empty.png'

dayjs.extend(customParseFormat)

const CASUAL_ANNUAL = 18

const SAMPLE_CASUAL = { used: 4, total: CASUAL_ANNUAL, remaining: 14 }

const PERIOD_OPTIONS = [
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'today', label: 'Today' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastYear', label: 'Last Year' },
  { value: 'thisYear', label: 'This Year' },
  { value: 'custom', label: 'Custom' },
]

const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'onDuty', label: 'On Duty' },
  { value: 'compensatoryOff', label: 'Compensatory Off' },
  { value: 'restrictedHolidays', label: 'Restricted Holidays' },
]

const LEAVE_TYPE_OPTIONS = [
  { value: 'Absent', label: 'Absent' },
  { value: 'Casual Leave', label: 'Casual Leave' },
  { value: 'Compensatory Off', label: 'Compensatory Off' },
  { value: 'Earned Leave', label: 'Earned Leave' },
  { value: 'Leave Without Pay', label: 'Leave Without Pay' },
  { value: 'Maternity Leave', label: 'Maternity Leave' },
  { value: 'Paternity Leave', label: 'Paternity Leave' },
  { value: 'Sabbatical Leave', label: 'Sabbatical Leave' },
]

const PAID_LEAVE_TYPES = [
  'Casual Leave',
  'Earned Leave',
  'Maternity Leave',
  'Paternity Leave',
  'Compensatory Off',
]
const UNPAID_LEAVE_TYPES = ['Leave Without Pay', 'Absent', 'Sabbatical Leave']

const PAGE_SIZE_OPTIONS = [20, 30, 40, 50, 75, 100, 200]

const IMPORT_MAX_MB = 5

const IMPORT_TARGETS = [{ value: 'Leave', label: 'Leave', title: '' }]

const IMPORT_STEPS = ['Map details', 'Verify', 'Import summary']

const IMPORT_PAGE_SIZE = 20

const LEAVE_IMPORT_FIELDS = [
  { key: 'employeeId', label: 'Employee ID' },
  { key: 'leaveType', label: 'Leave type', required: true },
  { key: 'unit', label: 'Unit' },
  { key: 'from', label: 'From', required: true },
  { key: 'teamEmailId', label: 'Team Email ID' },
  { key: 'dateOfRequest', label: 'Date of request' },
  { key: 'to', label: 'To', required: true },
  { key: 'session', label: 'Session' },
  { key: 'startTime', label: 'Start Time' },
  { key: 'daysHours', label: 'Days / Hours taken', required: true },
  { key: 'reason', label: 'Reason for leave' },
]

const IMPORT_TEMPLATE_HEADERS = [
  'employee id',
  'leave type',
  'unit (if not provided, default unit will be considered)',
  'from',
  'to',
  'session',
  'start time',
  'days/hours taken',
  'reason for leave',
]

/** Leave types the backend can store, plus the shorthands people type. */
const SUPPORTED_LEAVE_TYPES = ['Casual Leave', 'Sick Leave', 'Custom']

/** Addresses that can be notified about a leave request; the server has the same allowlist. */
const TEAM_NOTIFY_EMAILS = ['office@bda.co.in', 'hello@ambesh.com']

const IMPORT_LEAVE_TYPE_ALIASES = new Set([
  'casual',
  'casual leave',
  'sick',
  'sick leave',
  'custom',
  'custom leave',
])

/** Sample rows sit in the current month so a straight download-upload lands in view. */
function leaveImportTemplate(today = dayjs()) {
  const day = (date) => date.format('DD-MMM-YYYY')
  const first = today.date(10)
  const second = today.date(18)
  const third = today.date(24)

  return {
    filename: `leave-import-template-${today.format('MMM-YYYY')}.xlsx`,
    sheet: 'Leave',
    headers: IMPORT_TEMPLATE_HEADERS,
    rows: [
      ['', 'Casual Leave', 'Day', day(first), day(first.add(2, 'day')), '', '', '3', 'Family function'],
      ['', 'Sick Leave', 'Day', day(second), day(second), '', '', '1', 'Fever'],
      ['', 'Casual Leave', 'Day', day(third), day(third.add(1, 'day')), '', '', '2', 'Personal errand'],
    ],
  }
}

const HOLIDAY_CLASS_OPTIONS = [
  { value: 'all', label: 'All Holiday Classification' },
  { value: 'Holiday', label: 'Holiday' },
  { value: 'Restricted holiday', label: 'Restricted holiday' },
]

function rangeForPeriod(period, now = dayjs()) {
  if (period === 'yesterday') {
    const day = now.subtract(1, 'day')
    return [day.startOf('day'), day.endOf('day')]
  }
  if (period === 'today') return [now.startOf('day'), now.endOf('day')]
  if (period === 'lastMonth') {
    const month = now.subtract(1, 'month')
    return [month.startOf('month'), month.endOf('month')]
  }
  if (period === 'thisMonth') return [now.startOf('month'), now.endOf('month')]
  if (period === 'lastYear') {
    const year = now.subtract(1, 'year')
    return [year.startOf('year'), year.endOf('year')]
  }
  if (period === 'thisYear') return [now.startOf('year'), now.endOf('year')]
  return null
}

function defaultFilter() {
  const [from, to] = rangeForPeriod('thisYear')
  return {
    period: 'thisYear',
    from,
    to,
    type: 'all',
    leaveTypes: [],
    holidayClass: 'all',
  }
}

function leaveKind(row) {
  if (row.leaveType) return row.leaveType
  if (row.type === 'Casual') return 'Casual Leave'
  return row.type || 'Casual Leave'
}

const SAMPLE_REQUESTS = [
  {
    id: 's1',
    type: 'Casual',
    startDate: '2026-09-11',
    endDate: '2026-09-11',
    status: 'Approved',
    reason: 'Personal errand',
    days: 1,
  },
  {
    id: 's2',
    type: 'Casual',
    startDate: '2026-08-22',
    endDate: '2026-08-23',
    status: 'Approved',
    reason: 'Family visit',
    days: 2,
  },
  {
    id: 's3',
    type: 'Casual',
    startDate: '2026-10-06',
    endDate: '2026-10-07',
    status: 'Pending',
    reason: 'Out of town',
    days: 2,
  },
]

const INDIA_HOLIDAYS_2026 = [
  { id: 'h1', name: "New Year's Day", date: '2026-01-01' },
  { id: 'h2', name: 'Pongal', date: '2026-01-14' },
  { id: 'h3', name: 'Vasant Panchami', date: '2026-01-23' },
  { id: 'h4', name: 'Republic Day', date: '2026-01-26' },
  { id: 'h5', name: 'Maha Shivaratri', date: '2026-02-15' },
  { id: 'h6', name: 'Shivaji Jayanti', date: '2026-02-19' },
  { id: 'h7', name: 'Holi', date: '2026-03-04' },
  { id: 'h8', name: 'Ugadi', date: '2026-03-19' },
  { id: 'h9', name: 'Eid al-Fitr', date: '2026-03-21' },
  { id: 'h10', name: 'Rama Navami', date: '2026-03-26' },
  { id: 'h11', name: 'Good Friday', date: '2026-04-03' },
  { id: 'h12', name: 'Easter Day', date: '2026-04-05' },
  { id: 'h13', name: 'Bakrid', date: '2026-05-28' },
  { id: 'h14', name: 'Muharram', date: '2026-06-26' },
  { id: 'h15', name: 'Rath Yatra', date: '2026-07-16' },
  { id: 'h16', name: 'Independence Day', date: '2026-08-15' },
  { id: 'h17', name: 'Onam', date: '2026-08-26' },
  { id: 'h18', name: 'Raksha Bandhan', date: '2026-08-28' },
  { id: 'h19', name: 'Janmashtami', date: '2026-09-04' },
  { id: 'h20', name: 'Ganesh Chaturthi', date: '2026-09-14' },
  { id: 'h21', name: 'Gandhi Jayanti', date: '2026-10-02' },
  { id: 'h22', name: 'Dussehra', date: '2026-10-20' },
  { id: 'h23', name: 'Diwali', date: '2026-10-29' },
  { id: 'h24', name: 'Christmas', date: '2026-12-25' },
]

function statusColor(status) {
  if (status === 'Approved') return 'green'
  if (status === 'Rejected') return 'red'
  return 'gold'
}

function formatHolidayDate(value) {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return `${format(date, 'dd-MMM-yyyy')} ${format(date, 'EEE')}`
}

function formatRangeLabel(startDate, endDate) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—'
  if (format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')) {
    return format(start, 'dd-MMM-yyyy')
  }
  return `${format(start, 'dd-MMM-yyyy')} - ${format(end, 'dd-MMM-yyyy')}`
}

function leaveDurationDays(start, end) {
  if (!start?.isValid?.() || !end?.isValid?.()) return null
  if (end.isBefore(start, 'day')) return null
  return end.diff(start, 'day') + 1
}

function LeaveEmpty({ title, actionLabel, onAction }) {
  return (
    <div className="pulse-leave-empty">
      <div className="pulse-leave-empty-art" aria-hidden="true">
        <img
          className="pulse-leave-empty-img"
          src={leaveEmptyArt}
          alt=""
          width={180}
          height={180}
          draggable={false}
        />
      </div>
      <p>{title}</p>
      {actionLabel ? (
        <Button type="primary" className="pulse-leave-empty-btn" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}

function saveBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function downloadCsv(filename, headers, rows) {
  const escape = (cell) => {
    const text = cell == null ? '' : String(cell)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n')
  saveBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
}

async function downloadXlsx(filename, sheetName, headers, rows) {
  const xlsx = await import('xlsx')
  const sheet = xlsx.utils.aoa_to_sheet([headers, ...rows])
  sheet['!cols'] = headers.map((header, index) => {
    const widest = [header, ...rows.map((row) => row[index])].reduce(
      (longest, cell) => Math.max(longest, String(cell ?? '').length),
      0,
    )
    return { wch: Math.min(46, Math.max(12, widest + 2)) }
  })
  const book = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(book, sheet, sheetName)
  const buffer = xlsx.write(book, { bookType: 'xlsx', type: 'array', compression: true })
  saveBlob(
    filename,
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
}

function padCount(value) {
  return String(value).padStart(2, '0')
}

function cellText(value) {
  if (value == null) return ''
  if (value instanceof Date) return dayjs(value).format('DD-MMM-YYYY')
  return String(value).trim()
}

/** Reads the first sheet of an xlsx/xls/csv upload into a header row plus data rows. */
async function readSpreadsheet(file) {
  const xlsx = await import('xlsx')
  const book = xlsx.read(await file.arrayBuffer(), { cellDates: true, raw: false })
  const sheet = book.Sheets[book.SheetNames[0]]
  if (!sheet) throw new Error('The file has no readable sheet')

  const grid = xlsx.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
  const [header = [], ...body] = grid
  const width = header.reduce((last, cell, index) => (cellText(cell) ? index + 1 : last), 0)
  if (!width) throw new Error('The first row must contain column names')

  const columns = header.slice(0, width).map((cell, index) => ({
    index,
    name: cellText(cell) || `Column ${index + 1}`,
  }))
  const rows = body
    .map((row) => Array.from({ length: width }, (_, index) => cellText(row[index])))
    .filter((row) => row.some(Boolean))

  return { columns, rows }
}

function normalizeHeader(text) {
  return String(text)
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function autoMapFields(columns) {
  const byName = new Map()
  columns.forEach((column) => {
    const key = normalizeHeader(column.name)
    if (key && !byName.has(key)) byName.set(key, column.index)
  })
  return LEAVE_IMPORT_FIELDS.reduce((map, field) => {
    const match = byName.get(normalizeHeader(field.label))
    return match == null ? map : { ...map, [field.key]: match }
  }, {})
}

function parseImportDate(value) {
  if (!value) return null
  const parsed = dayjs(value, ['DD-MMM-YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'D-M-YYYY'])
  return parsed.isValid() ? parsed : null
}

/** Zoho-style per-row validation; every message lands in the import summary. */
function validateImportRow(row) {
  const errors = []

  LEAVE_IMPORT_FIELDS.filter((field) => field.required).forEach((field) => {
    if (!row[field.key]) errors.push(`Select a value for ${field.label}`)
  })

  if (row.leaveType && !IMPORT_LEAVE_TYPE_ALIASES.has(row.leaveType.toLowerCase())) {
    errors.push(`${row.leaveType} is not a supported leave type (use ${SUPPORTED_LEAVE_TYPES.join(', ')})`)
  }

  const from = parseImportDate(row.from)
  const to = parseImportDate(row.to)
  if (row.from && !from) errors.push('From is not a valid date')
  if (row.to && !to) errors.push('To is not a valid date')
  if (from && to && to.isBefore(from, 'day')) errors.push('To cannot be earlier than From')

  if (row.daysHours && !(Number(row.daysHours) > 0)) {
    errors.push('Days / Hours taken must be a number greater than zero')
  }

  return { errors, from, to }
}

function ImportArt() {
  return (
    <svg
      className="pulse-import-art"
      viewBox="0 0 360 250"
      role="img"
      aria-label="Supported file formats: xls, xlsx and csv"
    >
      <g fill="none" stroke="#dfe4ec" strokeWidth="1.5">
        <rect x="116" y="40" width="104" height="140" rx="6" />
      </g>

      <g transform="rotate(-12 78 140)">
        <rect x="26" y="70" width="104" height="140" rx="6" fill="#fff" stroke="#e3e8ef" strokeWidth="1.5" />
        <circle cx="78" cy="118" r="25" fill="#eef2f7" stroke="#c9d5e3" strokeWidth="1.5" />
        <path d="M54.3 110 A25 25 0 0 1 101.7 110 Z" fill="#dbe4ee" />
        <path d="M69 130 Q78 146 87 130 Z" fill="#e6ecf4" stroke="#c9d5e3" strokeWidth="1.2" />
        <g fill="#fff" stroke="#93a5ba" strokeWidth="1.6">
          <circle cx="69" cy="119" r="7.5" />
          <circle cx="87" cy="119" r="7.5" />
        </g>
        <path d="M76.5 119 H79.5" stroke="#93a5ba" strokeWidth="1.6" />
        <g fill="#eceff4">
          <rect x="42" y="162" width="72" height="6" rx="3" />
          <rect x="42" y="176" width="56" height="6" rx="3" />
        </g>
        <rect x="72" y="182" width="62" height="26" rx="5" fill="#f2703a" />
        <text x="103" y="200" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700">XLSX</text>
      </g>

      <g transform="rotate(12 282 140)">
        <rect x="230" y="70" width="104" height="140" rx="6" fill="#fff" stroke="#e3e8ef" strokeWidth="1.5" />
        <circle cx="282" cy="118" r="25" fill="#eef2f7" stroke="#c9d5e3" strokeWidth="1.5" />
        <path d="M258.3 110 A25 25 0 0 1 305.7 110 Z" fill="#dbe4ee" />
        <g fill="none" stroke="#7d8ea4" strokeWidth="1.8" strokeLinecap="round">
          <path d="M272 115 Q275 111 278 115" />
          <path d="M286 115 Q289 111 292 115" />
          <path d="M266 126 L259 122" />
          <path d="M298 126 L305 122" />
        </g>
        <rect x="266" y="121" width="32" height="18" rx="7" fill="#fff" stroke="#93a5ba" strokeWidth="1.5" />
        <g fill="#eceff4">
          <rect x="246" y="162" width="72" height="6" rx="3" />
          <rect x="246" y="176" width="56" height="6" rx="3" />
        </g>
        <rect x="288" y="182" width="50" height="26" rx="5" fill="#35a853" />
        <text x="313" y="200" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700">CSV</text>
      </g>

      <g>
        <rect x="128" y="52" width="104" height="140" rx="6" fill="#fff" stroke="#e3e8ef" strokeWidth="1.5" />
        <circle cx="180" cy="100" r="27" fill="#eef2f7" stroke="#c9d5e3" strokeWidth="1.5" />
        <path d="M154.9 90 A27 27 0 0 1 205.1 90 Z" fill="#d7dfe9" />
        <g fill="none" stroke="#7d8ea4" strokeWidth="1.8" strokeLinecap="round">
          <path d="M170 98 Q173 94 176 98" />
          <path d="M184 98 Q187 94 190 98" />
          <path d="M170 108 Q180 118 190 108" />
        </g>
        <g fill="#eceff4">
          <rect x="144" y="146" width="72" height="6" rx="3" />
          <rect x="144" y="160" width="56" height="6" rx="3" />
        </g>
        <rect x="186" y="164" width="50" height="26" rx="5" fill="#1f87e8" />
        <text x="211" y="182" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700">XLS</text>
      </g>

      <g>
        <circle cx="306" cy="48" r="23" fill="#d7e4f4" />
        <g fill="none" stroke="#5b7290" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M306 38 V54" />
          <path d="M300 48 L306 54 L312 48" />
          <path d="M297 60 H315" />
        </g>
      </g>
    </svg>
  )
}

function ImportSteps({ current }) {
  return (
    <ol className="pulse-import-steps">
      {IMPORT_STEPS.map((label, index) => {
        const step = index + 1
        const state = step === current ? 'is-current' : step < current ? 'is-done' : ''
        return (
          <li key={label} className={`pulse-import-step ${state}`}>
            <span className="pulse-import-step-dot">{step}</span>
            <span className="pulse-import-step-label">{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function ImportPager({ total, page, onPage }) {
  const lastPage = Math.max(1, Math.ceil(total / IMPORT_PAGE_SIZE))
  const start = total === 0 ? 0 : (page - 1) * IMPORT_PAGE_SIZE + 1
  const end = Math.min(page * IMPORT_PAGE_SIZE, total)

  return (
    <div className="pulse-import-pager">
      <Button
        type="text"
        size="small"
        icon={<LeftOutlined />}
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      />
      <span>{start} - {end}</span>
      <Button
        type="text"
        size="small"
        icon={<RightOutlined />}
        aria-label="Next page"
        disabled={page >= lastPage}
        onClick={() => onPage(page + 1)}
      />
    </div>
  )
}

function FilterSelect({ value, onChange, options }) {
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return options
    return options.filter((option) => option.label.toLowerCase().includes(term))
  }, [options, query])

  return (
    <Select
      value={value}
      onChange={onChange}
      options={visible}
      showSearch={false}
      className="pulse-leave-select"
      classNames={{ popup: { root: 'pulse-leave-filter-dropdown' } }}
      onOpenChange={(open) => {
        if (!open) setQuery('')
      }}
      popupRender={(menu) => (
        <>
          <div className="pulse-leave-filter-search">
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              prefix={<SearchOutlined />}
              aria-label="Search options"
            />
          </div>
          {menu}
        </>
      )}
    />
  )
}

function LeaveCard({ children, footer }) {
  return (
    <div className="pulse-leave-card">
      <div className="pulse-leave-card-scroll">{children}</div>
      {footer}
    </div>
  )
}

function LeavePagination({ total, page, pageSize, onPage, onPageSize }) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 1 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="pulse-leave-pager">
      <span className="pulse-leave-pager-count">
        Total Record Count : <strong>{total}</strong>
      </span>
      <div className="pulse-leave-pager-right">
        <Select
          value={pageSize}
          onChange={onPageSize}
          className="pulse-leave-pager-select"
          classNames={{ popup: { root: 'pulse-leave-pager-dropdown' } }}
          options={PAGE_SIZE_OPTIONS.map((size) => ({ value: size, label: String(size) }))}
        />
        <span className="pulse-leave-pager-label">Records per page</span>
        <Button
          type="text"
          size="small"
          icon={<LeftOutlined />}
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        />
        <span className="pulse-leave-pager-range">{start} - {end}</span>
        <Button
          type="text"
          size="small"
          icon={<RightOutlined />}
          aria-label="Next page"
          disabled={page >= lastPage}
          onClick={() => onPage(page + 1)}
        />
      </div>
    </div>
  )
}

export default function PulseLeaveTracker({
  sample = false,
  casualBalance,
  mainTab = 'mydata',
  myTab = 'summary',
  onMyTabChange,
}) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(!sample)
  const [submitting, setSubmitting] = useState(false)
  const [requests, setRequests] = useState(sample ? SAMPLE_REQUESTS : [])
  const [casual, setCasual] = useState(
    sample ? SAMPLE_CASUAL : casualBalance || { used: 0, total: CASUAL_ANNUAL, remaining: CASUAL_ANNUAL },
  )
  const [requestFilter, setRequestFilter] = useState('Leave')
  const [notifyEmails, setNotifyEmails] = useState(TEAM_NOTIFY_EMAILS)
  const [addOpen, setAddOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftFilter, setDraftFilter] = useState(defaultFilter)
  const [appliedFilter, setAppliedFilter] = useState(defaultFilter)
  const [holidayYear, setHolidayYear] = useState(2026)
  const [myHolidays, setMyHolidays] = useState([])
  const [galleryPick, setGalleryPick] = useState({})
  const [teamWeek, setTeamWeek] = useState(() => dayjs())
  const [importOpen, setImportOpen] = useState(false)
  const [importTarget, setImportTarget] = useState('Leave')
  const [importFile, setImportFile] = useState(null)
  const [importStep, setImportStep] = useState(0)
  const [importBusy, setImportBusy] = useState(false)
  const [importSheet, setImportSheet] = useState(null)
  const [importMap, setImportMap] = useState({})
  const [importMapFilter, setImportMapFilter] = useState('all')
  const [importSectionOpen, setImportSectionOpen] = useState(true)
  const [autoMapAsk, setAutoMapAsk] = useState(false)
  const [verifyPage, setVerifyPage] = useState(1)
  const [importResult, setImportResult] = useState(null)
  const [summaryTab, setSummaryTab] = useState('errors')
  const [summaryPage, setSummaryPage] = useState(1)
  const [requestPage, setRequestPage] = useState(1)
  const [requestPageSize, setRequestPageSize] = useState(PAGE_SIZE_OPTIONS[0])
  const [holidayPage, setHolidayPage] = useState(1)
  const [holidayPageSize, setHolidayPageSize] = useState(PAGE_SIZE_OPTIONS[0])

  const filterActive = useMemo(() => {
    const base = defaultFilter()
    return (
      appliedFilter.period !== base.period ||
      appliedFilter.type !== 'all' ||
      appliedFilter.leaveTypes.length > 0 ||
      appliedFilter.holidayClass !== 'all' ||
      !appliedFilter.from?.isSame(base.from, 'day') ||
      !appliedFilter.to?.isSame(base.to, 'day')
    )
  }, [appliedFilter])

  const openFilter = () => {
    setDraftFilter({ ...appliedFilter })
    setFilterOpen(true)
  }

  const updatePeriod = (period) => {
    const range = rangeForPeriod(period)
    setDraftFilter((prev) => ({
      ...prev,
      period,
      from: range ? range[0] : prev.from,
      to: range ? range[1] : prev.to,
    }))
  }

  const applyFilter = () => {
    const next = { ...draftFilter }
    if (next.period !== 'custom') {
      const range = rangeForPeriod(next.period)
      if (range) {
        next.from = range[0]
        next.to = range[1]
      }
    }
    setAppliedFilter(next)
    if (next.from) {
      setHolidayYear(next.from.year())
      setTeamWeek(next.from)
    }
    setRequestPage(1)
    setHolidayPage(1)
    setFilterOpen(false)
  }

  const resetFilter = () => {
    const next = defaultFilter()
    setDraftFilter(next)
    setAppliedFilter(next)
    setHolidayYear(next.from.year())
    setTeamWeek(dayjs())
  }

  const load = useCallback(async () => {
    if (sample) {
      setRequests(SAMPLE_REQUESTS)
      setCasual(SAMPLE_CASUAL)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await api.get('/pulse-checkin/leaves')
      setRequests(Array.isArray(res.data?.data) ? res.data.data : [])
      if (res.data?.casual) setCasual(res.data.casual)
      if (Array.isArray(res.data?.notifyEmails) && res.data.notifyEmails.length) {
        setNotifyEmails(res.data.notifyEmails)
      }
    } catch {
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [sample])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!sample && casualBalance) setCasual(casualBalance)
  }, [sample, casualBalance])

  const remaining = Math.max(0, Number(casual.remaining ?? (casual.total - casual.used)) || 0)
  const applyStartDate = Form.useWatch('startDate', form)
  const applyEndDate = Form.useWatch('endDate', form)
  const applyLeaveDays = useMemo(
    () => leaveDurationDays(applyStartDate, applyEndDate),
    [applyStartDate, applyEndDate],
  )
  const used = Math.max(0, Number(casual.used) || 0)
  const total = Number(casual.total) || CASUAL_ANNUAL
  const usedPct = total > 0 ? Math.round((used / total) * 100) : 0

  const filteredRequests = useMemo(() => {
    return requests.filter((row) => {
      if (requestFilter !== 'Leave' && row.type !== requestFilter) return false
      const start = dayjs(row.startDate)
      const end = dayjs(row.endDate)
      if (appliedFilter.from && end.isBefore(appliedFilter.from, 'day')) return false
      if (appliedFilter.to && start.isAfter(appliedFilter.to, 'day')) return false
      const kind = leaveKind(row)
      if (appliedFilter.type === 'paid' && !PAID_LEAVE_TYPES.includes(kind)) return false
      if (appliedFilter.type === 'unpaid' && !UNPAID_LEAVE_TYPES.includes(kind)) return false
      if (appliedFilter.type === 'onDuty' && kind !== 'On Duty') return false
      if (appliedFilter.type === 'compensatoryOff' && kind !== 'Compensatory Off') return false
      if (appliedFilter.type === 'restrictedHolidays' && kind !== 'Restricted Holidays') return false
      if (appliedFilter.leaveTypes.length > 0 && !appliedFilter.leaveTypes.includes(kind)) return false
      return true
    })
  }, [requests, requestFilter, appliedFilter])

  const teamRangeLabel = useMemo(() => {
    const start = startOfWeek(teamWeek.toDate(), { weekStartsOn: 0 })
    const end = endOfWeek(teamWeek.toDate(), { weekStartsOn: 0 })
    return `${format(start, 'dd-MMM-yyyy')} - ${format(end, 'dd-MMM-yyyy')}`
  }, [teamWeek])

  const holidayYearLabel = `01-Jan-${holidayYear} - 31-Dec-${holidayYear}`

  const galleryRows = useMemo(
    () => INDIA_HOLIDAYS_2026.filter((row) => row.date.startsWith(String(holidayYear))),
    [holidayYear],
  )

  const pagedRequests = useMemo(
    () => filteredRequests.slice((requestPage - 1) * requestPageSize, requestPage * requestPageSize),
    [filteredRequests, requestPage, requestPageSize],
  )

  const visibleHolidays = useMemo(
    () =>
      myHolidays.filter((row) => {
        if (!row.date.startsWith(String(holidayYear))) return false
        const date = dayjs(row.date)
        if (appliedFilter.from && date.isBefore(appliedFilter.from, 'day')) return false
        if (appliedFilter.to && date.isAfter(appliedFilter.to, 'day')) return false
        if (appliedFilter.holidayClass !== 'all' && (row.classification || 'Holiday') !== appliedFilter.holidayClass) {
          return false
        }
        return true
      }),
    [myHolidays, holidayYear, appliedFilter],
  )

  const pagedHolidays = useMemo(
    () => visibleHolidays.slice((holidayPage - 1) * holidayPageSize, holidayPage * holidayPageSize),
    [visibleHolidays, holidayPage, holidayPageSize],
  )

  const columns = useMemo(
    () => [
      {
        title: 'Leave type',
        dataIndex: 'type',
        width: 120,
        render: (value) => <Tag>{value || 'Casual'}</Tag>,
      },
      {
        title: 'From - To',
        key: 'dates',
        render: (_, row) => formatRangeLabel(row.startDate, row.endDate),
      },
      {
        title: 'Days',
        dataIndex: 'days',
        width: 70,
        align: 'center',
      },
      {
        title: 'Reason',
        dataIndex: 'reason',
        ellipsis: true,
      },
      {
        title: 'Status',
        dataIndex: 'status',
        width: 110,
        render: (value) => <Tag color={statusColor(value)}>{value}</Tag>,
      },
    ],
    [],
  )

  const holidayColumns = useMemo(
    () => [
      { title: 'Holiday', dataIndex: 'name' },
      {
        title: 'Date',
        dataIndex: 'date',
        width: 180,
        render: (value) => formatHolidayDate(value),
      },
      {
        title: 'Type',
        width: 120,
        render: () => 'Full Day',
      },
    ],
    [],
  )

  const onSubmit = async (values) => {
    if (sample) return
    setSubmitting(true)
    try {
      const res = await api.post('/pulse-checkin/leaves/apply', {
        leaveType: values.leaveType,
        startDate: values.startDate.format('YYYY-MM-DD'),
        endDate: values.endDate.format('YYYY-MM-DD'),
        teamEmailId: values.teamEmailId,
        reason: values.reason,
      })
      form.resetFields()
      setAddOpen(false)
      message.success({
        content: res.data?.notified
          ? `Leave request submitted · ${values.teamEmailId} notified`
          : 'Leave request submitted',
        className: 'pulse-message',
      })
      await load()
      onMyTabChange?.('requests')
    } catch (err) {
      message.error({
        content: err.response?.data?.message || err.message || 'Failed to submit leave request',
        className: 'pulse-message',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const exportRequests = () => {
    downloadCsv(
      `leave-requests-${dayjs().format('YYYY-MM-DD')}.csv`,
      ['Leave type', 'From', 'To', 'Days', 'Reason', 'Status'],
      filteredRequests.map((row) => [
        leaveKind(row),
        row.startDate,
        row.endDate,
        row.days,
        row.reason,
        row.status,
      ]),
    )
  }

  const exportHolidays = () => {
    downloadCsv(
      `holidays-${holidayYear}.csv`,
      ['Holiday', 'Date', 'Type'],
      visibleHolidays.map((row) => [row.name, row.date, 'Full Day']),
    )
  }

  const openImport = () => {
    setImportTarget('Leave')
    setImportFile(null)
    setImportSheet(null)
    setImportMap({})
    setImportMapFilter('all')
    setImportSectionOpen(true)
    setImportResult(null)
    setVerifyPage(1)
    setSummaryPage(1)
    setImportStep(0)
    setImportOpen(true)
  }

  const closeImport = () => {
    setImportOpen(false)
    setAutoMapAsk(false)
    if (importResult?.added.length) {
      resetFilter()
      setRequestPage(1)
      onMyTabChange?.('requests')
    }
  }

  const moreMenu = (onExport, hasRows) => ({
    items: [
      { key: 'import', icon: <DownloadOutlined />, label: 'Import' },
      { key: 'export', icon: <UploadOutlined />, label: 'Export' },
    ],
    onClick: ({ key }) => {
      if (key === 'import') {
        openImport()
        return
      }
      if (!hasRows) {
        message.info({ content: 'Nothing to export yet', className: 'pulse-message' })
        return
      }
      onExport()
    },
  })

  const pickImportFile = (file) => {
    if (!/\.(xls|xlsx|csv)$/i.test(file.name)) {
      message.error({
        content: 'Only xls, xlsx and csv formats are supported',
        className: 'pulse-message',
      })
      return Upload.LIST_IGNORE
    }
    if (file.size > IMPORT_MAX_MB * 1024 * 1024) {
      message.error({
        content: `Maximum upload file size is ${IMPORT_MAX_MB} MB`,
        className: 'pulse-message',
      })
      return Upload.LIST_IGNORE
    }
    setImportFile(file)
    return false
  }

  const downloadTemplate = async () => {
    const { filename, sheet, headers, rows } = leaveImportTemplate()
    try {
      await downloadXlsx(filename, sheet, headers, rows)
    } catch {
      message.error({ content: 'Could not build the template file', className: 'pulse-message' })
    }
  }

  const mappedCount = useMemo(
    () => LEAVE_IMPORT_FIELDS.filter((field) => importMap[field.key] != null).length,
    [importMap],
  )

  const visibleMapFields = useMemo(() => {
    if (importMapFilter === 'mapped') return LEAVE_IMPORT_FIELDS.filter((f) => importMap[f.key] != null)
    if (importMapFilter === 'unmapped') return LEAVE_IMPORT_FIELDS.filter((f) => importMap[f.key] == null)
    return LEAVE_IMPORT_FIELDS
  }, [importMapFilter, importMap])

  const columnOptions = useMemo(() => {
    if (!importSheet) return []
    return [
      { value: null, label: 'Select', title: '' },
      ...importSheet.columns.map((column) => ({ value: column.index, label: column.name, title: '' })),
    ]
  }, [importSheet])

  const mappedFields = useMemo(
    () => LEAVE_IMPORT_FIELDS.filter((field) => importMap[field.key] != null),
    [importMap],
  )

  const verifyRows = useMemo(() => {
    if (!importSheet) return []
    return importSheet.rows.map((cells, index) => {
      const record = { key: `row-${index}`, rowNo: index + 2 }
      LEAVE_IMPORT_FIELDS.forEach((field) => {
        const column = importMap[field.key]
        record[field.key] = column == null ? '' : cells[column] || ''
      })
      return record
    })
  }, [importSheet, importMap])

  const applyAutoMap = () => {
    const next = autoMapFields(importSheet?.columns || [])
    setImportMap(next)
    setAutoMapAsk(false)
    const matched = Object.keys(next).length
    message.success({
      content: matched
        ? `Mapped ${matched} of ${LEAVE_IMPORT_FIELDS.length} fields`
        : 'No column names matched the leave fields',
      className: 'pulse-message',
    })
  }

  const resetMapping = () => {
    setImportMap({})
    setImportMapFilter('all')
  }

  const parseImportFile = async () => {
    if (!importFile) {
      message.warning({ content: 'Attach a file to continue', className: 'pulse-message' })
      return
    }
    setImportBusy(true)
    try {
      const sheet = await readSpreadsheet(importFile)
      if (!sheet.rows.length) {
        message.error({ content: 'The file has no data rows', className: 'pulse-message' })
        return
      }
      setImportSheet(sheet)
      setImportMap(autoMapFields(sheet.columns))
      setImportMapFilter('all')
      setImportStep(1)
    } catch (err) {
      message.error({
        content: err.message || 'Could not read the file',
        className: 'pulse-message',
      })
    } finally {
      setImportBusy(false)
    }
  }

  const goToVerify = () => {
    const missing = LEAVE_IMPORT_FIELDS.filter((field) => field.required && importMap[field.key] == null)
    if (missing.length) {
      message.error({
        content: `Select a value for ${missing.map((field) => field.label).join(', ')}`,
        className: 'pulse-message',
      })
      return
    }
    setVerifyPage(1)
    setImportStep(2)
  }

  const runImport = async () => {
    const rejected = []
    const candidates = []

    verifyRows.forEach((row) => {
      const { errors, from, to } = validateImportRow(row)
      if (errors.length) rejected.push({ rowNo: row.rowNo, errors })
      else candidates.push({ row, from, to })
    })

    setImportBusy(true)
    try {
      let added = []
      let serverRejected = []

      if (candidates.length && sample) {
        added = candidates.map(({ row, from, to }) => ({
          rowNo: row.rowNo,
          id: `import-${row.rowNo}`,
          type: row.leaveType,
          startDate: from.toISOString(),
          endDate: to.toISOString(),
          days: to.diff(from, 'day') + 1,
          reason: row.reason || 'Imported leave',
          status: 'Pending',
        }))
        setRequests((prev) => [
          ...added.map((row) => ({
            ...row,
            startDate: dayjs(row.startDate).format('YYYY-MM-DD'),
            endDate: dayjs(row.endDate).format('YYYY-MM-DD'),
          })),
          ...prev,
        ])
      } else if (candidates.length) {
        const res = await api.post('/pulse-checkin/leaves/import', {
          rows: candidates.map(({ row, from, to }) => ({
            rowNo: row.rowNo,
            employeeId: row.employeeId,
            leaveType: row.leaveType,
            from: from.format('YYYY-MM-DD'),
            to: to.format('YYYY-MM-DD'),
            reason: row.reason,
          })),
        })
        added = Array.isArray(res.data?.added) ? res.data.added : []
        serverRejected = Array.isArray(res.data?.skipped) ? res.data.skipped : []
      }

      const byRow = new Map(verifyRows.map((row) => [row.rowNo, row]))
      const skipped = []
      const errors = []
      ;[...rejected, ...serverRejected]
        .sort((a, b) => a.rowNo - b.rowNo)
        .forEach(({ rowNo, errors: list }) => {
          const row = byRow.get(rowNo)
          if (row) skipped.push(row)
          ;(list || []).forEach((detail) => errors.push({ key: `${rowNo}-${detail}`, rowNo, detail }))
        })

      setImportResult({
        added: added.map((row) => ({
          key: `added-${row.rowNo ?? row.id}`,
          rowNo: row.rowNo,
          leaveType: row.type || row.leaveType,
          startDate: dayjs(row.startDate).format('DD-MMM-YYYY'),
          endDate: dayjs(row.endDate).format('DD-MMM-YYYY'),
          days: row.days,
          reason: row.reason,
        })),
        updated: [],
        skipped,
        errors,
      })
      setSummaryTab(errors.length ? 'errors' : 'added')
      setSummaryPage(1)
      setImportStep(3)
      if (added.length && !sample) await load()
    } catch (err) {
      message.error({
        content: err.response?.data?.message || err.message || 'Failed to import leave requests',
        className: 'pulse-message',
      })
    } finally {
      setImportBusy(false)
    }
  }

  const downloadErrorFile = async () => {
    if (!importResult?.skipped.length) return
    const byRow = new Map()
    importResult.errors.forEach(({ rowNo, detail }) => {
      byRow.set(rowNo, [...(byRow.get(rowNo) || []), detail])
    })
    try {
      await downloadXlsx(
        `leave-import-errors-${dayjs().format('YYYY-MM-DD')}.xlsx`,
        'Errors',
        ['Row number', ...LEAVE_IMPORT_FIELDS.map((field) => field.label), 'Errors'],
        importResult.skipped.map((row) => [
          row.rowNo,
          ...LEAVE_IMPORT_FIELDS.map((field) => row[field.key]),
          (byRow.get(row.rowNo) || []).join('; '),
        ]),
      )
    } catch {
      message.error({ content: 'Could not build the error file', className: 'pulse-message' })
    }
  }

  const importNext = () => {
    if (importStep === 0) {
      parseImportFile()
      return
    }
    if (importStep === 1) {
      goToVerify()
      return
    }
    runImport()
  }

  const addSelectedHolidays = () => {
    const picked = galleryRows.filter((row) => galleryPick[row.id])
    if (!picked.length) {
      message.info({ content: 'Select at least one holiday', className: 'pulse-message' })
      return
    }
    setMyHolidays((prev) => {
      const map = new Map(prev.map((row) => [row.id, row]))
      picked.forEach((row) => map.set(row.id, row))
      return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
    })
    setGalleryPick({})
    setGalleryOpen(false)
    message.success({ content: 'Holidays added', className: 'pulse-message' })
  }

  const verifyColumns = useMemo(
    () => [
      {
        title: 'Row no',
        dataIndex: 'rowNo',
        width: 90,
        fixed: 'left',
        render: (value) => `Row ${value}`,
      },
      {
        title: 'Leave',
        children: mappedFields.map((field) => ({
          title: field.label,
          dataIndex: field.key,
          width: 150,
          ellipsis: true,
          render: (value) => value || '—',
        })),
      },
    ],
    [mappedFields],
  )

  const renderImportUpload = () => (
    <>
      <label className="pulse-import-field">
        <span>Import data for:</span>
        <FilterSelect value={importTarget} onChange={setImportTarget} options={IMPORT_TARGETS} />
      </label>

      <Upload.Dragger
        name="file"
        accept=".xls,.xlsx,.csv"
        multiple={false}
        maxCount={1}
        showUploadList={false}
        beforeUpload={pickImportFile}
        className="pulse-import-drop"
      >
        <ImportArt />
        <p className="pulse-import-title">Drag and drop attachment here</p>
        <p className="pulse-import-note">[only xls, xlsx and csv formats are supported]</p>
        <Button type="primary" className="pulse-leave-add-btn pulse-import-btn">
          Upload File
        </Button>
        {importFile ? (
          <p className="pulse-import-file">{importFile.name}</p>
        ) : (
          <p className="pulse-import-note">Maximum upload file size is {IMPORT_MAX_MB} MB.</p>
        )}
        <button
          type="button"
          className="pulse-import-link"
          onClick={(event) => {
            event.stopPropagation()
            downloadTemplate()
          }}
        >
          Download sample template
        </button>
      </Upload.Dragger>
    </>
  )

  const renderImportMap = () => (
    <>
      <div className="pulse-import-bar">
        <div className="pulse-import-chips">
          {[
            { key: 'all', label: 'All' },
            { key: 'mapped', label: 'Mapped', count: mappedCount },
            { key: 'unmapped', label: 'Unmapped', count: LEAVE_IMPORT_FIELDS.length - mappedCount },
          ].map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`pulse-import-chip${importMapFilter === chip.key ? ' is-on' : ''}`}
              onClick={() => setImportMapFilter(chip.key)}
            >
              {chip.label}
              {chip.count == null ? null : <em>{padCount(chip.count)}</em>}
            </button>
          ))}
        </div>
        <div className="pulse-import-bar-actions">
          <Button className="pulse-import-reset" onClick={resetMapping}>
            Reset Fields
          </Button>
          <Button className="pulse-import-automap" onClick={() => setAutoMapAsk(true)}>
            Auto Map Fields
          </Button>
        </div>
      </div>

      <div className="pulse-import-scroll">
        <p className="pulse-import-hint">
          <strong>{importFile?.name}</strong> · {mappedCount} of {LEAVE_IMPORT_FIELDS.length} fields matched
          your columns automatically. Change anything that looks wrong, then continue. Rows with a blank
          employee ID are added to your own leave list.
        </p>

        <section className="pulse-import-section">
          <header className="pulse-import-section-head">
            <h4>Leave</h4>
            <Button
              type="text"
              size="small"
              aria-label={importSectionOpen ? 'Collapse Leave fields' : 'Expand Leave fields'}
              icon={importSectionOpen ? <UpOutlined /> : <DownOutlined />}
              onClick={() => setImportSectionOpen((open) => !open)}
            />
          </header>

          {importSectionOpen ? (
            <div className="pulse-import-map-grid">
              {visibleMapFields.map((field) => (
                <label key={field.key} className="pulse-import-map-field">
                  <span className="pulse-import-map-label">
                    {field.label}
                    {importMap[field.key] == null ? null : <em>(c:{importMap[field.key]})</em>}
                    {field.required ? <i aria-hidden="true">*</i> : null}
                  </span>
                  <FilterSelect
                    value={importMap[field.key] ?? -1}
                    onChange={(value) =>
                      setImportMap((prev) => ({ ...prev, [field.key]: value === -1 ? null : value }))
                    }
                    options={columnOptions}
                  />
                </label>
              ))}
              {visibleMapFields.length === 0 ? (
                <p className="pulse-import-note">No fields in this view.</p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <Modal
        open={autoMapAsk}
        onCancel={() => setAutoMapAsk(false)}
        centered
        width={430}
        footer={null}
        className="pulse-import-confirm"
        title={null}
      >
        <span className="pulse-import-confirm-icon" aria-hidden="true">
          <InfoCircleFilled />
        </span>
        <h4>Auto Map Fields?</h4>
        <p>The system will map the fields and fill in the details.</p>
        <div className="pulse-import-confirm-actions">
          <Button type="primary" className="pulse-leave-add-btn" onClick={applyAutoMap}>
            Confirm
          </Button>
          <Button onClick={() => setAutoMapAsk(false)}>Cancel</Button>
        </div>
      </Modal>
    </>
  )

  const renderImportVerify = () => (
    <>
      <div className="pulse-import-scroll is-table">
        <Table
          size="middle"
          rowKey="key"
          pagination={false}
          columns={verifyColumns}
          dataSource={verifyRows.slice((verifyPage - 1) * IMPORT_PAGE_SIZE, verifyPage * IMPORT_PAGE_SIZE)}
          scroll={{ x: 'max-content' }}
          className="pulse-leave-table pulse-import-table"
        />
      </div>
      <div className="pulse-import-count">
        <span>
          Total Record Count : <strong>{verifyRows.length}</strong>
        </span>
        <ImportPager total={verifyRows.length} page={verifyPage} onPage={setVerifyPage} />
      </div>
    </>
  )

  const renderImportSummary = () => {
    const result = importResult || { added: [], updated: [], skipped: [], errors: [] }
    const rows = result[summaryTab] || []
    const columnsByTab = {
      added: [
        { title: 'Row no', dataIndex: 'rowNo', width: 110, render: (value) => `Row ${value}` },
        { title: 'Leave type', dataIndex: 'leaveType', width: 150 },
        { title: 'From', dataIndex: 'startDate', width: 140 },
        { title: 'To', dataIndex: 'endDate', width: 140 },
        { title: 'Days', dataIndex: 'days', width: 90 },
        { title: 'Reason for leave', dataIndex: 'reason', ellipsis: true },
      ],
      errors: [
        { title: 'Row no', dataIndex: 'rowNo', width: 120, render: (value) => `Row ${value}` },
        { title: 'Error Details', dataIndex: 'detail' },
      ],
    }
    const columns = columnsByTab[summaryTab] || verifyColumns

    return (
      <>
        <div className="pulse-import-summary-head">
          {result.errors.length ? (
            <p className="pulse-import-summary-note">
              Rectify the errors mentioned in the given{' '}
              <button type="button" className="pulse-import-link" onClick={downloadErrorFile}>
                link
              </button>{' '}
              and try importing again.
            </p>
          ) : (
            <p className="pulse-import-summary-note">
              {result.added.length} record{result.added.length === 1 ? '' : 's'} imported successfully.
            </p>
          )}

          <div className="pulse-import-chips">
            {[
              { key: 'added', label: 'Added records', count: result.added.length },
              { key: 'updated', label: 'Updated records', count: result.updated.length },
              { key: 'skipped', label: 'Skipped records', count: result.skipped.length },
              { key: 'errors', label: 'Record errors', count: result.errors.length },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`pulse-import-chip${summaryTab === tab.key ? ' is-on' : ''}`}
                onClick={() => {
                  setSummaryTab(tab.key)
                  setSummaryPage(1)
                }}
              >
                {tab.label}
                <em>{padCount(tab.count)}</em>
              </button>
            ))}
          </div>
        </div>

        <div className="pulse-import-scroll is-table">
          <Table
            size="middle"
            rowKey={(row) => row.key || row.id}
            pagination={false}
            columns={columns}
            dataSource={rows.slice((summaryPage - 1) * IMPORT_PAGE_SIZE, summaryPage * IMPORT_PAGE_SIZE)}
            scroll={{ x: 'max-content' }}
            className="pulse-leave-table pulse-import-table"
            locale={{ emptyText: <Empty image={null} description="No records" /> }}
          />
        </div>
        <div className="pulse-import-count">
          <ImportPager total={rows.length} page={summaryPage} onPage={setSummaryPage} />
        </div>
      </>
    )
  }

  const renderMyData = () => {
    if (myTab === 'shift') {
      return (
        <LeaveCard>
          <LeaveEmpty title="Shift schedule is coming soon." />
        </LeaveCard>
      )
    }

    if (myTab === 'summary') {
      return (
        <div className="pulse-leave-summary">
          <div className="pulse-leave-summary-grid">
            <article className="pulse-leave-summary-card is-tracked">
              <span className="pulse-leave-summary-label">Casual leave</span>
              <strong>{remaining}</strong>
              <small>of {total} days left</small>
              <Progress percent={usedPct} strokeColor="#1a5f4a" size="small" showInfo={false} />
              <Tag color="green" bordered={false}>Tracked · {used} used</Tag>
            </article>
            <article className="pulse-leave-summary-card is-muted">
              <span className="pulse-leave-summary-label">Sick leave</span>
              <strong>—</strong>
              <small>Not tracked yet</small>
            </article>
            <article className="pulse-leave-summary-card is-muted">
              <span className="pulse-leave-summary-label">Medical leave</span>
              <strong>—</strong>
              <small>Not tracked yet</small>
            </article>
          </div>
        </div>
      )
    }

    return (
      <>
        <div className="pulse-leave-toolbar">
          <Select
            value={requestFilter}
            onChange={setRequestFilter}
            className="pulse-leave-select"
            options={[{ value: 'Leave', label: 'Leave', title: '' }]}
          />
          <div className="pulse-leave-toolbar-right">
            <Button
              icon={<FilterOutlined />}
              aria-label="Filter"
              className={filterActive ? 'is-on' : ''}
              onClick={openFilter}
            />
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              rootClassName="pulse-leave-more-menu"
              menu={moreMenu(exportRequests, filteredRequests.length > 0)}
            >
              <Button icon={<EllipsisOutlined />} aria-label="More options" />
            </Dropdown>
          </div>
        </div>
        <LeaveCard
          footer={(
            <LeavePagination
              total={filteredRequests.length}
              page={requestPage}
              pageSize={requestPageSize}
              onPage={setRequestPage}
              onPageSize={(size) => {
                setRequestPageSize(size)
                setRequestPage(1)
              }}
            />
          )}
        >
          {filteredRequests.length === 0 && !loading ? (
            <LeaveEmpty title="No Data Found" actionLabel="Add Request" onAction={() => setAddOpen(true)} />
          ) : (
            <Table
              size="middle"
              rowKey="id"
              loading={loading}
              pagination={false}
              columns={columns}
              dataSource={pagedRequests}
              className="pulse-leave-table"
            />
          )}
        </LeaveCard>
      </>
    )
  }

  const renderTeam = () => (
    <>
      <div className="pulse-leave-toolbar pulse-leave-toolbar-center">
        <div className="pulse-leave-period">
          <Button
            type="text"
            icon={<LeftOutlined />}
            aria-label="Previous week"
            onClick={() => setTeamWeek((value) => value.subtract(1, 'week'))}
          />
          <Button type="text" icon={<CalendarOutlined />} aria-label="This week" />
          <Button
            type="text"
            icon={<RightOutlined />}
            aria-label="Next week"
            onClick={() => setTeamWeek((value) => value.add(1, 'week'))}
          />
          <span>{teamRangeLabel}</span>
        </div>
        <Button
          icon={<FilterOutlined />}
          aria-label="Filter"
          className={filterActive ? 'is-on' : ''}
          onClick={openFilter}
        />
      </div>
      <LeaveCard>
        <LeaveEmpty title="No team members on leave this week" />
      </LeaveCard>
    </>
  )

  const renderHolidays = () => (
    <>
      <div className="pulse-leave-toolbar pulse-leave-toolbar-center">
        <div className="pulse-leave-period">
          <Button
            type="text"
            icon={<LeftOutlined />}
            aria-label="Previous year"
            onClick={() => setHolidayYear((year) => year - 1)}
          />
          <Button type="text" icon={<CalendarOutlined />} aria-label="Calendar" />
          <Button
            type="text"
            icon={<RightOutlined />}
            aria-label="Next year"
            onClick={() => setHolidayYear((year) => year + 1)}
          />
          <span>{holidayYearLabel}</span>
        </div>
        <div className="pulse-leave-toolbar-right">
          <Button type="text" icon={<UnorderedListOutlined />} className="is-on" aria-label="List view" />
          <Button type="text" icon={<AppstoreOutlined />} aria-label="Calendar view" />
          <Select value="My Holidays" className="pulse-leave-select pulse-leave-select-sm" options={[{ value: 'My Holidays', label: 'My Holidays' }]} />
          <Dropdown
            menu={{
              items: [
                { key: 'gallery', label: 'Holidays Gallery' },
                { key: 'import', label: 'Import', disabled: true },
              ],
              onClick: ({ key }) => {
                if (key === 'gallery') setGalleryOpen(true)
              },
            }}
          >
            <Button type="primary" className="pulse-leave-add-btn">
              Add Holidays
            </Button>
          </Dropdown>
          <Button
            icon={<FilterOutlined />}
            aria-label="Filter"
            className={filterActive ? 'is-on' : ''}
            onClick={openFilter}
          />
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            rootClassName="pulse-leave-more-menu"
            menu={moreMenu(exportHolidays, visibleHolidays.length > 0)}
          >
            <Button icon={<EllipsisOutlined />} aria-label="More options" />
          </Dropdown>
        </div>
      </div>
      <LeaveCard
        footer={(
          <LeavePagination
            total={visibleHolidays.length}
            page={holidayPage}
            pageSize={holidayPageSize}
            onPage={setHolidayPage}
            onPageSize={(size) => {
              setHolidayPageSize(size)
              setHolidayPage(1)
            }}
          />
        )}
      >
        {visibleHolidays.length === 0 ? (
          <LeaveEmpty title="No holiday data to display currently" actionLabel="Add Holidays" onAction={() => setGalleryOpen(true)} />
        ) : (
          <Table
            size="middle"
            rowKey="id"
            pagination={false}
            columns={holidayColumns}
            dataSource={pagedHolidays}
            className="pulse-leave-table"
          />
        )}
      </LeaveCard>
    </>
  )

  return (
    <div className="pulse-leave-page">
      <div className="pulse-leave-shell">
        <div className="pulse-leave-panel">
          {mainTab === 'mydata' ? renderMyData() : null}
          {mainTab === 'team' ? renderTeam() : null}
          {mainTab === 'holidays' ? renderHolidays() : null}
        </div>
      </div>

      <Modal
        title="Apply Leave"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        destroyOnHidden
        centered={false}
        className="pulse-leave-modal"
        rootClassName="pulse-leave-modal-root"
        footer={(
          <div className="pulse-leave-apply-foot">
            <Button type="primary" loading={submitting} onClick={() => form.submit()}>
              Submit
            </Button>
            <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          </div>
        )}
      >
        <div className="pulse-leave-apply-body">
          <div className="pulse-leave-apply-card">
            <div className="pulse-leave-apply-card-head">Leave</div>
            <Form
              form={form}
              layout="horizontal"
              requiredMark
              colon={false}
              labelAlign="left"
              labelCol={{ flex: '0 0 180px' }}
              wrapperCol={{ flex: '1 1 auto' }}
              onFinish={onSubmit}
              disabled={sample}
              className="pulse-leave-apply-form"
            >
              <Form.Item
                name="leaveType"
                label="Leave type"
                rules={[{ required: true, message: 'Choose a leave type' }]}
              >
                <Select
                  placeholder="Select"
                  classNames={{ popup: { root: 'pulse-leave-filter-dropdown' } }}
                  options={SUPPORTED_LEAVE_TYPES.map((type) => ({ value: type, label: type, title: '' }))}
                />
              </Form.Item>
              <Form.Item label="Date" required className="pulse-leave-apply-date">
                <div className="pulse-leave-date-row">
                  <Form.Item
                    name="startDate"
                    noStyle
                    rules={[{ required: true, message: 'Choose a start date' }]}
                  >
                    <DatePicker
                      className="pulse-leave-date"
                      format="DD-MMM-YYYY"
                      placeholder="Start date"
                      disabledDate={(current) => current && current < dayjs().startOf('day')}
                      onChange={(date) => {
                        if (date) {
                          const end = form.getFieldValue('endDate')
                          if (!end || end.isBefore(date, 'day')) {
                            form.setFieldsValue({ endDate: date })
                          }
                        }
                        form.validateFields(['endDate']).catch(() => {})
                      }}
                    />
                  </Form.Item>
                  <Form.Item
                    name="endDate"
                    noStyle
                    rules={[
                      { required: true, message: 'Choose an end date' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          const start = getFieldValue('startDate')
                          if (!value || !start) return Promise.resolve()
                          if (value.isBefore(start, 'day')) {
                            return Promise.reject(new Error('End date cannot be before start date'))
                          }
                          return Promise.resolve()
                        },
                      }),
                    ]}
                  >
                    <DatePicker
                      className="pulse-leave-date"
                      format="DD-MMM-YYYY"
                      placeholder="End date"
                      disabledDate={(current) => {
                        if (!current) return false
                        const start = form.getFieldValue('startDate')
                        const floor = start ? start.startOf('day') : dayjs().startOf('day')
                        return current < floor
                      }}
                    />
                  </Form.Item>
                </div>
                {applyLeaveDays != null ? (
                  <p className="pulse-leave-date-days">
                    {applyLeaveDays} day{applyLeaveDays === 1 ? '' : 's'} selected
                  </p>
                ) : null}
              </Form.Item>
              <Form.Item
                name="teamEmailId"
                label="Team Email ID"
                rules={[{ required: true, message: 'Choose who to notify' }]}
              >
                <Select
                  placeholder="Select"
                  classNames={{ popup: { root: 'pulse-leave-filter-dropdown' } }}
                  options={notifyEmails.map((email) => ({ value: email, label: email, title: '' }))}
                />
              </Form.Item>
              <Form.Item
                name="reason"
                label="Reason for leave"
                className="pulse-leave-apply-reason"
                rules={[{ required: true, message: 'Add a reason for leave' }]}
              >
                <Input.TextArea rows={4} />
              </Form.Item>
            </Form>
          </div>
        </div>
      </Modal>

      <Modal
        title="Holidays Gallery"
        open={galleryOpen}
        onCancel={() => setGalleryOpen(false)}
        footer={(
          <div className="pulse-leave-gallery-foot">
            <Button type="primary" onClick={addSelectedHolidays}>Add Selected Holidays</Button>
            <Button onClick={() => setGalleryOpen(false)}>Close</Button>
          </div>
        )}
        width={760}
        className="pulse-leave-gallery-modal"
      >
        <div className="pulse-leave-gallery-head">
          <Select value="India" className="pulse-leave-select" options={[{ value: 'India', label: 'India' }]} />
          <div className="pulse-leave-period">
            <Button type="text" icon={<LeftOutlined />} onClick={() => setHolidayYear((year) => year - 1)} />
            <Button type="text" icon={<CalendarOutlined />} />
            <Button type="text" icon={<RightOutlined />} onClick={() => setHolidayYear((year) => year + 1)} />
            <span>{holidayYear}</span>
          </div>
        </div>
        <div className="pulse-leave-gallery-list">
          {galleryRows.map((row) => (
            <label key={row.id} className="pulse-leave-gallery-row">
              <input
                type="checkbox"
                checked={Boolean(galleryPick[row.id])}
                onChange={(event) => {
                  setGalleryPick((prev) => ({ ...prev, [row.id]: event.target.checked }))
                }}
              />
              <span className="pulse-leave-gallery-name">{row.name}</span>
              <span className="pulse-leave-gallery-date">{formatHolidayDate(row.date)}</span>
              <Select value="Full Day" className="pulse-leave-select pulse-leave-select-sm" options={[{ value: 'Full Day', label: 'Full Day' }]} />
            </label>
          ))}
        </div>
      </Modal>

      <Modal
        open={importOpen}
        onCancel={closeImport}
        width="100%"
        style={{ top: 0, paddingBottom: 0, maxWidth: '100vw' }}
        destroyOnHidden
        className={`pulse-import-modal${importStep === 0 ? '' : ' is-flow'}`}
        rootClassName="pulse-import-modal-root"
        title={(
          <div className="pulse-import-head">
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              aria-label="Back"
              onClick={() => (importStep === 0 ? closeImport() : setImportStep(importStep - 1))}
            />
            <span>Import</span>
          </div>
        )}
        footer={importStep === 3 ? (
          <div className="pulse-import-foot">
            <Button onClick={closeImport}>Close</Button>
          </div>
        ) : (
          <div className="pulse-import-foot">
            <Button onClick={closeImport}>Cancel</Button>
            <div className="pulse-import-foot-right">
              {importStep === 2 ? <Button onClick={() => setImportStep(1)}>Previous</Button> : null}
              <Button
                type="primary"
                className="pulse-leave-add-btn"
                loading={importBusy}
                onClick={importNext}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      >
        {importStep === 0 ? renderImportUpload() : (
          <>
            <ImportSteps current={importStep} />
            {importStep === 1 ? renderImportMap() : null}
            {importStep === 2 ? renderImportVerify() : null}
            {importStep === 3 ? renderImportSummary() : null}
          </>
        )}
      </Modal>

      <Drawer
        title="Filter"
        placement="right"
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        className="pulse-leave-filter-drawer"
        rootClassName="pulse-leave-filter-root"
        width={300}
        getContainer={false}
        closable={false}
        extra={(
          <Button
            type="text"
            icon={<CloseOutlined />}
            aria-label="Close filter"
            onClick={() => setFilterOpen(false)}
          />
        )}
        footer={(
          <div className="pulse-leave-filter-actions">
            <Button type="primary" onClick={applyFilter}>Apply</Button>
            <Button onClick={resetFilter}>Reset</Button>
          </div>
        )}
      >
        <label className="pulse-leave-filter-field">
          <span>Period</span>
          <FilterSelect value={draftFilter.period} onChange={updatePeriod} options={PERIOD_OPTIONS} />
        </label>
        <label className="pulse-leave-filter-field">
          <span>From</span>
          <DatePicker
            value={draftFilter.from}
            format="DD-MMM-YYYY"
            allowClear={false}
            disabled={draftFilter.period !== 'custom'}
            onChange={(from) => setDraftFilter((prev) => ({ ...prev, from, period: 'custom' }))}
            className="pulse-leave-filter-date"
          />
        </label>
        <label className="pulse-leave-filter-field">
          <span>To</span>
          <DatePicker
            value={draftFilter.to}
            format="DD-MMM-YYYY"
            allowClear={false}
            disabled={draftFilter.period !== 'custom'}
            onChange={(to) => setDraftFilter((prev) => ({ ...prev, to, period: 'custom' }))}
            className="pulse-leave-filter-date"
          />
        </label>
        {mainTab === 'holidays' ? (
          <label className="pulse-leave-filter-field">
            <span>Holiday Classification</span>
            <FilterSelect
              value={draftFilter.holidayClass}
              onChange={(holidayClass) => setDraftFilter((prev) => ({ ...prev, holidayClass }))}
              options={HOLIDAY_CLASS_OPTIONS}
            />
          </label>
        ) : (
          <>
            <label className="pulse-leave-filter-field">
              <span>Type</span>
              <FilterSelect
                value={draftFilter.type}
                onChange={(type) => setDraftFilter((prev) => ({ ...prev, type }))}
                options={TYPE_OPTIONS}
              />
            </label>
            <label className="pulse-leave-filter-field">
              <span>Leave Type</span>
              <Select
                mode="multiple"
                allowClear
                showSearch
                optionFilterProp="label"
                value={draftFilter.leaveTypes}
                onChange={(leaveTypes) => setDraftFilter((prev) => ({ ...prev, leaveTypes }))}
                placeholder="All Leave Types"
                className="pulse-leave-select pulse-leave-multi"
                classNames={{ popup: { root: 'pulse-leave-filter-dropdown' } }}
                options={LEAVE_TYPE_OPTIONS}
              />
            </label>
          </>
        )}
      </Drawer>
    </div>
  )
}
