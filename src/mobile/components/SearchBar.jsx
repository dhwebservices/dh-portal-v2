import { useState, useEffect } from 'react'
import Icon from './Icon'

export default function SearchBar({ value, onChange, placeholder = 'Search...', autoFocus = false }) {
  const [isFocused, setIsFocused] = useState(false)

  return (
    <div className={`search-bar ${isFocused ? 'focused' : ''}`}>
      <Icon name="search" size={18} color={isFocused ? '#0066cc' : '#86868b'} />

      <input
        type="search"
        className="search-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        autoFocus={autoFocus}
      />

      {value && (
        <button
          className="search-clear"
          onClick={() => onChange('')}
          type="button"
        >
          <Icon name="x" size={16} color="#86868b" />
        </button>
      )}

      <style>{`
        .search-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: #f5f5f7;
          border: 2px solid transparent;
          border-radius: 10px;
          margin: 0 20px 16px;
          transition: all 0.2s ease;
        }

        .search-bar.focused {
          background: white;
          border-color: #0066cc;
          box-shadow: 0 0 0 4px rgba(0, 102, 204, 0.1);
        }

        .search-input {
          flex: 1;
          border: none;
          background: none;
          font-size: 16px;
          color: #1a1a1a;
          outline: none;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .search-input::placeholder {
          color: #86868b;
        }

        .search-input::-webkit-search-cancel-button {
          display: none;
        }

        .search-clear {
          background: none;
          border: none;
          padding: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.6;
          transition: opacity 0.2s;
        }

        .search-clear:active {
          opacity: 1;
        }
      `}</style>
    </div>
  )
}

// Hook for debounced search
export function useSearch(initialValue = '', delay = 300) {
  const [searchTerm, setSearchTerm] = useState(initialValue)
  const [debouncedTerm, setDebouncedTerm] = useState(initialValue)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm)
    }, delay)

    return () => clearTimeout(timer)
  }, [searchTerm, delay])

  return [searchTerm, setSearchTerm, debouncedTerm]
}
