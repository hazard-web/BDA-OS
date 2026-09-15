import api from '../api'

function triggerDownload(blobUrl, fileName) {
  const anchor = document.createElement('a')
  anchor.href = blobUrl
  if (fileName) anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

async function blobFromOpenPath(openPath) {
  const res = await api.get(openPath, { responseType: 'blob' })
  const mime = res.headers['content-type'] || 'application/octet-stream'
  return new Blob([res.data], { type: mime })
}

function fileNameOf(item) {
  return String(item?.downloadName || item?.originalName || item?.title || '').toLowerCase()
}

function guessMime(item, blobType) {
  if (blobType && blobType !== 'application/octet-stream') return blobType
  if (item?.mimeType) return item.mimeType
  const name = fileNameOf(item)
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.gif')) return 'image/gif'
  if (name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (name.endsWith('.doc')) return 'application/msword'
  if (name.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (name.endsWith('.xls')) return 'application/vnd.ms-excel'
  if (name.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  if (name.endsWith('.txt')) return 'text/plain'
  return blobType || 'application/octet-stream'
}

function isPublicHttp(url) {
  return /^https:\/\//i.test(String(url || ''))
}

function isOfficeDoc(item, mime) {
  const name = fileNameOf(item)
  const m = String(mime || item?.mimeType || '').toLowerCase()
  if (/\.(docx?|xlsx?|pptx?)$/.test(name)) return true
  return m.includes('word') || m.includes('officedocument') || m.includes('ms-excel') || m.includes('msword') || m.includes('presentation')
}

function previewKind(mime, item) {
  const m = String(mime || '').toLowerCase()
  const name = fileNameOf(item)
  if (m.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(name)) return 'image'
  if (m.includes('pdf') || name.endsWith('.pdf')) return 'pdf'
  if (isOfficeDoc(item, m)) return 'office'
  if (m.startsWith('text/') || name.endsWith('.txt')) return 'text'
  return 'other'
}

/** Microsoft Office Online — Drive-like viewer for Word / Excel / PowerPoint. */
function officeEmbedUrl(url) {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
}

function officeTabUrl(url) {
  return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`
}

/** Google Docs viewer — good for PDF and generic docs (Drive-style). */
function googleEmbedUrl(url) {
  return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`
}

function googleTabUrl(url) {
  return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=false`
}

/**
 * Pick a Drive-style viewer from public https URL + file extension.
 * Returns null when the file cannot use a cloud viewer (data: / blob: / missing url).
 */
export function driveStyleViewer(item, url = item?.url) {
  if (!isPublicHttp(url)) return null
  const mime = guessMime(item, item?.mimeType)
  const kind = previewKind(mime, item)

  if (kind === 'image') {
    return {
      kind,
      viewer: 'image',
      canPreview: true,
      canOpenTab: true,
      previewHref: url,
      tabHref: url,
      href: url,
    }
  }

  if (kind === 'pdf') {
    return {
      kind,
      viewer: 'pdf',
      canPreview: true,
      canOpenTab: true,
      // Browser PDF viewer in iframe (closest to Drive PDF open)
      previewHref: url,
      tabHref: url,
      href: url,
    }
  }

  if (kind === 'office') {
    return {
      kind,
      viewer: 'office',
      canPreview: true,
      canOpenTab: true,
      previewHref: officeEmbedUrl(url),
      tabHref: officeTabUrl(url),
      href: url,
    }
  }

  // txt / other — Google Docs viewer
  return {
    kind: kind === 'text' ? 'text' : 'other',
    viewer: 'google',
    canPreview: true,
    canOpenTab: true,
    previewHref: googleEmbedUrl(url),
    tabHref: googleTabUrl(url),
    href: url,
  }
}

/**
 * Resolve a file row for preview / open / download.
 * Prefer Drive-style cloud viewers when the file has a public https URL.
 */
export async function resolvePulseFileSource(item) {
  if (!item) throw new Error('No file')
  const url = item.url
  const mimeHint = guessMime(item, item.mimeType)
  const kindHint = previewKind(mimeHint, item)

  const drive = driveStyleViewer(item, url)
  if (drive) {
    return {
      ...drive,
      mime: mimeHint,
      revoke: false,
    }
  }

  if (url && url !== '#' && (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:'))) {
    if (url.startsWith('data:')) {
      const mime = url.slice(5, url.indexOf(';')) || 'application/octet-stream'
      const kind = previewKind(mime, item)
      return {
        href: url,
        mime,
        revoke: false,
        kind,
        viewer: 'local',
        canPreview: kind === 'image' || kind === 'pdf',
        canOpenTab: kind === 'image' || kind === 'pdf',
        previewHref: kind === 'image' || kind === 'pdf' ? url : null,
        tabHref: kind === 'image' || kind === 'pdf' ? url : null,
      }
    }
    if (url.startsWith('blob:')) {
      const kind = previewKind(item.mimeType, item)
      return {
        href: url,
        mime: item.mimeType || 'application/octet-stream',
        revoke: false,
        kind,
        viewer: 'local',
        canPreview: kind === 'image' || kind === 'pdf',
        canOpenTab: kind === 'image' || kind === 'pdf',
        previewHref: kind === 'image' || kind === 'pdf' ? url : null,
        tabHref: kind === 'image' || kind === 'pdf' ? url : null,
      }
    }

    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const mime = guessMime(item, blob.type)
      const kind = previewKind(mime, item)
      const href = URL.createObjectURL(blob)
      const viewable = kind === 'image' || kind === 'pdf'
      return {
        href,
        mime,
        revoke: true,
        kind,
        viewer: 'local',
        canPreview: viewable,
        canOpenTab: viewable,
        previewHref: viewable ? href : null,
        tabHref: viewable ? href : null,
      }
    } catch {
      const kind = previewKind(mimeHint, item)
      const viewable = kind === 'image' || kind === 'pdf'
      return {
        href: url,
        mime: mimeHint,
        revoke: false,
        kind,
        viewer: 'local',
        canPreview: viewable,
        canOpenTab: viewable,
        previewHref: viewable ? url : null,
        tabHref: viewable ? url : null,
      }
    }
  }

  if (item.openPath) {
    const blob = await blobFromOpenPath(item.openPath)
    const mime = guessMime(item, blob.type)
    const kind = previewKind(mime, item)
    const href = URL.createObjectURL(blob)
    const viewable = kind === 'image' || kind === 'pdf'
    return {
      href,
      mime,
      revoke: true,
      kind,
      viewer: 'local',
      canPreview: viewable,
      canOpenTab: viewable,
      previewHref: viewable ? href : null,
      tabHref: viewable ? href : null,
    }
  }

  throw new Error('File has no source')
}

/** Open with the Drive-style viewer for this file’s extension. */
export async function openPulseFile(item) {
  const source = await resolvePulseFileSource(item)
  const target = source.tabHref || (source.canOpenTab ? source.href : null)
  if (!target) {
    const err = new Error('This file type cannot open in a new tab. Use Download instead.')
    err.code = 'NO_TAB'
    throw err
  }
  window.open(target, '_blank', 'noopener,noreferrer')
  if (source.revoke) {
    window.setTimeout(() => URL.revokeObjectURL(source.href), 60_000)
  }
}

/** Download a Pulse file row. */
export async function downloadPulseFile(item) {
  if (!item) return
  const name = item.downloadName || item.title || 'download'
  const url = item.url
  if (url && url !== '#' && (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:'))) {
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      triggerDownload(url, name)
      return
    }
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    triggerDownload(blobUrl, name)
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000)
    return
  }
  if (item.openPath) {
    const blob = await blobFromOpenPath(item.openPath)
    const blobUrl = URL.createObjectURL(blob)
    triggerDownload(blobUrl, name)
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000)
  }
}

export function isPulseFileRow(item) {
  return Boolean(item?.url || item?.openPath || item?.to === 'file')
}

export function fileTypeLabel(item) {
  const name = fileNameOf(item)
  if (name.endsWith('.docx') || name.endsWith('.doc')) return 'Word'
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'Excel'
  if (name.endsWith('.pptx') || name.endsWith('.ppt')) return 'PowerPoint'
  if (name.endsWith('.pdf')) return 'PDF'
  if (/\.(png|jpe?g|webp|gif)$/.test(name)) return 'Image'
  return 'File'
}

function companyFileMongoId(file) {
  const raw = String(file?.id || '').replace(/^org-/, '')
  return /^[a-f0-9]{24}$/i.test(raw) ? raw : null
}

/**
 * If the company file is still a data: URL, publish it to Cloudinary so
 * Office Online / Google Drive-style viewers can open it.
 */
export async function ensurePublicCompanyFile(file) {
  if (!file) return file
  if (file.url && /^https:\/\//i.test(file.url)) return file
  if (!file.url || !String(file.url).startsWith('data:')) return file

  const mongoId = companyFileMongoId(file)
  if (!mongoId) return file

  const res = await api.post(`/pulse-files/company/${mongoId}/publish`)
  const published = res.data?.data
  if (!published?.url) return file
  return {
    ...file,
    url: published.url,
    mimeType: published.mimeType || file.mimeType,
    title: published.title || file.title,
    downloadName: published.originalName || file.downloadName,
  }
}

/** Resolve Drive-style source, publishing company files to Cloudinary when needed. */
export async function resolveDriveFileSource(file) {
  const published = await ensurePublicCompanyFile(file)
  return {
    file: published,
    source: await resolvePulseFileSource(published),
  }
}
