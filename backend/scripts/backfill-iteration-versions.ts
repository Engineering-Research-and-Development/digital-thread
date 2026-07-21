/**
 * One-shot backfill — creates the missing StateMachineVersion snapshot for
 * every StateMachine whose head version has no row (seeded machines and any
 * machine predating the versioning model), then binds legacy iterations
 * (stateMachineVersionId == null) to their machine's latest version.
 * Run: npm run migrate:versions
 * Idempotent: safe to re-run at any time.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔧 Backfilling state-machine version snapshots...\n')

  const machines = await prisma.stateMachine.findMany({
    include: { versions: { select: { versionNumber: true } } },
  })

  let createdVersions = 0
  for (const m of machines) {
    const hasHead = m.versions.some((v) => v.versionNumber === m.latestVersion)
    if (hasHead) continue
    await prisma.stateMachineVersion.create({
      data: {
        stateMachineId: m.id,
        versionNumber: m.latestVersion,
        versionLabel: m.version,
        nodesJson: m.nodesJson,
        edgesJson: m.edgesJson,
        groupsJson: m.groupsJson,
        createdById: m.createdById,
      },
    })
    createdVersions++
    console.log(`✅ ${m.name}: created snapshot v${m.latestVersion}`)
  }
  if (createdVersions === 0) {
    console.log('✅ All state machines already have their head version snapshot')
  }

  // Bind legacy iterations to the latest version of their machine — the same
  // choice iterations.service makes when creating a new iteration.
  const orphans = await prisma.iteration.findMany({
    where: { stateMachineVersionId: null },
    select: { id: true, displayId: true, machineId: true },
  })

  let bound = 0
  for (const it of orphans) {
    const latest = await prisma.stateMachineVersion.findFirst({
      where: { stateMachineId: it.machineId },
      orderBy: { versionNumber: 'desc' },
      select: { id: true, versionNumber: true },
    })
    if (!latest) {
      console.warn(`⚠️  Iteration ${it.displayId}: machine ${it.machineId} has no versions — skipped`)
      continue
    }
    await prisma.iteration.update({
      where: { id: it.id },
      data: { stateMachineVersionId: latest.id },
    })
    bound++
    console.log(`✅ Iteration ${it.displayId} → bound to v${latest.versionNumber}`)
  }
  if (orphans.length === 0) {
    console.log('✅ No legacy iterations to bind')
  }

  console.log(
    `\n🎉 Backfill complete: ${createdVersions} snapshot(s) created, ${bound} iteration(s) bound.`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
