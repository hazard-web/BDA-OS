import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  App,
  Button,
  Checkbox,
  Drawer,
  Dropdown,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Popover,
  Select,
  Space,
  Table,
  Tag,
} from 'antd'
import {
  DeleteOutlined,
  FileDoneOutlined,
  CloseOutlined,
  FilterOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import api from '../api'
import { companyEmailRequiredMessage, isCompanyEmail, normalizeCompanyEmail } from '../utils/companyDomain'
import PulseCandidateForm, {
  DEPARTMENTS,
  LOCATIONS,
  emptyCandidate,
  payloadFromValues,
  valuesFromCandidate,
} from './PulseCandidateForm'
import './pulse-onboarding.css'

const ALL_COLUMNS = [
  { key: 'firstName', title: 'First name' },
  { key: 'lastName', title: 'Last name' },
  { key: 'email', title: 'Email ID' },
  { key: 'officialEmail', title: 'Official Email' },
  { key: 'status', title: 'Onboarding Status' },
  { key: 'department', title: 'Department' },
  { key: 'sourceOfHire', title: 'Source of Hire' },
  { key: 'pan', title: 'PAN card number' },
  { key: 'aadhaar', title: 'Aadhaar card number' },
  { key: 'phone', title: 'Phone' },
  { key: 'workLocation', title: 'Location' },
  { key: 'title', title: 'Title' },
  { key: 'experienceYears', title: 'Experience' },
  { key: 'skillSet', title: 'Skill Set' },
  { key: 'highestQualification', title: 'Highest Qualification' },
  { key: 'currentSalary', title: 'Current Salary' },
  { key: 'additionalInfo', title: 'Additional information' },
  { key: 'tentativeJoiningDate', title: 'Tentative Joining Date' },
  { key: 'candidateId', title: 'Employee ID' },
]

const LOCKED_KEYS = ['firstName', 'lastName', 'email']
const OPTIONAL_COLUMNS = ALL_COLUMNS.filter((col) => !LOCKED_KEYS.includes(col.key))
const ALL_ON = Object.fromEntries(ALL_COLUMNS.map((col) => [col.key, true]))

const STATUS_COLOR = {
  Draft: 'default',
  'Not started': 'gold',
  'In progress': 'blue',
  'Details received': 'purple',
  'Offer sent': 'cyan',
  Joined: 'green',
  Withdrawn: 'red',
}

function employeeName(row) {
  return [row?.firstName, row?.lastName].map((part) => String(part || '').trim()).filter(Boolean).join(' ')
}

function matchesDeleteConfirm(typed, row) {
  const value = String(typed || '').trim().toLowerCase()
  if (!value) return false
  const id = String(row?.candidateId || '').trim().toLowerCase()
  const name = employeeName(row).toLowerCase()
  return Boolean((id && value === id) || (name && value === name))
}

function dash(value) {
  if (value == null || value === '') return '—'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    try {
      return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch {
      return value
    }
  }
  return value
}

function EmptyArt() {
  return (
    <div className="ob-empty-art" aria-hidden="true">
      <div className="ob-empty-tray">
        <span className="ob-empty-lid" />
        <span className="ob-empty-mark" />
      </div>
    </div>
  )
}

export default function PulseOnboarding() {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [draftFilters, setDraftFilters] = useState({ employee: '', department: 'all', location: 'all' })
  const [applied, setApplied] = useState({ employee: '', department: 'all', location: 'all' })
  const [visible, setVisible] = useState(ALL_ON)
  const [draftVisible, setDraftVisible] = useState(ALL_ON)
  const [viewQuery, setViewQuery] = useState('')
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [removing, setRemoving] = useState(null)
  const [confirmText, setConfirmText] = useState('')
  const [removingBusy, setRemovingBusy] = useState(false)
  const [mailFail, setMailFail] = useState(null)

  const load = useCallback(async (opts = {}) => {
    const silent = Boolean(opts.silent)
    if (!silent) setLoading(true)
    try {
      const res = await api.get('/candidates', {
        params: {
          q: applied.employee || query || undefined,
          department: applied.department,
          location: applied.location,
          scope: 'all',
        },
      })
      const candidates = res.data?.data?.candidates || []
      setRows(candidates)
      if (!silent) setSelectedRowKeys([])
      setEditing((prev) => {
        if (!prev?._id) return prev
        const next = candidates.find((row) => String(row._id) === String(prev._id))
        return next ? { ...prev, ...next } : prev
      })
    } catch (err) {
      if (!silent) {
        setRows([])
        message.error(err?.response?.data?.message || 'Could not load employees')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [applied, query, message])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const id = window.setInterval(() => {
      load({ silent: true })
    }, 8000)
    return () => window.clearInterval(id)
  }, [load])

  const submittedOnOpen = useRef(false)
  const submittedKey = editing?.employeeSubmittedAt && editing?._id
    ? `${editing._id}:${editing.employeeSubmittedAt}`
    : ''

  const closeForm = () => {
    submittedOnOpen.current = false
    setOpen(false)
    setEditing(null)
  }

  const openAdd = () => {
    submittedOnOpen.current = false
    setEditing(null)
    form.resetFields()
    form.setFieldsValue(emptyCandidate)
    setOpen(true)
  }

  const openEdit = async (record) => {
    submittedOnOpen.current = Boolean(record.employeeSubmittedAt)
    setEditing(record)
    setOpen(true)
    try {
      const res = await api.get(`/candidates/${record._id}`)
      form.setFieldsValue(valuesFromCandidate(res.data?.data || record))
    } catch {
      form.setFieldsValue(valuesFromCandidate(record))
    }
  }

  useEffect(() => {
    if (!open || !editing?._id || !editing.employeeSubmittedAt || submittedOnOpen.current) return undefined
    submittedOnOpen.current = true
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get(`/candidates/${editing._id}`)
        if (cancelled) return
        const keep = form.getFieldsValue([
          'officialEmail',
          'tentativeJoiningDate',
          'offerLetter',
          'department',
          'title',
          'workLocation',
          'sourceOfHire',
          'email',
        ])
        form.setFieldsValue({ ...valuesFromCandidate(res.data?.data), ...keep })
      } catch {
        /* keep current form */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, submittedKey, form])

  const persistAdmin = async () => {
    const values = form.getFieldsValue(true)
    const payload = payloadFromValues(values, { draft: true, mode: 'admin' })
    if (editing?._id) {
      const res = await api.patch(`/candidates/${editing._id}`, payload)
      const row = res.data?.data
      if (row) setEditing((prev) => ({ ...prev, ...row }))
      return row
    }
    const res = await api.post('/candidates', payload)
    const row = res.data?.data
    if (row) setEditing(row)
    return row
  }

  const saveDraft = async () => {
    try {
      setSaving(true)
      await persistAdmin()
      message.success('Saved')
      await load()
    } catch (err) {
      message.error(err?.response?.data?.message || err.message || 'Could not save employee')
    } finally {
      setSaving(false)
    }
  }

  const sendDetailsEmail = async () => {
    try {
      await form.validateFields(['email'])
      setSending(true)
      const row = await persistAdmin()
      const id = row?._id || editing?._id
      if (!id) throw new Error('Could not save employee')
      const res = await api.post(`/candidates/${id}/send-onboarding`)
      const onboardLink = res.data?.data?.devOnboardLink || res.data?.data?.onboardUrl
      if (res.data?.emailSent === false) {
        setMailFail({
          title: 'Employee saved — email not sent',
          message: res.data?.message || 'Record saved, but the email could not be sent',
          link: onboardLink || '',
          linkLabel: 'Details form link',
        })
        await load()
        return
      }
      message.success(res.data?.message || 'Details email sent')
      closeForm()
      await load()
    } catch (err) {
      if (err?.errorFields) return
      message.error(err?.response?.data?.message || err.message || 'Could not send details email')
    } finally {
      setSending(false)
    }
  }

  const sendPulseInvite = async () => {
    try {
      await form.validateFields(['officialEmail'])
      const values = form.getFieldsValue(true)
      const workEmail = normalizeCompanyEmail(values.officialEmail)
      if (!workEmail) {
        message.error('Work email is required')
        return
      }
      if (!isCompanyEmail(workEmail)) {
        message.error(companyEmailRequiredMessage())
        return
      }
      if (!values.tentativeJoiningDate) {
        message.error('Joining date is required')
        return
      }
      if (!values.offerLetter?.name && !values.offerLetter?.data) {
        message.error('Upload the offer letter')
        return
      }
      setSending(true)
      const row = await persistAdmin()
      const id = row?._id || editing?._id
      if (!id) throw new Error('Could not save employee')
      const res = await api.post(`/candidates/${id}/send-invite`)
      const inviteLink = res.data?.data?.devInviteLink || res.data?.data?.inviteUrl
      if (res.data?.emailSent === false) {
        setMailFail({
          title: 'Invite created — email not sent',
          message: res.data?.message || 'Invite created, but the email could not be sent',
          link: inviteLink || '',
          linkLabel: 'Pulse invite link',
        })
        await load()
        return
      }
      message.success(res.data?.message || 'Pulse invite sent')
      closeForm()
      await load()
    } catch (err) {
      if (err?.errorFields) return
      message.error(err?.response?.data?.message || err.message || 'Could not send Pulse invite')
    } finally {
      setSending(false)
    }
  }

  const askDelete = (row, e) => {
    e?.stopPropagation?.()
    if (!row?._id) return
    setConfirmText('')
    setRemoving(row)
  }

  const closeDelete = () => {
    if (removingBusy) return
    setRemoving(null)
    setConfirmText('')
  }

  const confirmDelete = async () => {
    if (!removing?._id || !matchesDeleteConfirm(confirmText, removing)) return
    try {
      setRemovingBusy(true)
      await api.delete(`/candidates/${removing._id}`)
      message.success('Employee removed')
      if (editing?._id && String(editing._id) === String(removing._id)) closeForm()
      setRemoving(null)
      setConfirmText('')
      await load()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not delete employee')
    } finally {
      setRemovingBusy(false)
    }
  }

  const canConfirmDelete = matchesDeleteConfirm(confirmText, removing)
  const deleteHintId = String(removing?.candidateId || '').trim()
  const deleteHintName = employeeName(removing)

  const statusFilters = useMemo(
    () => [...new Set(rows.map((r) => r.status).filter(Boolean))].map((s) => ({ text: s, value: s })),
    [rows],
  )

  const fieldList = OPTIONAL_COLUMNS.filter((col) => col.title.toLowerCase().includes(viewQuery.trim().toLowerCase()))

  const closeViewEdit = () => {
    setViewOpen(false)
    setViewQuery('')
    setDraftVisible({ ...visible, firstName: true, lastName: true, email: true })
  }

  const saveViewEdit = () => {
    setVisible({ ...draftVisible, firstName: true, lastName: true, email: true })
    setViewOpen(false)
    setViewQuery('')
  }

  const toggleColumn = (key, checked) => {
    if (LOCKED_KEYS.includes(key)) return
    setDraftVisible((prev) => ({ ...prev, [key]: checked, firstName: true, lastName: true, email: true }))
  }

  const columnPicker = (
    <Popover
      trigger="click"
      open={viewOpen}
      onOpenChange={(next) => {
        if (next) {
          setDraftVisible({ ...visible, firstName: true, lastName: true, email: true })
          setViewQuery('')
        }
        setViewOpen(next)
      }}
      placement="bottomLeft"
      arrow={false}
      overlayClassName="ob-view-pop"
      styles={{ body: { padding: 0 } }}
      content={
        <div className="ob-view-panel">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search"
            value={viewQuery}
            onChange={(e) => setViewQuery(e.target.value)}
          />
          <div className="ob-view-list">
            {fieldList.length === 0 ? (
              <p className="ob-view-empty">No matching columns</p>
            ) : (
              fieldList.map((col) => (
                <label key={col.key} className="ob-view-item">
                  <Checkbox
                    checked={Boolean(draftVisible[col.key])}
                    onChange={(e) => toggleColumn(col.key, e.target.checked)}
                  />
                  <span>{col.title}</span>
                </label>
              ))
            )}
          </div>
          <div className="ob-view-foot">
            <Button type="primary" onClick={saveViewEdit}>Save</Button>
            <Button onClick={closeViewEdit}>Cancel</Button>
          </div>
        </div>
      }
    >
      <button type="button" className="ob-col-picker" aria-label="Choose columns" onClick={(e) => e.stopPropagation()}>
        <FileDoneOutlined />
      </button>
    </Popover>
  )

  const rowIds = rows.map((row) => row._id)
  const allSelected = rowIds.length > 0 && selectedRowKeys.length === rowIds.length
  const someSelected = selectedRowKeys.length > 0 && !allSelected

  const toggleAllRows = (checked) => {
    setSelectedRowKeys(checked ? rowIds : [])
  }

  const toggleRow = (id, checked) => {
    setSelectedRowKeys((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((key) => key !== id)))
  }

  const columns = [
    {
      key: '_picker',
      width: 44,
      align: 'center',
      className: 'ob-lock-col',
      fixed: 'left',
      title: columnPicker,
      render: () => null,
    },
    {
      key: '_select',
      width: 42,
      align: 'center',
      className: 'ob-lock-col',
      fixed: 'left',
      title: (
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected}
          disabled={!rows.length}
          onChange={(e) => toggleAllRows(e.target.checked)}
          aria-label="Select all employees"
        />
      ),
      render: (_, record) => (
        <Checkbox
          checked={selectedRowKeys.includes(record._id)}
          onChange={(e) => toggleRow(record._id, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${record.firstName || 'employee'}`}
        />
      ),
    },
    ...ALL_COLUMNS.filter((col) => LOCKED_KEYS.includes(col.key) || visible[col.key]).map((col) => ({
      title: col.title,
      dataIndex: col.key,
      key: col.key,
      ellipsis: true,
      className: LOCKED_KEYS.includes(col.key) ? 'ob-lock-col' : undefined,
      fixed: LOCKED_KEYS.includes(col.key) ? 'left' : undefined,
      width: col.key === 'email' ? 180 : col.key === 'firstName' || col.key === 'lastName' ? 140 : 160,
      sorter: (a, b) => String(a[col.key] || '').localeCompare(String(b[col.key] || '')),
      showSorterTooltip: false,
      ...(col.key === 'status'
        ? {
            filters: statusFilters,
            onFilter: (value, record) => record.status === value,
            render: (v) => <Tag color={STATUS_COLOR[v] || 'default'}>{v || '—'}</Tag>,
          }
        : { render: (v) => dash(v) }),
    })),
    {
      key: '_actions',
      title: '',
      width: 48,
      align: 'center',
      fixed: 'right',
      className: 'ob-lock-col',
      render: (_, record) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              {
                key: 'delete',
                icon: <DeleteOutlined />,
                label: 'Delete',
                danger: true,
                onClick: ({ domEvent }) => askDelete(record, domEvent),
              },
            ],
          }}
        >
          <Button
            type="text"
            size="small"
            icon={<MoreOutlined />}
            aria-label={`More for ${employeeName(record) || record.candidateId || 'employee'}`}
            onClick={(e) => e.stopPropagation()}
          />
        </Dropdown>
      ),
    },
  ]

  return (
    <div className="ob-page">
      <div className="ob-toolbar">
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          Add Employee
        </Button>
        <Button type="text" icon={<FilterOutlined />} aria-label="Filter" onClick={() => setFilterOpen(true)} />
        <Dropdown
          menu={{
            items: [
              { key: 'reload', icon: <ReloadOutlined />, label: 'Refresh', onClick: load },
              ...(selectedRowKeys.length === 1
                ? [{
                    key: 'delete',
                    icon: <DeleteOutlined />,
                    label: 'Delete',
                    danger: true,
                    onClick: () => {
                      const row = rows.find((item) => item._id === selectedRowKeys[0])
                      if (row) askDelete(row)
                    },
                  }]
                : []),
            ],
          }}
        >
          <Button type="text" icon={<MoreOutlined />} aria-label="More" />
        </Dropdown>
      </div>

      <div className="ob-table-wrap">
        <Table
          rowKey="_id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
          scroll={{ x: 'max-content' }}
          onRow={(record) => ({ onClick: () => openEdit(record) })}
          locale={{
            emptyText: (
              <Empty
                image={<EmptyArt />}
                description={
                  <div className="ob-empty-copy">
                    <strong>No employees have been added yet</strong>
                    <p>
                      Add an employee and send a details form to their personal email. After they submit, their
                      information appears here. Then fill work email, joining date, and offer letter, and send the
                      Pulse invite to their work email.
                    </p>
                  </div>
                }
              />
            ),
          }}
        />
      </div>

      <Drawer
        title="Filter"
        placement="right"
        width={340}
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        footer={
          <Flex gap={8}>
            <Button
              type="primary"
              onClick={() => {
                setApplied(draftFilters)
                setQuery(draftFilters.employee)
                setFilterOpen(false)
              }}
            >
              Apply
            </Button>
            <Button
              onClick={() => {
                const reset = { employee: '', department: 'all', location: 'all' }
                setDraftFilters(reset)
                setApplied(reset)
                setQuery('')
              }}
            >
              Reset
            </Button>
          </Flex>
        }
      >
        <div className="ob-filter-block">
          <p className="ob-filter-label">System Filters</p>
          <label className="ob-filter-field">
            Employee
            <Input
              value={draftFilters.employee}
              onChange={(e) => setDraftFilters((f) => ({ ...f, employee: e.target.value }))}
            />
          </label>
          <label className="ob-filter-field">
            Department
            <Select
              value={draftFilters.department}
              onChange={(department) => setDraftFilters((f) => ({ ...f, department }))}
              options={[{ value: 'all', label: 'All Department' }, ...DEPARTMENTS.map((d) => ({ value: d, label: d }))]}
            />
          </label>
          <label className="ob-filter-field">
            Location
            <Select
              value={draftFilters.location}
              onChange={(location) => setDraftFilters((f) => ({ ...f, location }))}
              options={[{ value: 'all', label: 'All Locations' }, ...LOCATIONS.map((d) => ({ value: d, label: d }))]}
            />
          </label>
        </div>
      </Drawer>

      <Drawer
        title={editing ? 'Edit Employee' : 'Add Employee'}
        placement="right"
        width={920}
        open={open}
        onClose={closeForm}
        destroyOnHidden
        rootClassName="ob-add-drawer"
        closable={false}
        footer={
          <Space wrap>
            {editing?.employeeSubmittedAt ? (
              <Button type="primary" loading={sending} onClick={sendPulseInvite}>
                {editing?.pulseInviteSentAt ? 'Resend Pulse invite' : 'Send Pulse invite'}
              </Button>
            ) : (
              <Button type="primary" loading={sending} onClick={sendDetailsEmail}>
                {editing?.onboardingEmailSentAt ? 'Resend details email' : 'Send details email'}
              </Button>
            )}
            <Button loading={saving} disabled={sending} onClick={saveDraft}>
              Save
            </Button>
            {editing?._id ? (
              <Button
                danger
                disabled={sending || saving}
                onClick={() => askDelete(editing)}
              >
                Delete
              </Button>
            ) : null}
            <Button onClick={closeForm}>Cancel</Button>
          </Space>
        }
      >
        {editing?.onboardingEmailSentAt || editing?.employeeSubmittedAt || editing?.pulseInviteSentAt ? (
          <p className="ob-form-status">
            {editing.pulseInviteSentAt
              ? 'Pulse invite sent to their work email.'
              : editing.employeeSubmittedAt
                ? 'Details received. Fill work email, joining date, and offer letter, then send the Pulse invite.'
                : editing.onboardingEmailSentAt
                  ? 'Details form emailed to their personal inbox. Waiting for them to submit.'
                  : null}
          </p>
        ) : null}
        <PulseCandidateForm form={form} mode="admin" reviewEmployee={Boolean(editing?.employeeSubmittedAt)} />
      </Drawer>
      {open
        ? createPortal(
            <button
              type="button"
              className="ob-drawer-close"
              aria-label="Close"
              onClick={closeForm}
            >
              <CloseOutlined />
            </button>,
            document.body,
          )
        : null}
      <Modal
        title="Delete employee"
        open={Boolean(removing)}
        onCancel={closeDelete}
        destroyOnHidden
        maskClosable={!removingBusy}
        keyboard={!removingBusy}
        rootClassName="ob-delete-modal-root"
        className="ob-delete-modal"
        footer={
          <Space>
            <Button onClick={closeDelete} disabled={removingBusy}>Cancel</Button>
            <Button
              danger
              type="primary"
              loading={removingBusy}
              disabled={!canConfirmDelete}
              onClick={confirmDelete}
              style={{ color: '#fff' }}
            >
              Delete
            </Button>
          </Space>
        }
      >
        <p className="ob-delete-copy">
          This removes the employee record. Type{' '}
          {deleteHintId ? <strong>{deleteHintId}</strong> : 'the employee ID'}
          {deleteHintName ? (
            <>
              {' '}or <strong>{deleteHintName}</strong>
            </>
          ) : null}{' '}
          to confirm.
        </p>
        <Input
          autoFocus
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={deleteHintName ? `${deleteHintId || 'Employee ID'} or name` : (deleteHintId || 'Employee ID')}
          onPressEnter={confirmDelete}
        />
      </Modal>
      <Modal
        title={mailFail?.title || 'Email not sent'}
        open={Boolean(mailFail)}
        onCancel={() => setMailFail(null)}
        rootClassName="ob-mail-fail-modal-root"
        className="ob-mail-fail-modal"
        footer={
          <Space>
            {mailFail?.link ? (
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(mailFail.link)
                    message.success('Link copied')
                  } catch {
                    message.error('Could not copy the link')
                  }
                }}
              >
                Copy link
              </Button>
            ) : null}
            <Button type="primary" onClick={() => setMailFail(null)}>
              OK
            </Button>
          </Space>
        }
      >
        <p className="ob-mail-fail-copy">{mailFail?.message}</p>
        {mailFail?.link ? (
          <>
            <p className="ob-mail-fail-label">{mailFail.linkLabel || 'Share this link'}</p>
            <p className="ob-mail-fail-link">{mailFail.link}</p>
          </>
        ) : null}
      </Modal>
    </div>
  )
}
