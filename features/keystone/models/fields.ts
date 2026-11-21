import { integer, select, text, timestamp, relationship } from '@keystone-6/core/fields'
import { hasFlag, serverOnly, type RoleFlag, type Session } from '../access'

export const label = (value: string) => value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
export const options = (values: readonly string[]) => values.map((value) => ({ value, label: label(value) }))

/**
 * A state-machine status: indexed, defaulted, and never written through generic
 * CRUD. Every change goes through a named mutation that compare-and-sets it.
 */
export function statusField(values: readonly string[], defaultValue: string) {
  return select({
    type: 'string',
    options: options(values),
    defaultValue,
    validation: { isRequired: true },
    isIndexed: true,
    access: serverOnly,
    ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } },
  })
}

/** A plain choice field (not a state machine). */
export function choice(values: readonly string[], defaultValue?: string, extra: Record<string, unknown> = {}) {
  return select({
    type: 'string',
    options: options(values),
    ...(defaultValue ? { defaultValue, validation: { isRequired: true } } : {}),
    ...extra,
  } as any)
}

/** Catalogue publish state: settable by the owner or a flag holder, never by others. */
export function publishField(values: readonly string[], defaultValue: string, flag: RoleFlag) {
  const allowed = ({ session }: { session?: Session }) => hasFlag(session, 'canManageSettings') || hasFlag(session, flag)
  return select({
    type: 'string',
    options: options(values),
    defaultValue,
    validation: { isRequired: true },
    isIndexed: true,
    access: { create: allowed, update: allowed },
  })
}

/** Integer minor units (cents). */
export const money = (extra: Record<string, unknown> = {}) => integer({ defaultValue: 0, validation: { isRequired: true, min: 0 }, ...extra } as any)
/** Signed minor units (adjustments, deductions). */
export const signedMoney = () => integer({ defaultValue: 0, validation: { isRequired: true } })

/** Written by the server only (balances, snapshots, timestamps of transitions). */
export const serverText = () => text({ access: serverOnly, ui: { itemView: { fieldMode: 'read' }, createView: { fieldMode: 'hidden' } } })
export const serverTime = () => timestamp({ access: serverOnly, ui: { itemView: { fieldMode: 'read' }, createView: { fieldMode: 'hidden' } } })
export const serverInt = (defaultValue = 0) => integer({ defaultValue, access: serverOnly, ui: { itemView: { fieldMode: 'read' }, createView: { fieldMode: 'hidden' } } })
export const serverRel = (ref: string, many = false) => relationship({ ref, many, access: serverOnly, ui: { itemView: { fieldMode: 'read' }, createView: { fieldMode: 'hidden' } } } as any)

/** A nullable unique key column: set while a row is "active", null once final. Postgres allows many nulls. */
export const activeKey = () => text({
  isIndexed: 'unique',
  db: { isNullable: true },
  access: { read: () => true, create: () => false, update: () => false },
  ui: { itemView: { fieldMode: 'hidden' }, createView: { fieldMode: 'hidden' }, listView: { fieldMode: 'hidden' } },
})

/** Append Prisma model attributes (composite unique rules and indexes). */
export function prismaExtras(...lines: string[]) {
  return (schema: string) => schema.replace(/\}\s*$/, `${lines.map((line) => `  ${line}`).join('\n')}\n}`)
}

export const DELIVERY_MODES = ['in_centre', 'online', 'in_home'] as const
