import { useState, useEffect } from 'react'
import { Plus, Search, Edit2, Trash2 } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'

const EMPTY = { name:'', email:'', role:'', commission_rate:10, status:'active', total_earned:0, pending_payout:0, sales_count:0 }

export default function Staff() {
  const { user } = useAuth()
  const [staff, setStaff]     = useState([])
  const [commissions, setComm] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [tab, setTab]         = useState('staff')
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from('staff').select('*').order('name'),
      supabase.from('commissions').select('*').order('date', { ascending:false }).limit(50),
    ])
    setStaff(s || []); setComm(c || [])
    setLoading(false)
  }
  const openAdd  = () => { setEditing(null); setForm(EMPTY); setModal(true) }
  const openEdit = r => { setEditing(r); setForm({ ...r }); setModal(true) }
  const close    = () => { setModal(false); setEditing(null) }
  const sf = (k,v) => setForm(p => ({ ...p, [k]: v }))

  const save = async () => {
    setSaving(true)
    if (editing) await supabase.from('staff').update(form).eq('id', editing.id)
    else await supabase.from('staff').insert([form])
    setSaving(false); close(); load()
  }
  const del = async (id, name) => {
    if (!confirm('Remove ' + name + '?')) return
    await supabase.from('staff').delete().eq('id', id); load()
  }

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">Staff & Commissions</h1></div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={14}/>Add Staff</button>
      </div>

      <div className="tabs">
        {[['staff','Staff Members'],['commissions','Commission Log']].map(([k,l]) => (
          <button key={k} onClick={()=>setTab(k)} className={"tab"+(tab===k?' on':'')}>{l}</button>
        ))}
      </div>

      {loading ? <div className="spin-wrap"><div className="spin"/></div> : tab==='staff' ? (
        <div className="card" style={{ overflow:'hidden' }}>
          <table className="tbl">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Rate</th><th>Earned</th><th>Pending</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id}>
                  <td className="t-main">{s.name}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{s.email}</td>
                  <td>{s.role}</td>
                  <td>{s.commission_rate}%</td>
                  <td>£{Number(s.total_earned||0).toLocaleString()}</td>
                  <td>£{Number(s.pending_payout||0).toLocaleString()}</td>
                  <td><span className={"badge badge-"+(s.status==='active'?'green':'grey')}>{s.status}</span></td>
                  <td>
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>openEdit(s)}><Edit2 size={13}/></button>
                      <button className="btn btn-ghost btn-sm btn-icon" style={{ color:'var(--red)' }} onClick={()=>del(s.id,s.name)}><Trash2 size={13}/></button>
                    </div>
                  </td>
                </tr>
              ))}
              {staff.length===0 && <tr><td colSpan={8} style={{ textAlign:'center', padding:40, color:'var(--faint)' }}>No staff added yet</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ overflow:'hidden' }}>
          <table className="tbl">
            <thead><tr><th>Staff</th><th>Client</th><th>Sale Value</th><th>Commission</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {commissions.map(c => (
                <tr key={c.id}>
                  <td className="t-main">{c.staff_name}</td>
                  <td>{c.client}</td>
                  <td>£{Number(c.sale_value||0).toLocaleString()}</td>
                  <td>£{Number(c.commission_amount||0).toLocaleString()}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{c.date}</td>
                  <td><span className={"badge badge-"+(c.status==='paid'?'green':'amber')}>{c.status}</span></td>
                </tr>
              ))}
              {commissions.length===0 && <tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'var(--faint)' }}>No commissions recorded</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={editing?'Edit Staff Member':'Add Staff Member'} onClose={close} footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving...':'Save'}</button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div className="fg">
              <div><label className="lbl">Name</label><input className="inp" value={form.name} onChange={e=>sf('name',e.target.value)}/></div>
              <div><label className="lbl">Email</label><input className="inp" type="email" value={form.email} onChange={e=>sf('email',e.target.value)}/></div>
              <div><label className="lbl">Role</label><input className="inp" value={form.role} onChange={e=>sf('role',e.target.value)} placeholder="Sales Rep, Designer..."/></div>
              <div><label className="lbl">Commission Rate (%)</label><input className="inp" type="number" value={form.commission_rate} onChange={e=>sf('commission_rate',Number(e.target.value))}/></div>
              <div><label className="lbl">Status</label>
                <select className="inp" value={form.status} onChange={e=>sf('status',e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <p style={{ fontSize:12, color:'var(--faint)', fontStyle:'italic' }}>Staff are self-employed contractors — commission paid after client invoice confirmed received.</p>
          </div>
        </Modal>
      )}
    </div>
  )
}
