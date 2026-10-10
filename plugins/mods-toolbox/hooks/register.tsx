import type { Register } from 'claude-code'

import { registerChatPicks } from './chat-picks'
import { registerCleanView } from './clean-view'
import { registerDock } from './dock'
import { registerToolbox } from './toolbox'

// Registrations nest first-outermost. The Toolbox wraps the band Clean View
// draws, and the dock's hook on a helper's report_progress runs before Clean
// View's catch-all answers it. The chat picks only answer their own keys and
// watch Stop and /effort, so where they sit doesn't matter.
export const register: Register = on => {
  registerToolbox(on)
  registerChatPicks(on)
  registerDock(on)
  registerCleanView(on)
}
