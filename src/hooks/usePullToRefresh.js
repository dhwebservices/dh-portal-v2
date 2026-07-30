import { useRef, useState, useCallback } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

export function usePullToRefresh(onRefresh) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const touchStartY = useRef(0)
  const scrollRef = useRef(null)

  const PULL_THRESHOLD = 80
  const MAX_PULL = 120

  const handleTouchStart = useCallback((e) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY
    }
  }, [])

  const handleTouchMove = useCallback((e) => {
    if (touchStartY.current === 0) return
    if (scrollRef.current && scrollRef.current.scrollTop > 0) {
      touchStartY.current = 0
      setPullDistance(0)
      return
    }

    const currentY = e.touches[0].clientY
    const diff = currentY - touchStartY.current

    if (diff > 0) {
      e.preventDefault()
      const distance = Math.min(diff * 0.5, MAX_PULL)
      setPullDistance(distance)

      if (distance > PULL_THRESHOLD) {
        Haptics.impact({ style: ImpactStyle.Light })
      }
    }
  }, [])

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance > PULL_THRESHOLD) {
      setIsRefreshing(true)
      await Haptics.impact({ style: ImpactStyle.Medium })

      try {
        await onRefresh()
      } catch (error) {
        console.error('Refresh failed:', error)
      } finally {
        setIsRefreshing(false)
      }
    }

    touchStartY.current = 0
    setPullDistance(0)
  }, [pullDistance, onRefresh])

  return {
    scrollRef,
    isRefreshing,
    pullDistance,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd
    }
  }
}
