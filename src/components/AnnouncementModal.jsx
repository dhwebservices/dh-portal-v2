/**
 * "What's new" announcement modal.
 *
 * Deliberately built to RotaCloud's spec, measured off their live dialog rather
 * than eyeballed: 834x434 card at 20px radius, a 384px square visual on the
 * left, 300px of copy on the right, a 260x48 pill button in #0A65FC, and a
 * 143x52 pager floating across the bottom edge. Lato 900 at 40px/50px for the
 * heading, 16px/22px body.
 *
 * It does not use the portal's design tokens, which is a conscious choice - it
 * is meant to look like the reference. That also means it will read as slightly
 * apart from the rest of the portal.
 */

import { useEffect, useState } from 'react'

const BLUE = '#0A65FC'
const INK = '#0A0E2F'
const MUTED = '#474A63'

export default function AnnouncementModal({ slides = [], onDismiss, onDontShowAgain }) {
  const [index, setIndex] = useState(0)
  const total = slides.length
  const slide = slides[index]

  // Escape closes, arrows page - a keyboard user should not be trapped.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onDismiss?.()
      if (event.key === 'ArrowRight') setIndex((i) => Math.min(total - 1, i + 1))
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss, total])

  if (!slide) return null

  const isLast = index === total - 1

  const next = () => {
    if (isLast) onDismiss?.()
    else setIndex((i) => i + 1)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="What's new"
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 4000,
        background: 'rgba(10,14,47,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="dh-announce"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 834, maxWidth: '100%',
          background: '#fff',
          borderRadius: 20,
          padding: 25,
          display: 'flex',
          alignItems: 'center',
          gap: 100,
          fontFamily: "'Lato', -apple-system, BlinkMacSystemFont, sans-serif",
          boxShadow: '0 24px 60px -12px rgba(10,14,47,0.35)',
        }}
      >
        <button
          onClick={onDismiss}
          aria-label="Close"
          style={{
            position: 'absolute', top: 18, right: 18,
            width: 36, height: 36, borderRadius: '50%',
            border: 'none', background: 'transparent', color: MUTED,
            fontSize: 20, lineHeight: 1, cursor: 'pointer',
          }}
        >
          ✕
        </button>

        {/* Visual */}
        <div
          className="dh-announce__visual"
          style={{
            width: 384, height: 384, flexShrink: 0,
            borderRadius: 10, overflow: 'hidden',
            background: BLUE,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {slide.image ? (
            <img src={slide.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <img src="/dh-logo-white.png" alt="" style={{ width: '55%', height: 'auto', opacity: 0.9 }} />
          )}
        </div>

        {/* Copy */}
        <div className="dh-announce__copy" style={{ width: 300, flexShrink: 0 }}>
          {slide.tag ? (
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: BLUE, marginBottom: 10 }}>
              {slide.tag}
            </div>
          ) : null}
          <h2 style={{ fontSize: 40, lineHeight: '50px', fontWeight: 900, color: INK, margin: '0 0 16px' }}>
            {slide.heading}
          </h2>
          <p style={{ fontSize: 16, lineHeight: '22px', color: INK, margin: '0 0 28px', whiteSpace: 'pre-line' }}>
            {slide.body}
          </p>

          {slide.ctaLabel && slide.ctaHref ? (
            <a
              href={slide.ctaHref}
              onClick={onDismiss}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 260, height: 48, borderRadius: 100,
                background: BLUE, color: '#fff', fontSize: 16, fontWeight: 700,
                textDecoration: 'none', marginBottom: 14,
              }}
            >
              {slide.ctaLabel}
            </a>
          ) : (
            <button
              onClick={next}
              style={{
                width: 260, height: 48, borderRadius: 100, border: 'none',
                background: BLUE, color: '#fff', fontSize: 16, fontWeight: 700,
                cursor: 'pointer', marginBottom: 14,
                fontFamily: 'inherit',
              }}
            >
              {isLast ? 'Got it' : 'Next'}
            </button>
          )}

          <button
            onClick={onDontShowAgain}
            style={{
              width: 260, background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 16, fontWeight: 700, color: MUTED, fontFamily: 'inherit', padding: 0,
            }}
          >
            Don&apos;t show this again
          </button>
        </div>

        {/* Pager, straddling the bottom edge */}
        {total > 1 && (
          <div
            style={{
              position: 'absolute', bottom: -26, left: '50%', transform: 'translateX(-50%)',
              width: 143, height: 52, borderRadius: 100,
              background: '#fff', boxShadow: '0 6px 20px rgba(10,14,47,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            }}
          >
            <PagerArrow
              direction="back"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              {slides.map((s, i) => (
                <span
                  key={s.id || i}
                  style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: i === index ? BLUE : '#C7CBDA',
                  }}
                />
              ))}
            </div>
            <PagerArrow
              direction="forward"
              disabled={isLast}
              onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function PagerArrow({ direction, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'back' ? 'Previous' : 'Next'}
      style={{
        width: 34, height: 34, borderRadius: '50%', border: 'none',
        background: disabled ? '#E3E6EF' : BLUE,
        color: disabled ? '#9AA0B5' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 15, lineHeight: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {direction === 'back' ? '←' : '→'}
    </button>
  )
}
