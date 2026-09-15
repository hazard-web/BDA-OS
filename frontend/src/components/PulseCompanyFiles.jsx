import { useEffect, useRef, useState } from 'react'
import { App, Button, Empty, Input, Spin } from 'antd'
import {
  DeleteOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  ReloadOutlined,
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

export default function PulseCompanyFiles() {
  const { message, modal } = App.useApp()
  const inputRef = useRef(null)
  const [rows, setRows] = useState([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [viewFile, setViewFile] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/pulse-files/company')
      setRows(res.data?.data || [])
      setCanManage(Boolean(res.data?.canManage))
    } catch (err) {
      setRows([])
      message.error(err?.response?.data?.message || 'Could not load company files')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onPick = async (event) => {
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
      await load()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const remove = (row) => {
    modal.confirm({
      title: 'Delete this company file?',
      content: row.originalName || row.title,
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        setBusy(true)
        try {
          await api.delete(`/pulse-files/company/${row.id}`)
          message.success('Deleted')
          await load()
        } catch (err) {
          message.error(err?.response?.data?.message || 'Could not delete')
        } finally {
          setBusy(false)
        }
      },
    })
  }

  return (
    <div className="pulse-files-page">
      <header className="pulse-files-head">
        <div>
          <p className="pulse-files-kicker">Company</p>
          <h1 className="pulse-files-title">Company files</h1>
          <p className="pulse-files-sub">
            Shared policies and handbooks. Click a file to view, download, or open in a new tab.
          </p>
        </div>
        <Button
          type="text"
          icon={<ReloadOutlined />}
          aria-label="Refresh"
          onClick={load}
          disabled={loading || busy}
        />
      </header>

      {canManage ? (
        <div className="pulse-files-upload">
          <Input
            className="pulse-files-title-input"
            placeholder="Optional title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={onPick}
          />
          <Button
            type="primary"
            className="pulse-files-upload-btn"
            icon={<PlusOutlined />}
            loading={busy}
            onClick={() => inputRef.current?.click()}
          >
            Upload file
          </Button>
          <p className="pulse-files-hint">PDF, images, Word, Excel · max {MAX_MB} MB</p>
        </div>
      ) : null}

      {loading ? (
        <div className="pulse-files-loading">
          <Spin />
        </div>
      ) : rows.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={canManage ? 'No company files yet — upload the first one' : 'No company files yet'}
        />
      ) : (
        <ul className="pulse-files-list">
          {rows.map((row) => (
            <li key={row.id} className="pulse-files-row">
              <button
                type="button"
                className="pulse-files-row-hit"
                onClick={() => setViewFile(row)}
              >
                <span className="pulse-files-ico" aria-hidden="true">
                  <FolderOpenOutlined />
                </span>
                <div className="pulse-files-copy">
                  <p className="pulse-files-name">{row.title}</p>
                  <p className="pulse-files-meta">{row.meta}</p>
                </div>
                <span className="pulse-files-view-hint">
                  <EyeOutlined /> View
                </span>
              </button>
              {canManage ? (
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
                    remove(row)
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <PulseFileViewModal
        open={Boolean(viewFile)}
        file={viewFile}
        onClose={() => setViewFile(null)}
      />
    </div>
  )
}
