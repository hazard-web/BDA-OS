import { useEffect, useMemo, useState } from 'react'
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  Select,
  Table,
  Tag,
  Typography,
} from 'antd'
import { AppstoreAddOutlined } from '@ant-design/icons'
import api from '../api'
import { personName } from '../utils/pulsePerson'

function memberLabel(member) {
  const name = personName(member, '')
  return name ? `${name} · ${member.email}` : member.email
}

function groupGrantsByApp(grants) {
  const map = new Map()
  for (const grant of grants) {
    const key = grant.appId || `${grant.name}|${grant.url}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        appId: grant.appId,
        name: grant.name,
        url: grant.url,
        iconUrl: grant.iconUrl,
        people: [],
      })
    }
    map.get(key).people.push(grant)
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      people: row.people.slice().sort((a, b) => String(a.email).localeCompare(String(b.email))),
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

export default function PulseAppGrantsAdmin() {
  const { message } = App.useApp()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [members, setMembers] = useState([])
  const [grants, setGrants] = useState([])
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/launcher/admin')
      setMembers(res.data?.data?.members || [])
      setGrants(res.data?.data?.grants || [])
    } catch (err) {
      setMembers([])
      setGrants([])
      message.error(err?.response?.data?.message || 'Could not load assigned apps')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onAssign = async (values) => {
    setSaving(true)
    try {
      const emails = (values.emails || []).map((email) => String(email).trim().toLowerCase()).filter(Boolean)
      const res = await api.post('/launcher/admin', {
        emails,
        name: values.name.trim(),
        url: values.url.trim(),
      })
      message.success(res.data?.message || 'App assigned')
      form.resetFields()
      await load()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not assign app')
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (id) => {
    try {
      await api.delete(`/launcher/admin/${id}`)
      message.success('Access removed')
      await load()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not remove access')
    }
  }

  const revokeApp = async (people) => {
    try {
      await Promise.all(people.map((person) => api.delete(`/launcher/admin/${person.id}`)))
      message.success('Access removed for this app')
      await load()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not remove access')
    }
  }

  const emailOptions = useMemo(
    () => members.map((m) => ({
      value: m.email,
      label: memberLabel(m),
    })),
    [members],
  )

  const grouped = useMemo(() => groupGrantsByApp(grants), [grants])
  const appCount = grouped.length

  const columns = [
    {
      title: 'App',
      dataIndex: 'name',
      render: (name, row) => (
        <span className="pulse-apps-app-cell">
          {row.iconUrl ? (
            <img src={row.iconUrl} alt="" width={16} height={16} />
          ) : null}
          <span>{name}</span>
        </span>
      ),
    },
    {
      title: 'People',
      key: 'people',
      render: (_, row) => (
        <div className="pulse-apps-people">
          <span className="pulse-apps-people-count">
            {row.people.length} {row.people.length === 1 ? 'person' : 'people'}
          </span>
          <div className="pulse-apps-people-tags">
            {row.people.slice(0, 4).map((person) => (
              <Tag key={person.id}>{person.email}</Tag>
            ))}
            {row.people.length > 4 ? (
              <Tag>+{row.people.length - 4}</Tag>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      title: 'Opens',
      dataIndex: 'url',
      ellipsis: true,
      render: (url) => (
        <Typography.Link href={url} target="_blank" rel="noreferrer">
          {url}
        </Typography.Link>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      align: 'right',
      render: (_, row) => (
        <Button type="link" danger size="small" onClick={() => revokeApp(row.people)}>
          Revoke all
        </Button>
      ),
    },
  ]

  return (
    <div className="pulse-att-page pulse-apps-att">
      <div className="pulse-att-board">
        <section className="pulse-att-panel" aria-label="App access">
          <div className="pulse-att-panel-chrome">
            <header className="pulse-att-panel-head">
              <h4>App access</h4>
              <span>
                {appCount} app{appCount === 1 ? '' : 's'} · {grants.length} grant{grants.length === 1 ? '' : 's'}
              </span>
            </header>
          </div>

          <div className="pulse-apps-att-body">
            <div className="pulse-apps-assign-well">
              <Form
                form={form}
                layout="vertical"
                onFinish={onAssign}
                requiredMark={false}
                className="pulse-apps-assign-form"
                autoComplete="off"
              >
                <div className="pulse-apps-assign-row">
                  <Form.Item
                    name="emails"
                    className="pulse-apps-field is-email"
                    rules={[{ required: true, type: 'array', min: 1, message: 'Pick at least one person' }]}
                  >
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="People"
                      options={emailOptions}
                      maxTagCount="responsive"
                      autoComplete="off"
                    />
                  </Form.Item>
                  <Form.Item
                    name="name"
                    className="pulse-apps-field is-name"
                    rules={[{ required: true, message: 'App name' }]}
                  >
                    <Input placeholder="App name" autoComplete="off" />
                  </Form.Item>
                  <Form.Item
                    name="url"
                    className="pulse-apps-field is-url"
                    rules={[{ required: true, type: 'url', message: 'https://…' }]}
                  >
                    <Input placeholder="https://" autoComplete="off" />
                  </Form.Item>
                  <Form.Item className="pulse-apps-field is-submit">
                    <button type="submit" className="pov-cta plive-top-cta plive-checkin" disabled={saving}>
                      <AppstoreAddOutlined />
                      {saving ? 'Assigning…' : 'Give access'}
                    </button>
                  </Form.Item>
                </div>
              </Form>
            </div>

            <div className="pulse-apps-table-wrap">
              <Table
                size="middle"
                rowKey="key"
                loading={loading}
                pagination={false}
                columns={columns}
                dataSource={grouped}
                className="pulse-apps-table"
                expandable={{
                  expandedRowRender: (row) => (
                    <ul className="pulse-apps-grant-list">
                      {row.people.map((person) => (
                        <li key={person.id}>
                          <span>{person.email}</span>
                          <Button type="link" danger size="small" onClick={() => revoke(person.id)}>
                            Revoke
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ),
                }}
                locale={{
                  emptyText: (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No apps assigned yet. Pick people, then add an app name and URL."
                    />
                  ),
                }}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
