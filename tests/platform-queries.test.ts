import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildSchema, parse, validate } from 'graphql'
const schema = buildSchema(readFileSync('schema.graphql', 'utf8'))
for (const path of ['features/platform/today/actions/today.ts', 'features/platform/tasks/actions/tasks.ts', 'features/platform/matching/actions/matching.ts', 'features/platform/leads/actions/leads.ts', 'features/platform/assessments/actions/assessments.ts']) {
  test(`platform operations match generated schema: ${path}`, () => {
    const source = readFileSync(path, 'utf8')
    const operations = [...source.matchAll(/`((?:query|mutation)[\s\S]*?)`/g)]
    assert.ok(operations.length > 0)
    for (const [, operation] of operations.filter(([, op]) => !op.includes('${'))) assert.deepEqual(validate(schema, parse(operation)).map(e => e.message), [], operation)
  })
}
