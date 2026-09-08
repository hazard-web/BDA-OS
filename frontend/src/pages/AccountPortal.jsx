import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  AppstoreOutlined,
  BookOutlined,
  CodeOutlined,
  CrownOutlined,
  DeleteOutlined,
  DesktopOutlined,
  IdcardOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  LockOutlined,
  MailOutlined,
  MobileOutlined,
  PhoneOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Avatar,
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  Layout as AntLayout,
  List,
  Menu,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import { AuthLogoLoader, useAccountSignOut, useAuthRedirect } from '../components/auth/AuthLogoLoader'
import AccountsLogo from '../components/AccountsLogo'
import AppsFlyout from '../components/AppsFlyout'
import LinkedAppsPanel from '../components/LinkedAppsPanel'
import './account-portal.css'

const { Header, Sider, Content } = AntLayout

const NAV = [
  {
    id: 'profile',
    label: 'Profile',
    icon: <UserOutlined />,
    children: [
      { id: 'personal', label: 'Personal Information', icon: <IdcardOutlined /> },
      { id: 'email', label: 'Email Address', icon: <MailOutlined /> },
      { id: 'mobile', label: 'Mobile Numbers', icon: <PhoneOutlined /> },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    icon: <KeyOutlined />,
    children: [
      { id: 'password', label: 'Password' },
      { id: 'additional-verification', label: 'Additional verification' },
      { id: 'geo-fencing', label: 'Geo-fencing' },
      { id: 'account-recovery', label: 'Account Recovery' },
      { id: 'allowed-ip', label: 'Allowed IP Address' },
      { id: 'app-passwords', label: 'App Passwords' },
      { id: 'device-signins', label: 'Device Sign-ins' },
    ],
  },
  {
    id: 'mfa',
    label: 'Multi-factor auth',
    icon: <MobileOutlined />,
    children: [{ id: 'mfa-modes', label: 'MFA Modes' }],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <SettingOutlined />,
    children: [
      { id: 'preferences', label: 'Preferences' },
      { id: 'notifications', label: 'Notifications' },
      { id: 'authorized-websites', label: 'Authorized Websites' },
      { id: 'linked-accounts', label: 'Linked Accounts' },
      { id: 'close-account', label: 'Close Account' },
    ],
  },
  {
    id: 'sessions',
    label: 'Sessions',
    icon: <DesktopOutlined />,
    children: [
      { id: 'active-sessions', label: 'Active Sessions' },
      { id: 'activity-history', label: 'Activity History' },
      { id: 'connected-apps', label: 'Connected Apps' },
      { id: 'app-signins', label: 'App Sign-Ins' },
    ],
  },
  { id: 'groups', label: 'Groups', icon: <TeamOutlined /> },
  {
    id: 'privacy',
    label: 'Privacy',
    icon: <LockOutlined />,
    children: [
      { id: 'data-processing', label: 'Data Processing Addendum' },
      { id: 'manage-contacts', label: 'Manage Your Contacts' },
    ],
  },
]

const PROFILE_SECTIONS = new Set(['personal', 'email', 'mobile'])

function findNavItem(sectionId) {
  for (const item of NAV) {
    if (item.id === sectionId) return { parent: item, child: null }
    const child = item.children?.find((c) => c.id === sectionId)
    if (child) return { parent: item, child }
  }
  return null
}

function isParentActive(item, section) {
  if (item.id === 'profile') return PROFILE_SECTIONS.has(section)
  if (item.children?.some((c) => c.id === section)) return true
  return section === item.id
}

const HELP_DOCS = [
  { id: 'user-guide', label: 'User Guide', Icon: BookOutlined },
  { id: 'dev-guide', label: 'Developer Guide', Icon: CodeOutlined },
  { id: 'faqs', label: 'FAQs', Icon: QuestionCircleOutlined },
  { id: 'security', label: 'Best Practices for Security', Icon: SafetyCertificateOutlined },
  { id: 'contact', label: 'Contact Us', Icon: PhoneOutlined },
]

function displayUserId(id) {
  const raw = String(id || '').trim()
  if (!raw) return '-'
  const hex = raw.replace(/[^a-fA-F0-9]/g, '')
  if (hex.length >= 10) {
    try {
      return BigInt(`0x${hex.slice(-12)}`).toString().slice(0, 11)
    } catch {
      return raw.slice(-11)
    }
  }
  return raw
}

const SECTION_BLURBS = {
  password: 'Change your People OS account password and review recent password activity.',
  'additional-verification': 'Add an extra verification step for sensitive account actions.',
  'geo-fencing': 'Restrict sign-in access to approved geographic regions.',
  'account-recovery': 'Configure recovery options if you lose access to your account.',
  'allowed-ip': 'Allow sign-ins only from trusted IP addresses.',
  'app-passwords': 'Generate app-specific passwords for legacy apps that cannot use SSO.',
  'device-signins': 'Review devices that have recently signed in to your account.',
  'mfa-modes': 'Choose how you verify your identity when signing in to People OS.',
  preferences: 'Language, timezone, and display preferences for your account.',
  notifications: 'Choose which account alerts and product updates you receive.',
  'authorized-websites': 'Websites and domains authorized to use your People OS identity.',
  'linked-accounts': 'Google and other providers linked for sign-in to People OS.',
  'close-account': 'Permanently close your People OS administrator account.',
  'active-sessions': 'Devices and browsers currently signed in to People OS Accounts.',
  'activity-history': 'Recent sign-in and security activity on your account.',
  'connected-apps': 'See apps assigned in Pulse and Sign in with Google apps imported from Google Workspace.',
  'app-signins': 'Apps you have signed into with People OS Accounts or Google.',
  'data-processing': 'Review how People OS processes personal data for your organization.',
  'manage-contacts': 'Manage contact details used for account communication and recovery.',
}

const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: "I'd prefer not to say", label: "I'd prefer not to say" },
]

const DEFAULT_GENDER = "I'd prefer not to say"

const STATE_ALIASES = {
  orissa: 'Odisha',
  uttaranchal: 'Uttarakhand',
  'new delhi': 'Delhi',
  mumbai: 'Maharashtra',
  pune: 'Maharashtra',
  bengaluru: 'Karnataka',
  bangalore: 'Karnataka',
  chennai: 'Tamil Nadu',
  hyderabad: 'Telangana',
  kolkata: 'West Bengal',
  ahmedabad: 'Gujarat',
  jaipur: 'Rajasthan',
  lucknow: 'Uttar Pradesh',
  noida: 'Uttar Pradesh',
  gurgaon: 'Haryana',
  gurugram: 'Haryana',
  indore: 'Madhya Pradesh',
  kochi: 'Kerala',
  cochin: 'Kerala',
}

function extractIndiaState(text = '') {
  const raw = String(text || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  const sorted = [...INDIA_STATES].sort((a, b) => b.length - a.length)
  for (const state of sorted) {
    if (lower.includes(state.toLowerCase())) return state
  }
  for (const [alias, state] of Object.entries(STATE_ALIASES)) {
    if (lower.includes(alias)) return state
  }
  return ''
}

function resolveGender(user) {
  return user?.gender || DEFAULT_GENDER
}

function resolveState(user) {
  return user?.state || extractIndiaState(user?.companyAddress) || ''
}

const LANGUAGE_OPTIONS = [
  'English', 'Hindi', 'Tamil', 'Telugu', 'Bengali', 'Marathi', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi',
]

const COUNTRY_OPTIONS = [
  { name: 'India', flag: '🇮🇳' },
  { name: 'United States', flag: '🇺🇸' },
  { name: 'United Kingdom', flag: '🇬🇧' },
  { name: 'United Arab Emirates', flag: '🇦🇪' },
  { name: 'Singapore', flag: '🇸🇬' },
  { name: 'Australia', flag: '🇦🇺' },
  { name: 'Canada', flag: '🇨🇦' },
  { name: 'Germany', flag: '🇩🇪' },
]

const INDIA_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra',
  'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
]

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata', label: '(GMT +05:30) India Standard Time (Asia/Kolkata)' },
  { value: 'Asia/Dubai', label: '(GMT +04:00) Gulf Standard Time (Asia/Dubai)' },
  { value: 'Asia/Singapore', label: '(GMT +08:00) Singapore Time (Asia/Singapore)' },
  { value: 'Europe/London', label: '(GMT +00:00) Greenwich Mean Time (Europe/London)' },
  { value: 'America/New_York', label: '(GMT -05:00) Eastern Time (America/New_York)' },
  { value: 'America/Los_Angeles', label: '(GMT -08:00) Pacific Time (America/Los_Angeles)' },
  { value: 'Australia/Sydney', label: '(GMT +10:00) Australian Eastern Time (Australia/Sydney)' },
]

function formatTimezone(value) {
  const found = TIMEZONE_OPTIONS.find((t) => t.value === value)
  if (found) return found.label
  if (!value) return TIMEZONE_OPTIONS[0].label
  return value
}

function countryFlag(name) {
  return COUNTRY_OPTIONS.find((c) => c.name === name)?.flag || '🌐'
}

function relativeFrom(dateLike) {
  if (!dateLike) return 'Recently'
  const t = new Date(dateLike).getTime()
  if (Number.isNaN(t)) return 'Recently'
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  const days = Math.round(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

function formatPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
  }
  return raw || ''
}

function AccField({ label, children, className = '' }) {
  return (
    <div className={`acc-field${className ? ` ${className}` : ''}`}>
      <span className="acc-field-label">{label}</span>
      <div className="acc-field-value">{children || <span className="acc-unset">Not set</span>}</div>
    </div>
  )
}

function ContactRow({ icon, title, tags, meta, actions }) {
  return (
    <div className="acc-tile">
      <Avatar icon={icon} className="acc-tile-avatar" />
      <div className="acc-tile-copy">
        <Flex gap={8} wrap align="center">
          <Typography.Text strong className="acc-contact-value">{title}</Typography.Text>
          {tags}
        </Flex>
        {meta ? <Typography.Text type="secondary" className="acc-tile-meta">{meta}</Typography.Text> : null}
      </div>
      <Space className="acc-tile-actions" size={8}>{actions}</Space>
    </div>
  )
}

function GoogleMark({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.1 19 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.5 7.1l.1.1 6.2 5.2C36.8 38.7 44 33 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  )
}

export default function AccountPortal({ embedded = false }) {
  const { user, updateProfile, loading } = useAuth()
  const { redirecting } = useAuthRedirect()
  const [params] = useSearchParams()
  const [section, setSection] = useState('personal')
  const [editing, setEditing] = useState(false)
  const [addingMobile, setAddingMobile] = useState(false)
  const [addingEmail, setAddingEmail] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newMobile, setNewMobile] = useState('')
  const [mobileMarketing, setMobileMarketing] = useState(true)
  const [emailMarketing, setEmailMarketing] = useState(true)
  const [appsOpen, setAppsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { signingOut, signOutLogo, beginSignOut } = useAccountSignOut({
    onClosePanel: () => setProfileOpen(false),
    blocked: redirecting,
  })
  const [saving, setSaving] = useState(false)
  const [mobileIsPrimary, setMobileIsPrimary] = useState(false)
  const [primaryModalOpen, setPrimaryModalOpen] = useState(false)
  const [emailPrimaryModal, setEmailPrimaryModal] = useState(null)
  const [form, setForm] = useState({})
  const [navQuery, setNavQuery] = useState('')
  const mainRef = useRef(null)
  const sideRef = useRef(null)
  const appsBtnRef = useRef(null)
  const ignoreSpyUntil = useRef(0)

  const additionalEmails = useMemo(() => {
    const list = Array.isArray(user?.additionalEmails) ? user.additionalEmails : []
    const primary = String(user?.email || '').toLowerCase()
    return list
      .map((item) => ({
        email: String(item?.email || item || '').toLowerCase().trim(),
        createdAt: item?.createdAt || null,
      }))
      .filter((item) => item.email && item.email !== primary)
  }, [user])

  const fullName = useMemo(() => {
    const parts = [user?.firstName, user?.lastName].filter(Boolean)
    if (parts.length) return parts.join(' ')
    return user?.displayName || user?.email?.split('@')[0] || 'Account holder'
  }, [user])

  const hasGoogle = useMemo(
    () => (user?.oauthProviders || []).some((p) => p.provider === 'google'),
    [user],
  )

  useEffect(() => {
    if (!user) return
    setForm({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      displayName: user.displayName || '',
      gender: resolveGender(user),
      country: user.country || 'India',
      state: resolveState(user),
      timezone: user.timezone || 'Asia/Kolkata',
      language: user.language || 'English',
      companyPhone: user.companyPhone || '',
    })
  }, [user])

  useEffect(() => {
    const nextSection = params.get('section')
    if (nextSection) setSection(nextSection)
    const err = params.get('oauth_error')
    if (err) toast.error(err)
  }, [params])

  const scrollToBlock = (id) => {
    setSection(id)
    setEditing(false)
    ignoreSpyUntil.current = Date.now() + 1000
    requestAnimationFrame(() => {
      const scroller = mainRef.current
      const el = document.getElementById(`acc-${id}`)
      if (!scroller || !el) return
      const next =
        scroller.scrollTop +
        (el.getBoundingClientRect().top - scroller.getBoundingClientRect().top) -
        12
      scroller.scrollTo({ top: Math.max(0, next), behavior: 'smooth' })
    })
  }

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
    }
  }, [])

  const spyParentId = useMemo(() => {
    if (PROFILE_SECTIONS.has(section)) return 'profile'
    return findNavItem(section)?.parent?.id || section
  }, [section])

  useEffect(() => {
    const scroller = mainRef.current
    if (!scroller || loading || !user) return undefined

    const sectionBlocks = () => Array.from(scroller.querySelectorAll('[id^="acc-"]'))

    const syncFromScroll = () => {
      if (Date.now() < ignoreSpyUntil.current) return
      const blocks = sectionBlocks()
      if (!blocks.length) return
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      if (max > 0 && scroller.scrollTop >= max - 24) {
        const lastId = blocks[blocks.length - 1].id.replace(/^acc-/, '')
        setSection((prev) => (prev === lastId ? prev : lastId))
        return
      }
      const rootTop = scroller.getBoundingClientRect().top
      let current = blocks[0].id.replace(/^acc-/, '')
      blocks.forEach((el) => {
        const top = el.getBoundingClientRect().top - rootTop
        if (top <= 96) current = el.id.replace(/^acc-/, '')
      })
      setSection((prev) => (prev === current ? prev : current))
    }

    scroller.addEventListener('scroll', syncFromScroll, { passive: true })
    requestAnimationFrame(syncFromScroll)
    return () => scroller.removeEventListener('scroll', syncFromScroll)
  }, [loading, user, spyParentId])

  const onSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        displayName: form.displayName,
        gender: form.gender,
        country: form.country,
        state: form.state,
        timezone: form.timezone,
        language: form.language,
        companyPhone: form.companyPhone,
      }
      const res = await api.put('/auth/profile', payload)
      updateProfile({ ...user, ...res.data.user })
      toast.success('Profile updated')
      setEditing(false)
      setAddingMobile(false)
      setAddingEmail(false)
      setNewEmail('')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save profile')
    } finally {
      setSaving(false)
    }
  }

  const persistEmails = async (nextEmails, successMsg = 'Email address added') => {
    if (saving) return false
    setSaving(true)
    try {
      const res = await api.put('/auth/profile', {
        additionalEmails: nextEmails.map((item) =>
          typeof item === 'string' ? { email: item } : { email: item.email, createdAt: item.createdAt },
        ),
      })
      updateProfile({ ...user, ...res.data.user })
      toast.success(successMsg)
      return true
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update email addresses')
      return false
    } finally {
      setSaving(false)
    }
  }

  const onAddEmail = async () => {
    const address = String(newEmail || '').toLowerCase().trim()
    if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      toast.error('Enter a valid email address')
      return
    }
    if (address === String(user.email || '').toLowerCase()) {
      toast.error('That email is already your primary address')
      return
    }
    if (additionalEmails.some((e) => e.email === address)) {
      toast.error('That email is already on your account')
      return
    }
    const ok = await persistEmails([...additionalEmails, { email: address }], 'Email address added')
    if (ok) {
      setNewEmail('')
      setAddingEmail(false)
      setEmailMarketing(true)
    }
  }

  const onAddMobile = async () => {
    const digits = String(newMobile || '').replace(/\D/g, '')
    if (digits.length !== 10) {
      toast.error('Enter a valid 10-digit mobile number')
      return
    }
    if (saving) return
    setSaving(true)
    try {
      const companyPhone = `+91${digits}`
      const res = await api.put('/auth/profile', { companyPhone })
      updateProfile({ ...user, ...res.data.user })
      setForm((f) => ({ ...f, companyPhone }))
      setAddingMobile(false)
      setNewMobile('')
      setMobileMarketing(true)
      toast.success('Mobile number added')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not add mobile number')
    } finally {
      setSaving(false)
    }
  }

  const closeAddMobile = () => {
    setAddingMobile(false)
    setNewMobile('')
    setMobileMarketing(true)
  }

  const closeAddEmail = () => {
    setAddingEmail(false)
    setNewEmail('')
    setEmailMarketing(true)
  }

  const onDeleteEmail = async (address) => {
    const next = additionalEmails.filter((e) => e.email !== address)
    await persistEmails(next, 'Email address removed')
  }

  const onPromoteEmail = async (address) => {
    if (saving) return
    setSaving(true)
    try {
      const res = await api.put('/auth/profile', { primaryEmail: address })
      updateProfile({ ...user, ...res.data.user })
      setEmailPrimaryModal(null)
      toast.success('Primary email address updated')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update primary email')
    } finally {
      setSaving(false)
    }
  }

  const onCancelEdit = () => {
    setEditing(false)
    setAddingMobile(false)
    setAddingEmail(false)
    setNewEmail('')
    setNewMobile('')
    setForm({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      displayName: user.displayName || '',
      gender: resolveGender(user),
      country: user.country || 'India',
      state: resolveState(user),
      timezone: user.timezone || 'Asia/Kolkata',
      language: user.language || 'English',
      companyPhone: user.companyPhone || '',
    })
  }

  if (loading || !user) return <AuthLogoLoader show label="Loading account" />

  const initials = fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('')

  const isProfile = PROFILE_SECTIONS.has(section)
  const navContext = findNavItem(section)
  const openParent = navContext?.parent && !isProfile ? navContext.parent : null
  const pageTitle = isProfile
    ? 'Profile'
    : openParent?.label || (section === 'groups' ? 'Groups' : 'Account')
  const touchedLabel = relativeFrom(user.updatedAt || user.createdAt)
  const openKeys = NAV.filter((item) => isParentActive(item, section) && item.children).map((item) => item.id)

  const menuItems = useMemo(() => {
    const toItem = (item) => (
      item.children
        ? {
            key: item.id,
            icon: item.icon,
            label: item.label,
            children: item.children.map((child) => ({
              key: child.id,
              icon: child.icon,
              label: child.label,
            })),
          }
        : { key: item.id, icon: item.icon, label: item.label }
    )

    const query = navQuery.trim().toLowerCase()
    if (query) {
      const hits = []
      NAV.forEach((item) => {
        if (item.label.toLowerCase().includes(query)) hits.push(toItem({ ...item, children: undefined }))
        item.children?.forEach((child) => {
          if (child.label.toLowerCase().includes(query)) {
            hits.push({ key: child.id, icon: child.icon || item.icon, label: child.label })
          }
        })
      })
      return hits
    }

    return NAV.map(toItem)
  }, [navQuery])

  const goNav = (key) => {
    if (String(key).startsWith('g-')) return
    const parent = NAV.find((item) => item.id === key)
    if (parent?.children) {
      scrollToBlock(parent.children[0].id)
      return
    }
    const childParent = NAV.find((item) => item.children?.some((c) => c.id === key))
    if (childParent) {
      scrollToBlock(key)
      return
    }
    setEditing(false)
    setSection(key)
  }

  const avatar = user.avatarUrl
    ? <Avatar src={user.avatarUrl} referrerPolicy="no-referrer" size={28} />
    : <Avatar size={28} style={{ background: '#1A5F4A' }}>{initials || 'P'}</Avatar>

  return (
    <AntLayout className={`acc-shell${embedded ? ' is-embedded' : ''}`}>
      <AuthLogoLoader
        show={redirecting || saving || signOutLogo}
        label={signOutLogo ? 'Signing out' : saving ? 'Saving' : 'Redirecting'}
      />

      {embedded ? null : (
        <>
          <Header className="acc-top">
            <button type="button" className="acc-brand" onClick={() => scrollToBlock('personal')}>
              <AccountsLogo size={26} />
              Accounts
            </button>
            <div className="acc-top-tools">
              <Tooltip title="Account menu">
                <button type="button" className="acc-avatar-btn" onClick={() => setProfileOpen(true)} aria-label="Account menu">
                  {avatar}
                </button>
              </Tooltip>
              <Tooltip title="Apps">
                <Button
                  type="text"
                  ref={appsBtnRef}
                  icon={<AppstoreOutlined />}
                  aria-label="Open People OS apps"
                  onClick={() => setAppsOpen(true)}
                />
              </Tooltip>
            </div>
          </Header>
          <AppsFlyout open={appsOpen} onClose={() => setAppsOpen(false)} anchorRef={appsBtnRef} />
        </>
      )}

      <Drawer
        title="Account"
        placement="right"
        width={360}
        open={profileOpen}
        onClose={() => { if (!signingOut && !signOutLogo) setProfileOpen(false) }}
      >
        <Flex vertical align="center" gap={8} style={{ marginBottom: 24 }}>
          {user.avatarUrl ? (
            <Avatar src={user.avatarUrl} size={88} referrerPolicy="no-referrer" />
          ) : (
            <Avatar size={88} style={{ background: '#1A5F4A', fontSize: 32 }}>{initials || 'P'}</Avatar>
          )}
          <Typography.Title level={4} style={{ margin: 0 }}>{fullName}</Typography.Title>
          <Typography.Text type="secondary">{user.email}</Typography.Text>
          <Typography.Text type="secondary">
            User ID : {displayUserId(user._id)}{' '}
            <Tooltip title="Your unique People OS account identifier">
              <InfoCircleOutlined />
            </Tooltip>
          </Typography.Text>
          <Button type="primary" danger loading={signingOut} onClick={beginSignOut}>
            Sign Out
          </Button>
        </Flex>
        <Typography.Title level={5}>Help Documents</Typography.Title>
        <List
          dataSource={HELP_DOCS}
          renderItem={(doc) => {
            const Icon = doc.Icon
            return (
              <List.Item>
                <Button type="text" className="acc-help-item" onClick={() => toast(`${doc.label} will be available soon.`)}>
                  <span className="acc-help-icon"><Icon /></span>
                  {doc.label}
                </Button>
              </List.Item>
            )
          }}
        />
      </Drawer>

      <AntLayout className="acc-mid">
        <Sider className="acc-side" width={268} theme="light" trigger={null}>
          <div className="acc-side-inner" ref={sideRef}>
            <Input
              allowClear
              size="middle"
              prefix={<SearchOutlined />}
              placeholder="Find a setting"
              value={navQuery}
              onChange={(event) => setNavQuery(event.target.value)}
              className="acc-nav-search"
            />
            <Menu
              mode="inline"
              selectable
              selectedKeys={[section]}
              openKeys={navQuery ? [] : openKeys}
              items={menuItems}
              inlineIndent={18}
              onClick={({ key }) => goNav(key)}
              onOpenChange={(keys) => {
                if (navQuery) return
                const added = keys.find((key) => !openKeys.includes(key))
                if (added) goNav(added)
              }}
            />
          </div>
        </Sider>

        <Content className="acc-main" ref={mainRef}>
          <div className="acc-stack">
            <div className="acc-page-head">
              <Typography.Title level={2} className="acc-page-title">{pageTitle}</Typography.Title>
            </div>
            {isProfile ? (
              <>
                <Card id="acc-personal" className="acc-card acc-profile-card" bordered={false}>
                  <Flex className="acc-profile-head" justify="space-between" align="flex-start" gap={16} wrap="wrap">
                    <Flex gap={16} align="center" className="acc-identity">
                      {user.avatarUrl ? (
                        <Avatar src={user.avatarUrl} size={72} referrerPolicy="no-referrer" />
                      ) : (
                        <Avatar size={72} style={{ background: '#1A5F4A', fontSize: 26 }}>{initials || 'P'}</Avatar>
                      )}
                      <div>
                        <Typography.Title level={3} className="acc-user-name">{fullName}</Typography.Title>
                        <Typography.Text type="secondary">{user.email}</Typography.Text>
                        <div className="acc-updated">Last updated {touchedLabel}</div>
                      </div>
                    </Flex>
                    {editing ? (
                      <Space>
                        <Button onClick={onCancelEdit}>Cancel</Button>
                        <Button type="primary" loading={saving} onClick={onSave}>Save changes</Button>
                      </Space>
                    ) : (
                      <Button type="primary" onClick={() => setEditing(true)}>Edit</Button>
                    )}
                  </Flex>
                  <Divider />
                  {editing ? (
                    <Form layout="vertical" requiredMark={false}>
                      <Row gutter={[20, 4]}>
                        <Col xs={24} md={12}>
                          <Form.Item label="First name">
                            <Input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item label="Last name">
                            <Input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item label="Display name">
                            <Input value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item label="Gender">
                            <Select
                              value={form.gender}
                              options={GENDER_OPTIONS}
                              onChange={(value) => setForm((f) => ({ ...f, gender: value }))}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item label="Language">
                            <Select
                              value={form.language}
                              options={LANGUAGE_OPTIONS.map((lang) => ({ value: lang, label: lang }))}
                              onChange={(value) => setForm((f) => ({ ...f, language: value }))}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item label="Country / Region">
                            <Select
                              value={form.country}
                              options={COUNTRY_OPTIONS.map((c) => ({ value: c.name, label: `${c.flag}  ${c.name}` }))}
                              onChange={(value) => setForm((f) => ({ ...f, country: value, state: value === 'India' ? f.state : '' }))}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item label="State">
                            {form.country === 'India' ? (
                              <Select
                                allowClear
                                value={form.state || undefined}
                                placeholder="Select state"
                                options={INDIA_STATES.map((s) => ({ value: s, label: s }))}
                                onChange={(value) => setForm((f) => ({ ...f, state: value || '' }))}
                              />
                            ) : (
                              <Input value={form.state} placeholder="State / Province" onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
                            )}
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item label="Time zone">
                            <Select
                              value={form.timezone}
                              options={TIMEZONE_OPTIONS}
                              onChange={(value) => setForm((f) => ({ ...f, timezone: value }))}
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Form>
                  ) : (
                    <div className="acc-fields">
                      <AccField label="Full name">{fullName}</AccField>
                      <AccField label="Display name">{user.displayName || fullName}</AccField>
                      <AccField label="Gender">{resolveGender(user)}</AccField>
                      <AccField label="State">{resolveState(user)}</AccField>
                      <AccField label="Language">{user.language || 'English'}</AccField>
                      <AccField label="Country / Region">
                        <span className="acc-country">{countryFlag(user.country || 'India')} {user.country || 'India'}</span>
                      </AccField>
                      <AccField label="Time zone" className="acc-field-wide">{formatTimezone(user.timezone || 'Asia/Kolkata')}</AccField>
                    </div>
                  )}
                </Card>

                <Row gutter={[16, 16]} className="acc-contact-grid">
                  <Col xs={24} lg={12}>
                <Card
                  id="acc-email"
                  className="acc-card acc-fill"
                  bordered={false}
                  title="My Email Addresses"
                  extra={
                    <Button type="link" icon={<PlusOutlined />} onClick={() => { setAddingEmail(true); setSection('email') }}>
                      Add email
                    </Button>
                  }
                >
                  <Typography.Paragraph type="secondary" className="acc-lead">
                    These addresses can sign you in and recover your password.
                  </Typography.Paragraph>
                  <div className="acc-tiles">
                    <ContactRow
                      icon={<MailOutlined />}
                      title={user.email}
                      meta={`Added ${touchedLabel}`}
                      tags={(
                        <>
                          <Tooltip title="Used for announcements, notifications, and alerts.">
                            <Tag bordered={false} color="success" icon={<CrownOutlined />}>Primary</Tag>
                          </Tooltip>
                          {hasGoogle ? (
                            <Tooltip title="Linked with Google and can be used to sign in.">
                              <Tag bordered={false} className="acc-google-tag">
                                <GoogleMark size={12} /> Google
                              </Tag>
                            </Tooltip>
                          ) : null}
                        </>
                      )}
                      actions={(
                        <Tooltip title="Primary email cannot be deleted">
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => toast.error('Primary email cannot be deleted. Add another email first.')}
                          />
                        </Tooltip>
                      )}
                    />
                    {additionalEmails.map((item) => (
                      <ContactRow
                        key={item.email}
                        icon={<MailOutlined />}
                        title={item.email}
                        meta={item.createdAt ? `Added ${relativeFrom(item.createdAt)}` : 'Just added'}
                        actions={(
                          <>
                            <Button size="small" icon={<CrownOutlined />} onClick={() => setEmailPrimaryModal(item.email)}>
                              Set as primary
                            </Button>
                            <Popconfirm title="Remove this email?" onConfirm={() => onDeleteEmail(item.email)}>
                              <Button type="text" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </>
                        )}
                      />
                    ))}
                  </div>
                </Card>
                  </Col>
                  <Col xs={24} lg={12}>
                <Card
                  id="acc-mobile"
                  className="acc-card acc-fill"
                  bordered={false}
                  title="My Mobile Numbers"
                  extra={
                    <Button
                      type="link"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setAddingMobile(true)
                        setSection('mobile')
                        const digits = String(user.companyPhone || '').replace(/\D/g, '')
                        const local =
                          digits.length === 12 && digits.startsWith('91')
                            ? digits.slice(2)
                            : digits.length === 10
                              ? digits
                              : ''
                        setNewMobile(local)
                      }}
                    >
                      Add mobile
                    </Button>
                  }
                >
                  <Typography.Paragraph type="secondary" className="acc-lead">
                    Used for account recovery and important verification alerts.
                  </Typography.Paragraph>
                  {user.companyPhone ? (
                    <div className="acc-tiles">
                      <ContactRow
                        icon={<PhoneOutlined />}
                        title={formatPhone(user.companyPhone)}
                        meta={`Updated ${touchedLabel}`}
                        tags={(
                          <>
                            {mobileIsPrimary ? <Tag bordered={false} color="success" icon={<CrownOutlined />}>Primary</Tag> : null}
                            <Tooltip title="You can use this number to verify a password change.">
                              <Tag bordered={false} color="blue" icon={<SafetyCertificateOutlined />}>Recovery</Tag>
                            </Tooltip>
                          </>
                        )}
                        actions={(
                          <>
                            {!mobileIsPrimary ? (
                              <Button size="small" icon={<CrownOutlined />} onClick={() => setPrimaryModalOpen(true)}>
                                Set as primary
                              </Button>
                            ) : null}
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => {
                                if (mobileIsPrimary) {
                                  toast.error('Primary number cannot be deleted. Add another number first.')
                                  return
                                }
                                toast('Remove this number from Edit, then Save to clear it.')
                              }}
                            />
                          </>
                        )}
                      />
                    </div>
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No mobile number added yet." />
                  )}
                </Card>
                  </Col>
                </Row>
              </>
            ) : null}

            {openParent?.children ? (
              <div className="acc-section-grid">
              {openParent.children.map((child) => (
                <Card key={child.id} id={`acc-${child.id}`} className="acc-card" bordered={false} title={child.label}>
                  <Typography.Paragraph type="secondary" className="acc-lead">
                    {SECTION_BLURBS[child.id] || `${child.label} settings for your People OS account.`}
                  </Typography.Paragraph>
                  {child.id === 'password' ? (
                    <Link to="/forgot">
                      <Button type="primary">Change or reset password</Button>
                    </Link>
                  ) : null}
                  {child.id === 'preferences' ? (
                    <div className="acc-fields">
                      <AccField label="Language">{user.language || 'English'}</AccField>
                      <AccField label="Time zone">{formatTimezone(user.timezone || 'Asia/Kolkata')}</AccField>
                    </div>
                  ) : null}
                  {child.id === 'active-sessions' ? (
                    <div className="acc-tiles">
                      <ContactRow
                        icon={<DesktopOutlined />}
                        title="This browser"
                        tags={<Tag bordered={false} color="success">Current</Tag>}
                        meta="Active now"
                      />
                    </div>
                  ) : null}
                  {child.id === 'linked-accounts' && hasGoogle ? (
                    <div className="acc-tiles">
                      <ContactRow
                        icon={<GoogleMark size={16} />}
                        title="Google"
                        tags={<Tag bordered={false}>Linked</Tag>}
                        meta={user.email}
                      />
                    </div>
                  ) : null}
                  {child.id === 'linked-accounts' && !hasGoogle ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No linked sign-in providers yet." />
                  ) : null}
                  {child.id === 'connected-apps' ? (
                    <LinkedAppsPanel email={user.email} />
                  ) : null}
                  {child.id === 'app-signins' ? (
                    <Button type="primary" onClick={() => goNav('connected-apps')}>
                      Review linked apps
                    </Button>
                  ) : null}
                  {!['password', 'preferences', 'active-sessions', 'linked-accounts', 'connected-apps', 'app-signins'].includes(child.id) ? (
                    <Alert type="info" showIcon message="Coming soon" description="This section will be available in a later update." />
                  ) : null}
                </Card>
              ))}
              </div>
            ) : null}

            {section === 'groups' ? (
              <Card className="acc-card" bordered={false}>
                <div className="acc-groups">
                  <Empty
                    image={<TeamOutlined style={{ fontSize: 40, color: '#1A5F4A' }} />}
                    description={<Typography.Title level={4}>Create a group</Typography.Title>}
                  >
                    <Typography.Paragraph type="secondary">Share access and collaborate with a named group of people.</Typography.Paragraph>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => toast('Group creation will be available soon.')}>
                      Create group
                    </Button>
                  </Empty>
                </div>
              </Card>
            ) : null}
          </div>
        </Content>
      </AntLayout>

      <Modal title="Add Mobile Number" open={addingMobile} onCancel={closeAddMobile} onOk={onAddMobile} okText={saving ? 'Adding…' : 'Add'} confirmLoading={saving} okButtonProps={{ disabled: newMobile.replace(/\D/g, '').length !== 10 }}>
        <Typography.Paragraph type="secondary">
          A one-time password (OTP) will be sent to your mobile number via SMS.
        </Typography.Paragraph>
        <Form layout="vertical">
          <Form.Item label="Mobile Number">
            <Input
              addonBefore="+91"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="12345 12345"
              value={
                newMobile.replace(/\D/g, '').length > 5
                  ? `${newMobile.replace(/\D/g, '').slice(0, 5)} ${newMobile.replace(/\D/g, '').slice(5, 10)}`
                  : newMobile.replace(/\D/g, '')
              }
              onChange={(e) => setNewMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
              onPressEnter={onAddMobile}
            />
          </Form.Item>
          <Checkbox checked={mobileMarketing} onChange={(e) => setMobileMarketing(e.target.checked)}>
            Use this number for marketing-related communications.
          </Checkbox>
        </Form>
      </Modal>

      <Modal title="Add Email Address" open={addingEmail} onCancel={closeAddEmail} onOk={onAddEmail} okText={saving ? 'Adding…' : 'Add'} confirmLoading={saving}>
        <Typography.Paragraph type="secondary">
          A verification code will be sent to this email address.
        </Typography.Paragraph>
        <Form layout="vertical">
          <Form.Item label="Email Address">
            <Input
              type="email"
              placeholder="name@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onPressEnter={onAddEmail}
            />
          </Form.Item>
          <Checkbox checked={emailMarketing} onChange={(e) => setEmailMarketing(e.target.checked)}>
            Use this email for marketing-related communications.
          </Checkbox>
        </Form>
      </Modal>

      <Modal
        title="Modify Primary Number"
        open={primaryModalOpen}
        onCancel={() => setPrimaryModalOpen(false)}
        onOk={() => {
          setMobileIsPrimary(true)
          setPrimaryModalOpen(false)
          toast.success('Primary mobile number updated')
        }}
        okText="Update"
      >
        <Typography.Paragraph>
          This will make <Typography.Text strong>{formatPhone(user.companyPhone)}</Typography.Text> your primary mobile number.
        </Typography.Paragraph>
      </Modal>

      <Modal
        title="Modify Primary Email"
        open={Boolean(emailPrimaryModal)}
        onCancel={() => setEmailPrimaryModal(null)}
        onOk={() => onPromoteEmail(emailPrimaryModal)}
        okText={saving ? 'Updating…' : 'Update'}
        confirmLoading={saving}
      >
        <Typography.Paragraph>
          This will make <Typography.Text strong>{emailPrimaryModal}</Typography.Text> your primary email address. You will use it to sign in to People OS.
        </Typography.Paragraph>
      </Modal>
    </AntLayout>
  )
}
