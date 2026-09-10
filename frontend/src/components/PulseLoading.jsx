import BdaGateLoader from './BdaGateLoader'

/** Pulse wait screen: BDA OS mark in BDA green. */
export default function PulseLoading({ label = 'Loading' }) {
  return <BdaGateLoader show label={label} />
}
