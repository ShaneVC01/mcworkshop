import { useEffect, useState } from 'react'
import { minutesBetween, nowIso } from '@/lib/format'
import type { JobCard } from '@/types'

/** Clocked minutes on a job, ticking while the clock is running. */
export function useElapsedMinutes(job: JobCard) {
  const running = job.timeEntries.some((t) => !t.endedAt)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => tick((n) => n + 1), 15_000)
    return () => clearInterval(timer)
  }, [running])
  const minutes = job.timeEntries.reduce((sum, t) => sum + minutesBetween(t.startedAt, t.endedAt ?? nowIso()), 0)
  return { minutes, running }
}

/** Shrinks a camera photo so it is quick to save and send. */
export function readPhoto(file: File, maxSize = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That photo could not be read. Try taking it again.'))
    }
    img.src = url
  })
}

export function checklistProgress(job: JobCard) {
  const done = job.checklist.filter((c) => (c.kind === 'reading' ? c.reading != null : Boolean(c.result))).length
  return { done, total: job.checklist.length }
}
