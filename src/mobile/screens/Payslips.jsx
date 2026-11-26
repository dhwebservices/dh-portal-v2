import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Browser } from '@capacitor/browser'
import { useMsal } from '@azure/msal-react'
import { supabase } from '../../utils/supabase'
import { payslipLink } from '../../utils/payrollApi'
import Icon from '../components/Icon'
import { Chip } from '../components/DH'
import { Screen, HeaderButton, Sec, KV, Btn, Hero, Note, Empty, Loading } from '../components/UI'

export default function MobilePayslips({ goBack, user, navigate, isAdmin, can }) {
  const { instance, accounts } = useMsal()
  const [openError, setOpenError] = useState('')
  const canGenerate = isAdmin || can?.('hr_profiles')
  const [payslips, setPayslips] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPayslip, setSelectedPayslip] = useState(null)
  const [ytdGross, setYtdGross] = useState(0)

  useEffect(() => {
    loadPayslips()
  }, [user?.email])

  const loadPayslips = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('payslips')
        .select('*')
        .eq('user_email', user.email)
        .order('uploaded_at', { ascending: false })

      if (error) throw error

      setPayslips(data || [])
      calculateYTD(data || [])
    } catch (error) {
      console.error('Failed to load payslips:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateYTD = (data) => {
    const currentYear = new Date().getFullYear()
    const total = data
      .filter(p => p.gross_pay != null && new Date(p.uploaded_at).getFullYear() === currentYear)
      .reduce((sum, p) => sum + Number(p.gross_pay || 0), 0)
    setYtdGross(total)
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
    }).format(amount || 0)
  }

  const handlePayslipTap = async (payslip) => {
    await Haptics.impact({ style: ImpactStyle.Medium })
    setSelectedPayslip(payslip)

    if (!payslip.viewed) {
      await supabase
        .from('payslips')
        .update({ viewed: true, first_viewed_at: new Date().toISOString() })
        .eq('id', payslip.id)
      setPayslips(prev => prev.map(p => p.id === payslip.id ? { ...p, viewed: true } : p))
    }
  }

  const handleOpenFile = async (payslip) => {
    await Haptics.impact({ style: ImpactStyle.Medium })
    setOpenError('')
    try {
      // Payslips made from the rota are private: this fetches a short-lived link.
      const url = await payslipLink(instance, accounts?.[0], payslip)
      if (url) await Browser.open({ url })
    } catch (e) {
      setOpenError(e.message || 'Could not open the payslip.')
    }
  }

  if (selectedPayslip) {
    const p = selectedPayslip
    return (
      <Screen title="Payslip" onBack={() => setSelectedPayslip(null)}>
        <Hero>
          <span className="dh-sub">{p.user_name}</span>
          <span className="dh-big">{p.gross_pay != null ? formatCurrency(p.gross_pay) : p.period || '—'}</span>
          <span className="dh-sub">{p.gross_pay != null ? `Gross pay · ${p.period || ''}` : 'Uploaded document from HR'}</span>
        </Hero>

        {(p.source === 'hours' || p.source === 'rota') && (
          <>
            <Sec>{p.source === 'rota' ? 'From the rota' : 'Calculated from hours'}</Sec>
            <div className="dh-card">
              <KV k="Hours worked" v={`${Number(p.hours_worked || 0).toFixed(2)}h`} />
              <KV k="Hourly rate" v={formatCurrency(p.hourly_rate)} />
              <KV k="Gross pay" v={formatCurrency(p.gross_pay)} />
            </div>
          </>
        )}
        {p.source === 'rota' && <span className="dh-sub">Open the payslip for tax, National Insurance, net pay and your shifts.</span>}
        {p.source !== 'hours' && p.source !== 'rota' && <span className="dh-sub">Your payslip has been uploaded as a document by HR.</span>}

        <Note tone="error">{openError}</Note>
        {(p.file_url || p.source === 'rota') && (
          <Btn onPress={() => handleOpenFile(p)}>
            <Icon name="download" size={18} />
            {p.source === 'file' || p.source === 'rota' ? 'View payslip' : 'View document'}
          </Btn>
        )}
      </Screen>
    )
  }

  return (
    <Screen
      title="Payslips"
      onBack={goBack}
      action={canGenerate ? <HeaderButton onPress={() => navigate('generate-payslip')} label="Generate a payslip"><Icon name="plus" size={20} /></HeaderButton> : null}
    >
      <Hero>
        <span className="dh-sub">Year to date ({new Date().getFullYear()})</span>
        <span className="dh-big">{formatCurrency(ytdGross)}</span>
        <span className="dh-sub">Gross pay from calculated payslips</span>
      </Hero>

      <Sec>All payslips</Sec>
      {loading ? <Loading /> : payslips.length === 0 ? (
        <Empty icon="file" title="No payslips yet" />
      ) : (
        <div className="dh-card">
          {payslips.map(payslip => (
            <button key={payslip.id} type="button" className="dh-row" onClick={() => handlePayslipTap(payslip)}>
              <span className={`dh-ic${payslip.viewed ? ' muted' : ''}`}><Icon name="file" size={18} /></span>
              <span className="dh-g">
                <span className="dh-t">{payslip.period || '—'}</span>
                <span className="dh-sub">{payslip.source === 'rota' ? 'Calculated from the rota' : payslip.source === 'hours' ? 'Calculated from hours' : 'Uploaded document from HR'}</span>
              </span>
              {!payslip.viewed && <Chip tone="blue">New</Chip>}
              <span className="dh-val">{payslip.gross_pay != null ? formatCurrency(payslip.gross_pay) : 'PDF'}</span>
              <span className="dh-chev"><Icon name="chevron-right" size={18} /></span>
            </button>
          ))}
        </div>
      )}

      {canGenerate && <Btn variant="outline" onPress={() => navigate('generate-payslip')}>Generate a payslip</Btn>}
    </Screen>
  )
}
