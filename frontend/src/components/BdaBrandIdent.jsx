import './bda-brand-ident.css'

/** BDA Technologies wordmark for loaders and gates (full logo, not circular). */
export default function BdaBrandIdent() {
  return (
    <div className="bda-ident" aria-hidden="true">
      <img className="bda-ident-mark" src="/bda-logo.png" alt="" />
    </div>
  )
}
