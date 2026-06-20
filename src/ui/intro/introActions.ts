export const introActions = {
  handleEnter:       null as (() => void) | null,
  showLabel:         null as (() => void) | null,
  hideLabel:         null as (() => void) | null,
  collapseProgress:  null as ((onDone: () => void) => void) | null,
  startReveal:       null as (() => void) | null,
  expandReveal:      null as ((onComplete?: () => void) => void) | null,
  onHoverEnter:      null as (() => void) | null,
  onHoverLeave:      null as (() => void) | null,
  ready: false,
}
