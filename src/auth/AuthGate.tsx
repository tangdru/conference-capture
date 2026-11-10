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

/** The sign-in saved on this device, read straight from storage. Asking
 * Supabase for it waits on the network whenever the token has expired (it
 * renews it first) -- a blank screen for seconds on a slow connection, and
 * no way in at all offline. The saved one is enough to show the sessions
 * saved on the phone; Supabase renews it before the first request. */
function savedSession(): AuthSession | undefined {
  if (wasSignedOut()) return undefined
  try {
    const key = Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k))
    const saved = key ? (JSON.parse(localStorage.getItem(key) ?? 'null') as AuthSession | null) : null
    return saved?.access_token && saved.refresh_token && saved.user?.id ? saved : undefined
  } catch {
    return undefined
  }
}

interface AuthGateProps {
  children: (session: AuthSession) => React.ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<AuthSession | null | undefined>(savedSession)
  const [quickSignInError, setQuickSignInError] = useState('')

  async function startAsGuest() {
    clearSignedOut()
    const { data: anon, error } = await supabase.auth.signInAnonymously()
    if (error) setQuickSignInError(error.message)
    setSession(anon.session)
  }

  useEffect(() => {
    const saved = savedSession()
    supabase.auth.getSession().then(async ({ data, error }) => {
      // Couldn't renew the saved sign-in (no signal): keep using it. A
      // sign-in that's really over arrives as SIGNED_OUT below.
      if (!data.session && error && saved) return
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
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Only an actual sign-out ends the saved sign-in, not a failed renewal.
      if (newSession || event === 'SIGNED_OUT' || !saved) setSession(newSession)
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
