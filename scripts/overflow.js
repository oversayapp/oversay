// Finds text and boxes that run past their container or the window, in the page it is run in.
// `make shots` (scripts/screenshots.mjs) runs it after every picture and fails on what it finds.
//
// It is a function expression, evaluated in the page with an allow-list of selectors for
// elements meant to scroll sideways or to be cropped; it returns one line per problem. A problem is:
// - the page itself scrolling sideways (the window is narrower than its content);
// - an element whose content is wider than its box (scrollWidth > clientWidth) when the extra is
//   cut off (overflow not visible) or spills out (overflow visible), unless the element shortens
//   its text with an ellipsis and carries a title (a tooltip) with the whole text; a popup or
//   badge positioned absolute or fixed may reach past its anchor;
// - a visible element whose box reaches past the left or right edge of the window, unless a
//   box inside the window clips it (that box is reported instead).
// Inputs are skipped (they scroll their own text), as are elements that aren't drawn. Only
// sideways overflow is checked: overlay windows grow to fit their card, which a headless page
// can't do, and manager pages scroll down by design.
(allow) => {
  const SLACK = 1
  const problems = []
  const allowed = (el) => allow.some((s) => el.closest(s))
  const name = (el) => {
    let s = el.tagName.toLowerCase()
    if (el.id) s += '#' + el.id
    const cls = [...el.classList].filter((c) => !c.startsWith('svelte-'))
    if (cls.length) s += '.' + cls.join('.')
    const parent = el.parentElement
    return parent && parent !== document.body ? `${name.short(parent)} > ${s}` : s
  }
  name.short = (el) => {
    let s = el.tagName.toLowerCase()
    const cls = [...el.classList].filter((c) => !c.startsWith('svelte-'))
    if (cls.length) s += '.' + cls[0]
    return s
  }
  const text = (el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  const drawn = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'contents'
  }
  const placed = (d, el) => {
    for (let n = d; n && n !== el; n = n.parentElement) if (['absolute', 'fixed'].includes(getComputedStyle(n).position)) return true
    return false
  }
  const skip = (el) => el.matches('input, textarea, select, svg, svg *, option, script, style, [aria-hidden="true"] *')

  const doc = document.scrollingElement ?? document.documentElement
  if (doc.scrollWidth > window.innerWidth + SLACK) problems.push(`the page is ${doc.scrollWidth - window.innerWidth}px wider than the window`)

  // Innermost first, so a box that only overflows because a child does is not reported too.
  const reported = []
  const explained = (el) => reported.some((d) => el.contains(d))
  for (const el of [...document.body.querySelectorAll('*')].reverse()) {
    if (skip(el) || !drawn(el) || explained(el)) continue
    const before = problems.length
    const cs = getComputedStyle(el)
    const over = el.scrollWidth - el.clientWidth
    // Only boxes that have a width of their own: inline elements report 0 for clientWidth.
    if (over > SLACK && el.clientWidth > 0 && cs.display !== 'inline') {
      const scrolls = cs.overflowX === 'auto' || cs.overflowX === 'scroll'
      // An ellipsis shows only on a block box: on a flex or grid box, or on a button itself (Chrome
      // draws none there; the text needs a span inside), the text is just cut off.
      const ellipsis = cs.textOverflow === 'ellipsis' && cs.overflowX !== 'visible' && !/flex|grid/.test(cs.display) && el.tagName !== 'BUTTON'
      if (scrolls) {
        if (!allowed(el)) problems.push(`${name(el)} scrolls sideways by ${over}px and is not on the allow-list ("${text(el)}")`)
      } else if (ellipsis) {
        if (!el.closest('[title]') && !allowed(el)) problems.push(`${name(el)} is shortened with an ellipsis but has no title to show the rest ("${text(el)}")`)
      } else if (cs.overflowX !== 'visible') {
        if (!allowed(el)) problems.push(`${name(el)}: content ${over}px wider than its box, cut off ("${text(el)}")`)
      } else {
        // Spilling out: name the child that sticks out. A popup or badge placed on purpose
        // (absolute or fixed, between it and this box) is meant to reach past its anchor.
        const right = el.getBoundingClientRect().right
        const out = [...el.querySelectorAll('*')].find((d) => !skip(d) && drawn(d) && !placed(d, el) && d.getBoundingClientRect().right > right + SLACK)
        if (out && !allowed(el) && !allowed(out)) {
          problems.push(`${name(out)} runs ${Math.round(out.getBoundingClientRect().right - right)}px out of ${name.short(el)}, spilling out ("${text(out)}")`)
        }
      }
    }
    const r = el.getBoundingClientRect()
    if ((r.left < -SLACK || r.right > window.innerWidth + SLACK) && !allowed(el)) {
      // Held by a clipping ancestor that is itself inside the window: that ancestor reports it.
      let clip = el.parentElement
      while (clip && clip !== document.body && getComputedStyle(clip).overflowX === 'visible') clip = clip.parentElement
      const inside = clip && clip !== document.body && clip.getBoundingClientRect().right <= window.innerWidth + SLACK && clip.getBoundingClientRect().left >= -SLACK
      if (!inside && cs.position !== 'fixed') {
        problems.push(`${name(el)} reaches past the window's ${r.left < -SLACK ? 'left' : 'right'} edge by ${Math.round(r.left < -SLACK ? -r.left : r.right - window.innerWidth)}px ("${text(el)}")`)
      }
    }
    if (problems.length > before) reported.push(el)
  }
  return problems
}
