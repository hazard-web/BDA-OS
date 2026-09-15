import { useEffect, useRef, useState } from 'react'
import { App, Button, Modal, Spin } from 'antd'
import {
  DownloadOutlined,
  ExportOutlined,
  FileOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FileImageOutlined,
} from '@ant-design/icons'
import { renderAsync } from 'docx-preview'
import * as XLSX from 'xlsx'
import {
  downloadPulseFile,
  fileTypeLabel,
  resolveDriveFileSource,
} from '../utils/pulseOpenFile'
import './pulse-file-view.css'

function TypeIcon({ kind, name }) {
  const label = String(name || '').toLowerCase()
  if (kind === 'pdf' || label.endsWith('.pdf')) return <FilePdfOutlined />
  if (kind === 'image') return <FileImageOutlined />
  if (kind === 'office' && (label.includes('.xls') || label.includes('sheet'))) return <FileExcelOutlined />
  if (kind === 'office') return <FileWordOutlined />
  return <FileOutlined />
}

function isDocxName(name = '') {
  return /\.docx$/i.test(name)
}

function isExcelName(name = '') {
  return /\.xlsx?$/i.test(name)
}

async function blobFromSource(source, file) {
  if (source?.href?.startsWith('blob:') || source?.href?.startsWith('data:')) {
    const res = await fetch(source.href)
    return res.blob()
  }
  if (file?.url && file.url !== '#' && !file.url.startsWith('data:')) {
    const res = await fetch(file.url)
    return res.blob()
  }
  if (file?.url?.startsWith('data:')) {
    const res = await fetch(file.url)
    return res.blob()
  }
  throw new Error('No binary source')
}

export default function PulseFileViewModal({ open, file, onClose }) {
  const { message } = App.useApp()
  const docHostRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [source, setSource] = useState(null)
  const [activeFile, setActiveFile] = useState(null)
  const [mode, setMode] = useState('none') // image | pdf | office-embed | docx | excel | fallback
  const [excelHtml, setExcelHtml] = useState('')
  const [docxBuffer, setDocxBuffer] = useState(null)
  const [previewError, setPreviewError] = useState('')

  useEffect(() => {
    if (!open || !file) {
      setSource(null)
      setActiveFile(null)
      setMode('none')
      setExcelHtml('')
      setDocxBuffer(null)
      setPreviewError('')
      setLoading(false)
      return undefined
    }

    let cancelled = false
    let revokeHref = null
    setLoading(true)
    setSource(null)
    setActiveFile(file)
    setMode('none')
    setExcelHtml('')
    setDocxBuffer(null)
    setPreviewError('')

    ;(async () => {
      try {
        const { file: published, source: next } = await resolveDriveFileSource(file)
        if (cancelled) {
          if (next.revoke) URL.revokeObjectURL(next.href)
          return
        }
        if (next.revoke) revokeHref = next.href
        setSource(next)
        setActiveFile(published)

        const name = published.downloadName || published.originalName || published.title || ''

        // Drive-style cloud viewers by extension (Office Online / PDF / Google)
        if (next.previewHref && next.viewer && next.viewer !== 'local') {
          if (next.kind === 'image') setMode('image')
          else if (next.kind === 'pdf') setMode('pdf')
          else setMode('office-embed')
          return
        }

        if (next.kind === 'image' && next.previewHref) {
          setMode('image')
          return
        }
        if (next.kind === 'pdf' && next.previewHref) {
          setMode('pdf')
          return
        }

        // Local fallback only when Cloudinary publish is unavailable
        if (isDocxName(name)) {
          const blob = await blobFromSource(next, published)
          if (cancelled) return
          setDocxBuffer(await blob.arrayBuffer())
          setMode('docx')
          return
        }

        if (isExcelName(name)) {
          const blob = await blobFromSource(next, published)
          if (cancelled) return
          const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' })
          const sheet = wb.Sheets[wb.SheetNames[0]]
          setExcelHtml(XLSX.utils.sheet_to_html(sheet, { editable: false }))
          setMode('excel')
          return
        }

        setMode('fallback')
      } catch {
        if (!cancelled) {
          setSource(null)
          setMode('fallback')
          message.error('Could not load file')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      if (revokeHref) URL.revokeObjectURL(revokeHref)
    }
  }, [open, file, message])

  useEffect(() => {
    if (mode !== 'docx' || !docxBuffer || !docHostRef.current) return undefined
    let cancelled = false
    const host = docHostRef.current
    host.innerHTML = ''
    renderAsync(docxBuffer.slice(0), host, undefined, {
      className: 'pulse-docx',
      inWrapper: false,
      ignoreWidth: true,
      breakPages: false,
      useBase64URL: true,
    }).catch(() => {
      if (!cancelled) {
        setPreviewError('Could not render this Word file.')
        setMode('fallback')
      }
    })
    return () => {
      cancelled = true
    }
  }, [mode, docxBuffer])

  const title = activeFile?.title || activeFile?.downloadName || file?.title || 'File'
  const meta = activeFile?.meta || file?.meta || ''
  const typeLabel = fileTypeLabel(activeFile || file)
  const viewerKicker =
    source?.viewer === 'office'
      ? `${typeLabel} · Office viewer`
      : source?.viewer === 'pdf'
        ? 'PDF · Browser viewer'
        : source?.viewer === 'image'
          ? 'Image preview'
          : source?.viewer === 'google'
            ? `${typeLabel} · Google viewer`
            : 'View file'
  const showingPreview = ['image', 'pdf', 'office-embed', 'docx', 'excel'].includes(mode)
  const canOpenTab = Boolean(
    (source?.canOpenTab && source.tabHref)
    || mode === 'docx'
    || mode === 'excel'
    || mode === 'image'
    || mode === 'pdf'
    || mode === 'office-embed',
  )

  const onDownload = async () => {
    setBusy(true)
    try {
      await downloadPulseFile(activeFile || file)
      message.success('Download started')
    } catch {
      message.error('Could not download')
    } finally {
      setBusy(false)
    }
  }

  const onNewTab = async () => {
    setBusy(true)
    try {
      const { file: published, source: next } = await resolveDriveFileSource(activeFile || file)
      setActiveFile(published)
      if (next?.tabHref) {
        window.open(next.tabHref, '_blank', 'noopener,noreferrer')
        setSource(next)
        if (next.kind === 'image') setMode('image')
        else if (next.kind === 'pdf') setMode('pdf')
        else if (next.viewer && next.viewer !== 'local') setMode('office-embed')
        return
      }
      if (next?.previewHref && (next.kind === 'image' || next.kind === 'pdf')) {
        window.open(next.previewHref, '_blank', 'noopener,noreferrer')
        return
      }
      message.error('Drive-style viewer needs a public file link. Re-upload this file after Cloudinary is on, then try again.')
    } catch (err) {
      message.error(err?.response?.data?.message || err?.message || 'Could not open in new tab')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={null}
      footer={null}
      width={920}
      centered
      destroyOnClose
      className="pulse-file-view-modal"
      styles={{ body: { padding: 0 } }}
    >
      <div className="pulse-file-view">
        <header className="pulse-file-view-head">
          <div className="pulse-file-view-copy">
            <p className="pulse-file-view-kicker">{viewerKicker}</p>
            <h2 className="pulse-file-view-title">{title}</h2>
            {meta ? <p className="pulse-file-view-meta">{meta}</p> : null}
          </div>
        </header>

        <div className={`pulse-file-view-stage${showingPreview ? ' is-preview' : ' is-fallback'}`}>
          {loading ? (
            <div className="pulse-file-view-loading">
              <Spin size="small" />
            </div>
          ) : mode === 'image' && source?.previewHref ? (
            <img className="pulse-file-view-img" src={source.previewHref} alt={title} />
          ) : (mode === 'pdf' || mode === 'office-embed') && source?.previewHref ? (
            <iframe
              className="pulse-file-view-frame"
              title={title}
              src={source.previewHref}
            />
          ) : mode === 'docx' ? (
            <div className="pulse-file-view-doc" ref={docHostRef} />
          ) : mode === 'excel' ? (
            <div
              className="pulse-file-view-sheet"
              dangerouslySetInnerHTML={{ __html: excelHtml }}
            />
          ) : (
            <div className="pulse-file-view-fallback">
              <span className="pulse-file-view-fallback-ico" aria-hidden="true">
                <TypeIcon kind={source?.kind} name={title} />
              </span>
              <p className="pulse-file-view-fallback-title">{typeLabel} document</p>
              <p className="pulse-file-view-fallback-text">
                {previewError
                  || (source?.viewer === 'local'
                    ? 'Re-upload this file so it can open in Word / PDF / Drive-style viewers. Until then, use Download.'
                    : 'This format can’t be previewed here. Download it to open on your device.')}
              </p>
            </div>
          )}
        </div>

        <footer className="pulse-file-view-foot">
          {canOpenTab ? (
            <Button
              className="pulse-file-view-tab"
              icon={<ExportOutlined />}
              disabled={busy || loading}
              onClick={onNewTab}
            >
              Open in new tab
            </Button>
          ) : null}
          <Button
            type="primary"
            className="pulse-file-view-download"
            icon={<DownloadOutlined />}
            loading={busy}
            disabled={loading}
            onClick={onDownload}
            block={!canOpenTab}
          >
            Download
          </Button>
        </footer>
      </div>
    </Modal>
  )
}
