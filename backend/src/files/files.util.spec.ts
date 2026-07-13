import { BadRequestException } from '@nestjs/common'
import { sanitizeFilename, assertAllowedExtension } from './files.util'

describe('sanitizeFilename', () => {
  it('keeps a normal filename unchanged', () => {
    expect(sanitizeFilename('design_v3.step')).toBe('design_v3.step')
  })

  it('strips a relative path-traversal prefix', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd')
  })

  it('strips a POSIX absolute path', () => {
    expect(sanitizeFilename('/var/data/report.pdf')).toBe('report.pdf')
  })

  it('strips a Windows path with backslashes', () => {
    expect(sanitizeFilename('..\\..\\windows\\system32\\evil.dll')).toBe('evil.dll')
  })

  it('removes filesystem-illegal characters', () => {
    expect(sanitizeFilename('re:po*rt?.pdf')).toBe('report.pdf')
  })

  it('rejects an empty or whitespace-only filename', () => {
    expect(() => sanitizeFilename('')).toThrow(BadRequestException)
    expect(() => sanitizeFilename('   ')).toThrow(BadRequestException)
  })

  it('rejects a non-string filename', () => {
    expect(() => sanitizeFilename(undefined)).toThrow(BadRequestException)
    expect(() => sanitizeFilename(42)).toThrow(BadRequestException)
  })

  it('rejects names that reduce to a dot segment', () => {
    expect(() => sanitizeFilename('..')).toThrow(BadRequestException)
  })

  it('truncates an over-long filename and keeps the extension', () => {
    const result = sanitizeFilename('a'.repeat(300) + '.txt')
    expect(result.length).toBeLessThanOrEqual(200)
    expect(result.endsWith('.txt')).toBe(true)
  })
})

describe('assertAllowedExtension', () => {
  it('allows engineering-data files', () => {
    expect(() => assertAllowedExtension('panel.step')).not.toThrow()
    expect(() => assertAllowedExtension('report.pdf')).not.toThrow()
    expect(() => assertAllowedExtension('material_card.json')).not.toThrow()
  })

  it('rejects executable / script files', () => {
    expect(() => assertAllowedExtension('malware.exe')).toThrow(BadRequestException)
    expect(() => assertAllowedExtension('script.sh')).toThrow(BadRequestException)
    expect(() => assertAllowedExtension('macro.bat')).toThrow(BadRequestException)
  })

  it('is case-insensitive', () => {
    expect(() => assertAllowedExtension('Malware.EXE')).toThrow(BadRequestException)
  })
})
