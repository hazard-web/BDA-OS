import { useEffect, useState } from 'react'
import {
  App,
  AutoComplete,
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Input,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { AppstoreAddOutlined, ReloadOutlined } from '@ant-design/icons'
import api from '../api'

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
      const res = await api.post('/launcher/admin', {
        email: values.email.trim().toLowerCase(),
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

  const emailOptions = members.map((m) => ({
    value: m.email,
    label: [m.firstName, m.lastName].filter(Boolean).join(' ')
      ? `${[m.firstName, m.lastName].filter(Boolean).join(' ')} (${m.email})`
      : m.email,
  }))

  const counts = grants.reduce((acc, g) => {
    acc[g.email] = (acc[g.email] || 0) + 1
    return acc
  }, {})

  const columns = [
    { title: 'Employee email', dataIndex: 'email', ellipsis: true },
    {
      title: 'App',
      dataIndex: 'name',
      render: (name, row) => (
        <Flex align="center" gap={8}>
          {row.iconUrl ? (
            <img src={row.iconUrl} alt="" width={16} height={16} style={{ borderRadius: 3 }} />
          ) : null}
          <span>{name}</span>
        </Flex>
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
      width: 100,
      render: (_, row) => (
        <Button type="link" danger size="small" onClick={() => revoke(row.id)}>
          Revoke
        </Button>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }} className="pulse-org-stack">
      <Card
        size="small"
        className="pulse-org-card"
        title="Assign apps to an email"
        extra={
          <Button type="text" icon={<ReloadOutlined />} onClick={load} loading={loading} aria-label="Refresh" />
        }
      >
        <Form form={form} layout="vertical" onFinish={onAssign} requiredMark={false}>
          <Flex gap={10} wrap="wrap" align="flex-start">
            <Form.Item
              name="email"
              style={{ flex: '1 1 220px', marginBottom: 0, minWidth: 200 }}
              rules={[{ required: true, message: 'Pick an employee email' }]}
            >
              <AutoComplete
                allowClear
                placeholder="Employee email"
                options={emailOptions}
                filterOption={(input, option) =>
                  String(option?.label || option?.value || '')
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
            </Form.Item>
            <Form.Item
              name="name"
              style={{ width: 140, marginBottom: 0 }}
              rules={[{ required: true, message: 'App name' }]}
            >
              <Input placeholder="App name" />
            </Form.Item>
            <Form.Item
              name="url"
              style={{ flex: '1 1 200px', marginBottom: 0 }}
              rules={[{ required: true, type: 'url', message: 'https://…' }]}
            >
              <Input placeholder="https://" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" icon={<AppstoreAddOutlined />} loading={saving}>
                Give access
              </Button>
            </Form.Item>
          </Flex>
        </Form>
      </Card>

      <Card size="small" className="pulse-org-card" title={`Assigned access (${grants.length})`}>
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          pagination={false}
          columns={columns}
          dataSource={grants}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No apps assigned yet. Add a name and URL for each employee."
              />
            ),
          }}
        />
        {Object.keys(counts).length > 0 ? (
          <div style={{ marginTop: 8 }}>
            {Object.entries(counts).map(([email, n]) => (
              <Tag key={email} style={{ marginBottom: 6 }}>
                {email}: {n} app{n === 1 ? '' : 's'}
              </Tag>
            ))}
          </div>
        ) : null}
      </Card>
    </Space>
  )
}
