// The popup's outer width, border and padding included.
const POPUP_WIDTH = 66
export const BAND_GAP = 2
// Narrower than this beside the popup, the checklist folds to its header and sits above it.
const CHECKLIST_MIN = 44

export type BandLayout = {
  popupWidth: number
  // The columns the checklist gets: beside the popup, or the whole band above it.
  checklistColumns: number
  isSideBySide: boolean
}

export function bandLayout(columns: number, isOpen: boolean): BandLayout {
  if (!isOpen) {
    return { popupWidth: 0, checklistColumns: columns, isSideBySide: false }
  }
  const popupWidth = Math.min(POPUP_WIDTH, columns)
  const beside = columns - popupWidth - BAND_GAP
  const isSideBySide = beside >= CHECKLIST_MIN

  return { popupWidth, checklistColumns: isSideBySide ? beside : columns, isSideBySide }
}
