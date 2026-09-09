import './bda-brand-ident.css'

const GREEN = '#1A5F4A'

/** People OS four-square mark, all BDA green. */
export default function BdaBrandIdent() {
  return (
    <div className="bda-ident" aria-hidden="true">
      <svg className="bda-ident-mark" viewBox="0 0 18 18" fill="none">
        <rect className="bda-ident-sq" x="0" y="0" width="8" height="8" rx="1.6" fill={GREEN} />
        <rect className="bda-ident-sq" x="10" y="0" width="8" height="8" rx="1.6" fill={GREEN} />
        <rect className="bda-ident-sq" x="0" y="10" width="8" height="8" rx="1.6" fill={GREEN} />
        <rect className="bda-ident-sq" x="10" y="10" width="8" height="8" rx="1.6" fill={GREEN} />
      </svg>
    </div>
  )
}
