import type { Register } from 'claude-code'

import { registerCleanView } from './clean-view'
import { registerDock } from './dock'
import { registerToolbox } from './toolbox'

// Registrations nest first-outermost. The Toolbox wraps the band Clean View
// draws, and the dock's hook on a helper's report_progress runs before Clean
// View's catch-all answers it.
export const register: Register = on => {
  registerToolbox(on)
  registerDock(on)
  registerCleanView(on)
}
