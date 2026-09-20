import { useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Empty, Input, Modal, Select, Spin } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import api from '../api'
import PulseFileTypeIcon, { fileExtOf } from './PulseFileTypeIcon'
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
    <ul className="pulse-att-list pulse-files-att-list" aria-label="Files">
      {rows.map((row) => (
        <li key={row.id} className="pulse-att-row pulse-files-att-row">
          <button type="button" className="pulse-files-att-hit" onClick={() => onView(row)}>
            <span className={`pulse-files-att-ico is-${fileExtOf(row) || 'file'}`} aria-hidden="true">
              <PulseFileTypeIcon row={row} />
            </span>
            <span className="pulse-att-day">
              <strong>{row.title}</strong>
              <span>{row.meta}</span>
            </span>
          </button>
          {row.canDelete && onDelete ? (
            <Button
              type="text"
              size="small"
              danger
              className="pulse-files-att-delete"
              icon={<DeleteOutlined />}
              aria-label={`Delete ${row.title}`}
              disabled={busy}
              onClick={() => onDelete(row)}
            />
          ) : (
            <span className="pulse-files-att-delete-slot" aria-hidden="true" />
          )}
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
  const [viewFile, setViewFile] = useState(null)
  const [pending, setPending] = useState(null)
  const [pendingTitle, setPendingTitle] = useState('')

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

  const closePending = () => {
    setPending(null)
    setPendingTitle('')
  }

  const beginUpload = (file, scope) => {
    if (!file) return
    if (file.size > MAX_MB * 1024 * 1024) {
      message.error(`File must be under ${MAX_MB} MB`)
      return
    }
    setPending({ file, scope })
    setPendingTitle(file.name.replace(/\.[^.]+$/, '') || file.name)
  }

  const onPickCompany = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    beginUpload(file, 'company')
  }

  const onPickEmployee = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!employeeId) return
    beginUpload(file, 'employee')
  }

  const confirmUpload = async () => {
    if (!pending?.file) return
    setBusy(true)
    try {
      const data = await readAsDataUrl(pending.file)
      const title = pendingTitle.trim() || pending.file.name
      if (pending.scope === 'employee') {
        await api.post(`/pulse-files/admin/employee/${employeeId}`, {
          data,
          originalName: pending.file.name,
          title,
        })
        message.success('Uploaded to employee My files')
        closePending()
        await loadEmployeeFiles(employeeId)
      } else {
        await api.post('/pulse-files/company', {
          data,
          originalName: pending.file.name,
          title,
        })
        message.success('File uploaded')
        closePending()
        await loadCompany()
      }
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
      cancelButtonProps: {
        className: 'pulse-files-delete-cancel',
        style: { borderColor: '#d9d9d9', color: '#183B35' },
      },
      centered: true,
      className: 'pulse-files-delete-confirm',
      styles: { body: { paddingTop: 8 } },
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

  const showingEmployee = tab === 'employee' && canManage
  const activeLoading = showingEmployee ? employeeLoading : loading
  const activeRows = showingEmployee ? employeeRows : rows
  const panelTitle = showingEmployee ? 'Employee files' : 'Company files'
  const canUpload = (tab === 'company' && canManage) || (showingEmployee && Boolean(employeeId))
  const selectedEmployee = employees.find((row) => row.id === employeeId)

  const triggerUpload = () => {
    if (showingEmployee) employeeInputRef.current?.click()
    else companyInputRef.current?.click()
  }

  return (
    <div className="pulse-att-page pulse-files-att">
      <div className="pulse-att-board">
        <header className="pulse-att-toolbar">
          <div className="pulse-att-period">
            {canManage ? (
              <div className="pulse-files-seg" role="tablist" aria-label="File sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'company'}
                  className={`pulse-files-seg-btn${tab === 'company' ? ' is-on' : ''}`}
                  onClick={() => setTab('company')}
                >
                  Company
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'employee'}
                  className={`pulse-files-seg-btn${tab === 'employee' ? ' is-on' : ''}`}
                  onClick={() => setTab('employee')}
                >
                  Employees
                </button>
              </div>
            ) : null}
            {showingEmployee ? (
              <Select
                showSearch
                optionFilterProp="label"
                className="pulse-att-select pulse-files-employee-select"
                classNames={{ popup: { root: 'pulse-files-select-dropdown' } }}
                placeholder="Select employee"
                value={employeeId}
                options={employeeOptions}
                onChange={setEmployeeId}
              />
            ) : null}
          </div>
          <div className="pulse-files-toolbar-actions">
            {canUpload ? (
              <button
                type="button"
                className="pov-cta plive-top-cta plive-checkin"
                disabled={busy}
                onClick={triggerUpload}
              >
                <PlusOutlined />
                Upload
              </button>
            ) : null}
          </div>
        </header>

        <input
          ref={companyInputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={onPickCompany}
        />
        <input
          ref={employeeInputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={onPickEmployee}
        />

        <section className="pulse-att-panel" aria-label="Files">
          <div className="pulse-att-panel-chrome">
            <header className="pulse-att-panel-head">
              <h4>
                {panelTitle}
                {showingEmployee && selectedEmployee?.name ? (
                  <em className="pulse-files-head-sub"> · {selectedEmployee.name}</em>
                ) : null}
              </h4>
              <span>
                {activeRows.length} file{activeRows.length === 1 ? '' : 's'}
              </span>
            </header>
            <div className="pulse-att-cols pulse-files-att-cols" aria-hidden="true">
              <span>Name</span>
              <span />
            </div>
          </div>

          <div className="pulse-files-att-body">
            {activeLoading ? (
              <div className="pulse-files-loading">
                <Spin />
              </div>
            ) : activeRows.length === 0 ? (
              <div className="pulse-files-empty">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    showingEmployee
                      ? employeeId
                        ? canManage
                          ? 'No files for this employee yet'
                          : 'No files yet'
                        : 'Choose an employee to view their files'
                      : canManage
                        ? 'No company files yet'
                        : 'No files yet'
                  }
                >
                  {canUpload ? (
                    <button
                      type="button"
                      className="pov-cta plive-top-cta plive-checkin pulse-files-empty-cta"
                      disabled={busy}
                      onClick={triggerUpload}
                    >
                      <PlusOutlined />
                      Upload a file
                    </button>
                  ) : null}
                </Empty>
                <p className="pulse-files-empty-hint">
                  PDF, images, Word, Excel · max {MAX_MB} MB
                </p>
              </div>
            ) : (
              <FileRows
                rows={activeRows}
                busy={busy}
                onView={setViewFile}
                onDelete={canManage ? remove : undefined}
              />
            )}
          </div>
        </section>
      </div>

      <Modal
        title="Upload file"
        open={Boolean(pending)}
        onCancel={busy ? undefined : closePending}
        destroyOnHidden
        centered
        width={440}
        className="pulse-files-upload-modal"
        footer={
          <div className="pulse-files-upload-footer">
            <Button disabled={busy} onClick={closePending}>
              Cancel
            </Button>
            <Button type="primary" loading={busy} onClick={confirmUpload}>
              Upload
            </Button>
          </div>
        }
      >
        {pending ? (
          <div className="pulse-files-upload-body">
            <p className="pulse-files-upload-file">
              <PulseFileTypeIcon row={{ originalName: pending.file.name }} size={28} />
              <span>{pending.file.name}</span>
            </p>
            <label className="pulse-files-upload-label" htmlFor="pulse-files-upload-title">
              Display name
            </label>
            <Input
              id="pulse-files-upload-title"
              value={pendingTitle}
              onChange={(e) => setPendingTitle(e.target.value)}
              maxLength={120}
              placeholder="Optional title"
              onPressEnter={confirmUpload}
            />
            <p className="pulse-files-hint">
              {pending.scope === 'employee'
                ? `Goes to this employee’s My files · max ${MAX_MB} MB`
                : `Visible to the company · max ${MAX_MB} MB`}
            </p>
          </div>
        ) : null}
      </Modal>

      <PulseFileViewModal
        open={Boolean(viewFile)}
        file={viewFile}
        onClose={() => setViewFile(null)}
      />
    </div>
  )
}
