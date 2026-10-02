import { useEffect, useState } from 'react'
import type { Session as AuthSession } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'
import './AuthGate.css'

interface AuthGateProps {
  children: (session: AuthSession) => React.ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return <div className="auth-loading" />
  }

  if (!session) {
    return <SignInScreen />
  }

  return <>{children(session)}</>
}

function SignInScreen() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  async function sendLink(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setError('')
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })
    if (error) {
      setStatus('error')
      setError(error.message)
      return
    }
    setStatus('sent')
  }

  return (
    <div className="sign-in-screen">
      <h1 className="sign-in-screen__title">Conference Capture</h1>
      {status === 'sent' ? (
        <p className="sign-in-screen__sent">
          Check <strong>{email}</strong> for a sign-in link.
        </p>
      ) : (
        <form className="sign-in-screen__form" onSubmit={sendLink}>
          <p className="sign-in-screen__hint">Sign in to sync your sessions across devices.</p>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="sign-in-screen__input"
          />
          <button type="submit" className="sign-in-screen__submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Send sign-in link'}
          </button>
          {status === 'error' && <p className="sign-in-screen__error">{error}</p>}
        </form>
      )}
    </div>
  )
}
