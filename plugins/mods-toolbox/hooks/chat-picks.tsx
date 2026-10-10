import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { ChatEffort } from '../types'
import {
  FAMILIES,
  effortFromSettings,
  effortTaken,
  familyOf,
  isEffort,
  modelArgs,
  refusal,
  ultracodeAsked,
  ultracodeTaken,
} from './chat-picks-logic'

type Engine = EngineInterface

// The Toolbox's model config rows switch the model, effort and Ultracode the
// way typing /model and /effort does: once Claude is free, and in an
// interactive session the model and effort are saved as the default for new
// sessions too. The model is read back from the engine after every change; no
// API reads the effort or Ultracode, so the last ones seen are kept here.
const optionsAtom = atom({ plugin: 'mods-toolbox', key: 'chatModelOptions' } as const, null)
const modelAtom = atom({ plugin: 'mods-toolbox', key: 'chatModel' } as const, null)
const effortAtom = atom({ plugin: 'mods-toolbox', key: 'chatEffort' } as const, null)
const modelPendingAtom = atom({ plugin: 'mods-toolbox', key: 'chatModelPending' } as const, null)
const effortPendingAtom = atom({ plugin: 'mods-toolbox', key: 'chatEffortPending' } as const, null)
const ultracodeAtom = atom({ plugin: 'mods-toolbox', key: 'chatUltracode' } as const, 'off')
const ultracodePendingAtom = atom({ plugin: 'mods-toolbox', key: 'chatUltracodePending' } as const, null)

const KEY = /^chat-(model|effort|ultracode)-(.+)$/

export function registerChatPicks(on: On) {
  // Clean View holds the bare session.start, the dock its cwd matcher and the
  // Toolbox its surface one.
  on('session.start', { isInteractive: true }, async ($, e, next) => {
    // A reload drops the runs a pick was waiting on, so nothing stays pending.
    await update($, modelPendingAtom, () => null)
    await update($, effortPendingAtom, () => null)
    await update($, ultracodePendingAtom, () => null)
    try {
      await loadPicks($)
    } catch {
      // Without the /config row the model row stays out; effort shows once a turn ends.
    }

    return next(e)
  })

  // Every main turn's Stop carries the effort it ran at; the dock holds the bare hook.
  on('classic.Stop', { cwd: /^/ }, async ($, e, next) => {
    const level = e.effort?.level
    if (e.agent_id === undefined && isEffort(level)) {
      await update($, effortAtom, current => (current === level ? current : level)).catch(() => undefined)
    }

    return next(e)
  })

  // The person's /model and /config's model row move the chat too, not only the Toolbox.
  on('command.run', { command: 'model' }, async ($, e, next) => {
    const ran = await next(e)
    await refreshModel($)

    return ran
  })

  on('config.set', { key: 'model' }, async ($, e, next) => {
    const set = await next(e)
    await refreshModel($)

    return set
  })

  // The person's own /effort, and the Toolbox's, which comes through here too.
  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const ran = await next(e)
    const ultracode = ultracodeAsked(e.args)
    if (ultracode !== null) {
      // A refusal means this plan has no Ultracode, so the row goes for the session.
      const state = ultracodeTaken(ran.text) ? (ultracode ? 'on' : 'off') : 'unavailable'
      await update($, ultracodeAtom, () => state)

      return ran
    }
    const wanted = e.args.trim().toLowerCase()
    if (wanted === 'auto') {
      await update($, effortAtom, () => null)
    } else if (isEffort(wanted) && effortTaken(ran.text)) {
      await update($, effortAtom, () => wanted)
    }

    return ran
  })

  on('ui.press', { plugin: 'mods-toolbox', component: 'AbovePrompt', element: KEY }, async ($, e) => {
    const [, kind, value = ''] = KEY.exec(e.element) ?? []
    // Detached: /model and /effort wait until Claude is free, and the press should not.
    $.clock.after(1, () => {
      void (kind === 'model' ? switchModel($, value) : kind === 'effort' ? switchEffort($, value) : switchUltracode($, value))
    })

    return { element: e.element }
  })
}

async function loadPicks($: Engine) {
  const row = (await $.config.list()).find(candidate => candidate.key === 'model')
  const options = row === undefined || row.isLocked ? [] : [...(row.options ?? [])]
  await update($, optionsAtom, () => options)
  const model = await refreshModel($)
  // A reload keeps what a turn already showed; the settings only fill an empty start.
  if (model !== null && (await read($, effortAtom)) === null) {
    const effort = effortFromSettings(await $.settings.read(), model)
    await update($, effortAtom, current => current ?? effort)
  }
}

async function refreshModel($: Engine): Promise<string | null> {
  try {
    const model = await $.session.model()
    await update($, modelAtom, current => (current === model ? current : model))

    return model
  } catch {
    return null
  }
}

async function switchModel($: Engine, family: string) {
  const known = FAMILIES.find(candidate => candidate === family)
  if (known === undefined) {
    return
  }
  await update($, modelPendingAtom, () => known)
  try {
    const current = (await read($, modelAtom)) ?? (await $.session.model())
    const ran = await $.command.run({ command: 'model', args: modelArgs(known, current, (await read($, optionsAtom)) ?? []) })
    const model = await refreshModel($)
    if (model === null || familyOf(model) !== known) {
      $.ui.toast(refusal(ran.text, 'The model could not switch. Try /model.'))
    }
  } catch {
    $.ui.toast('The model could not switch. Try /model.')
  }
  await update($, modelPendingAtom, current => (current === known ? null : current))
}

async function switchEffort($: Engine, level: string) {
  if (!isEffort(level)) {
    return
  }
  const wanted: ChatEffort = level
  await update($, effortPendingAtom, () => wanted)
  try {
    const ran = await $.command.run({ command: 'effort', args: wanted })
    if (effortTaken(ran.text)) {
      await update($, effortAtom, () => wanted)
    } else {
      $.ui.toast(refusal(ran.text, 'The effort could not change. Try /effort.'))
    }
  } catch {
    $.ui.toast('The effort could not change. Try /effort.')
  }
  await update($, effortPendingAtom, current => (current === wanted ? null : current))
}

async function switchUltracode($: Engine, value: string) {
  if (value !== 'on' && value !== 'off') {
    return
  }
  await update($, ultracodePendingAtom, () => value)
  try {
    const ran = await $.command.run({ command: 'effort', args: `ultracode ${value}` })
    if (ultracodeTaken(ran.text)) {
      await update($, ultracodeAtom, () => value)
    } else {
      await update($, ultracodeAtom, () => 'unavailable')
      $.ui.toast(refusal(ran.text, 'Ultracode could not switch. Try /effort ultracode.'))
    }
  } catch {
    $.ui.toast('Ultracode could not switch. Try /effort ultracode.')
  }
  await update($, ultracodePendingAtom, current => (current === value ? null : current))
}
