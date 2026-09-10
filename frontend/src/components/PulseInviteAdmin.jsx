import { useEffect, useMemo, useState } from 'react'
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
  Modal,
  Row,
  Select,
  Table,
  Tag,
} from 'antd'
import { ReloadOutlined, SendOutlined, UserOutlined } from '@ant-design/icons'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import {
  assignableRolesFor,
  isPulseAdmin,
  pulseRoleLabel,
  pulseRoleTagColor,
} from '../utils/pulseRoles'

function GmailMark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="pulse-people-gmail">
      <path
        fill="#EA4335"
        d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"
      />
    </svg>
  )
}

function memberDisplayName(row) {
  const n = [row?.firstName, row?.lastName].filter(Boolean).join(' ').trim()
  return n || row?.email || ''
}

/** Admin / Super Admin: invite Admins/Super Admins and manage roles. */
export default function PulseInviteAdmin({ embedded = false } = {}) {
  const { message } = App.useApp()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [companyDomain, setCompanyDomain] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [savingRoleId, setSavingRoleId] = useState(null)
  const [sending, setSending] = useState(false)
  const [roleConfirm, setRoleConfirm] = useState(null)
  const [confirmName, setConfirmName] = useState('')
  const [form] = Form.useForm()

  const roleOptions = useMemo(() => {
    const fromApi = assignableRolesFor(user)
    return fromApi.length
      ? fromApi
      : [
          { value: 'member', label: 'Member' },
          { value: 'admin', label: 'Admin' },
          { value: 'superadmin', label: 'Super Admin' },
        ]
  }, [user])

  const inviteRoleOptions = useMemo(
    () => roleOptions.filter((opt) => opt.value !== 'member'),
    [roleOptions],
  )

  const pendingInvites = useMemo(
    () => invites.filter((row) => row.status === 'pending'),
    [invites],
  )

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/invites')
      setMembers(res.data?.data?.members || [])
      setInvites(res.data?.data?.invites || [])
      setCompanyDomain(res.data?.data?.companyDomain || '')
      setCurrentUserId(String(res.data?.data?.currentUserId || user?._id || ''))
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
        role: values.role || 'admin',
      })
      const link = res.data?.data?.devInviteLink
      if (link) {
        message.success('Invite created — copy the link')
        message.info(link, 12)
      } else {
        message.success(res.data?.message || 'Invite sent')
      }
      form.resetFields()
      form.setFieldsValue({ role: 'admin' })
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

  const requestRoleChange = (row, nextRole) => {
    const current = row.role || 'admin'
    if (current === nextRole) return
    setConfirmName('')
    setRoleConfirm({
      member: row,
      nextRole,
      displayName: memberDisplayName(row),
      fromLabel: pulseRoleLabel(current),
      toLabel: pulseRoleLabel(nextRole),
    })
  }

  const closeRoleConfirm = () => {
    if (savingRoleId) return
    setRoleConfirm(null)
    setConfirmName('')
  }

  const confirmRoleChange = async () => {
    if (!roleConfirm?.member?._id) return
    const expected = roleConfirm.displayName
    if (confirmName.trim().toLowerCase() !== expected.trim().toLowerCase()) {
      message.error(`Type “${expected}” exactly to confirm`)
      return
    }
    const memberId = roleConfirm.member._id
    setSavingRoleId(memberId)
    try {
      const res = await api.patch(`/invites/members/${memberId}/role`, {
        role: roleConfirm.nextRole,
        confirmName: confirmName.trim(),
      })
      message.success(res.data?.message || 'Role updated')
      setRoleConfirm(null)
      setConfirmName('')
      await load()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not update role')
      await load()
    } finally {
      setSavingRoleId(null)
    }
  }

  if (!isPulseAdmin(user)) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="Only Admin or Super Admin can manage people and roles."
      />
    )
  }

  const nameMatches = Boolean(
    roleConfirm &&
      confirmName.trim().toLowerCase() === String(roleConfirm.displayName || '').trim().toLowerCase(),
  )

  const cardClass = embedded ? 'acc-card pulse-people-card' : 'pulse-org-card pulse-people-card'

  const memberCols = [
    {
      title: 'Person',
      key: 'name',
      render: (_, row) => {
        const n = [row.firstName, row.lastName].filter(Boolean).join(' ')
        return (
          <Flex align="center" gap={10} className="pulse-people-person">
            <Avatar size={32} style={{ background: '#1A5F4A' }} icon={!n ? <UserOutlined /> : undefined}>
              {n ? n.charAt(0).toUpperCase() : null}
            </Avatar>
            <span className="pulse-people-person-meta">
              <strong>{n || '—'}</strong>
              <em>
                {row.email}
                {row.isOwner ? ' · Owner' : ''}
                {String(row._id) === currentUserId ? ' · You' : ''}
              </em>
            </span>
          </Flex>
        )
      },
    },
    {
      title: 'Role',
      dataIndex: 'role',
      width: 160,
      align: 'right',
      render: (r, row) => {
        const self = String(row._id) === currentUserId
        if (self) {
          return <Tag color={pulseRoleTagColor(r)}>{pulseRoleLabel(r)}</Tag>
        }
        return (
          <Select
            size="middle"
            value={r || 'admin'}
            className="pulse-people-role-select"
            popupMatchSelectWidth={false}
            loading={savingRoleId === row._id}
            options={roleOptions}
            onChange={(role) => requestRoleChange(row, role)}
            getPopupContainer={() => document.body}
          />
        )
      },
    },
  ]

  const inviteCols = [
    {
      title: 'Invite',
      key: 'invite',
      render: (_, row) => (
        <span className="pulse-people-person-meta">
          <strong>{row.email}</strong>
          <em>{pulseRoleLabel(row.role)}</em>
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 108,
      render: (s) => {
        const color = s === 'pending' ? 'processing' : s === 'accepted' ? 'success' : 'default'
        return <Tag color={color}>{s}</Tag>
      },
    },
    {
      title: '',
      key: 'actions',
      width: 84,
      align: 'right',
      render: (_, row) =>
        row.status === 'pending' ? (
          <Button type="link" danger size="small" onClick={() => revoke(row._id)}>
            Revoke
          </Button>
        ) : null,
    },
  ]

  return (
    <div className={`pulse-people${embedded ? ' is-embedded' : ''}`}>
      <Card
        size="small"
        className={cardClass}
        bordered={embedded ? false : undefined}
        title="Invite"
        extra={
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={load}
            loading={loading}
            aria-label="Refresh"
          />
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={onInvite}
          initialValues={{ role: 'admin' }}
          requiredMark={false}
          className="pulse-people-invite-form"
        >
          <div className="pulse-people-invite-row">
            <Form.Item
              name="email"
              className="pulse-people-invite-email"
              rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
            >
              <Input
                prefix={<GmailMark size={18} />}
                placeholder={companyDomain ? `name@${companyDomain}` : 'name@company.com'}
                allowClear
                size="large"
              />
            </Form.Item>
            <Form.Item name="role" className="pulse-people-invite-role">
              <Select size="large" options={inviteRoleOptions} />
            </Form.Item>
            <Form.Item className="pulse-people-invite-submit">
              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={sending} size="large">
                Send invite
              </Button>
            </Form.Item>
          </div>
        </Form>
      </Card>

      <Row gutter={[14, 14]} className="pulse-people-split">
        <Col xs={24} xl={14}>
          <Card
            size="small"
            className={cardClass}
            bordered={embedded ? false : undefined}
            title={
              <Flex align="center" gap={8}>
                <span>Team</span>
                <Tag bordered={false}>{members.length}</Tag>
              </Flex>
            }
          >
            <Table
              size="middle"
              rowKey="_id"
              loading={loading}
              pagination={false}
              columns={memberCols}
              dataSource={members}
              className="pulse-people-table"
              locale={{
                emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No people yet" />,
              }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card
            size="small"
            className={cardClass}
            bordered={embedded ? false : undefined}
            title={
              <Flex align="center" gap={8}>
                <span>Pending invites</span>
                <Tag bordered={false}>{pendingInvites.length}</Tag>
              </Flex>
            }
          >
            <Table
              size="middle"
              rowKey="_id"
              loading={loading}
              pagination={false}
              columns={inviteCols}
              dataSource={pendingInvites}
              className="pulse-people-table"
              locale={{
                emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No pending invites" />,
              }}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title={null}
        open={Boolean(roleConfirm)}
        onCancel={closeRoleConfirm}
        footer={null}
        destroyOnHidden
        centered
        width={420}
        className="pulse-people-confirm"
        styles={{ body: { padding: 0 } }}
      >
        {roleConfirm ? (
          <div className="pulse-people-confirm-body">
            <header className="pulse-people-confirm-head">
              <Avatar size={44} style={{ background: '#1A5F4A' }}>
                {roleConfirm.displayName.charAt(0).toUpperCase()}
              </Avatar>
              <div>
                <p className="pulse-people-confirm-kicker">Confirm role change</p>
                <h3 className="pulse-people-confirm-name">{roleConfirm.displayName}</h3>
              </div>
              <button
                type="button"
                className="pulse-people-confirm-close"
                aria-label="Close"
                disabled={Boolean(savingRoleId)}
                onClick={closeRoleConfirm}
              >
                ×
              </button>
            </header>

            <div className="pulse-people-confirm-shift" aria-label={`From ${roleConfirm.fromLabel} to ${roleConfirm.toLabel}`}>
              <div className="pulse-people-confirm-role is-from">
                <span>From</span>
                <strong>{roleConfirm.fromLabel}</strong>
              </div>
              <span className="pulse-people-confirm-arrow" aria-hidden="true">
                →
              </span>
              <div className={`pulse-people-confirm-role is-to is-${roleConfirm.nextRole}`}>
                <span>To</span>
                <strong>{roleConfirm.toLabel}</strong>
              </div>
            </div>

            <label className="pulse-people-confirm-label" htmlFor="pulse-people-confirm-input">
              Type <b>{roleConfirm.displayName}</b> to confirm
            </label>
            <Input
              id="pulse-people-confirm-input"
              autoFocus
              size="large"
              value={confirmName}
              status={confirmName && !nameMatches ? 'error' : undefined}
              placeholder={roleConfirm.displayName}
              className={`pulse-people-confirm-input${nameMatches ? ' is-ready' : ''}`}
              onChange={(e) => setConfirmName(e.target.value)}
              onPressEnter={() => {
                if (nameMatches) confirmRoleChange()
              }}
            />
            {confirmName && !nameMatches ? (
              <p className="pulse-people-confirm-hint is-error">Name doesn’t match yet</p>
            ) : nameMatches ? (
              <p className="pulse-people-confirm-hint is-ok">Ready to confirm</p>
            ) : null}

            <footer className="pulse-people-confirm-actions">
              <Button disabled={Boolean(savingRoleId)} onClick={closeRoleConfirm}>
                Cancel
              </Button>
              <Button
                type="primary"
                danger
                disabled={!nameMatches}
                loading={Boolean(savingRoleId)}
                onClick={confirmRoleChange}
              >
                Confirm change
              </Button>
            </footer>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
