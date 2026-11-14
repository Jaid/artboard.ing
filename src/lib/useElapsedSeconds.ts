import {useEffect, useState} from 'react'

/** whole seconds since a timestamp, ticking while active */
export const useElapsedSeconds = (since: number, active: boolean) => {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active) {
      return
    }
    const interval = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(interval)
  }, [active])
  return Math.max(0, Math.floor((now - since) / 1000))
}
