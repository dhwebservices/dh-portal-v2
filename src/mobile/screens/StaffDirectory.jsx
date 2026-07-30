import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import MobileCard from '../components/MobileCard'
import MobileButton from '../components/MobileButton'
import { supabase } from '../../utils/supabase'

export default function MobileStaffDirectory({ navigate, user, can, isAdmin }) {
  const [staff, setStaff] = useState([])
  const [filteredStaff, setFilteredStaff] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('all')
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStaff()
  }, [])

  useEffect(() => {
    filterStaffList()
  }, [searchQuery, filterDepartment, staff])

  const loadStaff = async () => {
    try {
      const { data, error } = await supabase
        .from('hr_profiles')
        .select('*')
        .order('full_name')

      if (error) throw error

      setStaff(data)

      // Extract unique departments
      const depts = [...new Set(data.map(s => s.department).filter(Boolean))]
      setDepartments(depts)

    } catch (error) {
      console.error('Failed to load staff:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterStaffList = () => {
    let filtered = staff

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(s =>
        s.full_name?.toLowerCase().includes(query) ||
        s.user_email?.toLowerCase().includes(query) ||
        s.role?.toLowerCase().includes(query)
      )
    }

    // Department filter
    if (filterDepartment !== 'all') {
      filtered = filtered.filter(s => s.department === filterDepartment)
    }

    setFilteredStaff(filtered)
  }

  const handleStaffPress = async (staffEmail) => {
    await Haptics.impact({ style: ImpactStyle.Medium })
    navigate('staff-profile', { staffEmail })
  }

  const handleAddStaff = async () => {
    await Haptics.impact({ style: ImpactStyle.Medium })
    navigate('add-staff')
  }

  return (
    <div className="mobile-staff-directory">
      {/* Header */}
      <div className="mobile-screen-header">
        <h1>Staff Directory</h1>
        {isAdmin && (
          <button className="mobile-add-btn" onClick={handleAddStaff}>
            + Add
          </button>
        )}
      </div>

      {/* Search & Filter */}
      <div className="mobile-search-section">
        <input
          type="text"
          className="mobile-search-input"
          placeholder="Search staff..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="mobile-filter-chips">
          <button
            className={`mobile-filter-chip ${filterDepartment === 'all' ? 'active' : ''}`}
            onClick={() => setFilterDepartment('all')}
          >
            All
          </button>
          {departments.map(dept => (
            <button
              key={dept}
              className={`mobile-filter-chip ${filterDepartment === dept ? 'active' : ''}`}
              onClick={() => setFilterDepartment(dept)}
            >
              {dept}
            </button>
          ))}
        </div>
      </div>

      {/* Staff List */}
      <div className="mobile-staff-list">
        {loading ? (
          <div className="mobile-loading">Loading...</div>
        ) : filteredStaff.length === 0 ? (
          <div className="mobile-empty">
            <p>No staff found</p>
          </div>
        ) : (
          filteredStaff.map(person => (
            <MobileCard
              key={person.user_email}
              onPress={() => handleStaffPress(person.user_email)}
            >
              <div className="mobile-staff-row">
                <div className="mobile-staff-avatar">
                  {person.full_name?.charAt(0) || '?'}
                </div>
                <div className="mobile-staff-info">
                  <h3>{person.full_name || person.user_email}</h3>
                  <p>{person.role || 'Staff Member'}</p>
                  {person.department && (
                    <span className="mobile-staff-dept">{person.department}</span>
                  )}
                </div>
                <span className="mobile-chevron">›</span>
              </div>
            </MobileCard>
          ))
        )}
      </div>

      <style>{`
        .mobile-staff-directory {
          min-height: 100vh;
          background: var(--mobile-bg);
          padding-bottom: 80px;
        }

        .mobile-screen-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: var(--mobile-card);
          border-bottom: 1px solid var(--mobile-border);
        }

        .mobile-screen-header h1 {
          font-size: 24px;
          font-weight: 700;
          margin: 0;
          color: var(--mobile-text);
        }

        .mobile-add-btn {
          font-size: 16px;
          font-weight: 600;
          color: var(--mobile-accent);
          background: none;
          border: none;
          padding: 8px 16px;
          cursor: pointer;
        }

        .mobile-search-section {
          padding: 16px 20px;
          background: var(--mobile-card);
          border-bottom: 1px solid var(--mobile-border);
        }

        .mobile-search-input {
          width: 100%;
          height: 44px;
          padding: 0 16px;
          font-size: 16px;
          border: 1px solid var(--mobile-border);
          border-radius: 12px;
          background: var(--mobile-bg);
          color: var(--mobile-text);
          margin-bottom: 12px;
        }

        .mobile-search-input:focus {
          outline: none;
          border-color: var(--mobile-accent);
        }

        .mobile-filter-chips {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .mobile-filter-chips::-webkit-scrollbar {
          display: none;
        }

        .mobile-filter-chip {
          padding: 8px 16px;
          border-radius: 20px;
          border: 1px solid var(--mobile-border);
          background: var(--mobile-card);
          color: var(--mobile-text);
          font-size: 14px;
          font-weight: 500;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.2s;
        }

        .mobile-filter-chip.active {
          background: var(--mobile-accent);
          color: white;
          border-color: var(--mobile-accent);
        }

        .mobile-staff-list {
          padding: 16px 20px;
        }

        .mobile-staff-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .mobile-staff-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: var(--mobile-accent);
          color: white;
          font-size: 20px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .mobile-staff-info {
          flex: 1;
        }

        .mobile-staff-info h3 {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 4px 0;
          color: var(--mobile-text);
        }

        .mobile-staff-info p {
          font-size: 14px;
          color: var(--mobile-text-secondary);
          margin: 0;
        }

        .mobile-staff-dept {
          display: inline-block;
          margin-top: 4px;
          padding: 2px 8px;
          background: rgba(184, 150, 12, 0.1);
          color: var(--mobile-accent);
          font-size: 12px;
          font-weight: 600;
          border-radius: 4px;
        }

        .mobile-chevron {
          font-size: 24px;
          color: var(--mobile-text-secondary);
        }

        .mobile-loading,
        .mobile-empty {
          text-align: center;
          padding: 40px 20px;
          color: var(--mobile-text-secondary);
        }
      `}</style>
    </div>
  )
}
