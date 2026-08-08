import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Browser } from '@capacitor/browser'
import { supabase } from '../../utils/supabase'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'
import { SkeletonList } from '../components/SkeletonLoader'

export default function MobilePayslips({ goBack, user, navigate }) {
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
    if (payslip.file_url) {
      await Browser.open({ url: payslip.file_url })
    }
  }

  if (selectedPayslip) {
    const p = selectedPayslip
    return (
      <div className="mobile-screen">
        <div className="mobile-screen-header">
          <button className="mobile-back-btn" onClick={() => setSelectedPayslip(null)}>
            <Icon name="chevronLeft" size={24} color="#0066cc" />
          </button>
          <h1>Payslip Details</h1>
          <div style={{ width: 60 }} />
        </div>

        <div style={{ padding: '20px', paddingBottom: '100px' }}>
          <MobileCard>
            <div style={{ padding: '8px' }}>
              <div className="payslip-header">
                <h2>{p.period || '—'}</h2>
                <p>{p.user_name}</p>
              </div>

              {p.source === 'hours' ? (
                <div className="payslip-section">
                  <div className="section-title">Calculated From Hours</div>
                  <div className="payslip-row">
                    <span>Hours Worked</span>
                    <span className="amount">{Number(p.hours_worked || 0).toFixed(2)}h</span>
                  </div>
                  <div className="payslip-row">
                    <span>Hourly Rate</span>
                    <span className="amount">{formatCurrency(p.hourly_rate)}</span>
                  </div>
                  <div className="payslip-row total">
                    <span>Gross Pay</span>
                    <span className="amount">{formatCurrency(p.gross_pay)}</span>
                  </div>
                </div>
              ) : (
                <div className="payslip-section">
                  <div className="section-title">Uploaded Document</div>
                  <p className="file-note">Your payslip has been uploaded as a document by HR.</p>
                </div>
              )}

              {p.file_url && (
                <button className="download-button" onClick={() => handleOpenFile(p)}>
                  <Icon name="download" size={18} color="white" />
                  {p.source === 'file' ? 'View Payslip' : 'View Document'}
                </button>
              )}
            </div>
          </MobileCard>
        </div>

        <style>{`
          .payslip-header {
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid var(--mobile-border);
          }

          .payslip-header h2 {
            font-size: 20px;
            font-weight: 700;
            color: var(--mobile-text);
            margin: 0 0 4px 0;
          }

          .payslip-header p {
            font-size: 14px;
            color: var(--mobile-text-secondary);
            margin: 0;
          }

          .payslip-section {
            margin-bottom: 20px;
          }

          .section-title {
            font-size: 13px;
            font-weight: 600;
            color: var(--mobile-text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
          }

          .file-note {
            font-size: 14px;
            color: var(--mobile-text-secondary);
            margin: 0;
          }

          .payslip-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid var(--mobile-border);
          }

          .payslip-row.total {
            border-bottom: none;
            border-top: 2px solid var(--mobile-text);
            padding-top: 16px;
            margin-top: 8px;
            font-size: 18px;
            font-weight: 700;
          }

          .amount {
            font-weight: 600;
            font-variant-numeric: tabular-nums;
          }

          .download-button {
            width: 100%;
            padding: 14px;
            background: #0066cc;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-top: 20px;
            cursor: pointer;
          }

          .download-button:active {
            opacity: 0.8;
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="mobile-screen">
      <div className="mobile-screen-header">
        <button className="mobile-back-btn" onClick={goBack}>
          <Icon name="chevronLeft" size={24} color="#0066cc" />
        </button>
        <h1>Payslips</h1>
        <div style={{ width: 60 }} />
      </div>

      <div style={{ padding: '20px', background: 'var(--mobile-bg)' }}>
        <MobileCard>
          <div style={{ padding: '8px' }}>
            <div className="ytd-header">Year to Date ({new Date().getFullYear()})</div>
            <div className="ytd-value primary">{formatCurrency(ytdGross)}</div>
            <div className="ytd-sub">Gross pay from calculated payslips</div>
          </div>
        </MobileCard>
      </div>

      <div style={{ padding: '20px', paddingBottom: '100px' }}>
        {loading ? (
          <SkeletonList count={4} lines={2} />
        ) : payslips.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <Icon name="file" size={48} color="#d2d2d7" />
            <p style={{ marginTop: 16, fontSize: 15, color: 'var(--mobile-text-secondary)' }}>
              No payslips available
            </p>
          </div>
        ) : (
          <div className="payslips-list">
            {payslips.map(payslip => (
              <MobileCard key={payslip.id} onPress={() => handlePayslipTap(payslip)}>
                <div className="payslip-item">
                  <div className="payslip-icon">
                    <Icon name="file" size={24} color="#0066cc" />
                  </div>
                  <div className="payslip-info">
                    <div className="payslip-period">{payslip.period || '—'}</div>
                    <div className="payslip-amount">
                      {payslip.gross_pay != null ? formatCurrency(payslip.gross_pay) : 'View document'}
                    </div>
                  </div>
                  {!payslip.viewed && <div className="unread-dot" />}
                  <Icon name="chevronRight" size={20} color="#86868b" />
                </div>
              </MobileCard>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .ytd-header {
          font-size: 14px;
          font-weight: 600;
          color: var(--mobile-text-secondary);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .ytd-value {
          font-size: 28px;
          font-weight: 700;
          color: var(--mobile-text);
          font-variant-numeric: tabular-nums;
        }

        .ytd-value.primary {
          color: #0066cc;
        }

        .ytd-sub {
          font-size: 12px;
          color: var(--mobile-text-secondary);
          margin-top: 4px;
        }

        .payslips-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .payslip-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 4px;
        }

        .payslip-icon {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #e3f2fd;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .payslip-info {
          flex: 1;
        }

        .payslip-period {
          font-size: 15px;
          font-weight: 600;
          color: var(--mobile-text);
        }

        .payslip-amount {
          font-size: 13px;
          color: var(--mobile-text-secondary);
          margin-top: 2px;
        }

        .unread-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ff3b30;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  )
}
