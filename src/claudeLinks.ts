// Links that hand work to Claude's own app (iPhone, desktop or claude.ai),
// where it runs on the user's Claude plan and reaches their sessions through
// the Conference Capture connector (menu > Use in Claude; the `mcp` function).
//
// Both links open the Claude app on iPhone (claude.ai lists them in its
// apple-app-site-association) and claude.ai elsewhere:
//  - /new?q= opens a new chat with the text typed in, not yet sent;
//  - /customize/connectors?modal=add-custom-connector&name=&url= opens the
//    Add custom connector form with both fields filled in. The modal param
//    is what makes iOS hand it to the app.
import { Capacitor } from '@capacitor/core'

export const CONNECTOR_NAME = 'Conference Capture'

export function addConnectorUrl(connectorUrl: string): string {
  return `https://claude.ai/customize/connectors?modal=add-custom-connector&name=${encodeURIComponent(CONNECTOR_NAME)}&url=${encodeURIComponent(connectorUrl)}`
}

export function newChatUrl(text: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(text)}`
}

/** What the session list's chat button starts with. */
export function askAllPrompt(): string {
  return 'Using my Conference Capture sessions, '
}

/** "Ask Claude about this talk" from inside a session. */
export function askSessionPrompt(title: string, sessionId: string): string {
  return `Using Conference Capture, about my session "${title}" (session ${sessionId}): `
}

/** Make in Claude: Sparkle's presentation, written in Claude and saved back. */
export function makePresentationPrompt(title: string, sessionId: string): string {
  return `Using Conference Capture, make a presentation of my session "${title}" (session ${sessionId}) and save it to the app.`
}

/** Opens a link outside the app. In the iPhone app, leaving the page for
 * another site hands the link to iOS, which opens the Claude app when it's
 * installed (Safari otherwise) -- unlike a pop-up, it needs no tap still in
 * progress, so it works after an await. */
export function openExternal(url: string) {
  if (Capacitor.isNativePlatform()) window.location.href = url
  else window.open(url, '_blank', 'noopener')
}
