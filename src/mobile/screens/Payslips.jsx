import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'

export default function MobilePayslips({ goBack, user, navigate }) {
  const [payslips, setPayslips] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPayslip, setSelectedPayslip] = useState(null)
  const [ytdTotals, setYtdTotals] = useState({ gross: 0, tax: 0, ni: 0, net: 0 })

  useEffect(() => {
    loadPayslips()
  }, [user?.email])

  const loadPayslips = async () => {
    setLoading(true)
    try {
      // Fetch payslips from payslips table
      const { data, error} = await supabase
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
    const thisYearPayslips = data.filter(p => {
      const year = new Date(p.period_end_date).getFullYear()
      return year === currentYear
    })

    const totals = thisYearPayslips.reduce((acc, p) => ({
      gross: acc.gross + (p.gross_pay || 0),
      tax: acc.tax + (p.tax || 0),
      ni: acc.ni + (p.ni || 0),
      net: acc.net + (p.net_pay || 0),
    }), { gross: 0, tax: 0, ni: 0, net: 0 })

    setYtdTotals(totals)
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
    }).format(amount || 0)
  }

  const formatPeriod = (startDate, endDate) => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const monthYear = end.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    return monthYear
  }

  const handlePayslipTap = async (payslip) => {
    await Haptics.impact({ style: ImpactStyle.Medium })
    setSelectedPayslip(payslip)
  }

  const handleDownloadPDF = async (payslip) => {
    await Haptics.impact({ style: ImpactStyle.Medium })

    if (payslip.xero_payslip_id) {
      const pdfUrl = `/api/xero/payslip/${payslip.xero_payslip_id}/pdf`
      window.open(pdfUrl, '_blank')
    } else {
      alert('PDF not available for this payslip')
    }
  }

  if (selectedPayslip) {
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
                <h2>{formatPeriod(selectedPayslip.period_start_date, selectedPayslip.period_end_date)}</h2>
                <p>{selectedPayslip.employee_name}</p>
              </div>

              <div className="payslip-section">
                <div className="section-title">Earnings</div>
                <div className="payslip-row">
                  <span>Gross Pay</span>
                  <span className="amount">{formatCurrency(selectedPayslip.gross_pay)}</span>
                </div>
                {selectedPayslip.hours_worked && (
                  <div className="payslip-row sub">
                    <span>Hours Worked</span>
                    <span>{selectedPayslip.hours_worked}h</span>
                  </div>
                )}
              </div>

              <div className="payslip-section">
                <div className="section-title">Deductions</div>
                <div className="payslip-row">
                  <span>Tax (PAYE)</span>
                  <span className="amount negative">-{formatCurrency(selectedPayslip.tax)}</span>
                </div>
                <div className="payslip-row">
                  <span>National Insurance</span>
                  <span className="amount negative">-{formatCurrency(selectedPayslip.ni)}</span>
                </div>
              </div>

              <div className="payslip-section">
                <div className="payslip-row total">
                  <span>Net Pay</span>
                  <span className="amount">{formatCurrency(selectedPayslip.net_pay)}</span>
                </div>
              </div>

              {selectedPayslip.xero_payslip_id && (
                <button
                  className="download-button"
                  onClick={() => handleDownloadPDF(selectedPayslip)}
                >
                  <Icon name="download" size={18} color="white" />
                  Download PDF
                </button>
              )}
            </div>
          </MobileCard>
        </div>

        <style>{`
          .payslip-header {
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid #f5f5f7;
          }

          .payslip-header h2 {
            font-size: 20px;
            font-weight: 700;
            color: #1a1a1a;
            margin: 0 0 4px 0;
          }

          .payslip-header p {
            font-size: 14px;
            color: #86868b;
            margin: 0;
          }

          .payslip-section {
            margin-bottom: 20px;
          }

          .section-title {
            font-size: 13px;
            font-weight: 600;
            color: #86868b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
          }

          .payslip-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid #f5f5f7;
          }

          .payslip-row.sub {
            padding-left: 16px;
            font-size: 13px;
            color: #86868b;
          }

          .payslip-row.total {
            border-bottom: none;
            border-top: 2px solid #1a1a1a;
            padding-top: 16px;
            margin-top: 8px;
            font-size: 18px;
            font-weight: 700;
          }

          .amount {
            font-weight: 600;
            font-variant-numeric: tabular-nums;
          }

          .amount.negative {
            color: #ff3b30;
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

      {/* YTD Summary */}
      <div style={{ padding: '20px', background: '#f5f5f7' }}>
        <MobileCard>
          <div style={{ padding: '8px' }}>
            <div className="ytd-header">Year to Date ({new Date().getFullYear()})</div>
            <div className="ytd-grid">
              <div className="ytd-item">
                <div className="ytd-label">Gross</div>
                <div className="ytd-value">{formatCurrency(ytdTotals.gross)}</div>
              </div>
              <div className="ytd-item">
                <div className="ytd-label">Tax</div>
                <div className="ytd-value negative">{formatCurrency(ytdTotals.tax)}</div>
              </div>
              <div className="ytd-item">
                <div className="ytd-label">NI</div>
                <div className="ytd-value negative">{formatCurrency(ytdTotals.ni)}</div>
              </div>
              <div className="ytd-item">
                <div className="ytd-label">Net</div>
                <div className="ytd-value primary">{formatCurrency(ytdTotals.net)}</div>
              </div>
            </div>
          </div>
        </MobileCard>
      </div>

      {/* Payslips List */}
      <div style={{ padding: '20px', paddingBottom: '100px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div className="spinner" />
          </div>
        ) : payslips.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <Icon name="file" size={48} color="#d2d2d7" />
            <p style={{ marginTop: 16, fontSize: 15, color: '#86868b' }}>
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
                    <div className="payslip-period">
                      {formatPeriod(payslip.period_start_date, payslip.period_end_date)}
                    </div>
                    <div className="payslip-amount">{formatCurrency(payslip.net_pay)}</div>
                  </div>
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
          color: #86868b;
          margin-bottom: 16px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .ytd-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .ytd-item {
          text-align: center;
        }

        .ytd-label {
          font-size: 12px;
          color: #86868b;
          margin-bottom: 6px;
        }

        .ytd-value {
          font-size: 18px;
          font-weight: 700;
          color: #1a1a1a;
          font-variant-numeric: tabular-nums;
        }

        .ytd-value.negative {
          color: #ff3b30;
        }

        .ytd-value.primary {
          color: #0066cc;
          font-size: 20px;
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
          color: #1a1a1a;
          margin-bottom: 2px;
        }

        .payslip-amount {
          font-size: 13px;
          color: #86868b;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #d2d2d7;
          border-top-color: #0066cc;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
