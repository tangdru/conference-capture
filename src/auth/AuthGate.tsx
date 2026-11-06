import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import type { Session as AuthSession } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'
import { EmailCodeForm, type CodeType } from './EmailCodeForm'
import './AuthGate.css'

const SIGNED_OUT_KEY = 'cc-signed-out'

function wasSignedOut(): boolean {
  return localStorage.getItem(SIGNED_OUT_KEY) === '1'
}

function clearSignedOut() {
  localStorage.removeItem(SIGNED_OUT_KEY)
}

export function signOut() {
  localStorage.setItem(SIGNED_OUT_KEY, '1')
  return supabase.auth.signOut()
}

interface AuthGateProps {
  children: (session: AuthSession) => React.ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined)
  const [quickSignInError, setQuickSignInError] = useState('')

  async function startAsGuest() {
    clearSignedOut()
    const { data: anon, error } = await supabase.auth.signInAnonymously()
    if (error) setQuickSignInError(error.message)
    setSession(anon.session)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      // Someone who signed out wants to sign back in. A new blank account here
      // would look like their sessions had vanished.
      if (data.session || !Capacitor.isNativePlatform() || wasSignedOut()) {
        setSession(data.session)
        return
      }
      // First launch: start straight away with a no-email account. Home offers
      // Add email, which keeps this same account.
      await startAsGuest()
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return <div className="auth-loading" />
  }

  if (!session) {
    return (
      <SignInScreen
        notice={quickSignInError && `Quick sign-in failed: ${quickSignInError}`}
        onGuest={Capacitor.isNativePlatform() ? startAsGuest : undefined}
      />
    )
  }

  return <>{children(session)}</>
}

function SignInScreen({ notice, onGuest }: { notice?: string; onGuest?: () => void }) {
  async function send(email: string): Promise<CodeType> {
    const emailRedirectTo = Capacitor.isNativePlatform()
      ? undefined
      : `${window.location.origin}${import.meta.env.BASE_URL}`
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })
    if (error) throw error
    return 'email'
  }

  return (
    <div className="sign-in-screen">
      <h1 className="sign-in-screen__title">Conference Capture</h1>
      {notice && <p className="sign-in-screen__error">{notice}</p>}
      <EmailCodeForm hint="Sign in to get back to your sessions." send={send} onDone={clearSignedOut} />
      {onGuest && (
        <div className="sign-in-screen__links">
          <button type="button" className="sign-in-screen__link" onClick={onGuest}>
            Start without an account
          </button>
        </div>
      )}
    </div>
  )
}
