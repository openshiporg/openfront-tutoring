import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pill, selectClass } from '@/features/platform/lib/ui'

/** Plain GET form: the period and location live in the URL, so a report can be shared. */
export function ReportFilters({ from, to, locationId, locations }: { from: string; to: string; locationId: string; locations: Array<{ id: string; name: string }> }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5"><Label htmlFor="r-from">From</Label><Input id="r-from" type="date" name="from" defaultValue={from} className="w-40" /></div>
      <div className="grid gap-1.5"><Label htmlFor="r-to">To</Label><Input id="r-to" type="date" name="to" defaultValue={to} className="w-40" /></div>
      {locations.length > 1 || locationId ? (
        <div className="grid gap-1.5">
          <Label htmlFor="r-loc">Location</Label>
          <select id="r-loc" name="location" defaultValue={locationId} className={`${selectClass} w-56`}>
            <option value="">All my locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      ) : null}
      <Pill type="submit" variant="primary">Show</Pill>
    </form>
  )
}
