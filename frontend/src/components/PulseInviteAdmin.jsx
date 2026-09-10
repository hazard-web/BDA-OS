import { useEffect, useState } from 'react'
import {
  App,
  Avatar,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Form,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { MailOutlined, ReloadOutlined, SendOutlined, UserOutlined } from '@ant-design/icons'
import api from '../api'
import { pulseRoleLabel } from '../utils/pulseRoles'

/** Admin: invite people + see members (Organization) — Ant Design. */
export default function PulseInviteAdmin() {
  const { message } = App.useApp()
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [companyDomain, setCompanyDomain] = useState('')
  const [sending, setSending] = useState(false)
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/invites')
      setMembers(res.data?.data?.members || [])
      setInvites(res.data?.data?.invites || [])
      setCompanyDomain(res.data?.data?.companyDomain || '')
    } catch (err) {
      setMembers([])
      setInvites([])
      message.error(err?.response?.data?.message || 'Could not load people')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onInvite = async (values) => {
    setSending(true)
    try {
      const res = await api.post('/invites', {
        email: values.email.trim().toLowerCase(),
        role: values.role || 'member',
      })
      const link = res.data?.data?.devInviteLink
      if (link) {
        message.success('Invite created — copy the link')
        message.info(link, 12)
      } else {
        message.success(res.data?.message || 'Invite sent')
      }
      form.resetFields()
      await load()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not send invite')
    } finally {
      setSending(false)
    }
  }

  const revoke = async (id) => {
    try {
      await api.delete(`/invites/${id}`)
      message.success('Invite revoked')
      await load()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not revoke')
    }
  }

  const memberCols = [
    {
      title: 'Name',
      key: 'name',
      render: (_, row) => {
        const n = [row.firstName, row.lastName].filter(Boolean).join(' ')
        const label = n || row.email || '?'
        return (
          <Flex align="center" gap={10}>
            <Avatar size={28} style={{ background: '#1A5F4A' }} icon={!n ? <UserOutlined /> : undefined}>
              {n ? n.charAt(0).toUpperCase() : null}
            </Avatar>
            <Typography.Text>{label === row.email ? '—' : n}</Typography.Text>
          </Flex>
        )
      },
    },
    { title: 'Email', dataIndex: 'email', ellipsis: true },
    {
      title: 'Role',
      dataIndex: 'role',
      width: 110,
      render: (r) => (
        <Tag color={r === 'admin' ? 'green' : 'default'}>{pulseRoleLabel(r)}</Tag>
      ),
    },
  ]

  const inviteCols = [
    { title: 'Email', dataIndex: 'email', ellipsis: true },
    {
      title: 'Role',
      dataIndex: 'role',
      width: 100,
      render: (r) => <Tag>{pulseRoleLabel(r)}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (s) => {
        const color = s === 'pending' ? 'processing' : s === 'accepted' ? 'success' : 'default'
        return <Tag color={color}>{s}</Tag>
      },
    },
    {
      title: '',
      key: 'actions',
      width: 88,
      render: (_, row) =>
        row.status === 'pending' ? (
          <Button type="link" danger size="small" onClick={() => revoke(row._id)}>
            Revoke
          </Button>
        ) : null,
    },
  ]

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }} className="pulse-org-stack">
      <Card
        size="small"
        className="pulse-org-card"
        title="Invite people"
        extra={
          <Button type="text" icon={<ReloadOutlined />} onClick={load} loading={loading} aria-label="Refresh" />
        }
      >
        <Form form={form} layout="vertical" onFinish={onInvite} initialValues={{ role: 'member' }} requiredMark={false}>
          {companyDomain ? (
            <Typography.Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 10 }}>
              Members sign in with @{companyDomain} only.
            </Typography.Paragraph>
          ) : null}
          <Flex gap={10} wrap="wrap" align="flex-start">
            <Form.Item
              name="email"
              style={{ flex: '1 1 240px', marginBottom: 0, minWidth: 200 }}
              rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
            >
              <Input
                prefix={<MailOutlined />}
                placeholder={companyDomain ? `name@${companyDomain}` : 'name@company.com'}
                allowClear
                size="middle"
              />
            </Form.Item>
            <Form.Item name="role" style={{ marginBottom: 0, width: 140 }}>
              <Select
                size="middle"
                options={[
                  { value: 'member', label: 'Member' },
                  { value: 'admin', label: 'Admin' },
                ]}
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={sending}>
                Send invite
              </Button>
            </Form.Item>
          </Flex>
        </Form>
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card size="small" className="pulse-org-card" title="Team">
            <Table
              size="small"
              rowKey="_id"
              loading={loading}
              pagination={false}
              columns={memberCols}
              dataSource={members}
              locale={{
                emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No members yet" />,
              }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" className="pulse-org-card" title="Invites">
            <Table
              size="small"
              rowKey="_id"
              loading={loading}
              pagination={false}
              columns={inviteCols}
              dataSource={invites}
              locale={{
                emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No invites yet" />,
              }}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  )
}
