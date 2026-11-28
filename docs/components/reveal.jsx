'use client'

// Fades a block in when it scrolls into view, and marks it .in-view so the
// motion inside it starts only when somebody can see it. The block is hidden
// only once the observer runs (.is-armed): without scripts, or if they fail,
// the page stays whole.
import { useEffect, useRef, useState } from 'react'

export function Reveal({ as: Tag = 'div', className = '', children }) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const node = ref.current
    // already on screen at hydration: show it as it is, without a dip
    if (!node || typeof IntersectionObserver === 'undefined' || node.getBoundingClientRect().top < window.innerHeight) {
      setSeen(true)
      return
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setSeen(true)
        observer.disconnect()
      }
    }, { rootMargin: '0px 0px -12% 0px' })
    observer.observe(node)
    setArmed(true)
    return () => observer.disconnect()
  }, [])
  return <Tag ref={ref} className={`reveal${armed ? ' is-armed' : ''}${seen ? ' is-in in-view' : ''} ${className}`.trim()}>{children}</Tag>
}
