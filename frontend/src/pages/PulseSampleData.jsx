import './pulse-sample-data.css'

/** Sample-data step for Getting Started — parked on branch `pulse/company-later-services`. */
export default function PulseSampleDataStep({ busy = false, onYes, onNo }) {
  return (
    <div className="psd-page is-embedded">
      <div className="psd-card" role="dialog" aria-labelledby="psd-title">
        <div className="psd-hero">
          <img
            className="psd-art"
            src={`/pulse-sample-hero.png?v=11`}
            alt="Person exploring BDA OS sample dashboards"
          />
        </div>

        <div className="psd-body">
          <h1 id="psd-title">Would you like us to load sample data into your BDA OS account?</h1>
          <p className="psd-lead">
            Load sample data to your BDA OS account to help you settle in comfortably as you
            familiarize yourself with the various features.
          </p>
          <p className="psd-note">
            <strong>Note:</strong> You can delete sample data at any point in time.
          </p>
        </div>

        <footer className="psd-foot">
          <button type="button" className="psd-yes" onClick={onYes} disabled={busy}>
            Yes, Generate Data
          </button>
          <button type="button" className="psd-no" onClick={onNo} disabled={busy}>
            No, I will fill my own data
          </button>
        </footer>
      </div>
    </div>
  )
}
