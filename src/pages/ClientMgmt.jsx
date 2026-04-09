import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import { sendEmail } from '../utils/email'
import { logClientActivity, upsertClientAccount } from '../utils/clientAccounts'
import { openSecureDocument } from '../utils/fileAccess'
import {
  buildClientContractKey,
  buildClientContractMergeFields,
  buildClientContractTemplateKey,
  CLIENT_CONTRACT_PLACEHOLDERS,
  createClientContract,
  createClientContractTemplate,
  createPortalSignature,
  formatCurrencyAmount,
  getClientContractStatusLabel,
  renderClientContractHtml,
} from '../utils/clientContracts'

const STAGES = [{key:'accepted',label:'Order Accepted'},{key:'building',label:'Being Built'},{key:'nearly_there',label:'Nearly There'},{key:'ready',label:'Ready to Launch'}]
const EMPTY_INV = { invoice_number:'', description:'', amount:'', due_date:'', status:'unpaid' }
const EMPTY_DOC = { name:'', type:'Contract', file_url:'' }
const EMPTY_UPD = { title:'', message:'' }
const DEFAULT_CLIENT_TEMPLATE_HTML = `
<p>This Service Agreement is made between <strong>DH Website Services</strong> and <strong>{{company_name}}</strong>.</p>
<p>DH Website Services will deliver <strong>{{service_name}}</strong> for <strong>{{price_amount}}</strong>.</p>
<p>Payment terms: <strong>{{payment_terms}}</strong>. Payment status: <strong>{{payment_status}}</strong>.</p>
<p>Deposit agreed: <strong>{{deposit_amount}}</strong>.</p>
<p>Your account manager for this agreement is <strong>{{account_manager_name}}</strong> (<strong>{{account_manager_email}}</strong>).</p>
<p>Issue date: <strong>{{issue_date}}</strong></p>
`
const EMPTY_CONTRACT_FORM = {
  template_id: '',
  service_name: '',
  price_amount: '',
  currency: 'GBP',
  payment_terms: '',
  payment_status: 'Due on agreed terms',
  deposit_amount: '',
  paid_in_full: false,
  notes: '',
}

const STAGE_TONES = {
  accepted: 'grey',
  building: 'blue',
  nearly_there: 'amber',
  ready: 'green',
}

function timeAgo(dateString) {
  if (!dateString) return 'No recent activity'
  const diff = Date.now() - new Date(dateString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function ClientMgmt() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [clients, setClients]         = useState([])
  const [allTickets, setAllTickets]   = useState([])
  const [invoiceRows, setInvoiceRows] = useState([])
  const [updateRows, setUpdateRows]   = useState([])
  const [clientContractTemplates, setClientContractTemplates] = useState([])
  const [clientContracts, setClientContracts] = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [filter, setFilter]           = useState('all')
  const [expanded, setExpanded]       = useState(null)
  const [modal, setModal]             = useState(null)
  const [activeClient, setActiveClient] = useState(null)
  const [tickets, setTickets]         = useState([])
  const [saving, setSaving]           = useState(false)
  const [invoiceForm, setInvForm]     = useState(EMPTY_INV)
  const [docForm, setDocForm]         = useState(EMPTY_DOC)
  const [updateForm, setUpdForm]      = useState(EMPTY_UPD)
  const [contractForm, setContractForm] = useState(EMPTY_CONTRACT_FORM)
  const [contractTemplateForm, setContractTemplateForm] = useState(() => createClientContractTemplate({
    name: '',
    description: '',
    contract_type: 'Service Agreement',
    subject: 'Your agreement with DH Website Services',
    content_html: DEFAULT_CLIENT_TEMPLATE_HTML,
  }))
  const [editingContractTemplate, setEditingContractTemplate] = useState(null)
  const [contractError, setContractError] = useState('')
  const [templateError, setTemplateError] = useState('')
  const [replyForm, setReplyForm]     = useState('')
  const [activeTicket, setActiveTicket] = useState(null)
  const [referenceFile, setReferenceFile] = useState(null)
  const referenceFileRef = useRef(null)

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    const [{ data: clientRows }, { data: invRows }, { data: depRows }, { data: templateRows }, { data: contractRows }, { data: supportRows }] = await Promise.all([
      supabase.from('clients').select('*').order('name'),
      supabase.from('client_invoices').select('id,client_email,status,amount,created_at,due_date').order('created_at', { ascending: false }),
      supabase.from('deployment_updates').select('id,client_email,title,created_at').order('created_at', { ascending: false }),
      supabase.from('portal_settings').select('key,value').like('key', 'client_contract_template:%'),
      supabase.from('portal_settings').select('key,value').like('key', 'client_contract:%'),
      supabase.from('support_tickets').select('*').order('created_at', { ascending: false }),
    ])
    setClients(clientRows || [])
    setAllTickets(supportRows || [])
    if (clientRows?.length) {
      Promise.all(clientRows.filter((row) => row.email).map((row) => upsertClientAccount(row))).catch(() => {})
    }
    setInvoiceRows(invRows || [])
    setUpdateRows(depRows || [])
    setClientContractTemplates(
      (templateRows || [])
        .map((row) => createClientContractTemplate({
          id: String(row.key || '').replace('client_contract_template:', ''),
          ...(row.value?.value ?? row.value ?? {}),
        }))
        .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()),
    )
    setClientContracts(
      (contractRows || [])
        .map((row) => createClientContract({
          id: String(row.key || '').replace('client_contract:', ''),
          ...(row.value?.value ?? row.value ?? {}),
        }))
        .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()),
    )
    setLoading(false)
  }

  const updateStage = async (client, stage) => {
    const label = STAGES.find((s) => s.key === stage)?.label || 'Status updated'
    await Promise.all([
      supabase.from('clients').update({ deployment_status: stage }).eq('id', client.id),
      upsertClientAccount(client, { deployment_status: stage }),
      logClientActivity({
        clientEmail: client.email,
        eventType: 'status_updated',
        title: 'Website status updated',
        description: `Status changed to ${label}`,
      }),
    ])
    setClients(prev => prev.map(c => c.id===client.id ? {...c, deployment_status: stage} : c))
  }

  const toggleExpand = async (id, email) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    const current = clients.find((client) => client.id === id) || null
    setActiveClient(current)
    setTickets((allTickets || []).filter((ticket) => ticket.client_email === email))
  }

  const openModal = (type, client) => {
    setActiveClient(client || null)
    setModal(type)
    setContractError('')
    setTemplateError('')
    if (type === 'contract') {
      setContractForm({
        ...EMPTY_CONTRACT_FORM,
        template_id: clientContractTemplates.find((template) => template.active !== false)?.id || '',
        account_manager_name: user?.name || '',
        account_manager_email: user?.email || '',
      })
    }
    if (type === 'contractTemplates') {
      setReferenceFile(null)
      setEditingContractTemplate(null)
      setContractTemplateForm(createClientContractTemplate({
        name: '',
        description: '',
        contract_type: 'Service Agreement',
        subject: 'Your agreement with DH Website Services',
        content_html: DEFAULT_CLIENT_TEMPLATE_HTML,
      }))
    }
  }
  const close = () => {
    setModal(null)
    setActiveClient(null)
    setActiveTicket(null)
    setReferenceFile(null)
    setEditingContractTemplate(null)
    setContractError('')
    setTemplateError('')
  }

  const activeContractTemplates = useMemo(
    () => clientContractTemplates.filter((template) => template.active !== false),
    [clientContractTemplates],
  )

  const contractsForActiveClient = useMemo(() => {
    if (!activeClient?.email) return []
    return clientContracts.filter((contract) => contract.client_email === String(activeClient.email || '').toLowerCase())
  }, [clientContracts, activeClient?.email])

  const contractPreview = useMemo(() => {
    if (!activeClient) return ''
    const template = activeContractTemplates.find((row) => row.id === contractForm.template_id) || activeContractTemplates[0]
    if (!template) return ''
    const mergeFields = buildClientContractMergeFields({
      client: activeClient,
      template,
      serviceName: contractForm.service_name,
      priceAmount: contractForm.price_amount,
      currency: contractForm.currency,
      paymentTerms: contractForm.payment_terms,
      paymentStatus: contractForm.payment_status,
      depositAmount: contractForm.deposit_amount,
      paidInFull: contractForm.paid_in_full,
      accountManagerName: contractForm.account_manager_name || user?.name || '',
      accountManagerEmail: contractForm.account_manager_email || user?.email || '',
    })
    return renderClientContractHtml(template.content_html, mergeFields)
  }, [activeClient, activeContractTemplates, contractForm, user?.email, user?.name])

  const addInvoice = async () => {
    setSaving(true)
    await supabase.from('client_invoices').insert([{ ...invoiceForm, client_email: activeClient.email, client_name: activeClient.name, created_at: new Date().toISOString() }])
    await sendEmail('invoice_issued', { clientEmail: activeClient.email, clientName: activeClient.name, ...invoiceForm })
    await logClientActivity({
      clientEmail: activeClient.email,
      eventType: 'invoice_issued',
      title: invoiceForm.description || 'Invoice issued',
      description: invoiceForm.invoice_number ? `Invoice #${invoiceForm.invoice_number} was issued.` : 'A new invoice was issued to your account.',
      amount: Number(invoiceForm.amount || 0) || null,
    })
    setSaving(false); setInvForm(EMPTY_INV); close(); load()
  }

  const addDocument = async () => {
    setSaving(true)
    await supabase.from('client_documents').insert([{ ...docForm, client_email: activeClient.email }])
    await logClientActivity({
      clientEmail: activeClient.email,
      eventType: 'document_uploaded',
      title: docForm.name || 'Document uploaded',
      description: `${docForm.type || 'Document'} added to your client portal.`,
    })
    setSaving(false); setDocForm(EMPTY_DOC); close()
  }

  const addUpdate = async () => {
    setSaving(true)
    await supabase.from('deployment_updates').insert([{ ...updateForm, client_email: activeClient.email, staff_name: user?.name }])
    await supabase.from('notifications').insert([{ user_email: activeClient.email, title: updateForm.title, message: updateForm.message, type:'info', link:'/website' }])
    await logClientActivity({
      clientEmail: activeClient.email,
      eventType: 'update_posted',
      title: updateForm.title || 'Project update',
      description: updateForm.message || 'A new delivery update was posted to your portal.',
    })
    setSaving(false); setUpdForm(EMPTY_UPD); close()
  }

  const replyTicket = async () => {
    setSaving(true)
    await supabase.from('support_tickets').update({ staff_reply: replyForm, status:'resolved', replied_by: user?.name, replied_at: new Date().toISOString() }).eq('id', activeTicket.id)
    await Promise.all([
      supabase.from('notifications').insert([{ user_email: activeClient.email, title: `Reply to: ${activeTicket.subject}`, message: 'Your support query has been updated by the team.', type:'info', link:'/support' }]),
      logClientActivity({
        clientEmail: activeClient.email,
        eventType: 'support_replied',
        title: activeTicket.subject || 'Support reply',
        description: 'The team has replied to your support query.',
      }),
    ])
    setSaving(false); setReplyForm(''); close()
    await load()
  }

  const startEditContractTemplate = (template) => {
    setEditingContractTemplate(template)
    setReferenceFile(null)
    setTemplateError('')
    setContractTemplateForm(createClientContractTemplate(template))
    setModal('contractTemplates')
  }

  const saveContractTemplate = async () => {
    if (!contractTemplateForm.name.trim() || !contractTemplateForm.content_html.trim()) {
      setTemplateError('Add a template name and contract body before saving.')
      return
    }
    setSaving(true)
    setTemplateError('')
    try {
      let nextTemplate = createClientContractTemplate({
        ...contractTemplateForm,
        id: editingContractTemplate?.id || contractTemplateForm.id,
        updated_at: new Date().toISOString(),
      })

      if (referenceFile) {
        const filePath = `client-contract-templates/${nextTemplate.id}/${Date.now()}-${referenceFile.name}`
        const { error: uploadError } = await supabase.storage.from('hr-documents').upload(filePath, referenceFile)
        if (uploadError) throw uploadError
        nextTemplate = {
          ...nextTemplate,
          reference_file_url: '',
          reference_file_path: filePath,
          reference_file_name: referenceFile.name,
        }
      }

      const { error } = await supabase.from('portal_settings').upsert({
        key: buildClientContractTemplateKey(nextTemplate.id),
        value: { value: nextTemplate },
      }, { onConflict: 'key' })
      if (error) throw error

      setReferenceFile(null)
      setEditingContractTemplate(null)
      setContractTemplateForm(createClientContractTemplate({
        name: '',
        description: '',
        contract_type: 'Service Agreement',
        subject: 'Your agreement with DH Website Services',
        content_html: DEFAULT_CLIENT_TEMPLATE_HTML,
      }))
      await load()
    } catch (error) {
      setTemplateError(error.message || 'Could not save the client contract template.')
    } finally {
      setSaving(false)
    }
  }

  const toggleContractTemplateArchive = async (template) => {
    const nextTemplate = createClientContractTemplate({
      ...template,
      active: !template.active,
      updated_at: new Date().toISOString(),
    })
    await supabase.from('portal_settings').upsert({
      key: buildClientContractTemplateKey(nextTemplate.id),
      value: { value: nextTemplate },
    }, { onConflict: 'key' })
    await load()
  }

  const openTemplateReference = async (template) => {
    try {
      await openSecureDocument({
        filePath: template.reference_file_path,
        fallbackUrl: template.reference_file_url,
        userEmail: user?.email,
        userName: user?.name,
        action: 'client_contract_template_reference_opened',
        entity: 'client_contract_template',
        entityId: template.id,
        details: {
          template_name: template.name,
          file_name: template.reference_file_name || '',
        },
      })
    } catch (error) {
      setTemplateError(error.message || 'Could not open the reference file.')
    }
  }

  const openIssuedContractReference = async (contract) => {
    try {
      await openSecureDocument({
        filePath: contract.template_reference_file_path,
        fallbackUrl: contract.template_reference_file_url,
        userEmail: user?.email,
        userName: user?.name,
        action: 'client_contract_reference_opened',
        entity: 'client_contract',
        entityId: contract.id,
        details: {
          client_email: contract.client_email || '',
          template_name: contract.template_name || '',
          file_name: contract.template_reference_file_name || '',
        },
      })
    } catch (error) {
      setContractError(error.message || 'Could not open the contract reference file.')
    }
  }

  const issueClientContract = async () => {
    const template = activeContractTemplates.find((row) => row.id === contractForm.template_id) || activeContractTemplates[0]
    if (!activeClient?.email || !template) {
      setContractError('Choose a client and template before issuing the contract.')
      return
    }
    if (!contractForm.service_name.trim()) {
      setContractError('Add the service name before issuing the contract.')
      return
    }

    setSaving(true)
    setContractError('')
    try {
      const mergeFields = buildClientContractMergeFields({
        client: activeClient,
        template,
        serviceName: contractForm.service_name,
        priceAmount: contractForm.price_amount,
        currency: contractForm.currency,
        paymentTerms: contractForm.payment_terms,
        paymentStatus: contractForm.payment_status,
        depositAmount: contractForm.deposit_amount,
        paidInFull: contractForm.paid_in_full,
        accountManagerName: contractForm.account_manager_name || user?.name || '',
        accountManagerEmail: contractForm.account_manager_email || user?.email || '',
      })

      const staffSignature = createPortalSignature({
        name: user?.name || 'DH Website Services',
        title: 'Issued by DH Website Services',
        email: user?.email || '',
      })

      const contract = createClientContract({
        template_id: template.id,
        template_name: template.name,
        contract_type: template.contract_type,
        subject: template.subject,
        client_email: activeClient.email,
        client_name: activeClient.contact || activeClient.name,
        company_name: activeClient.name,
        service_name: contractForm.service_name,
        status: 'awaiting_client_signature',
        notes: contractForm.notes,
        merge_fields: mergeFields,
        template_html: template.content_html,
        template_reference_file_url: template.reference_file_url,
        template_reference_file_path: template.reference_file_path,
        template_reference_file_name: template.reference_file_name,
        price_amount: contractForm.price_amount,
        currency: contractForm.currency,
        payment_terms: contractForm.paid_in_full ? 'Paid in full' : contractForm.payment_terms,
        payment_status: contractForm.paid_in_full ? 'Paid in full' : contractForm.payment_status,
        deposit_amount: contractForm.deposit_amount,
        paid_in_full: contractForm.paid_in_full,
        issued_by_email: user?.email || '',
        issued_by_name: user?.name || '',
        account_manager_name: contractForm.account_manager_name || user?.name || '',
        account_manager_email: contractForm.account_manager_email || user?.email || '',
        staff_signature: staffSignature,
        issued_at: staffSignature.signed_at,
        staff_signed_at: staffSignature.signed_at,
      })

      const { error } = await supabase.from('portal_settings').upsert({
        key: buildClientContractKey(contract.id),
        value: { value: contract },
      }, { onConflict: 'key' })
      if (error) throw error

      await Promise.allSettled([
        supabase.from('notifications').insert([{
          user_email: activeClient.email,
          title: 'Contract ready to sign',
          message: `${template.name} is ready for your review and signature.`,
          type: 'info',
          link: '/contracts',
          created_at: new Date().toISOString(),
        }]),
        logClientActivity({
          clientEmail: activeClient.email,
          eventType: 'contract_issued',
          title: template.name || 'Contract ready to sign',
          description: `${contractForm.service_name} has been issued in your client portal.`,
        }),
        sendEmail('custom_email', {
          from_email: 'HR@dhwebsiteservices.co.uk',
          to: activeClient.email,
          subject: template.subject || `Contract ready to sign — ${contractForm.service_name}`,
          html: `
            <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.7;">
              <p>Hi ${activeClient.contact || activeClient.name},</p>
              <p>Your contract for <strong>${contractForm.service_name}</strong> is now ready to review and sign in the client portal.</p>
              <p><strong>Amount:</strong> ${formatCurrencyAmount(contractForm.price_amount, contractForm.currency) || contractForm.price_amount || 'Not listed'}<br/>
              <strong>Payment terms:</strong> ${contractForm.paid_in_full ? 'Paid in full' : (contractForm.payment_terms || 'As agreed')}</p>
              <p><a href="https://clients.dhwebsiteservices.co.uk/contracts" style="display:inline-block;padding:10px 18px;background:#1A56DB;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;">Open contracts</a></p>
              <p>Thanks,<br/>${user?.name || 'DH Website Services'}</p>
            </div>
          `,
          text: `Hi ${activeClient.contact || activeClient.name},\n\nYour contract for ${contractForm.service_name} is ready to review and sign in the client portal.\n\nAmount: ${formatCurrencyAmount(contractForm.price_amount, contractForm.currency) || contractForm.price_amount || 'Not listed'}\nPayment terms: ${contractForm.paid_in_full ? 'Paid in full' : (contractForm.payment_terms || 'As agreed')}\n\nOpen contracts: https://clients.dhwebsiteservices.co.uk/contracts`,
        }),
      ])

      setContractForm({
        ...EMPTY_CONTRACT_FORM,
        template_id: activeContractTemplates.find((row) => row.active !== false)?.id || '',
        account_manager_name: user?.name || '',
        account_manager_email: user?.email || '',
      })
      await load()
    } catch (error) {
      setContractError(error.message || 'Could not issue the client contract.')
    } finally {
      setSaving(false)
    }
  }

  const clientSignals = useMemo(() => {
    const invoiceMap = invoiceRows.reduce((acc, row) => {
      const key = row.client_email
      acc[key] = acc[key] || { total: 0, unpaid: 0, overdue: 0, latestAt: null }
      acc[key].total += 1
      if (row.status !== 'paid') acc[key].unpaid += 1
      if (row.status !== 'paid' && row.due_date && new Date(row.due_date) < new Date()) acc[key].overdue += 1
      const stamp = row.created_at || row.due_date
      if (!acc[key].latestAt || new Date(stamp) > new Date(acc[key].latestAt)) acc[key].latestAt = stamp
      return acc
    }, {})

    const updateMap = updateRows.reduce((acc, row) => {
      const key = row.client_email
      acc[key] = acc[key] || { total: 0, latestTitle: '', latestAt: null }
      acc[key].total += 1
      if (!acc[key].latestAt || new Date(row.created_at) > new Date(acc[key].latestAt)) {
        acc[key].latestAt = row.created_at
        acc[key].latestTitle = row.title
      }
      return acc
    }, {})

    const ticketMap = allTickets.reduce((acc, row) => {
      const key = row.client_email
      acc[key] = acc[key] || { open: 0, total: 0, latestAt: null }
      acc[key].total += 1
      if (row.status === 'open') acc[key].open += 1
      if (!acc[key].latestAt || new Date(row.created_at) > new Date(acc[key].latestAt)) acc[key].latestAt = row.created_at
      return acc
    }, {})

    const contractMap = clientContracts.reduce((acc, row) => {
      const key = row.client_email
      acc[key] = acc[key] || { total: 0, awaiting: 0, completed: 0, latestAt: null }
      acc[key].total += 1
      if (row.status === 'awaiting_client_signature') acc[key].awaiting += 1
      if (row.status === 'completed') acc[key].completed += 1
      const stamp = row.updated_at || row.issued_at || row.created_at
      if (!acc[key].latestAt || new Date(stamp) > new Date(acc[key].latestAt)) acc[key].latestAt = stamp
      return acc
    }, {})

    return { invoiceMap, updateMap, ticketMap, contractMap }
  }, [invoiceRows, updateRows, allTickets, clientContracts])

  const stats = useMemo(() => {
    const active = clients.filter((c) => c.status === 'active').length
    const openTickets = Object.values(clientSignals.ticketMap).reduce((sum, row) => sum + row.open, 0)
    const unpaidInvoices = Object.values(clientSignals.invoiceMap).reduce((sum, row) => sum + row.unpaid, 0)
    const ready = clients.filter((c) => c.deployment_status === 'ready').length
    const awaitingContracts = Object.values(clientSignals.contractMap).reduce((sum, row) => sum + row.awaiting, 0)
    return { active, openTickets, unpaidInvoices, ready, awaitingContracts }
  }, [clients, clientSignals])

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    const matchQ = !q || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
    const signals = {
      invoices: clientSignals.invoiceMap[c.email] || { unpaid: 0, overdue: 0 },
      tickets: clientSignals.ticketMap[c.email] || { open: 0 },
    }
    const matchF =
      filter === 'all' ||
      (filter === 'attention' && (signals.tickets.open > 0 || signals.invoices.unpaid > 0)) ||
      (filter === 'ready' && c.deployment_status === 'ready') ||
      (filter === 'building' && ['accepted', 'building', 'nearly_there'].includes(c.deployment_status || 'accepted'))
    return matchQ && matchF
  })

  const activeSignals = activeClient ? {
    invoices: clientSignals.invoiceMap[activeClient.email] || { unpaid: 0, total: 0, overdue: 0, latestAt: null },
    updates: clientSignals.updateMap[activeClient.email] || { total: 0, latestTitle: '', latestAt: null },
    tickets: {
      total: tickets.length,
      open: tickets.filter((ticket) => ticket.status === 'open').length,
      latestAt: tickets[0]?.created_at || null,
    },
  } : null

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">Client Portal Management</h1><p className="page-sub">Live delivery, billing, and support view across {clients.length} client accounts.</p></div>
      </div>
      <div className="dashboard-stat-grid" style={{ display:'grid', gridTemplateColumns:'repeat(5, minmax(0,1fr))', gap:14, marginBottom:20 }}>
        <div className="stat-card"><div className="stat-val">{stats.active}</div><div className="stat-lbl">Active clients</div></div>
        <div className="stat-card"><div className="stat-val">{stats.openTickets}</div><div className="stat-lbl">Open tickets</div></div>
        <div className="stat-card"><div className="stat-val">{stats.unpaidInvoices}</div><div className="stat-lbl">Unpaid invoices</div></div>
        <div className="stat-card"><div className="stat-val">{stats.ready}</div><div className="stat-lbl">Ready to launch</div></div>
        <div className="stat-card"><div className="stat-val">{stats.awaitingContracts}</div><div className="stat-lbl">Contracts awaiting signature</div></div>
      </div>

      <div className="card card-pad" style={{ marginBottom:20 }}>
          <div className="legacy-toolbar" style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ position:'relative', flex:1, minWidth:220 }}>
              <input className="inp" style={{ paddingLeft:34 }} placeholder="Search clients..." value={search} onChange={e=>setSearch(e.target.value)}/>
              <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--faint)', pointerEvents:'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
          <div className="legacy-toolbar-actions" style={{ display:'flex', gap:6 }}>
            {[
              ['all', 'All clients'],
              ['attention', 'Need attention'],
              ['building', 'In delivery'],
              ['ready', 'Ready to launch'],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)} className={'pill'+(filter===key?' on':'')}>{label}</button>
            ))}
          </div>
          <button className="btn btn-outline" onClick={() => openModal('contractTemplates', null)}>Client contract templates</button>
        </div>
      </div>

      <div style={{ display:'grid', gap:16 }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : filtered.map((client) => {
          const invoiceSignal = clientSignals.invoiceMap[client.email] || { total: 0, unpaid: 0, overdue: 0, latestAt: null }
          const updateSignal = clientSignals.updateMap[client.email] || { total: 0, latestTitle: '', latestAt: null }
          const contractSignal = clientSignals.contractMap[client.email] || { total: 0, awaiting: 0, completed: 0, latestAt: null }
          const active = expanded === client.id
          return (
            <div key={client.id} className="card" style={{ overflow:'hidden' }}>
              <div style={{ padding:'18px 20px', display:'grid', gridTemplateColumns:'minmax(0,1.25fr) minmax(260px,0.9fr)', gap:18, alignItems:'start' }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:14, flexWrap:'wrap' }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                        <div style={{ fontSize:16, fontWeight:600, color:'var(--text)' }}>{client.name}</div>
                        <span className="badge badge-blue">{client.plan}</span>
                        <span className={`badge badge-${STAGE_TONES[client.deployment_status || 'accepted'] || 'grey'}`}>{STAGES.find((stage) => stage.key === (client.deployment_status || 'accepted'))?.label || 'Order Accepted'}</span>
                        <span className={`badge badge-${client.status === 'active' ? 'green' : client.status === 'pending' ? 'amber' : 'grey'}`}>{client.status}</span>
                      </div>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--faint)', marginTop:6 }}>{client.email}</div>
                      <div style={{ fontSize:13, color:'var(--sub)', marginTop:8, lineHeight:1.6 }}>
                        {client.contact || 'No contact name'}{client.website_url ? ` · ${client.website_url}` : ''}
                      </div>
                    </div>
                    <select className="inp" style={{ padding:'6px 10px', fontSize:12, width:'auto', minWidth:180 }} value={client.deployment_status||'accepted'} onChange={e=>updateStage(client,e.target.value)}>
                      {STAGES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'repeat(5, minmax(0, 1fr))', gap:10, marginTop:16 }}>
                    <div style={{ padding:'12px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
                      <div style={{ fontSize:22, fontWeight:600, color:'var(--text)' }}>{invoiceSignal.unpaid}</div>
                      <div style={{ fontSize:11, color:'var(--faint)', marginTop:4, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Unpaid invoices</div>
                    </div>
                    <div style={{ padding:'12px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
                      <div style={{ fontSize:22, fontWeight:600, color:'var(--text)' }}>{invoiceSignal.overdue}</div>
                      <div style={{ fontSize:11, color:'var(--faint)', marginTop:4, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Overdue</div>
                    </div>
                    <div style={{ padding:'12px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
                      <div style={{ fontSize:22, fontWeight:600, color:'var(--text)' }}>{updateSignal.total}</div>
                      <div style={{ fontSize:11, color:'var(--faint)', marginTop:4, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Updates posted</div>
                    </div>
                    <div style={{ padding:'12px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
                      <div style={{ fontSize:22, fontWeight:600, color:'var(--text)' }}>{Number(client.value || 0) ? `£${Number(client.value).toLocaleString()}` : '—'}</div>
                      <div style={{ fontSize:11, color:'var(--faint)', marginTop:4, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Account value</div>
                    </div>
                    <div style={{ padding:'12px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)' }}>
                      <div style={{ fontSize:22, fontWeight:600, color:'var(--text)' }}>{contractSignal.awaiting}</div>
                      <div style={{ fontSize:11, color:'var(--faint)', marginTop:4, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Contracts pending</div>
                    </div>
                  </div>
                </div>

                <div style={{ minWidth:0, display:'grid', gap:12 }}>
                  <div style={{ padding:'14px 16px', border:'1px solid var(--border)', borderRadius:14, background:'linear-gradient(180deg, var(--card), var(--bg2))' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--faint)' }}>Latest signal</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginTop:8 }}>{updateSignal.latestTitle || 'No deployment update yet'}</div>
                    <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:6, lineHeight:1.6 }}>
                      Last client movement was {timeAgo(updateSignal.latestAt || invoiceSignal.latestAt || client.updated_at || client.created_at)}.
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => navigate(`/clients/${client.id}`)}>Open profile</button>
                    <button className="btn btn-outline btn-sm" onClick={()=>openModal('invoice',client)}>Invoice</button>
                    <button className="btn btn-outline btn-sm" onClick={()=>openModal('update',client)}>Update</button>
                    <button className="btn btn-outline btn-sm" onClick={()=>openModal('doc',client)}>Doc</button>
                    <button className="btn btn-outline btn-sm" onClick={()=>openModal('contract',client)}>Contracts</button>
                    <button className="btn btn-ghost btn-sm" onClick={()=>toggleExpand(client.id, client.email)}>{active ? 'Hide details' : 'Show details'}</button>
                  </div>
                </div>
              </div>

              {active && (
                <div style={{ padding:'18px 20px', background:'var(--bg2)', borderTop:'1px solid var(--border)' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:12, marginBottom:16 }}>
                    <div className="card" style={{ padding:'14px 16px' }}>
                      <div className="lbl" style={{ marginBottom:8 }}>Support</div>
                      <div style={{ fontSize:24, fontWeight:600, color:'var(--text)' }}>{activeClient?.id === client.id ? activeSignals?.tickets.open : 0}</div>
                      <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:4 }}>Open tickets for this client right now.</div>
                    </div>
                    <div className="card" style={{ padding:'14px 16px' }}>
                      <div className="lbl" style={{ marginBottom:8 }}>Invoices</div>
                      <div style={{ fontSize:24, fontWeight:600, color:'var(--text)' }}>{invoiceSignal.total}</div>
                      <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:4 }}>{invoiceSignal.unpaid} still unpaid.</div>
                    </div>
                    <div className="card" style={{ padding:'14px 16px' }}>
                      <div className="lbl" style={{ marginBottom:8 }}>Account notes</div>
                      <div style={{ fontSize:12.5, color:'var(--sub)', lineHeight:1.6 }}>{client.notes || 'No client notes added yet.'}</div>
                    </div>
                    <div className="card" style={{ padding:'14px 16px' }}>
                      <div className="lbl" style={{ marginBottom:8 }}>Contracts</div>
                      <div style={{ fontSize:24, fontWeight:600, color:'var(--text)' }}>{contractSignal.total}</div>
                      <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:4 }}>{contractSignal.awaiting} awaiting signature.</div>
                    </div>
                  </div>

                  <div className="lbl" style={{ padding:'0 0 8px' }}>Support Tickets</div>
                  {tickets.length === 0 ? <p style={{ fontSize:13, color:'var(--faint)', fontStyle:'italic' }}>No tickets</p> : tickets.map(t => (
                    <div key={t.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border)', gap:12, flexWrap:'wrap' }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:500 }}>{t.subject}</div>
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--faint)', marginTop:4 }}>{new Date(t.created_at).toLocaleDateString('en-GB')}</div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span className={'badge badge-'+(t.status==='open'?'amber':'green')}>{t.status}</span>
                        {t.status==='open' && <button className="btn btn-primary btn-sm" onClick={()=>{ setActiveClient(client); setActiveTicket(t); setModal('reply') }}>Reply</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {!loading && filtered.length===0 && <div className="empty"><p>No clients match this view</p></div>}
      </div>

      {modal==='invoice' && <Modal title={`Invoice — ${activeClient?.name}`} onClose={close} footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={addInvoice} disabled={saving}>{saving?'Saving...':'Send Invoice'}</button></>}>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="fg">
            <div><label className="lbl">Invoice #</label><input className="inp" value={invoiceForm.invoice_number} onChange={e=>setInvForm(p=>({...p,invoice_number:e.target.value}))} placeholder="INV-001"/></div>
            <div><label className="lbl">Amount (£)</label><input className="inp" type="number" value={invoiceForm.amount} onChange={e=>setInvForm(p=>({...p,amount:e.target.value}))}/></div>
          </div>
          <div><label className="lbl">Description</label><input className="inp" value={invoiceForm.description} onChange={e=>setInvForm(p=>({...p,description:e.target.value}))} placeholder="Monthly Pro Plan — March 2026"/></div>
          <div><label className="lbl">Due Date</label><input className="inp" type="date" value={invoiceForm.due_date} onChange={e=>setInvForm(p=>({...p,due_date:e.target.value}))}/></div>
        </div>
      </Modal>}

      {modal==='doc' && <Modal title={`Add Document — ${activeClient?.name}`} onClose={close} footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={addDocument} disabled={saving}>{saving?'Saving...':'Add'}</button></>}>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div><label className="lbl">Document Name</label><input className="inp" value={docForm.name} onChange={e=>setDocForm(p=>({...p,name:e.target.value}))}/></div>
          <div><label className="lbl">Type</label><select className="inp" value={docForm.type} onChange={e=>setDocForm(p=>({...p,type:e.target.value}))}>{['Contract','NDA','Invoice','Proposal','Other'].map(t=><option key={t}>{t}</option>)}</select></div>
          <div><label className="lbl">File URL</label><input className="inp" value={docForm.file_url} onChange={e=>setDocForm(p=>({...p,file_url:e.target.value}))} placeholder="https://drive.google.com/..."/></div>
        </div>
      </Modal>}

      {modal==='update' && <Modal title={`Post Update — ${activeClient?.name}`} onClose={close} footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={addUpdate} disabled={saving}>{saving?'Saving...':'Post'}</button></>}>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div><label className="lbl">Title</label><input className="inp" value={updateForm.title} onChange={e=>setUpdForm(p=>({...p,title:e.target.value}))} placeholder="Homepage design complete"/></div>
          <div><label className="lbl">Message</label><textarea className="inp" rows={4} value={updateForm.message} onChange={e=>setUpdForm(p=>({...p,message:e.target.value}))} style={{ resize:'vertical' }}/></div>
        </div>
      </Modal>}

      {modal==='reply' && activeTicket && <Modal title={`Reply — ${activeTicket.subject}`} onClose={close} footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={replyTicket} disabled={saving||!replyForm.trim()}>{saving?'Sending...':'Send Reply'}</button></>}>
        <div style={{ padding:'12px 14px', background:'var(--bg2)', borderRadius:8, marginBottom:12 }}>
          <div className="lbl" style={{ marginBottom:6 }}>Original message</div>
          <p style={{ fontSize:13.5, color:'var(--sub)', lineHeight:1.7 }}>{activeTicket.message}</p>
        </div>
        <div><label className="lbl">Your Reply</label><textarea className="inp" rows={5} value={replyForm} onChange={e=>setReplyForm(e.target.value)} style={{ resize:'vertical' }}/></div>
      </Modal>}

      {modal==='contractTemplates' && <Modal title="Client contract templates" onClose={close} width={980} footer={<><button className="btn btn-outline" onClick={close}>Close</button><button className="btn btn-primary" onClick={saveContractTemplate} disabled={saving}>{saving ? 'Saving...' : (editingContractTemplate ? 'Save changes' : 'Save template')}</button></>}>
        <div style={{ display:'grid', gridTemplateColumns:'minmax(280px,0.9fr) minmax(0,1.4fr)', gap:18 }}>
          <div style={{ display:'grid', gap:12, alignContent:'start' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:'var(--text)' }}>Saved templates</div>
                <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:4 }}>Reuse a base client agreement and swap pricing/payment details at issue time.</div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => {
                setEditingContractTemplate(null)
                setReferenceFile(null)
                setTemplateError('')
                setContractTemplateForm(createClientContractTemplate({
                  name: '',
                  description: '',
                  contract_type: 'Service Agreement',
                  subject: 'Your agreement with DH Website Services',
                  content_html: DEFAULT_CLIENT_TEMPLATE_HTML,
                }))
              }}>New</button>
            </div>
            <div style={{ display:'grid', gap:10, maxHeight:420, overflowY:'auto', paddingRight:4 }}>
              {clientContractTemplates.length ? clientContractTemplates.map((template) => (
                <div key={template.id} className="card" style={{ padding:'14px 16px', display:'grid', gap:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:600 }}>{template.name}</div>
                      <div style={{ fontSize:12, color:'var(--sub)', marginTop:4 }}>{template.contract_type || 'Service Agreement'}</div>
                    </div>
                    <span className={`badge badge-${template.active ? 'green' : 'grey'}`}>{template.active ? 'Active' : 'Archived'}</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--sub)', lineHeight:1.6 }}>{template.description || 'No description yet.'}</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => startEditContractTemplate(template)}>Edit</button>
                    <button className="btn btn-outline btn-sm" onClick={() => toggleContractTemplateArchive(template)}>{template.active ? 'Archive' : 'Restore'}</button>
                    {template.reference_file_path || template.reference_file_url ? <button className="btn btn-outline btn-sm" onClick={() => openTemplateReference(template)}>Reference file</button> : null}
                  </div>
                </div>
              )) : <div className="empty"><p>No client contract templates yet.</p></div>}
            </div>
          </div>

          <div style={{ display:'grid', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div><label className="lbl">Template name</label><input className="inp" value={contractTemplateForm.name} onChange={(e) => setContractTemplateForm((current) => ({ ...current, name: e.target.value }))} /></div>
              <div><label className="lbl">Contract type</label><input className="inp" value={contractTemplateForm.contract_type} onChange={(e) => setContractTemplateForm((current) => ({ ...current, contract_type: e.target.value }))} /></div>
              <div><label className="lbl">Email subject</label><input className="inp" value={contractTemplateForm.subject} onChange={(e) => setContractTemplateForm((current) => ({ ...current, subject: e.target.value }))} /></div>
              <div>
                <label className="lbl">Status</label>
                <select className="inp" value={contractTemplateForm.active ? 'active' : 'archived'} onChange={(e) => setContractTemplateForm((current) => ({ ...current, active: e.target.value === 'active' }))}>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
            <div><label className="lbl">Description</label><textarea className="inp" rows={3} value={contractTemplateForm.description} onChange={(e) => setContractTemplateForm((current) => ({ ...current, description: e.target.value }))} style={{ resize:'vertical' }} /></div>
            <div>
              <div className="lbl" style={{ marginBottom:6 }}>Template body</div>
              <div style={{ fontSize:12, color:'var(--sub)', marginBottom:8 }}>Use placeholders like {CLIENT_CONTRACT_PLACEHOLDERS.map(([key]) => `{{${key}}}`).join(', ')}.</div>
              <textarea className="inp" rows={14} value={contractTemplateForm.content_html} onChange={(e) => setContractTemplateForm((current) => ({ ...current, content_html: e.target.value }))} style={{ resize:'vertical', fontFamily:'var(--font-mono)', fontSize:12 }} />
            </div>
            <div className="card card-pad" style={{ display:'grid', gap:10 }}>
              <div className="lbl">Attach default contract file</div>
              <div style={{ fontSize:12, color:'var(--sub)' }}>Optional. Keep the original PDF or source document attached to the template for internal reference.</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <input ref={referenceFileRef} type="file" style={{ display:'none' }} accept=".pdf,.doc,.docx,.html" onChange={(e) => setReferenceFile(e.target.files?.[0] || null)} />
                <button className="btn btn-outline btn-sm" onClick={() => referenceFileRef.current?.click()}>{referenceFile ? 'Change file' : 'Choose file'}</button>
                <span style={{ fontSize:12, color: referenceFile ? 'var(--text)' : 'var(--sub)' }}>{referenceFile ? referenceFile.name : (contractTemplateForm.reference_file_name || 'No file attached')}</span>
              </div>
            </div>
            {templateError ? <div className="badge badge-red" style={{ justifySelf:'flex-start' }}>{templateError}</div> : null}
          </div>
        </div>
      </Modal>}

      {modal==='contract' && activeClient && <Modal title={`Client contracts — ${activeClient.name}`} onClose={close} width={1080} footer={<><button className="btn btn-outline" onClick={close}>Close</button><button className="btn btn-primary" onClick={issueClientContract} disabled={saving}>{saving ? 'Issuing...' : 'Issue contract'}</button></>}>
        <div style={{ display:'grid', gridTemplateColumns:'minmax(320px,0.95fr) minmax(0,1.35fr)', gap:18 }}>
          <div style={{ display:'grid', gap:14, alignContent:'start' }}>
            <div className="card card-pad" style={{ display:'grid', gap:12 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:'var(--text)' }}>Issue new contract</div>
                <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:4 }}>Set the amount due, payment terms, and push a sign-ready agreement into the client portal.</div>
              </div>
              <div><label className="lbl">Template</label><select className="inp" value={contractForm.template_id} onChange={(e) => setContractForm((current) => ({ ...current, template_id: e.target.value }))}>{activeContractTemplates.length ? activeContractTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>) : <option value="">No active templates</option>}</select></div>
              <div><label className="lbl">Service name</label><input className="inp" value={contractForm.service_name} onChange={(e) => setContractForm((current) => ({ ...current, service_name: e.target.value }))} placeholder="Website build and onboarding" /></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 140px', gap:12 }}>
                <div><label className="lbl">Amount due</label><input className="inp" type="number" value={contractForm.price_amount} onChange={(e) => setContractForm((current) => ({ ...current, price_amount: e.target.value }))} placeholder="1499" /></div>
                <div><label className="lbl">Currency</label><select className="inp" value={contractForm.currency} onChange={(e) => setContractForm((current) => ({ ...current, currency: e.target.value }))}><option value="GBP">GBP</option><option value="USD">USD</option><option value="EUR">EUR</option></select></div>
              </div>
              <div><label className="lbl">Payment terms</label><input className="inp" value={contractForm.payment_terms} onChange={(e) => setContractForm((current) => ({ ...current, payment_terms: e.target.value }))} placeholder="50% upfront, balance due on launch" disabled={contractForm.paid_in_full} /></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div><label className="lbl">Payment status</label><input className="inp" value={contractForm.payment_status} onChange={(e) => setContractForm((current) => ({ ...current, payment_status: e.target.value }))} placeholder="Due on agreed terms" disabled={contractForm.paid_in_full} /></div>
                <div><label className="lbl">Deposit amount</label><input className="inp" type="number" value={contractForm.deposit_amount} onChange={(e) => setContractForm((current) => ({ ...current, deposit_amount: e.target.value }))} placeholder="500" disabled={contractForm.paid_in_full} /></div>
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:10, fontSize:12.5, color:'var(--sub)' }}>
                <input type="checkbox" checked={contractForm.paid_in_full} onChange={(e) => setContractForm((current) => ({ ...current, paid_in_full: e.target.checked, payment_terms: e.target.checked ? 'Paid in full' : current.payment_terms, payment_status: e.target.checked ? 'Paid in full' : current.payment_status }))} />
                Client has paid in full
              </label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div><label className="lbl">Account manager name</label><input className="inp" value={contractForm.account_manager_name || ''} onChange={(e) => setContractForm((current) => ({ ...current, account_manager_name: e.target.value }))} /></div>
                <div><label className="lbl">Account manager email</label><input className="inp" value={contractForm.account_manager_email || ''} onChange={(e) => setContractForm((current) => ({ ...current, account_manager_email: e.target.value }))} /></div>
              </div>
              <div><label className="lbl">Internal notes</label><textarea className="inp" rows={3} value={contractForm.notes} onChange={(e) => setContractForm((current) => ({ ...current, notes: e.target.value }))} style={{ resize:'vertical' }} /></div>
              {contractError ? <div className="badge badge-red" style={{ justifySelf:'flex-start' }}>{contractError}</div> : null}
            </div>

            <div className="card card-pad" style={{ display:'grid', gap:12 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:'var(--text)' }}>Existing contracts</div>
                <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:4 }}>Signed agreements and contracts currently waiting on the client.</div>
              </div>
              <div style={{ display:'grid', gap:10, maxHeight:280, overflowY:'auto', paddingRight:4 }}>
                {contractsForActiveClient.length ? contractsForActiveClient.map((contract) => {
                  const [statusLabel, tone] = getClientContractStatusLabel(contract.status)
                  return (
                    <div key={contract.id} style={{ padding:'12px 14px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg2)', display:'grid', gap:8 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
                        <div>
                          <div style={{ fontSize:13.5, fontWeight:600 }}>{contract.template_name || 'Client contract'}</div>
                          <div style={{ fontSize:12, color:'var(--sub)', marginTop:4 }}>{contract.service_name || 'Service agreement'}</div>
                        </div>
                        <span className={`badge badge-${tone}`}>{statusLabel}</span>
                      </div>
                      <div style={{ fontSize:12, color:'var(--sub)' }}>
                        {formatCurrencyAmount(contract.price_amount, contract.currency) || contract.price_amount || 'No amount listed'}
                        {contract.payment_terms ? ` · ${contract.payment_terms}` : ''}
                      </div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        {contract.final_document_url ? <a className="btn btn-outline btn-sm" href={contract.final_document_url} target="_blank" rel="noreferrer">Signed PDF</a> : null}
                        {contract.template_reference_file_path || contract.template_reference_file_url ? <button className="btn btn-outline btn-sm" onClick={() => openIssuedContractReference(contract)}>Reference file</button> : null}
                      </div>
                    </div>
                  )
                }) : <div className="empty"><p>No contracts issued for this client yet.</p></div>}
              </div>
            </div>
          </div>

          <div className="card card-pad" style={{ display:'grid', gap:14, alignContent:'start' }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:'var(--text)' }}>Live preview</div>
              <div style={{ fontSize:12.5, color:'var(--sub)', marginTop:4 }}>This is what the client will review and sign in their portal.</div>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {contractForm.price_amount ? <span className="badge badge-blue">{formatCurrencyAmount(contractForm.price_amount, contractForm.currency) || contractForm.price_amount}</span> : null}
              {contractForm.paid_in_full ? <span className="badge badge-green">Paid in full</span> : null}
              {contractForm.payment_terms ? <span className="badge badge-grey">{contractForm.payment_terms}</span> : null}
            </div>
            <div style={{ background:'#f8f6f1', border:'1px solid #e7e1d8', borderRadius:18, padding:22, minHeight:420, maxHeight:680, overflowY:'auto' }}>
              {contractPreview ? (
                <div style={{ maxWidth:760, margin:'0 auto', background:'#fff', border:'1px solid #e7e1d8', borderRadius:18, padding:'28px 30px', boxShadow:'0 18px 48px rgba(15, 23, 42, 0.08)' }}>
                  <div style={{ fontFamily:'Georgia, Times New Roman, serif', fontSize:15, lineHeight:1.8, color:'#111' }} dangerouslySetInnerHTML={{ __html: contractPreview }} />
                </div>
              ) : (
                <div style={{ fontSize:13, color:'var(--sub)' }}>Choose an active template to preview the contract.</div>
              )}
            </div>
          </div>
        </div>
      </Modal>}
    </div>
  )
}
