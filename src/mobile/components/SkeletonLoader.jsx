export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="skeleton-card">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`skeleton-line ${i === 0 ? 'wide' : i === lines - 1 ? 'narrow' : ''}`}
        />
      ))}

      <style>{`
        .skeleton-card {
          padding: 16px;
          background: white;
          border-radius: 8px;
          margin: 0 20px 12px;
        }

        .skeleton-line {
          height: 12px;
          background: linear-gradient(
            90deg,
            #f0f0f0 25%,
            #e0e0e0 50%,
            #f0f0f0 75%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 4px;
          margin-bottom: 8px;
        }

        .skeleton-line:last-child {
          margin-bottom: 0;
        }

        .skeleton-line.wide {
          width: 100%;
        }

        .skeleton-line.narrow {
          width: 60%;
        }

        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </div>
  )
}

export function SkeletonList({ count = 5, lines = 3 }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </div>
  )
}

export function SkeletonCircle({ size = 40 }) {
  return (
    <div
      className="skeleton-circle"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite'
      }}
    />
  )
}

export function SkeletonText({ width = '100%', height = 12 }) {
  return (
    <div
      className="skeleton-line"
      style={{
        width,
        height,
        background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        borderRadius: 4
      }}
    />
  )
}

export default SkeletonCard
