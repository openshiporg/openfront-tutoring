import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { DataTable, PageHeader, Readouts, Section, Td } from '@/features/platform/lib/ui'
import { getReports, type Reports } from '../actions/reports'
import { ReportFilters } from '../components/ReportFilters'

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> }

const breadcrumbs = [
  { type: 'link' as const, label: 'Dashboard', href: basePath },
  { type: 'page' as const, label: 'Platform' },
  { type: 'page' as const, label: 'Reports' },
]

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Default period: the current calendar month (UTC), to = first day of next month. */
function defaultPeriod() {
  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100)
}
const rate = (v: number | null) => (v == null ? '—' : `${v}%`)
const hours = (minutes: number) => `${Math.round(minutes / 6) / 10} h`
const KIND: Record<string, string> = { membership_period: 'Membership credit', package: 'Package hours', make_up: 'Make-up credit', goodwill: 'Goodwill credit', pay_as_you_go: 'Pay as you go' }

export default async function ReportsPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : {}
  const d = defaultPeriod()
  const from = isDay(one(sp.from)) ? one(sp.from) : d.from
  // The form's "to" is inclusive for people; the query takes an exclusive end.
  const toInclusive = isDay(one(sp.to)) ? one(sp.to) : new Date(new Date(`${d.to}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10)
  const toExclusive = new Date(new Date(`${toInclusive}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10)
  const locationId = one(sp.location) || null
  const res = await getReports({ from, to: toExclusive, locationId })
  const header = <PageHeader title="Reports" meta={res.ok ? `${from} to ${toInclusive}${res.data.scope === 'all' ? ', every location' : res.data.scope === 'mine' ? ', your locations' : ''}` : undefined} />

  if (!res.ok) {
    return (
      <PageContainer title="Reports" header={header} breadcrumbs={breadcrumbs}>
        <div className="grid gap-4 px-4 md:px-6">
          <Alert variant="destructive"><AlertDescription>{res.error}</AlertDescription></Alert>
        </div>
      </PageContainer>
    )
  }
  const r: Reports = res.data
  const c = r.currency
  const locName = (id: string | null) => (id ? r.locations.find((l) => l.id === id)?.name ?? 'Other' : 'Online and in-home')

  return (
    <PageContainer title="Reports" header={header} breadcrumbs={breadcrumbs}>
      <div className="grid gap-8 px-4 pb-10 md:px-6">
        <ReportFilters from={from} to={toInclusive} locationId={locationId ?? ''} locations={r.locationChoices} />

        <Readouts items={[
          { label: 'Net revenue', value: money(r.revenue.net, c) },
          { label: 'Active students', value: r.activeStudents },
          { label: 'Attendance', value: rate(r.attendance.rate) },
          { label: 'Churn', value: rate(r.churn.rate) },
          { label: 'Credit liability', value: money(r.liability.cents, c) },
          { label: 'Tutor utilisation', value: rate(r.utilisation.rate) },
          { label: 'Lead conversion', value: rate(r.leads.rate) },
        ]} />

        <Section title="By location" count={r.byLocation.length}>
          <DataTable label="Reports by location" head={[
            { label: 'Location' }, { label: 'Net revenue', className: 'text-right' }, { label: 'Active students', className: 'text-right' },
            { label: 'Attendance', className: 'text-right' }, { label: 'Churn', className: 'text-right' }, { label: 'Credit liability', className: 'text-right' },
            { label: 'Utilisation', className: 'text-right' }, { label: 'Lead conversion', className: 'text-right' },
          ]}>
            {r.byLocation.map((l) => (
              <tr key={l.locationId ?? 'none'}>
                <Td className="font-medium">{l.name}</Td>
                <Td className="text-right tabular-nums">{money(l.revenue, c)}</Td>
                <Td className="text-right tabular-nums">{l.activeStudents}</Td>
                <Td className="text-right tabular-nums">{rate(l.attendanceRate)}</Td>
                <Td className="text-right tabular-nums">{rate(l.churnRate)}</Td>
                <Td className="text-right tabular-nums">{money(l.liabilityCents, c)}<span className="block text-xs text-muted-foreground">{hours(l.liabilityMinutes)}</span></Td>
                <Td className="text-right tabular-nums">{rate(l.utilisation)}</Td>
                <Td className="text-right tabular-nums">{rate(l.leadConversion)}</Td>
              </tr>
            ))}
          </DataTable>
        </Section>

        <div className="grid gap-8 lg:grid-cols-2">
          <Section title="Revenue by month">
            {r.revenue.byMonth.length ? (
              <DataTable label="Revenue by month and location" head={[{ label: 'Month' }, { label: 'Location' }, { label: 'Taken', className: 'text-right' }, { label: 'Refunded', className: 'text-right' }, { label: 'Net', className: 'text-right' }]}>
                {r.revenue.byMonth.map((m) => (
                  <tr key={`${m.month}-${m.locationId ?? 'none'}`}>
                    <Td>{new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</Td>
                    <Td>{locName(m.locationId)}</Td>
                    <Td className="text-right tabular-nums">{money(m.gross, c)}</Td>
                    <Td className="text-right tabular-nums">{m.refunds ? `−${money(m.refunds, c)}` : '—'}</Td>
                    <Td className="text-right font-medium tabular-nums">{money(m.net, c)}</Td>
                  </tr>
                ))}
              </DataTable>
            ) : <p className="py-4 text-sm text-muted-foreground">No payments in this period.</p>}
            <Definition text={r.definitions.revenue} />
          </Section>

          <Section title="Credit outstanding">
            <DataTable label="Credit outstanding by kind" head={[{ label: 'Kind' }, { label: 'Hours', className: 'text-right' }, { label: 'Value', className: 'text-right' }]}>
              {Object.entries(r.liability.byKind).map(([k, v]) => (
                <tr key={k}>
                  <Td>{KIND[k] ?? k}</Td>
                  <Td className="text-right tabular-nums">{hours(v.minutes)}</Td>
                  <Td className="text-right tabular-nums">{v.cents == null ? 'Not bought' : money(v.cents, c)}</Td>
                </tr>
              ))}
              {!Object.keys(r.liability.byKind).length ? <tr><Td colSpan={3} className="text-muted-foreground">No unused credit.</Td></tr> : null}
            </DataTable>
            <Definition text={r.definitions.liability} />
          </Section>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <Section title="Attendance and churn">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Present (attended or late)</dt><dd className="tabular-nums">{r.attendance.present} of {r.attendance.finished}</dd>
              <dt className="text-muted-foreground">Memberships running at start</dt><dd className="tabular-nums">{r.churn.atStart}</dd>
              <dt className="text-muted-foreground">Ended in the period</dt><dd className="tabular-nums">{r.churn.ended}</dd>
            </dl>
            <Definition text={r.definitions.attendance} />
            <Definition text={r.definitions.churn} />
          </Section>
          <Section title="Tutors and enquiries">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Taught</dt><dd className="tabular-nums">{hours(r.utilisation.taughtMinutes)}</dd>
              <dt className="text-muted-foreground">Offered (availability)</dt><dd className="tabular-nums">{hours(r.utilisation.offeredMinutes)}</dd>
              <dt className="text-muted-foreground">Enquiries created</dt><dd className="tabular-nums">{r.leads.created}</dd>
              <dt className="text-muted-foreground">Assessed or further</dt><dd className="tabular-nums">{r.leads.assessedOrLater}</dd>
              <dt className="text-muted-foreground">Enrolled</dt><dd className="tabular-nums">{r.leads.enrolled}</dd>
              <dt className="text-muted-foreground">Lost</dt><dd className="tabular-nums">{r.leads.lost}</dd>
            </dl>
            <Definition text={r.definitions.utilisation} />
            <Definition text={r.definitions.leads} />
            <Definition text={r.definitions.activeStudents} />
          </Section>
        </div>
      </div>
    </PageContainer>
  )
}

function Definition({ text }: { text: string }) {
  return <p className="mt-3 text-[13px] leading-5 text-muted-foreground">{text}</p>
}
