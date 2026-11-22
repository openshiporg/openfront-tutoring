import test from 'node:test'
import assert from 'node:assert/strict'
import { platformNavigation } from '../features/platform/lib/navigation'

test('platform navigation: signed out has no links; owner has all 21 slices', () => {
  assert.deepEqual(platformNavigation(null), [])
  const links = platformNavigation({ canAccessDashboard: true, canManageSettings: true }).flatMap(g => g.items)
  assert.equal(links.length, 21)
  assert.equal(new Set(links.map(l => l.href)).size, 21)
})
test('platform navigation: tutor sees own work, not billing or settings', () => {
  const links = platformNavigation({ canAccessDashboard: true, isTutor: true, canMarkAttendance: true }).flatMap(g => g.items).map(l => l.href)
  assert.ok(links.includes('/dashboard/platform/my'))
  assert.ok(!links.includes('/dashboard/platform/billing'))
  assert.ok(!links.includes('/dashboard/platform/settings'))
})
