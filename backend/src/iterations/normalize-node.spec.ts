/**
 * `work` (IDTA 02100 content) on the generic node model. US4 = node model.
 */
import { normalizeFlowNode, normalizeWorkDescription } from './normalize-node'

describe('normalizeFlowNode — work description (US4 node model)', () => {
  it('US4/AS1: keeps a well-formed `work` on any node kind and defaults every list to an array', () => {
    const node = normalizeFlowNode({
      id: 'n1', kind: 'TASK', name: 'Job',
      work: { hierarchyScope: 'Cell A', workType: 'maintenance', duration: '2', durationUnit: 'h', parameters: [{ id: 'p', value: 1 }] },
    })
    expect(node.work).toEqual({
      hierarchyScope: 'Cell A', workType: 'maintenance', duration: '2', durationUnit: 'h',
      parameters: [{ id: 'p', description: undefined, value: '1', valueUnit: undefined }],
      personnel: [], equipment: [], physicalAssets: [], materials: [],
    })
    expect(normalizeFlowNode({ id: 'g', kind: 'GATEWAY', work: { workType: 'quality' } }).work?.workType).toBe('quality')
    expect(normalizeFlowNode({ id: 'n2', kind: 'TASK' }).work).toBeUndefined()
  })

  it('US4/AS2: drops entries without a string id, blanks optional strings, ignores unknown work types', () => {
    const work = normalizeWorkDescription({
      workType: 'demolition',
      parameters: [{ id: '', value: 'x' }, { value: 'no id' }, null, 'str', { id: 'ok', value: 'v', valueUnit: '' }],
      personnel: [{ id: 42 }, { id: 'p1', classRef: '', use: 'operation', properties: [{ id: 'q', value: 'v' }, { value: 'dropped' }] }],
      equipment: 'not a list',
      materials: [{ id: 'm1', assemblyType: 'PHYSICAL', assemblyRelationship: 'transient' }],
    })
    expect(work.workType).toBeUndefined()
    expect(work.parameters).toEqual([{ id: 'ok', description: undefined, value: 'v', valueUnit: undefined }])
    expect(work.personnel).toEqual([{
      id: 'p1', classRef: undefined, objectRef: undefined, description: undefined, use: 'operation',
      quantity: undefined, quantityUnit: undefined,
      properties: [{ id: 'q', description: undefined, value: 'v', valueUnit: undefined, quantity: undefined, quantityUnit: undefined }],
    }])
    expect(work.equipment).toEqual([])
    expect(work.materials![0]).toMatchObject({ id: 'm1', assemblyType: undefined, assemblyRelationship: 'transient' })
    // assembly fields are material-only
    expect('assemblyType' in work.personnel![0]).toBe(false)
  })

  it('US4/AS3: never throws on garbage', () => {
    for (const garbage of [null, 'work', 7, [], { parameters: {} }, { personnel: [[]] }]) {
      expect(() => normalizeWorkDescription(garbage)).not.toThrow()
      expect(normalizeWorkDescription(garbage)).toMatchObject({ parameters: [], personnel: [], equipment: [], physicalAssets: [], materials: [] })
    }
    expect(normalizeFlowNode({ id: 'n', work: 'garbage' }).work).toBeUndefined()
    expect(normalizeFlowNode({ id: 'n', work: [] }).work).toMatchObject({ parameters: [] })
  })
})
