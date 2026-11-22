import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { DataTable, Empty, PageHeader, StatusCell, Td } from '@/features/platform/lib/ui'
import { listLocations } from '../actions/locations'
import { LocationDrawer } from '../components/LocationForms'
import { WEEKDAYS } from '../lib/hours'

const breadcrumbs = [
  { type: 'link' as const, label: 'Dashboard', href: basePath },
  { type: 'page' as const, label: 'Platform' },
  { type: 'page' as const, label: 'Centres' },
]
const STATUS: Record<string, string> = { active: 'Open', coming_soon: 'Coming soon', closed: 'Closed' }

export default async function LocationsPage() {
  const res = await listLocations()
  const header = <PageHeader title="Centres" meta="Hours, rooms, closures and the staff at each centre." actions={<LocationDrawer />} />
  if (!res.ok) {
    return (
      <PageContainer title="Centres" header={header} breadcrumbs={breadcrumbs}>
        <div className="px-4 md:px-6"><Alert variant="destructive"><AlertDescription>{res.error}</AlertDescription></Alert></div>
      </PageContainer>
    )
  }
  const { locations } = res.data
  return (
    <PageContainer title="Centres" header={header} breadcrumbs={breadcrumbs}>
      <div className="grid gap-4 px-4 pb-10 md:px-6">
        {locations.length ? (
          <DataTable label="Locations" head={[{ label: 'Centre' }, { label: 'Open days' }, { label: 'Rooms', className: 'text-right' }, { label: 'Tutors', className: 'text-right' }, { label: 'Programmes', className: 'text-right' }, { label: 'Staff', className: 'text-right' }, { label: 'Status' }]}>
            {locations.map((l: any) => (
              <tr key={l.id} className="hover:bg-muted/40">
                <Td><Link href={`/dashboard/platform/locations/${l.id}`} className="font-medium underline-offset-4 hover:underline">{l.name}</Link><span className="block text-xs text-muted-foreground">{[l.city, l.region].filter(Boolean).join(', ')}{l.phone ? ` · ${l.phone}` : ''}</span></Td>
                <Td>{WEEKDAYS.filter((d) => l.openingHours?.[d]?.length).map((d) => d[0].toUpperCase() + d.slice(1)).join(' ') || 'No hours set'}</Td>
                <Td className="text-right tabular-nums">{l.roomsCount}</Td>
                <Td className="text-right tabular-nums">{l.tutorsCount}</Td>
                <Td className="text-right tabular-nums">{l.programsCount}</Td>
                <Td className="text-right tabular-nums">{l.membershipsCount}</Td>
                <Td><StatusCell tone={l.status === 'active' ? 'live' : l.status === 'coming_soon' ? 'wait' : 'off'}>{STATUS[l.status] ?? l.status}</StatusCell></Td>
              </tr>
            ))}
          </DataTable>
        ) : <Empty>No centres yet.</Empty>}
      </div>
    </PageContainer>
  )
}
