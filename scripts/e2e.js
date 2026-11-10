// End to end check of the PRD's 20 step scenario, for the Playwright MCP "run code" tool.
// Needs the dev server on port 5183. Resets the demo data first.
async (page) => {
  const base = 'http://localhost:5183'
  const log = []
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)))
  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem('mcw-db')))
  const as = async (user, path) => {
    await page.evaluate((u) => localStorage.setItem('mcw-session', JSON.stringify(u)), user)
    await page.goto(base + path)
    await page.waitForLoadState('networkidle')
  }
  const advisor = { id: 'u-sean', name: 'Sean Poiani', role: 'advisor' }

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(base + '/login')
  await page.evaluate(() => {
    localStorage.removeItem('mcw-db')
    localStorage.removeItem('mcw-settings')
  })

  // 1 to 7: advisor books 923XYZ for a 120,000 km service
  await as(advisor, '/bookings/new')
  const t0 = Date.now()
  await page.getByPlaceholder('Rego, customer name or mobile').fill('923XYZ')
  await page.getByRole('button', { name: /LandCruiser 79/ }).first().click()
  await page.getByRole('button', { name: /120,000 km major service/ }).click()
  const first = page.getByRole('radio').first()
  await first.waitFor()
  log.push('slot offered: ' + (await first.innerText()).replace(/\s+/g, ' '))
  await page.getByRole('button', { name: 'Confirm booking' }).click()
  await page.waitForURL(/calendar/)
  log.push(`booking made in ${((Date.now() - t0) / 1000).toFixed(1)} s (scripted)`)
  await page.getByRole('button', { name: /923XYZ/ }).first().waitFor()
  log.push('8: booking is on the calendar')

  let data = await db()
  const booking = data.bookings.filter((b) => b.vehicleId === 'v1').sort((a, b) => b.number.localeCompare(a.number))[0]
  const mechanic = data.staff.find((u) => u.technicianId === booking.technicianIds[0])
  log.push(`booked ${booking.number} with ${mechanic.name}, ${booking.estimatedLabourHours} h`)

  // 9 to 12: mechanic starts, completes checklist, reports brake pads with photo
  await as(mechanic, '/mechanic')
  for (let i = 0; i < 6 && !(await page.getByText('923 XYZ').first().isVisible().catch(() => false)); i++) {
    await page.getByRole('button', { name: 'Next day' }).click()
    await page.waitForTimeout(700)
  }
  log.push('9: job is in My day: ' + (await page.getByText('923 XYZ').first().isVisible()))
  await page.goto(`${base}/mechanic/jobs/${booking.jobId}`)
  await page.getByRole('button', { name: 'Start job' }).click()
  await page.getByRole('button', { name: 'Pause' }).waitFor()
  log.push('10: job started')
  await page.getByRole('link', { name: /Service checklist/ }).click()
  data = await db()
  const job = data.jobs.find((j) => j.id === booking.jobId)
  for (const item of job.checklist) {
    if (item.label === 'Front brake pads') continue
    if (item.kind === 'reading') {
      const input = page.getByLabel(new RegExp(`^${item.label} in`))
      await input.fill('38')
      await input.blur()
    } else {
      const ok = page.getByRole('group', { name: item.label, exact: true }).getByRole('button', { name: 'OK' })
      await ok.click()
      await page.getByRole('group', { name: item.label, exact: true }).locator('button[aria-pressed="true"]').waitFor()
    }
  }
  log.push('11: checklist done except brake pads')
  await page.getByRole('group', { name: 'Front brake pads', exact: true }).getByRole('button', { name: 'Attention' }).click()
  await page.waitForURL(/findings\/new/)
  await page.getByRole('radio', { name: 'Safety' }).click()
  await page.getByLabel('What did you find?').fill('Pads approximately 2 mm')
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC'
  await page.locator('input[type=file]').setInputFiles({ name: 'pads.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await page.getByAltText('Photo 1').waitFor()
  await page.getByLabel('Suggested fix').fill('Replace front brake pads')
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'More time' }).click()
  await page.getByRole('button', { name: 'Save finding' }).click()
  await page.waitForURL(/inspection/)
  log.push('12: finding saved with photo')

  // 13 to 15: advisor sees it, quotes it, customer approves
  await as(advisor, `/bookings/${booking.id}`)
  await page.getByRole('tab', { name: /Findings/ }).click()
  await page.getByRole('heading', { name: 'Front brake pads' }).waitFor()
  log.push('13: advisor sees the finding')
  await page.getByRole('button', { name: 'Quote this work' }).click()
  await page.getByLabel('Parts, $ ex GST').fill('189')
  await page.getByRole('button', { name: 'Add to quote' }).click()
  await page.getByRole('button', { name: 'Send for approval' }).click()
  await page.getByText(/Waiting for customer/).first().waitFor()
  log.push('14: quote sent')
  await page.getByRole('button', { name: 'Customer approved' }).click()
  await page.getByText('Approved', { exact: true }).first().waitFor()
  log.push('15: approved')

  // 16 to 18: mechanic gets the extra work, does it, completes
  await as(mechanic, `/mechanic/jobs/${booking.jobId}`)
  await page.getByRole('heading', { name: 'Additional work approved' }).waitFor()
  log.push('16: mechanic sees approved extra work')
  await page.getByRole('checkbox', { name: /^Replace front brake pads/ }).click()
  await page.getByRole('checkbox', { name: /^Replace front brake pads/, checked: true }).waitFor()
  await page.getByRole('button', { name: 'Complete', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Complete job' }).click()
  await page.getByText('Job complete').waitFor()
  log.push('17 and 18: brake work and service completed')

  // 19 and 20: board and vehicle timeline
  await as(advisor, '/workshop')
  const column = page.getByRole('region', { name: 'Complete' })
  await column.getByText('923 XYZ').waitFor()
  log.push('19: board shows it under Complete: ' + (await column.getByText('Tech complete').count() > 0))
  await page.goto(base + '/vehicles/v1')
  await page.getByText('Front brake pads').first().waitFor()
  log.push('20: vehicle timeline shows the visit and finding')

  data = await db()
  const done = data.jobs.find((j) => j.id === booking.jobId)
  log.push(`final: status ${done.status}, completed by ${done.completedBy}, labour lines ${done.labour.length}, activity events ${data.activity.filter((a) => a.jobId === done.id).length}, outbox ${data.outbox.length}`)
  return { log, errors }
}
