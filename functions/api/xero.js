// Cloudflare Pages Function for Xero Payroll UK integration

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)

  const corsHeaders = {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Route to handlers
  if (url.pathname.endsWith('/auth')) {
    return handleAuthStart(request, env, corsHeaders)
  }

  if (url.pathname.endsWith('/callback')) {
    return handleOAuthCallback(request, env, corsHeaders)
  }

  if (url.pathname.endsWith('/status')) {
    return handleConnectionStatus(request, env, corsHeaders)
  }

  if (url.pathname.endsWith('/sync-employees')) {
    return handleSyncEmployees(request, env, corsHeaders)
  }

  if (url.pathname.endsWith('/sync-leave')) {
    return handleSyncLeaveBalances(request, env, corsHeaders)
  }

  if (url.pathname.endsWith('/sync-payslips')) {
    return handleSyncPayslips(request, env, corsHeaders)
  }

  if (url.pathname.endsWith('/leave-balance')) {
    return handleGetLeaveBalance(request, env, corsHeaders)
  }

  if (url.pathname.endsWith('/payslips')) {
    return handleGetPayslips(request, env, corsHeaders)
  }

  if (url.pathname.includes('/payslip/') && url.pathname.endsWith('/pdf')) {
    return handleDownloadPayslipPDF(request, env, corsHeaders)
  }

  return new Response(
    JSON.stringify({ error: 'Not found' }),
    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// Start OAuth flow
async function handleAuthStart(request, env, corsHeaders) {
  const { XERO_CLIENT_ID, XERO_REDIRECT_URI } = env

  const authUrl = new URL('https://login.xero.com/identity/connect/authorize')
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', XERO_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', XERO_REDIRECT_URI)
  authUrl.searchParams.set('scope', 'payroll.employees payroll.timesheets payroll.leaveapplications payroll.payslip offline_access')
  authUrl.searchParams.set('state', crypto.randomUUID())

  return Response.redirect(authUrl.toString(), 302)
}

// OAuth callback
async function handleOAuthCallback(request, env, corsHeaders) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    return new Response(
      `OAuth error: ${error}`,
      { status: 400, headers: { 'Content-Type': 'text/plain' } }
    )
  }

  if (!code) {
    return new Response(
      'Missing authorization code',
      { status: 400, headers: { 'Content-Type': 'text/plain' } }
    )
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, env)

    // Get tenant (organization) info
    const connections = await getConnections(tokens.access_token, env)
    const tenant = connections[0] // First organization

    if (!tenant) {
      throw new Error('No Xero organization found')
    }

    // Store tokens in database
    await storeTokens(tenant.tenantId, tokens, tenant.tenantName, env)

    // Redirect back to portal
    return Response.redirect('https://staff.dhwebsiteservices.co.uk/settings?xero=connected', 302)

  } catch (error) {
    console.error('OAuth callback error:', error)
    return new Response(
      `Failed to connect Xero: ${error.message}`,
      { status: 500, headers: { 'Content-Type': 'text/plain' } }
    )
  }
}

async function exchangeCodeForTokens(code, env) {
  const { XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI } = env

  const response = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: XERO_REDIRECT_URI,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token exchange failed: ${error}`)
  }

  const data = await response.json()

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in, // seconds
    token_type: data.token_type,
  }
}

async function getConnections(accessToken, env) {
  const response = await fetch('https://api.xero.com/connections', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Failed to get Xero connections')
  }

  return response.json()
}

async function storeTokens(tenantId, tokens, tenantName, env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await fetch(`${SUPABASE_URL}/rest/v1/xero_tokens`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      tenant_id: tenantId,
      organization_name: tenantName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      token_type: tokens.token_type,
      updated_at: new Date().toISOString(),
    }),
  })
}

async function getValidAccessToken(env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

  // Get tokens from database
  const response = await fetch(`${SUPABASE_URL}/rest/v1/xero_tokens?order=updated_at.desc&limit=1`, {
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })

  const tokens = await response.json()
  if (!tokens || tokens.length === 0) {
    throw new Error('Xero not connected')
  }

  const token = tokens[0]

  // Check if token is expired
  const expiresAt = new Date(token.expires_at)
  const now = new Date()

  if (expiresAt > now) {
    // Token still valid
    return { accessToken: token.access_token, tenantId: token.tenant_id }
  }

  // Token expired, refresh it
  const newTokens = await refreshAccessToken(token.refresh_token, env)
  await storeTokens(token.tenant_id, newTokens, token.organization_name, env)

  return { accessToken: newTokens.access_token, tenantId: token.tenant_id }
}

async function refreshAccessToken(refreshToken, env) {
  const { XERO_CLIENT_ID, XERO_CLIENT_SECRET } = env

  const response = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token refresh failed: ${error}`)
  }

  return response.json()
}

async function handleConnectionStatus(request, env, corsHeaders) {
  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

    const response = await fetch(`${SUPABASE_URL}/rest/v1/xero_tokens?order=updated_at.desc&limit=1`, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    })

    const tokens = await response.json()

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ connected: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        connected: true,
        organization: tokens[0].organization_name,
        connected_at: tokens[0].created_at,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleSyncEmployees(request, env, corsHeaders) {
  try {
    const { accessToken, tenantId } = await getValidAccessToken(env)

    // Get employees from Xero
    const response = await fetch(`https://api.xero.com/payroll.xro/2.0/Employees`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch employees from Xero')
    }

    const data = await response.json()
    const employees = data.employees || []

    // Store in database (match by email)
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

    for (const emp of employees) {
      await fetch(`${SUPABASE_URL}/rest/v1/xero_employees`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          user_email: emp.email?.toLowerCase() || '',
          user_name: `${emp.firstName} ${emp.lastName}`,
          xero_employee_id: emp.employeeID,
          xero_employee_number: emp.employeeNumber,
          first_name: emp.firstName,
          last_name: emp.lastName,
          job_title: emp.jobTitle,
          start_date: emp.startDate,
          updated_at: new Date().toISOString(),
        }),
      })
    }

    return new Response(
      JSON.stringify({ message: 'Employees synced', count: employees.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Sync employees error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleSyncLeaveBalances(request, env, corsHeaders) {
  try {
    const { accessToken, tenantId } = await getValidAccessToken(env)
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

    // Get all employees from database
    const empResponse = await fetch(`${SUPABASE_URL}/rest/v1/xero_employees?select=*`, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    })

    const employees = await empResponse.json()

    let syncedCount = 0

    for (const emp of employees) {
      // Get leave balances for this employee
      const response = await fetch(
        `https://api.xero.com/payroll.xro/2.0/Employees/${emp.xero_employee_id}/LeaveBalances`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Xero-tenant-id': tenantId,
            'Accept': 'application/json',
          },
        }
      )

      if (!response.ok) continue

      const data = await response.json()
      const balances = data.leaveBalances || []

      for (const balance of balances) {
        const balanceDays = balance.numberOfUnits || 0

        await fetch(`${SUPABASE_URL}/rest/v1/xero_leave_balances`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            user_email: emp.user_email,
            user_name: emp.user_name,
            leave_type: balance.leaveTypeName?.toLowerCase() || 'unknown',
            xero_leave_type_id: balance.leaveTypeID,
            balance_hours: balance.typeOfUnits === 'Hours' ? balanceDays : balanceDays * 8,
            balance_days: balance.typeOfUnits === 'Days' ? balanceDays : balanceDays / 8,
            units: balance.typeOfUnits || 'Hours',
            as_of_date: new Date().toISOString().split('T')[0],
            synced_at: new Date().toISOString(),
          }),
        })

        syncedCount++
      }
    }

    return new Response(
      JSON.stringify({ message: 'Leave balances synced', count: syncedCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Sync leave error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleSyncPayslips(request, env, corsHeaders) {
  try {
    const { accessToken, tenantId } = await getValidAccessToken(env)
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

    // Get payslips from Xero (last 3 months)
    const response = await fetch(`https://api.xero.com/payroll.xro/2.0/Payslips`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch payslips from Xero')
    }

    const data = await response.json()
    const payslips = data.paySlips || []

    for (const payslip of payslips) {
      // Get employee email from mapping
      const empResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/xero_employees?xero_employee_id=eq.${payslip.employeeID}&select=user_email,user_name`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      )

      const employees = await empResponse.json()
      if (!employees || employees.length === 0) continue

      const employee = employees[0]

      await fetch(`${SUPABASE_URL}/rest/v1/xero_payslips`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          user_email: employee.user_email,
          user_name: employee.user_name,
          xero_payslip_id: payslip.paySlipID,
          xero_employee_id: payslip.employeeID,
          pay_period_start: payslip.periodStartDate,
          pay_period_end: payslip.periodEndDate,
          payment_date: payslip.paymentDate,
          gross_pay: payslip.wages || 0,
          net_pay: payslip.wages - (payslip.tax || 0) - (payslip.deductions || 0),
          tax: payslip.tax || 0,
          ni: payslip.employeeNI || 0,
          pension: payslip.employeePension || 0,
          earnings: payslip.earningsLines || [],
          deductions: payslip.deductionLines || [],
          leave_earnings: payslip.leaveEarningsLines || [],
          reimbursements: payslip.reimbursementLines || [],
          status: payslip.status,
          updated_at: new Date().toISOString(),
        }),
      })
    }

    return new Response(
      JSON.stringify({ message: 'Payslips synced', count: payslips.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Sync payslips error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleGetLeaveBalance(request, env, corsHeaders) {
  const url = new URL(request.url)
  const email = url.searchParams.get('email')

  if (!email) {
    return new Response(
      JSON.stringify({ error: 'Email parameter required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/xero_leave_balances?user_email=eq.${encodeURIComponent(email)}&order=as_of_date.desc`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    )

    const balances = await response.json()

    // Group by leave type (take most recent)
    const grouped = {}
    for (const balance of balances) {
      if (!grouped[balance.leave_type]) {
        grouped[balance.leave_type] = balance.balance_days
      }
    }

    return new Response(
      JSON.stringify(grouped),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleGetPayslips(request, env, corsHeaders) {
  const url = new URL(request.url)
  const email = url.searchParams.get('email')

  if (!email) {
    return new Response(
      JSON.stringify({ error: 'Email parameter required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/xero_payslips?user_email=eq.${encodeURIComponent(email)}&order=payment_date.desc&limit=12`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    )

    const payslips = await response.json()

    return new Response(
      JSON.stringify(payslips),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function handleDownloadPayslipPDF(request, env, corsHeaders) {
  // Extract payslip ID from URL
  const url = new URL(request.url)
  const pathParts = url.pathname.split('/')
  const payslipId = pathParts[pathParts.length - 2]

  try {
    const { accessToken, tenantId } = await getValidAccessToken(env)

    const response = await fetch(
      `https://api.xero.com/payroll.xro/2.0/Payslips/${payslipId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Xero-tenant-id': tenantId,
          'Accept': 'application/pdf',
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to download payslip from Xero')
    }

    const pdf = await response.arrayBuffer()

    return new Response(pdf, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="payslip-${payslipId}.pdf"`,
      },
    })

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
