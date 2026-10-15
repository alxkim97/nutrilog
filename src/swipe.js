// Swipe-to-reveal actions for list rows (iOS Mail-style): drag a row left to
// reveal Edit/Delete buttons underneath — a tap does nothing, on purpose,
// so brushing a row while scrolling never surfaces Delete by accident.
// Pointer Events cover touch and mouse in one handler, so this also works
// by mouse-drag when previewing in a desktop browser's device toolbar.
// Call enableSwipeRows(container) once after each render; markup doesn't
// persist across a rebuild, so there's nothing to tear down first.
const REVEAL = 136   // px of action strip revealed when fully open
const OVERDRAG = 24  // a little elastic give past fully open, snaps back
const OPEN_AT = REVEAL * 0.4 // drag past this far to snap open on release
const TAP_TOLERANCE = 12 // px of wander that's still a tap, not a drag — a mouse click barely
                          // moves, but a real finger (or a touch the browser is about to turn
                          // into a scroll — see touch-action in style.css) always does

let openRow = null
let dismissBound = false

// The transform belongs on .swipe-front alone — .swipe-row also contains the
// (un-transformed, right-anchored) .swipe-actions, so moving the row itself
// would drag the actions along with it and nothing would ever be revealed.
function setFrontX(row, x) {
  const front = row.querySelector('.swipe-front')
  if (front) front.style.transform = x ? `translateX(${x}px)` : ''
}

function closeRow(row) {
  if (!row) return
  row.classList.remove('no-anim') // snap closed with the transition back on
  setFrontX(row, 0)
  row.classList.remove('swipe-open')
  if (openRow === row) openRow = null
}

function openRowFull(row) {
  if (openRow && openRow !== row) closeRow(openRow)
  row.classList.remove('no-anim')
  setFrontX(row, -REVEAL)
  row.classList.add('swipe-open')
  openRow = row
}

export function closeSwipeRows() {
  closeRow(openRow)
}

// Each ".swipe-row" needs a ".swipe-front" child (the visible, draggable
// content) painted over a ".swipe-actions" child (the Edit/Delete buttons).
export function enableSwipeRows(container) {
  if (!dismissBound) {
    dismissBound = true
    // Capture phase: runs before a tap on a *different* row, so switching
    // rows closes the old one first. A tap inside the open row (including
    // its action buttons) is left alone.
    document.addEventListener('pointerdown', (e) => {
      if (openRow && !openRow.contains(e.target)) closeRow(openRow)
    }, true)
  }

  container.querySelectorAll('.swipe-row').forEach(row => {
    const front = row.querySelector('.swipe-front')
    if (!front) return
    const isOpen = () => row.classList.contains('swipe-open')
    let dragging = false, startX = 0, startY = 0, base = 0, dx = 0, moved = false, rafId = null

    // Pointermove on a real screen can fire faster than the display repaints;
    // writing the transform straight from the event handler was the jitter —
    // coalesce to at most one DOM write per frame instead.
    const flush = () => { rafId = null; setFrontX(row, dx) }
    const scheduleFlush = () => { if (rafId == null) rafId = requestAnimationFrame(flush) }

    front.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      dragging = true; moved = false; dx = 0
      startX = e.clientX; startY = e.clientY
      base = isOpen() ? -REVEAL : 0
      try { front.setPointerCapture(e.pointerId) } catch { /* not critical */ }
    })

    front.addEventListener('pointermove', (e) => {
      if (!dragging) return
      const ddx = e.clientX - startX
      if (!moved) {
        const ddy = e.clientY - startY
        // Past the tolerance and more horizontal than vertical, so a vertical
        // scroll that starts on a row never drags it sideways.
        if (Math.abs(ddx) <= TAP_TOLERANCE || Math.abs(ddx) <= Math.abs(ddy)) return
        moved = true
        row.classList.add('no-anim') // follow the finger with no transition lag while dragging
      }
      dx = Math.min(0, Math.max(-REVEAL - OVERDRAG, base + ddx))
      scheduleFlush()
      e.preventDefault()
    })

    const end = (e) => {
      if (!dragging) return
      dragging = false
      try { front.releasePointerCapture(e.pointerId) } catch { /* not critical */ }
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null } // don't let a stale frame overwrite the snap below
      if (!moved) return // never left the tap tolerance — a plain tap, which does nothing
      if (dx <= -OPEN_AT) openRowFull(row)
      else closeRow(row)
    }
    front.addEventListener('pointerup', end)
    front.addEventListener('pointercancel', end)
  })
}
