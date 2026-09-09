import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Col, Flex, Layout, Row, Space, Spin, Typography } from 'antd'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import PulseMark from '../components/PulseMark'
import PulseLoading from '../components/PulseLoading'
import PulseAppearanceToggle from '../components/PulseAppearanceToggle'
import { getPulseGettingStartedPath, getPostLoginPath, hasPulseAccount, hasPulseSampleChoice, reopenPulseGuide } from '../utils/pulseEntry'
import { goToLoginOrCloseTab } from '../utils/pulseAuthSync'
import './people-hub.css'
import './pulse-antd.css'

const { Content } = Layout
const { Title, Paragraph, Link, Text } = Typography

const FEATURES = [
  'Time & Attendance',
  'Performance Management',
  'Learning Management System',
  'Case Management',
  'Document Management',
  'Integrated Payroll System (India)',
]

const HELP_LINKS = [
  { label: 'Help Center', href: '/coming-soon?app=Help%20Center' },
  { label: 'Request a Demo', href: '/coming-soon?app=Demo' },
  { label: 'Join live Webinar', href: '/coming-soon?app=Webinar' },
  { label: 'Price Quote', href: '/coming-soon?app=Pricing' },
]

/** Pulse welcome landing — Ant Design, aligned with Pulse shell theme. */
export default function PeopleHub() {
  const { user, loading, logout, updateProfile } = useAuth()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [profileChecked, setProfileChecked] = useState(false)

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    user?.displayName?.trim() ||
    String(user?.email || 'there').split('@')[0]

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get('/auth/profile', { __skipCache: true })
        if (!cancelled && res?.data?.user) updateProfile?.(res.data.user)
      } catch {
        /* keep session user */
      } finally {
        if (!cancelled) setProfileChecked(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [updateProfile])

  useEffect(() => {
    if (loading || !user) return
    if (!hasPulseAccount(user)) return
    const next = getPostLoginPath(user)
    if (next && next !== '/pulse') {
      navigate(next, { replace: true })
    }
  }, [user, loading, navigate])

  const onSignOut = () => {
    logout()
    goToLoginOrCloseTab(navigate)
  }

  const onCta = async () => {
    if (creating) return

    const nextPath = getPulseGettingStartedPath(user)
    const firstTime = !hasPulseAccount(user)

    if (firstTime) {
      setCreating(true)
      try {
        localStorage.removeItem('pulseSampleData')
        localStorage.removeItem('pulseLastPath')
        localStorage.removeItem('pulseGuideDismissed')
      } catch {
        /* ignore */
      }
      await new Promise((resolve) => setTimeout(resolve, 1100))
      navigate(nextPath)
      return
    }

    if (!hasPulseSampleChoice()) {
      navigate(nextPath)
      return
    }

    reopenPulseGuide()
    navigate(nextPath)
  }

  if (loading || !user || !profileChecked) {
    return <PulseLoading />
  }

  if (hasPulseAccount(user)) {
    return <PulseLoading />
  }

  const featuresLeft = FEATURES.filter((_, i) => i % 2 === 0)
  const featuresRight = FEATURES.filter((_, i) => i % 2 === 1)
  const helpLeft = HELP_LINKS.filter((_, i) => i % 2 === 0)
  const helpRight = HELP_LINKS.filter((_, i) => i % 2 === 1)

  return (
    <Layout className="pp-page pulse-welcome">
      <Content className="pp-split">
        <section className="pp-left">
          <div className="pp-left-inner">
            <Title level={1} className="pp-title">
              <span className="pp-hello">Hello, {displayName}!</span>
              <span className="pp-welcome">Welcome to Pulse</span>
            </Title>

            <Paragraph className="pp-intro" type="secondary">
              Pulse is an online HR solution that lets you track and automate all your HR
              processes while enabling you to provide an exceptional employee experience.
            </Paragraph>

            <Title level={4} className="pp-features-title">
              Features
            </Title>
            <Row gutter={[48, 0]} className="pp-features">
              <Col xs={24} sm={12}>
                <ul>
                  {featuresLeft.map((item) => (
                    <li key={item}>
                      <Text>{item}</Text>
                    </li>
                  ))}
                </ul>
              </Col>
              <Col xs={24} sm={12}>
                <ul>
                  {featuresRight.map((item) => (
                    <li key={item}>
                      <Text>{item}</Text>
                    </li>
                  ))}
                </ul>
              </Col>
            </Row>

            <Row gutter={[48, 12]} className="pp-links">
              <Col xs={24} sm={12}>
                <Space direction="vertical" size={12}>
                  {helpLeft.map((link) => (
                    <Link key={link.label} href={link.href}>
                      {link.label}
                    </Link>
                  ))}
                </Space>
              </Col>
              <Col xs={24} sm={12}>
                <Space direction="vertical" size={12}>
                  {helpRight.map((link) => (
                    <Link key={link.label} href={link.href}>
                      {link.label}
                    </Link>
                  ))}
                </Space>
              </Col>
            </Row>
          </div>
        </section>

        <aside className="pp-right" aria-label="Get started">
          <div className="pp-welcome-tools">
            <PulseAppearanceToggle />
            <Button type="link" danger className="pp-signout" onClick={onSignOut}>
              Sign Out
            </Button>
          </div>

          <Flex vertical align="center" className="pp-right-inner">
            {creating ? (
              <Flex vertical align="center" gap={22} className="pp-creating" role="status" aria-live="polite">
                <PulseMark size={108} title="Pulse" />
                <Space>
                  <Spin size="small" />
                  <Text strong>Creating your Pulse account...</Text>
                </Space>
              </Flex>
            ) : (
              <>
                <div className="pp-right-mark">
                  <PulseMark size={108} title="Pulse" />
                </div>
                <Title level={3} className="pp-cta-title">
                  You&apos;re just a step away from delivering the best HR service experience
                </Title>
                <Button type="primary" size="large" block className="pp-cta" onClick={onCta}>
                  Get started with Pulse
                </Button>
                <Paragraph type="secondary" className="pp-right-note">
                  If your organization already has a Pulse account, please contact your HR
                  administrator to send the invitation.
                </Paragraph>
              </>
            )}
          </Flex>
        </aside>
      </Content>
    </Layout>
  )
}
