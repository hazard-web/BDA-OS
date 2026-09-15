import { useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Empty, Input, Select, Spin } from 'antd'
import {
  DeleteOutlined,
  EyeOutlined,
  FileOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  ReloadOutlined,
  UserOutlined,
} from '@ant-design/icons'
import api from '../api'
import PulseFileViewModal from './PulseFileViewModal'
import './pulse-files.css'

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt'
const MAX_MB = 10

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

function FileRows({ rows, busy, onView, onDelete }) {
  if (!rows.length) return null
  return (
    <ul className="pulse-files-list">
      {rows.map((row) => (
        <li key={row.id} className="pulse-files-row">
          <button
            type="button"
            className="pulse-files-row-hit"
            onClick={() => onView(row)}
          >
            <span className="pulse-files-ico" aria-hidden="true">
              {row.section === 'employee' ? <FileOutlined /> : <FolderOpenOutlined />}
            </span>
            <div className="pulse-files-copy">
              <p className="pulse-files-name">{row.title}</p>
              <p className="pulse-files-meta">{row.meta}</p>
            </div>
            <span className="pulse-files-view-hint">
              <EyeOutlined /> View
            </span>
          </button>
          {row.canDelete && onDelete ? (
            <Button
              type="text"
              size="small"
              danger
              className="pulse-files-delete"
              icon={<DeleteOutlined />}
              aria-label={`Delete ${row.title}`}
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(row)
              }}
            />
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export default function PulseCompanyFiles() {
  const { message, modal } = App.useApp()
  const companyInputRef = useRef(null)
  const employeeInputRef = useRef(null)
  const [tab, setTab] = useState('company')
  const [rows, setRows] = useState([])
  const [employeeRows, setEmployeeRows] = useState([])
  const [employees, setEmployees] = useState([])
  const [employeeId, setEmployeeId] = useState(null)
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [employeeLoading, setEmployeeLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [employeeTitle, setEmployeeTitle] = useState('')
  const [viewFile, setViewFile] = useState(null)

  const loadCompany = async () => {
    setLoading(true)
    try {
      const res = await api.get('/pulse-files/company')
      setRows((res.data?.data || []).map((row) => ({ ...row, canDelete: Boolean(res.data?.canManage) })))
      setCanManage(Boolean(res.data?.canManage))
    } catch (err) {
      setRows([])
      message.error(err?.response?.data?.message || 'Could not load files')
    } finally {
      setLoading(false)
    }
  }

  const loadEmployees = async () => {
    try {
      const res = await api.get('/pulse-files/admin/employees')
      const list = res.data?.data || []
      setEmployees(list)
      if (!employeeId && list.length) setEmployeeId(list[0].id)
    } catch {
      setEmployees([])
    }
  }

  const loadEmployeeFiles = async (id) => {
    if (!id) {
      setEmployeeRows([])
      return
    }
    setEmployeeLoading(true)
    try {
      const res = await api.get(`/pulse-files/admin/employee/${id}`)
      setEmployeeRows(res.data?.data || [])
    } catch (err) {
      setEmployeeRows([])
      message.error(err?.response?.data?.message || 'Could not load employee files')
    } finally {
      setEmployeeLoading(false)
    }
  }

  useEffect(() => {
    loadCompany()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!canManage) return
    loadEmployees()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage])

  useEffect(() => {
    if (tab !== 'employee' || !canManage || !employeeId) return
    loadEmployeeFiles(employeeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, employeeId, canManage])

  const employeeOptions = useMemo(
    () =>
      employees.map((row) => ({
        value: row.id,
        label: `${row.name}${row.email ? ` · ${row.email}` : ''}`,
      })),
    [employees],
  )

  const onPickCompany = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_MB * 1024 * 1024) {
      message.error(`File must be under ${MAX_MB} MB`)
      return
    }
    setBusy(true)
    try {
      const data = await readAsDataUrl(file)
      await api.post('/pulse-files/company', {
        data,
        originalName: file.name,
        title: title.trim() || file.name,
      })
      setTitle('')
      message.success('File uploaded')
      await loadCompany()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const onPickEmployee = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !employeeId) return
    if (file.size > MAX_MB * 1024 * 1024) {
      message.error(`File must be under ${MAX_MB} MB`)
      return
    }
    setBusy(true)
    try {
      const data = await readAsDataUrl(file)
      await api.post(`/pulse-files/admin/employee/${employeeId}`, {
        data,
        originalName: file.name,
        title: employeeTitle.trim() || file.name,
      })
      setEmployeeTitle('')
      message.success('Uploaded to employee My files')
      await loadEmployeeFiles(employeeId)
    } catch (err) {
      message.error(err?.response?.data?.message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const remove = (row) => {
    const isEmployeeDoc = Boolean(row.staffDocId)
    modal.confirm({
      title: isEmployeeDoc ? 'Delete this employee file?' : 'Delete this company file?',
      content: row.originalName || row.title,
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        setBusy(true)
        try {
          if (isEmployeeDoc) {
            await api.delete(`/pulse-files/admin/employee/${employeeId}/files/${row.staffDocId}`)
            message.success('Deleted')
            await loadEmployeeFiles(employeeId)
          } else {
            await api.delete(`/pulse-files/company/${row.id}`)
            message.success('Deleted')
            await loadCompany()
          }
        } catch (err) {
          message.error(err?.response?.data?.message || 'Could not delete')
        } finally {
          setBusy(false)
        }
      },
    })
  }

  const refresh = () => {
    if (tab === 'company') loadCompany()
    else if (employeeId) loadEmployeeFiles(employeeId)
  }

  const showingEmployee = tab === 'employee' && canManage
  const activeLoading = showingEmployee ? employeeLoading : loading
  const activeRows = showingEmployee ? employeeRows : rows

  return (
    <div className="pulse-files-page">
      <div className="pulse-files-toolbar">
        {canManage ? (
          <div className="pulse-files-tabs" role="tablist" aria-label="File sections">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'company'}
              className={`pulse-files-tab${tab === 'company' ? ' is-on' : ''}`}
              onClick={() => setTab('company')}
            >
              Company
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'employee'}
              className={`pulse-files-tab${tab === 'employee' ? ' is-on' : ''}`}
              onClick={() => setTab('employee')}
            >
              My files
            </button>
          </div>
        ) : (
          <div className="pulse-files-toolbar-spacer" />
        )}
        <Button
          type="text"
          className="pulse-files-refresh"
          icon={<ReloadOutlined />}
          aria-label="Refresh"
          onClick={refresh}
          disabled={activeLoading || busy}
        />
      </div>

      {tab === 'company' && canManage ? (
        <div className="pulse-files-upload">
          <div className="pulse-files-upload-main">
            <Input
              className="pulse-files-title-input"
              placeholder="Optional title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
            <input
              ref={companyInputRef}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={onPickCompany}
            />
            <Button
              type="primary"
              className="pulse-files-upload-btn"
              icon={<PlusOutlined />}
              loading={busy}
              onClick={() => companyInputRef.current?.click()}
            >
              Upload file
            </Button>
          </div>
          <p className="pulse-files-hint">PDF, images, Word, Excel · max {MAX_MB} MB</p>
        </div>
      ) : null}

      {showingEmployee ? (
        <>
          <div className="pulse-files-employee-bar">
            <span className="pulse-files-employee-label">
              <UserOutlined /> Employee
            </span>
            <Select
              showSearch
              optionFilterProp="label"
              className="pulse-files-employee-select"
              classNames={{ popup: { root: 'pulse-files-select-dropdown' } }}
              placeholder="Select employee"
              value={employeeId}
              options={employeeOptions}
              onChange={setEmployeeId}
            />
          </div>
          {employeeId ? (
            <div className="pulse-files-upload">
              <div className="pulse-files-upload-main">
                <Input
                  className="pulse-files-title-input"
                  placeholder="Optional title"
                  value={employeeTitle}
                  onChange={(e) => setEmployeeTitle(e.target.value)}
                  maxLength={120}
                />
                <input
                  ref={employeeInputRef}
                  type="file"
                  accept={ACCEPT}
                  hidden
                  onChange={onPickEmployee}
                />
                <Button
                  type="primary"
                  className="pulse-files-upload-btn"
                  icon={<PlusOutlined />}
                  loading={busy}
                  onClick={() => employeeInputRef.current?.click()}
                >
                  Upload for employee
                </Button>
              </div>
              <p className="pulse-files-hint">
                Shows in this employee&apos;s My files · PDF, images, Word, Excel · max {MAX_MB} MB
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      {activeLoading ? (
        <div className="pulse-files-loading">
          <Spin />
        </div>
      ) : activeRows.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            showingEmployee
              ? employeeId
                ? 'No personal or onboarding files for this employee — upload one above'
                : 'Select an employee'
              : canManage
                ? 'No files yet — upload the first one'
                : 'No files yet'
          }
        />
      ) : (
        <FileRows
          rows={activeRows}
          busy={busy}
          onView={setViewFile}
          onDelete={canManage ? remove : undefined}
        />
      )}

      <PulseFileViewModal
        open={Boolean(viewFile)}
        file={viewFile}
        onClose={() => setViewFile(null)}
      />
    </div>
  )
}
