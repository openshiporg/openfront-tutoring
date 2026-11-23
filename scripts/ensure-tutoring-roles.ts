/** Non-destructive role-only provisioning. Does not load catalogue/history or change existing role permissions. */
import { PrismaClient } from '@prisma/client'
import { ensureRoles } from '../features/keystone/lib/seed/history'
async function main() {
  const prisma = new PrismaClient()
  try {
    await ensureRoles(prisma)
    const tutor = await prisma.role.findFirst({ where: { isTutor: true, canManageSettings: false }, select: { id: true, name: true } })
    if (!tutor) throw new Error('The existing Tutor role has incompatible permissions; review it before assigning users.')
    console.log(JSON.stringify({ provisioned: true, tutorRoleId: tutor.id, tutorRoleName: tutor.name }))
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
