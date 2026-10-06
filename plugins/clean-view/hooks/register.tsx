import type { Register } from 'claude-code'

import { registerCleanView } from './clean-view'

export const register: Register = on => {
  registerCleanView(on)
}
