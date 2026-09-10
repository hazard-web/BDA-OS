import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Avatar,
  Button,
  Empty,
  Flex,
  Input,
  List,
  Segmented,
  Space,
  Typography,
} from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import api from '../api'
import { PULSE_HOME } from '../utils/pulseEntry'
import { oauthStartUrl } from './auth/oauthUrls'
import './linked-apps.css'

export default function LinkedAppsPanel({ email }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('google')
  const [apps, setApps] = useState([])
  const [google, setGoogle] = useState({})
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/launcher/apps', { params: { t: Date.now() } })
      setApps(Array.isArray(res.data?.data?.apps) ? res.data.data.apps : [])
      setGoogle(res.data?.data?.google || {})
    } catch {
      setApps([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [email])

  const counts = useMemo(() => {
    const googleCount = apps.filter((a) => a.source === 'google').length
    const assignedCount = apps.filter((a) => a.source !== 'google').length
    return {
      google: googleCount,
      assigned: assignedCount,
      linked: 0,
      all: apps.length,
    }
  }, [apps])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return apps.filter((app) => {
      if (filter === 'google' && app.source !== 'google') return false
      if (filter === 'assigned' && app.source === 'google') return false
      if (filter === 'linked') return false
      if (q && !String(app.name || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [apps, filter, query])

  const importGoogle = () => {
    window.location.assign(`${oauthStartUrl('google')}?intent=workspace-apps`)
  }

  const resync = async () => {
    setSyncing(true)
    try {
      const res = await api.post('/launcher/google/sync')
      setApps(Array.isArray(res.data?.data?.apps) ? res.data.data.apps : apps)
      setGoogle(res.data?.data || google)
    } finally {
      setSyncing(false)
      await load()
    }
  }

  return (
    <div className="la-page" id="acc-connected-apps">
      <Typography.Title level={3} className="la-h">
        Review your linked apps
      </Typography.Title>
      <Typography.Paragraph type="secondary" className="la-lead">
        See the data you&apos;re sharing with apps assigned in BDA OS, and Sign in with Google
        apps imported from Google Workspace.{' '}
        <Typography.Link
          href="https://support.google.com/accounts/answer/3466521"
          target="_blank"
          rel="noreferrer"
        >
          Learn about linked apps
        </Typography.Link>
      </Typography.Paragraph>

      <Input
        size="large"
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Search linked apps by name."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="la-search"
      />

      <Segmented
        className="la-tabs"
        value={filter}
        onChange={setFilter}
        options={[
          { label: `Sign in with Google (${counts.google})`, value: 'google' },
          { label: `Assigned (${counts.assigned})`, value: 'assigned' },
          { label: `Linked account (${counts.linked})`, value: 'linked', disabled: true },
        ]}
      />

      {!counts.google && filter === 'google' ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span>
              {google.message ||
                `Google Account can show dozens of apps for ${email || 'this email'}. BDA OS cannot read that page with Sign in with Google (email and profile only). Import them with Google Workspace admin access, or assign apps in Company.`}
            </span>
          }
        >
          <Space wrap>
            <Button type="primary" onClick={importGoogle}>
              Import from Google Workspace
            </Button>
            <Button onClick={resync} loading={syncing}>
              Sync again
            </Button>
            <Link to={PULSE_HOME}>Open BDA OS</Link>
          </Space>
        </Empty>
      ) : (
        <>
          <Flex justify="flex-end" className="la-actions">
            <Space>
              <Button onClick={importGoogle}>Reconnect Google Workspace</Button>
              <Button onClick={resync} loading={syncing}>
                Sync
              </Button>
            </Space>
          </Flex>
          <List
            loading={loading}
            dataSource={visible}
            locale={{ emptyText: query ? `No apps match “${query}”.` : 'No apps in this filter.' }}
            renderItem={(app) => (
              <List.Item
                className="la-row"
                onClick={() => app.url && window.open(app.url, '_blank', 'noopener,noreferrer')}
              >
                <List.Item.Meta
                  avatar={
                    <Avatar src={app.iconUrl || undefined} alt="">
                      {(app.name || '?').charAt(0)}
                    </Avatar>
                  }
                  title={app.name}
                />
              </List.Item>
            )}
          />
        </>
      )}
    </div>
  )
}
