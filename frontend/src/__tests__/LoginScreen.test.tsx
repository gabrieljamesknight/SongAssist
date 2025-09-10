// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { LoginScreen } from '../components/LoginScreen'

describe('LoginScreen', () => {
  it('submits login when filled', () => {
    const onLogin = vi.fn()
    const onRegister = vi.fn()
    render(<LoginScreen onLogin={onLogin} onRegister={onRegister} isLoading={false} />)

    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: ' user ' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: ' pass ' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Login' }))

    expect(onLogin).toHaveBeenCalledWith('user', 'pass')
    expect(onRegister).not.toHaveBeenCalled()
  })

  it('toggles to register and submits register', () => {
    const onLogin = vi.fn()
    const onRegister = vi.fn()
    render(<LoginScreen onLogin={onLogin} onRegister={onRegister} isLoading={false} />)

    fireEvent.click(screen.getByText("Don't have an account? Register"))
    expect(screen.getByText('Create an Account')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Register' }))
    expect(onRegister).toHaveBeenCalledWith('alice', 'secret')
  })

  it('disables submit while loading', () => {
    render(<LoginScreen onLogin={() => {}} onRegister={() => {}} isLoading={true} />)
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled()
  })
})

