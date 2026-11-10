// Screenshot helper for the Playwright MCP "run code" tool.
// Captures each route at phone, tablet and desktop widths and reports horizontal overflow.
// Usage: set globalThis.__routes before running, or edit the default list.
async (page) => {
  const routes = globalThis.__routes ?? ['today', 'calendar', 'bookings', 'vehicles', 'workshop', 'reports', 'bookings/new']
  const widths = [
    [1440, 900],
    [820, 1180],
    [390, 844],
  ]
  const report = []
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)))
  for (const r of routes) {
    for (const [w, h] of widths) {
      await page.setViewportSize({ width: w, height: h })
      await page.goto('http://localhost:5183/' + r)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(900)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      await page.screenshot({ path: `screenshots/${r.replace(/[/?=&]/g, '-')}-${w}.png` })
      if (overflow) report.push(`${r}@${w} overflowX=${overflow}`)
    }
  }
  return { overflow: report, errors }
}
