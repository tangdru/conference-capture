import { supabase } from '../supabaseClient'
import { EmailCodeForm, type CodeType } from './EmailCodeForm'
import './AuthGate.css'

interface AddEmailSheetProps {
  sessionCount: number
  onClose: () => void
}

// Turns a no-email account into a real one. Adding the email keeps the same
// account, so every session and photo stays exactly where it is.
export function AddEmailSheet({ sessionCount, onClose }: AddEmailSheetProps) {
  async function send(email: string): Promise<CodeType> {
    const { error } = await supabase.auth.updateUser({ email })
    if (!error) return 'email_change'
    if (error.code !== 'email_exists') throw error
    // The email already has an account. Moving to it is only safe when this
    // phone has nothing to leave behind.
    if (sessionCount > 0) {
      throw new Error('That email already has an account. Use a different email so this phone’s sessions aren’t left behind.')
    }
    const { error: signInError } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    if (signInError) throw signInError
    return 'email'
  }

  return (
    <div className="sign-in-screen add-email-sheet" role="dialog" aria-modal="true" aria-label="Add your email">
      <button className="add-email-sheet__close" onClick={onClose}>
        Cancel
      </button>
      <h1 className="sign-in-screen__title">Add your email</h1>
      <EmailCodeForm
        hint="Then you can get back to your sessions if you sign out or change phones. If you already have an account, use that email."
        send={send}
        onDone={onClose}
      />
    </div>
  )
}
