import { useState } from 'react'
import { supabase } from '../supabaseClient'

export type CodeType = 'email' | 'email_change'

/** Digits in the emailed code (Supabase Auth's OTP length). */
const CODE_LENGTH = 8

interface EmailCodeFormProps {
  hint: string
  // Sends the code and says which kind it was. Throws with a message to show.
  send: (email: string) => Promise<CodeType>
  onDone?: () => void
}

function readable(error: { code?: string; message: string }): string {
  if (error.code === 'over_email_send_rate_limit') {
    return 'Too many emails were sent just now. Wait a while, then try again.'
  }
  if (error.code === 'otp_expired') return 'That code didn’t work. Check it, or send a new one.'
  return error.message
}

// The app can't receive an emailed link (it opens Safari), so people type the
// code from the email instead.
export function EmailCodeForm({ hint, send, onDone }: EmailCodeFormProps) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeType, setCodeType] = useState<CodeType | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [codeFocused, setCodeFocused] = useState(false)

  async function sendCode() {
    setBusy(true)
    setError('')
    try {
      setCodeType(await send(email.trim()))
      setCode('')
    } catch (err) {
      setError(readable(err as { code?: string; message: string }))
    } finally {
      setBusy(false)
    }
  }

  async function verify(token: string) {
    if (!codeType || busy) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: codeType })
    setBusy(false)
    if (error) {
      setError(readable(error))
      return
    }
    onDone?.()
  }

  if (codeType) {
    return (
      <form
        className="sign-in-screen__form"
        onSubmit={(e) => {
          e.preventDefault()
          void verify(code)
        }}
      >
        <p className="sign-in-screen__hint">
          Enter the code we emailed to <strong>{email.trim()}</strong>.
        </p>
        {/* One real input (so paste and iOS's code autofill work) under a
            row of boxes, one per digit. */}
        <div className="code-boxes">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            aria-label={`${CODE_LENGTH}-digit code from your email`}
            maxLength={CODE_LENGTH}
            value={code}
            disabled={busy}
            onFocus={() => setCodeFocused(true)}
            onBlur={() => setCodeFocused(false)}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)
              setCode(digits)
              if (digits.length === CODE_LENGTH) void verify(digits)
            }}
            className="code-boxes__input"
          />
          {Array.from({ length: CODE_LENGTH }, (_, i) => {
            const active = codeFocused && i === Math.min(code.length, CODE_LENGTH - 1)
            return (
              <span
                key={i}
                aria-hidden="true"
                className={`code-boxes__box${code[i] ? ' code-boxes__box--filled' : ''}${active ? ' code-boxes__box--active' : ''}`}
              >
                {code[i] ?? ''}
              </span>
            )
          })}
        </div>
        <button type="submit" className="sign-in-screen__submit" disabled={busy || code.length < CODE_LENGTH}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
        {error && <p className="sign-in-screen__error">{error}</p>}
        <div className="sign-in-screen__links">
          <button type="button" className="sign-in-screen__link" disabled={busy} onClick={sendCode}>
            Send a new code
          </button>
          <button
            type="button"
            className="sign-in-screen__link"
            disabled={busy}
            onClick={() => {
              setCodeType(null)
              setError('')
            }}
          >
            Use a different email
          </button>
        </div>
      </form>
    )
  }

  return (
    <form
      className="sign-in-screen__form"
      onSubmit={(e) => {
        e.preventDefault()
        sendCode()
      }}
    >
      <p className="sign-in-screen__hint">{hint}</p>
      <input
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        aria-label="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="sign-in-screen__input"
      />
      <button type="submit" className="sign-in-screen__submit" disabled={busy}>
        {busy ? 'Sending…' : 'Email me a code'}
      </button>
      {error && <p className="sign-in-screen__error">{error}</p>}
    </form>
  )
}
