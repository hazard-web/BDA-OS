import BdaGateLoader from './BdaGateLoader'

/** Pulse wait screen: People OS mark in BDA green. */
export default function PulseLoading({ label = 'Loading' }) {
  return <BdaGateLoader show label={label} />
}
