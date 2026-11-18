import { expect, test, vi } from 'vitest'
import { csvCell, validateBackup } from './backup'

vi.mock('./store', () => ({ mergeBackup: vi.fn(), readBackup: vi.fn() }))

test('검증된 백업 문서만 변환하며 중복 ID를 거절한다', () => {
  const entry = { collection: 'savingsGoals', id: 'g1', values: { name: '저축', amount: 5000, memo: '' } }
  const file = { version: 1, exportedAt: '2026-11-18T00:00:00.000Z', entries: [entry] }
  expect(validateBackup(JSON.parse(JSON.stringify(file)))).toEqual([{ ...entry, deleted: false }])
  expect(() => validateBackup({ ...file, entries: [entry, entry] })).toThrow('중복')
  expect(() => validateBackup({ ...file, entries: [{ ...entry, values: { ...entry.values, amount: -1 } }] })).toThrow()
})

test('CSV는 한국어와 따옴표를 보존하고 수식으로 해석될 입력을 막는다', () => {
  expect(csvCell('교통 "정기권"')).toBe('"교통 ""정기권"""')
  expect(csvCell('=1+1')).toBe('"\'=1+1"')
  expect(csvCell(1000)).toBe('"1000"')
})
