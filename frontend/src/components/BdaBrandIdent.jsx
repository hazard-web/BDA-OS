import './bda-brand-ident.css'

const GREEN = '#556B2F'

/** Green People OS four-square mark for loaders / gates only. */
function PeopleOsTiles({ size = 72, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      className={`bda-ident-tiles${className ? ` ${className}` : ''}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="8" height="8" rx="1.6" fill={GREEN} />
      <rect x="10" y="0" width="8" height="8" rx="1.6" fill={GREEN} />
      <rect x="0" y="10" width="8" height="8" rx="1.6" fill={GREEN} />
      <rect x="10" y="10" width="8" height="8" rx="1.6" fill={GREEN} />
    </svg>
  )
}

/** Loading / gate brand mark — People OS tiles in BDA green. */
export default function BdaBrandIdent() {
  return (
    <div className="bda-ident" aria-hidden="true">
      <PeopleOsTiles size={72} className="bda-ident-mark" />
    </div>
  )
}
