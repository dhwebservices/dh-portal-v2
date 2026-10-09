import assert from 'node:assert/strict'
import * as P from '../src/utils/payroll.js'
const eq = (a, b, m) => assert.equal(a, b, `${m}: got ${a}, want ${b}`)
// Tax periods
eq(P.taxYearOf('2026-04-05'), '2025-26', 'tax year boundary'); eq(P.taxYearOf('2026-04-06'), '2026-27', 'tax year start')
eq(P.taxPeriodOf('2026-04-30', 'monthly'), 1, 'April payday = month 1'); eq(P.taxPeriodOf('2026-05-05', 'monthly'), 1, '5 May still month 1')
eq(P.taxPeriodOf('2026-10-31', 'monthly'), 7, 'Oct payday = month 7'); eq(P.taxPeriodOf('2027-03-31', 'monthly'), 12, 'March = month 12')
eq(P.taxPeriodOf('2026-04-10', 'weekly'), 1, 'week 1'); eq(P.taxPeriodOf('2026-04-13', 'weekly'), 2, 'week 2')
// Month 1, £1,800, 1257L: free pay 1,048.25, taxable £751 -> £150.20; NI (1800-1048) x 8% = £60.16
let t = P.incomeTax({ gross: 1800, taxCode: '1257L', frequency: 'monthly', period: 1 }); eq(t.tax, 150.2, 'month 1 tax')
eq(P.employeeNI({ gross: 1800, frequency: 'monthly' }).ni, 60.16, 'monthly NI')
// Cumulative: month 7, £1,000 this month, £0 earlier -> under 7 months' free pay, so no tax
eq(P.incomeTax({ gross: 1000, taxCode: 'C1257L', frequency: 'monthly', period: 7 }).tax, 0, 'cumulative free pay unused')
// Month 2 after paying 150.20 on 1800 in month 1, another 1800: same again
eq(P.incomeTax({ gross: 1800, grossToDate: 1800, taxToDate: 150.2, taxCode: '1257L', frequency: 'monthly', period: 2 }).tax, 150.4, 'month 2 cumulative (rounding on the cumulative figure)')
// M1 basis ignores year to date
eq(P.incomeTax({ gross: 1800, grossToDate: 0, taxCode: '1257L M1', frequency: 'monthly', period: 7 }).tax, 150.2, 'month 1 basis')
eq(P.incomeTax({ gross: 1000.99, taxCode: 'BR', frequency: 'monthly', period: 3 }).tax, 200, 'BR rounds pay down')
eq(P.incomeTax({ gross: 500, taxCode: 'NT', frequency: 'monthly', period: 3 }).tax, 0, 'NT')
// Higher rate: month 1, £5,000: taxable floor(5000-1048.25)=3951; basic band 3141.67 @20% = 628.33..; rest 809.33 @40% = 323.73 -> 952.06
eq(P.incomeTax({ gross: 5000, taxCode: '1257L', frequency: 'monthly', period: 1 }).tax, 952.06, 'higher rate')
// NI above UEL: (4189-1048)*8% + (5000-4189)*2% = 251.28 + 16.22
eq(P.employeeNI({ gross: 5000, frequency: 'monthly' }).ni, 267.5, 'NI above UEL')
eq(P.employeeNI({ gross: 900, frequency: 'monthly' }).ni, 0, 'below PT')
// Shifts
eq(P.shiftHours({ start_time: '09:00', end_time: '17:30', break_minutes: 30 }), 8, 'shift with break')
eq(P.shiftHours({ start_time: '22:00', end_time: '02:00' }), 4, 'overnight')
const slip = P.buildPayslip({ shifts: [{ start_time: '09:00', end_time: '17:00', break_minutes: 0 }, { start_time: '09:00', end_time: '13:00' }], hourlyRate: 11, payDate: '2026-10-31', taxCode: 'C1257L', pension: 5 })
eq(slip.hours, 12, 'hours'); eq(slip.gross, 132, 'gross'); eq(slip.net, 127, 'net after pension')
eq(P.formatNI('ab123456c'), 'AB 12 34 56 C', 'NI format'); assert.ok(P.validNI('AB 12 34 56 C')); assert.ok(!P.validNI('BG123456A'))
console.log('payroll maths: all checks pass')
