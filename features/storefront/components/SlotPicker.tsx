'use client'

import { dateLong, dayKey, time, tzLabel } from '../lib/format'

export type Slot = { startsAt: string; endsAt: string; tutorId: string; tutorName: string }

/** Real slots grouped by local day. The value is "<startsAt>|<tutorId>". */
export function SlotPicker({ slots, timezone, value, onChange, name = 'slot', limitDays = 7 }: { slots: Slot[]; timezone: string; value: string; onChange: (v: string) => void; name?: string; limitDays?: number }) {
  const days = new Map<string, Slot[]>()
  for (const s of slots) {
    const k = dayKey(s.startsAt, timezone)
    if (!days.has(k)) days.set(k, [])
    days.get(k)!.push(s)
  }
  const list = Array.from(days.entries()).slice(0, limitDays)
  return (
    <div>
      <p className="bp-small bp-muted" style={{ marginBottom: 10 }}>Times in {tzLabel(timezone)}.</p>
      {list.map(([k, daySlots]) => (
        <div className="bp-day" key={k}>
          <h4>{dateLong(daySlots[0].startsAt, timezone)}</h4>
          <div className="bp-slots" role="radiogroup" aria-label={dateLong(daySlots[0].startsAt, timezone)}>
            {daySlots.map((s) => {
              const v = `${s.startsAt}|${s.tutorId}`
              return (
                <label className="bp-choice" key={v}>
                  <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
                  <span>{time(s.startsAt, timezone)}</span>
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
