import { NotFoundException } from '@nestjs/common'
import { MinioStorageProvider } from './minio.provider'

/**
 * Unit coverage for the S3/MinIO provider. The `minio` Client is
 * replaced by an in-memory mock so these run without a live server — they pin
 * the object-path scheme, partner attribution and the read/delete path parsing.
 */
function makeConfig() {
  return {
    get: (key: string) =>
      key === 'storage.minio'
        ? { endpoint: 'localhost', port: 9000, secure: false, accessKey: 'k', secretKey: 's' }
        : undefined,
  } as any
}

function makeProvider(prisma: any) {
  const provider = new MinioStorageProvider(makeConfig(), prisma)
  const client = {
    bucketExists: jest.fn().mockResolvedValue(true),
    makeBucket: jest.fn().mockResolvedValue(undefined),
    setBucketVersioning: jest.fn().mockResolvedValue(undefined),
    putObject: jest.fn().mockResolvedValue({ etag: 'e', versionId: 'v-1' }),
    getObject: jest.fn().mockResolvedValue('STREAM'),
    removeObject: jest.fn().mockResolvedValue(undefined),
  }
  ;(provider as any).client = client
  ;(provider as any).ready = true
  return { provider, client }
}

describe('MinioStorageProvider', () => {
  it('writes node uploads to the v{version} path and persists partnerId', async () => {
    const created: any[] = []
    const prisma = {
      fileRecord: {
        findMany: jest.fn().mockResolvedValue([]), // no prior versions → v1
        create: jest.fn().mockImplementation(({ data }: any) => {
          created.push(data)
          return data
        }),
      },
    }
    const { provider, client } = makeProvider(prisma)

    await provider.save({
      bucket: 'digital-thread',
      iterationId: 'iter-1',
      nodeId: 'node-7',
      nodeOutputId: 'out-a',
      nodeLabel: 'NDI',
      filename: 'scan.cscan',
      data: Buffer.from('hello'),
      contentType: 'application/octet-stream',
      uploadType: 'MANUAL',
      sourceInfo: 'User: x',
      partnerId: 'p-cai',
    })

    const expectedObject = 'iter-1/nodes/node-7/out-a/v1/scan.cscan'
    expect(client.putObject).toHaveBeenCalledWith(
      'digital-thread',
      expectedObject,
      expect.any(Buffer),
      5,
      { 'Content-Type': 'application/octet-stream' },
    )
    expect(created[0].path).toBe(`digital-thread/${expectedObject}`)
    expect(created[0].version).toBe(1)
    expect(created[0].partnerId).toBe('p-cai') // regression: was dropped on MinIO
    // sha256('hello')
    expect(created[0].contentHash).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
  })

  it('increments the version from the latest existing record', async () => {
    const prisma = {
      fileRecord: {
        findMany: jest.fn().mockResolvedValue([{ version: 3 }]),
        create: jest.fn().mockImplementation(({ data }: any) => data),
      },
    }
    const { provider, client } = makeProvider(prisma)
    await provider.save({
      bucket: 'digital-thread', iterationId: 'i', nodeId: 'n', nodeOutputId: 'o',
      nodeLabel: 'l', filename: 'f.bin', data: Buffer.from('x'),
      contentType: 'application/octet-stream', uploadType: 'AUTOMATIC', sourceInfo: 's',
    })
    expect(client.putObject).toHaveBeenCalledWith(
      'digital-thread', 'i/nodes/n/o/v4/f.bin', expect.any(Buffer), 1, expect.anything(),
    )
  })

  it('stores raw uploads under raw/{uuid}/ with partner attribution', async () => {
    const created: any[] = []
    const prisma = {
      fileRecord: { create: jest.fn().mockImplementation(({ data }: any) => { created.push(data); return data }) },
    }
    const { provider, client } = makeProvider(prisma)
    await provider.saveRaw({
      bucket: 'digital-thread', filename: 'note.txt', data: Buffer.from('y'),
      contentType: 'text/plain', partnerId: 'p-aim', sourceInfo: 'User: a',
    })
    const obj = client.putObject.mock.calls[0][1] as string
    expect(obj).toMatch(/^raw\/[0-9a-f-]{36}\/note\.txt$/)
    expect(created[0].path).toBe(`digital-thread/${obj}`)
    expect(created[0].attachmentKind).toBe('RAW')
    expect(created[0].partnerId).toBe('p-aim')
  })

  it('readStream parses bucket/object and forwards a real versionId', async () => {
    const { provider, client } = makeProvider({})
    await provider.readStream('digital-thread/iter-1/nodes/n/o/v1/scan.cscan?versionId=abc')
    expect(client.getObject).toHaveBeenCalledWith(
      'digital-thread', 'iter-1/nodes/n/o/v1/scan.cscan', { versionId: 'abc' },
    )
  })

  it('readStream ignores the legacy ?versionId=undefined artifact', async () => {
    const { provider, client } = makeProvider({})
    await provider.readStream('digital-thread/iter-1/nodes/n/o/v1/scan.cscan?versionId=undefined')
    expect(client.getObject).toHaveBeenCalledWith(
      'digital-thread', 'iter-1/nodes/n/o/v1/scan.cscan', {},
    )
  })

  it('readStream converts a missing object into a 404 NotFoundException', async () => {
    const { provider, client } = makeProvider({})
    client.getObject.mockRejectedValueOnce(new Error('NoSuchKey'))
    await expect(provider.readStream('digital-thread/missing/file.bin')).rejects.toThrow(NotFoundException)
  })

  it('delete parses the path and removes the object', async () => {
    const { provider, client } = makeProvider({})
    await provider.delete('digital-thread/iter-1/nodes/n/o/v1/scan.cscan')
    expect(client.removeObject).toHaveBeenCalledWith('digital-thread', 'iter-1/nodes/n/o/v1/scan.cscan', {})
  })
})
