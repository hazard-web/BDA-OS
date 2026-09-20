import { useEffect, useState } from 'react'
import { App, Button, Empty, Spin } from 'antd'
import {
  EyeOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import api from '../api'
import PulseFileTypeIcon from './PulseFileTypeIcon'
import PulseFileViewModal from './PulseFileViewModal'
import './pulse-files.css'

const TABS = [
  { id: 'org', label: 'Company files' },
  { id: 'employee', label: 'My files' },
]

export default function PulseMyFiles() {
  const { message } = App.useApp()
  const [rows, setRows] = useState([])
  const [tab, setTab] = useState('org')
  const [loading, setLoading] = useState(true)
  const [viewFile, setViewFile] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/pulse-files/mine')
      setRows(res.data?.data || [])
    } catch (err) {
      setRows([])
      message.error(err?.response?.data?.message || 'Could not load files')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visible = rows.filter((row) => (row.section || 'org') === tab)

  return (
    <div className="pulse-files-page">
      <header className="pulse-files-head">
        <div>
          <p className="pulse-files-kicker">My Space</p>
          <h1 className="pulse-files-title">My files</h1>
          <p className="pulse-files-sub">
            Company handbooks plus your onboarding and personal documents. Open a file to view, download, or open in a new tab.
          </p>
        </div>
        <Button
          type="text"
          icon={<ReloadOutlined />}
          aria-label="Refresh"
          onClick={load}
          disabled={loading}
        />
      </header>

      <div className="pulse-files-tabs" role="tablist" aria-label="File sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`pulse-files-tab${tab === item.id ? ' is-on' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="pulse-files-loading">
          <Spin />
        </div>
      ) : visible.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={tab === 'org' ? 'No company files yet' : 'No personal or onboarding files yet'}
        />
      ) : (
        <ul className="pulse-files-list">
          {visible.map((row) => (
            <li key={row.id} className="pulse-files-row">
              <button
                type="button"
                className="pulse-files-row-hit"
                onClick={() => setViewFile(row)}
              >
                <span className="pulse-files-ico" aria-hidden="true">
                  <PulseFileTypeIcon row={row} />
                </span>
                <div className="pulse-files-copy">
                  <p className="pulse-files-name">{row.title}</p>
                  <p className="pulse-files-meta">{row.meta}</p>
                </div>
                <span className="pulse-files-view-hint">
                  <EyeOutlined /> View
                </span>
              </button>
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
