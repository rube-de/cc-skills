import type { Register } from 'claude-code'

import { registerCleanView } from './clean-view'
import { registerDock } from './dock'

// The dock goes first: registrations nest first-outermost, so its hook on a
// helper's report_progress runs before Clean View's catch-all answers it.
export const register: Register = on => {
  registerDock(on)
  registerCleanView(on)
}
