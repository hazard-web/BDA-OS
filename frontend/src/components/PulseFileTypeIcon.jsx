/** Official Microsoft Fluent file-type icons (vendored from Office CDN). */

const ICON_SRC = {
  word: '/file-icons/word.svg',
  excel: '/file-icons/excel.svg',
  pdf: '/file-icons/pdf.svg',
  image: '/file-icons/image.svg',
  text: '/file-icons/text.svg',
  file: '/file-icons/file.svg',
}

export function fileExtOf(row) {
  const name = String(row?.originalName || row?.downloadName || row?.title || row?.name || row?.meta || '')
  const match = name.match(/\.([a-z0-9]{1,8})(?:\s|·|$)/i) || name.match(/\.([a-z0-9]{1,8})$/i)
  return String(match?.[1] || '').toLowerCase()
}

export function pulseFileKind(row) {
  const ext = fileExtOf(row)
  const mime = String(row?.mimeType || row?.mime || '').toLowerCase()
  if (ext === 'pdf' || mime.includes('pdf')) return 'pdf'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) || mime.startsWith('image/')) return 'image'
  if (['xls', 'xlsx', 'csv'].includes(ext) || mime.includes('sheet') || mime.includes('excel')) return 'excel'
  if (['doc', 'docx'].includes(ext) || mime.includes('word')) return 'word'
  if (ext === 'txt' || mime.startsWith('text/')) return 'text'
  return 'file'
}

export default function PulseFileTypeIcon({ row, className = '', size = 36 }) {
  const kind = pulseFileKind(row)
  const src = ICON_SRC[kind] || ICON_SRC.file
  const label =
    kind === 'word'
      ? 'Word'
      : kind === 'excel'
        ? 'Excel'
        : kind === 'pdf'
          ? 'PDF'
          : kind === 'image'
            ? 'Image'
            : kind === 'text'
              ? 'Text'
              : 'File'

  return (
    <span className={`pulse-ftype-wrap is-${kind}${className ? ` ${className}` : ''}`} aria-hidden="true">
      <img
        className="pulse-ftype-img"
        src={src}
        alt=""
        width={size}
        height={size}
        draggable={false}
        title={label}
      />
    </span>
  )
}
