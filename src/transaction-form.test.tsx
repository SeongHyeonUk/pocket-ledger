// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { TransactionForm } from './transaction-form'
import { saveRecord } from './store'

vi.mock('./store', () => ({ saveRecord: vi.fn(async () => {}) }))
afterEach(cleanup)

test('거래 등록과 빠른 금액 입력은 검증된 정수 원을 저장한다', async () => {
  const close = vi.fn()
  const write = async (pending: Promise<void>) => { await pending; return true }
  render(<TransactionForm uid="alice" subscriptions={[]} goals={[]} close={close} write={write} />)
  fireEvent.change(screen.getByLabelText('거래명'), { target: { value: '점심' } })
  fireEvent.click(screen.getByRole('button', { name: '5,000원' }))
  fireEvent.click(screen.getByRole('button', { name: '저장' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(saveRecord).toHaveBeenCalledWith('alice', 'transactions', expect.objectContaining({
    amount: 5000, name: '점심', type: 'expense',
  }), expect.any(String), undefined)
})

test('거절된 서버 쓰기는 입력값을 유지한다', async () => {
  const close = vi.fn()
  render(<TransactionForm uid="alice" subscriptions={[]} goals={[]} close={close} write={async () => false} />)
  fireEvent.change(screen.getByLabelText('거래명'), { target: { value: '교통' } })
  fireEvent.click(screen.getByRole('button', { name: '1,000원' }))
  fireEvent.click(screen.getByRole('button', { name: '저장' }))
  expect((await screen.findByRole('alert')).textContent).toContain('서버가 이 변경을 받지 못했습니다')
  expect((screen.getByLabelText('거래명') as HTMLInputElement).value).toBe('교통')
  expect(close).not.toHaveBeenCalled()
})
