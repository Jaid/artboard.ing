import type {Rect} from '#src/lib/geometry.ts'
import type {CanvasJob} from '#src/lib/state.ts'

import clsx from 'clsx'
import {RotateCw, X} from 'lucide-react'

import {getLayer} from '#src/lib/actions.ts'
import {dismissJob, generate, reroll} from '#src/lib/generation.ts'
import {getModel} from '#src/lib/models/index.ts'
import {useElapsedSeconds} from '#src/lib/useElapsedSeconds.ts'

import css from './style.module.sass'

type Props = {
  /** the jobs whose results land in the same layer, like the shots of one generation; never empty */
  jobs: ReadonlyArray<CanvasJob>
  /** screen rect */
  rect: Rect
}

const JobOverlay = ({jobs, rect}: Props) => {
  const running = jobs.filter(job => job.status === 'running')
  const failed = jobs.filter(job => job.status === 'failed')
  const seconds = useElapsedSeconds(Math.min(...running.map(job => job.startedAt)), running.length > 0)
  const models = [...new Set(running.map(job => getModel(job.modelId).title))].join(', ')
  const {layerId, prompt, rect: frame} = jobs[0]
  const cancel = () => {
    for (const job of running) {
      dismissJob(job.id)
    }
  }
  const dismiss = () => {
    for (const job of failed) {
      dismissJob(job.id)
    }
  }
  const retry = () => {
    dismiss()
    // Once a sibling shot has landed, or for a failed reroll, the retry rerolls the layer with its captured inputs; otherwise it captures the frame again.
    if (getLayer(layerId)) {
      void reroll(layerId, failed.length)
      return
    }
    void generate({
      frame,
      prompt,
    }, {
      layerId,
      shots: failed.length,
    })
  }
  const error = failed[0]?.error ?? 'Generation failed'
  return <div
    className={clsx(css.overlay, !running.length && css.failed)}
    data-overlay-control
    data-testid='job-overlay'
    style={{
      transform: `translate(${rect.x}px, ${rect.y}px)`,
      width: rect.width,
      height: rect.height,
    }}
  >
    {running.length > 0 && <>
      <div className={css.shimmer} />
      <div className={css.sparks} />
      <div className={css.scan} />
      <div className={css.ring} />
    </>}
    <div className={css.panels}>
      {running.length > 0 && <div className={css.panel}>
        <span className={css.spinner} />
        <span className={css.text}>{running.length > 1 && `${running.length} shots · `}{models} · {seconds} s</span>
        <button className={css.button} title={running.length > 1 ? `Cancel ${running.length} generations` : 'Cancel generation'} type='button' onClick={cancel}><X size={14} /></button>
      </div>}
      {failed.length > 0 && <div className={css.panel}>
        <span className={css.error} title={error}>{failed.length > 1 ? `${failed.length} shots failed: ${error}` : error}</span>
        <button className={css.button} title={failed.length > 1 ? `Retry ${failed.length} shots with this frame and prompt` : 'Retry with this frame and prompt'} type='button' onClick={retry}><RotateCw size={14} /></button>
        <button className={css.button} title='Dismiss' type='button' onClick={dismiss}><X size={14} /></button>
      </div>}
    </div>
  </div>
}

export default JobOverlay
