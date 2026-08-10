/**
 * Properties panel, generated entirely from the block's field schema.
 *
 * There is no per-block editor code anywhere in the portal. A block gains
 * controls here the moment it appears in the site's manifest, which is the
 * point: adding a block should be one change in one repo, not two.
 */

import { useState } from 'react'
import { Button, FormField, FormLabel, FormInput, FormSelect, FormHint, Toggle } from '../../components/ds'

const PANEL_GAP = 14

function Field({ field, value, onChange }) {
  const label = field.label || field.key

  switch (field.type) {
    case 'textarea':
      return (
        <FormField>
          <FormLabel>{label}</FormLabel>
          <textarea
            className="ds-form-input"
            rows={4}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            style={{ resize: 'vertical' }}
          />
          {field.hint ? <FormHint>{field.hint}</FormHint> : null}
        </FormField>
      )

    case 'number':
      return (
        <FormField>
          <FormLabel>{label}</FormLabel>
          <FormInput
            type="number"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />
          {field.hint ? <FormHint>{field.hint}</FormHint> : null}
        </FormField>
      )

    case 'boolean':
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: PANEL_GAP }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{label}</span>
          <Toggle checked={value === true} onChange={(next) => onChange(next === true || next?.target?.checked === true)} />
        </div>
      )

    case 'colour':
      return (
        <FormField>
          <FormLabel>{label}</FormLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#ffffff'}
              onChange={(e) => onChange(e.target.value)}
              style={{ width: 38, height: 36, padding: 2, border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg-surface)' }}
            />
            <FormInput
              value={value ?? ''}
              placeholder="e.g. var(--cream) or #f5f5f7"
              onChange={(e) => onChange(e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
          {field.hint ? <FormHint>{field.hint}</FormHint> : null}
        </FormField>
      )

    case 'select':
      return (
        <FormField>
          <FormLabel>{label}</FormLabel>
          <FormSelect value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            {(field.options || []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </FormSelect>
        </FormField>
      )

    case 'list':
      return <ListField field={field} value={value} onChange={onChange} />

    case 'image':
    case 'link':
    case 'text':
    default:
      return (
        <FormField>
          <FormLabel>{label}</FormLabel>
          <FormInput
            value={value ?? ''}
            placeholder={field.type === 'link' ? '/contact or https://…' : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.hint ? <FormHint>{field.hint}</FormHint> : null}
        </FormField>
      )
  }
}

/** Repeater. Handles both lists of plain strings and lists of objects. */
function ListField({ field, value, onChange }) {
  const items = Array.isArray(value) ? value : []
  const simple = !field.itemFields
  const [open, setOpen] = useState(() => new Set())

  const update = (index, next) => {
    const copy = [...items]
    copy[index] = next
    onChange(copy)
  }

  const add = () => {
    const blank = simple
      ? ''
      : Object.fromEntries((field.itemFields || []).map((f) => [f.key, f.type === 'boolean' ? false : '']))
    onChange([...items, blank])
    setOpen((current) => new Set(current).add(items.length))
  }

  const remove = (index) => onChange(items.filter((_, i) => i !== index))

  const move = (index, delta) => {
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const copy = [...items]
    const [moved] = copy.splice(index, 1)
    copy.splice(target, 0, moved)
    onChange(copy)
  }

  const summarise = (item, index) => {
    if (simple) return String(item || `Item ${index + 1}`)
    return String(item?.title || item?.label || item?.name || item?.q || item?.heading || item?.value || `Item ${index + 1}`)
  }

  return (
    <div style={{ marginBottom: PANEL_GAP }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
          {field.label} <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>({items.length})</span>
        </span>
        <Button variant="secondary" style={{ height: 24, fontSize: 11, padding: '0 8px' }} onClick={add}>+ Add</Button>
      </div>
      {field.hint ? <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>{field.hint}</div> : null}

      <div style={{ display: 'grid', gap: 6 }}>
        {items.map((item, index) => {
          const isOpen = open.has(index)
          return (
            <div key={index} style={{ border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-bg-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px' }}>
                <button
                  onClick={() => setOpen((current) => {
                    const next = new Set(current)
                    if (next.has(index)) next.delete(index); else next.add(index)
                    return next
                  })}
                  style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--color-text-primary)', padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {isOpen ? '▾' : '▸'} {summarise(item, index)}
                </button>
                <button title="Move up" onClick={() => move(index, -1)} style={iconBtn}>↑</button>
                <button title="Move down" onClick={() => move(index, 1)} style={iconBtn}>↓</button>
                <button title="Remove" onClick={() => remove(index)} style={{ ...iconBtn, color: 'var(--color-red-500)' }}>✕</button>
              </div>

              {isOpen && (
                <div style={{ padding: '4px 10px 10px', borderTop: '1px solid var(--color-border)' }}>
                  {simple ? (
                    <FormInput value={item ?? ''} onChange={(e) => update(index, e.target.value)} />
                  ) : (
                    (field.itemFields || []).map((sub) => (
                      <Field
                        key={sub.key}
                        field={sub}
                        value={item?.[sub.key]}
                        onChange={(next) => update(index, { ...item, [sub.key]: next })}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const iconBtn = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  color: 'var(--color-text-tertiary)',
  padding: '2px 4px',
  lineHeight: 1,
}

export default function Inspector({ block, definition, onPatch, onRemove, onDuplicate }) {
  if (!block) {
    return (
      <div style={{ padding: 16, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
        Select a section on the page, or pick one from the list, to edit it.
      </div>
    )
  }

  if (!definition) {
    return (
      <div style={{ padding: 16, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
        This page uses a <strong>{block.type}</strong> section that the live site does not have.
        It will not appear for visitors. Remove it, or deploy the site build that provides it.
        <div style={{ marginTop: 12 }}>
          <Button variant="secondary" style={{ height: 28, fontSize: 12 }} onClick={() => onRemove(block.id)}>Remove section</Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{definition.label}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button variant="secondary" style={{ height: 26, fontSize: 11, padding: '0 8px' }} onClick={() => onDuplicate(block.id)}>Duplicate</Button>
          <Button variant="secondary" style={{ height: 26, fontSize: 11, padding: '0 8px', color: 'var(--color-red-500)' }} onClick={() => onRemove(block.id)}>Delete</Button>
        </div>
      </div>

      {definition.hint ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12, lineHeight: 1.5 }}>{definition.hint}</div>
      ) : null}

      {(definition.fields || []).map((field) => (
        <Field
          key={field.key}
          field={field}
          value={block.props?.[field.key]}
          onChange={(next) => onPatch(block.id, { [field.key]: next })}
        />
      ))}
    </div>
  )
}
