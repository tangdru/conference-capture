import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { viewingHtml } from '../deck'
import { APP_SCHEME, fetchSharedHtml, lookupShared, saveShare } from '../sharing'
import { MESSAGES, errorMessage } from '../networkError'
import './SharedDeckPage.css'

/** A shared presentation, opened from its link (the website with ?p=<token>)
 * in any browser, with no sign-in. Someone signed in to Conference Capture
 * here can add it to their sessions; on an iPhone the page offers to open it
 * in the app instead. */
export function SharedDeckPage({ token }: { token: string }) {
  const [title, setTitle] = useState('')
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [added, setAdded] = useState(false)
  const iPhone = /iPhone|iPad|iPod/.test(navigator.userAgent)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null)).catch(() => {})
    void (async () => {
      try {
        const deck = (await lookupShared([token])).get(token)
        if (!deck) {
          setError(MESSAGES.notShared)
          return
        }
        setTitle(deck.title)
        document.title = deck.title || 'Shared presentation'
        setHtml(viewingHtml(await fetchSharedHtml(deck)))
      } catch (err) {
        setError(errorMessage(err))
      }
    })()
  }, [token])

  async function add() {
    if (!userId) return
    try {
      await saveShare(userId, token)
      setAdded(true)
      // On to the sessions, on this same site.
      window.location.href = window.location.origin + window.location.pathname
    } catch (err) {
      setError(errorMessage(err) || MESSAGES.unknown)
    }
  }

  return (
    <div className="shared-deck">
      <div className="shared-deck__bar">
        <span className="shared-deck__title">{title || 'Shared presentation'}</span>
        {userId ? (
          <button className="shared-deck__action" onClick={add} disabled={added}>
            {added ? 'Added' : 'Add to my sessions'}
          </button>
        ) : iPhone ? (
          <a className="shared-deck__action" href={`${APP_SCHEME}://shared/${encodeURIComponent(token)}`}>
            Open in app
          </a>
        ) : null}
      </div>
      {error ? (
        <p className="shared-deck__message">{error}</p>
      ) : html === null ? (
        <p className="shared-deck__message">Loading…</p>
      ) : (
        <iframe
          className="shared-deck__frame"
          title={title}
          srcDoc={html}
          // Its scripts run (charts, the chapter bar); its links open in a new tab.
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        />
      )}
    </div>
  )
}
