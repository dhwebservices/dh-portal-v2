const TASK_META_PREFIX = '[dh-task-meta]'

export function parseTaskDescription(raw = '') {
  const text = String(raw || '')
  if (!text.startsWith(TASK_META_PREFIX)) {
    return {
      plainDescription: text,
      meta: { assigned_department: '' },
    }
  }

  const newlineIndex = text.indexOf('\n')
  const metaLine = newlineIndex >= 0 ? text.slice(TASK_META_PREFIX.length, newlineIndex).trim() : text.slice(TASK_META_PREFIX.length).trim()
  const remaining = newlineIndex >= 0 ? text.slice(newlineIndex + 1).trim() : ''

  try {
    const parsed = JSON.parse(metaLine || '{}')
    return {
      plainDescription: remaining,
      meta: {
        assigned_department: String(parsed.assigned_department || '').trim(),
      },
    }
  } catch {
    return {
      plainDescription: remaining || text,
      meta: { assigned_department: '' },
    }
  }
}

export function buildTaskDescription(plainDescription = '', meta = {}) {
  const safeMeta = {
    assigned_department: String(meta.assigned_department || '').trim(),
  }
  const metaBlock = `${TASK_META_PREFIX} ${JSON.stringify(safeMeta)}`
  const body = String(plainDescription || '').trim()
  return body ? `${metaBlock}\n${body}` : metaBlock
}

export function enrichTask(task = {}) {
  const parsed = parseTaskDescription(task.description)
  return {
    ...task,
    description_plain: parsed.plainDescription,
    assigned_department: parsed.meta.assigned_department,
  }
}
