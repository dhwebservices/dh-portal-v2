import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import Icon from '../components/Icon'
import { Screen, Sec, Pills, Pill, Btn, Empty, Loading } from '../components/UI'
import { supabase } from '../../utils/supabase'

export default function MobileStaffDirectory({ navigate, goBack, user, can, isAdmin }) {
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

  const initials = (p) => (p.full_name || p.user_email || '?').split(/[ @.]/).filter(Boolean).map(x => x[0]).join('').slice(0, 2).toUpperCase()
  return (
    <Screen title="Staff" onBack={goBack}>
      <div className="dh-search">
        <Icon name="search" size={18} />
        <input type="text" placeholder="Search staff" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Search staff" />
      </div>

      {departments.length > 1 && (
        <Pills>
          <Pill on={filterDepartment === 'all'} onPress={() => setFilterDepartment('all')}>All</Pill>
          {departments.map(dept => (
            <Pill key={dept} on={filterDepartment === dept} onPress={() => setFilterDepartment(dept)}>{dept}</Pill>
          ))}
        </Pills>
      )}

      {loading ? <Loading /> : filteredStaff.length === 0 ? (
        <Empty icon="users" title="No staff found" />
      ) : (
        <div className="dh-card">
          {filteredStaff.map((person, i) => (
            <button key={person.user_email} type="button" className="dh-row" onClick={() => handleStaffPress(person.user_email)}>
              <span className="dh-av round" style={i % 2 ? { background: '#FFE6CC', color: '#8A4A00' } : undefined}>{initials(person)}</span>
              <span className="dh-g">
                <span className="dh-t">{person.full_name || person.user_email}</span>
                <span className="dh-sub">{[person.role || 'Staff member', person.department].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="dh-chev"><Icon name="chevron-right" size={18} /></span>
            </button>
          ))}
        </div>
      )}

      {isAdmin && (
        <>
          <Sec>Onboarding</Sec>
          <div className="dh-card">
            <button type="button" className="dh-row" onClick={() => navigate('onboarding-review')}>
              <span className="dh-ic"><Icon name="checkCircle" size={18} /></span>
              <span className="dh-g"><span className="dh-t">Onboarding forms</span><span className="dh-sub">Review what new starters have sent</span></span>
              <span className="dh-chev"><Icon name="chevron-right" size={18} /></span>
            </button>
          </div>
          <Btn onPress={handleAddStaff}>Add staff</Btn>
        </>
      )}
    </Screen>
  )
}
