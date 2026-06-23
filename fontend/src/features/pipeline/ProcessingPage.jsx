import { useCallback, useMemo, useState } from 'react'
import {
  getProcessedImageDownloadUrl,
  processExistingImage,
  uploadAndProcessImage,
} from '../../api/pipelineApi'
import { useAuth } from '../../hooks/useAuth'
import { useObjectUrl } from '../../hooks/useObjectUrl'
import { usePipelineRealtime } from '../../hooks/usePipelineRealtime'
import { buildPipelineOptions, initialPipelineOptions } from '../../untils/pipelineOptions'

const stageOrder = [
  { id: 'start', eventType: 'image.processing.started', title: 'Start' },
  { id: 'resize', eventType: 'image.resized', title: 'Resize' },
  { id: 'filter', eventType: 'image.filtered', title: 'Filter' },
  { id: 'watermark', eventType: 'image.watermarked', title: 'Watermark' },
  { id: 'compress', eventType: 'image.completed', title: 'Compress' },
  { id: 'storage', eventType: 'image.completed', title: 'S3 Storage' },
]

const fallbackPollLimit = 45
const fallbackPollDelay = 2000

function parseMetadata(metadata) {
  if (!metadata) return {}
  if (typeof metadata === 'object') return metadata

  try {
    return JSON.parse(metadata)
  } catch {
    return {}
  }
}

function makeInitialStages(options) {
  return stageOrder.map((stage) => {
    if (stage.id === 'resize' && !options.resize) return { ...stage, status: 'skipped', detail: 'Disabled' }
    if (stage.id === 'filter' && !options.filter) return { ...stage, status: 'skipped', detail: 'Disabled' }
    if (stage.id === 'watermark' && !options.watermark) return { ...stage, status: 'skipped', detail: 'Disabled' }
    return { ...stage, status: 'pending', detail: 'Pending' }
  })
}

function eventToStageId(eventType) {
  const match = stageOrder.find((stage) => stage.eventType === eventType)
  return match?.id || ''
}

function nextStageAfter(stageId) {
  const activeStages = stageOrder.map((stage) => stage.id)
  const index = activeStages.indexOf(stageId)
  return activeStages[index + 1]
}

function finalExtension(options) {
  const format = options?.compression?.format || 'jpeg'
  return format === 'jpeg' ? 'jpg' : format
}

function processedOutputKey(jobId, options) {
  if (!jobId) return ''
  return `processed/${jobId}/final.${finalExtension(options)}`
}

function resultOutputKey(userId, jobId, options) {
  if (!userId || !jobId) return ''
  return `results/${userId}/${jobId}/final.${finalExtension(options)}`
}

function metadataFromResponse(data) {
  const pipelineData = data?.data?.pipeline?.data || data?.data?.pipeline || {}
  return {
    jobId: pipelineData.jobId || data?.data?.payload?.jobId || '',
    imageId: pipelineData.imageId || data?.data?.payload?.imageId || '',
    sourceKey: data?.data?.s3Key || data?.data?.payload?.s3Key || '',
    skipped: Boolean(data?.data?.pipeline?.skipped),
  }
}

function StageNode({ stage }) {
  return (
    <div className={`studio-stage ${stage.status}`}>
      <div className="studio-stage-icon">{stage.title.slice(0, 1)}</div>
      <strong>{stage.title}</strong>
      <span>{stage.detail || stage.status}</span>
    </div>
  )
}

export function ProcessingPage() {
  const { accessToken, user } = useAuth()
  const [file, setFile] = useState(null)
  const [manualS3Key, setManualS3Key] = useState('')
  const [optionsForm, setOptionsForm] = useState(initialPipelineOptions)
  const [stages, setStages] = useState(() => makeInitialStages(buildPipelineOptions(initialPipelineOptions)))
  const [jobMeta, setJobMeta] = useState({ jobId: '', imageId: '', sourceKey: '', outputKey: '' })
  const [outputUrl, setOutputUrl] = useState('')
  const [activity, setActivity] = useState('Ready to start a new image pipeline.')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const imagePreview = useObjectUrl(file)
  const optionsPreview = useMemo(() => buildPipelineOptions(optionsForm), [optionsForm])

  function appendLog(level, message) {
    setActivity(`[${level}] ${message}`)
  }

  const applyProgressEvent = useCallback((event) => {
    const metadata = parseMetadata(event.metadata)
    const stageId = eventToStageId(event.eventType)

    appendLog(event.status === 'FAILED' ? 'ERR' : 'SYNC', `${event.eventType} received for job ${event.jobId}`)

    setStages((current) => current.map((stage) => {
      if (event.eventType === 'image.failed') {
        return stage.status === 'running' || stage.status === 'pending'
          ? { ...stage, status: 'failed', detail: metadata.failedStage || 'Failed' }
          : stage
      }

      if (stage.id === stageId || (event.eventType === 'image.completed' && stage.id === 'storage')) {
        return { ...stage, status: 'done', detail: 'Completed' }
      }

      if (stage.id === nextStageAfter(stageId) && stage.status === 'pending') {
        return { ...stage, status: 'running', detail: 'In progress...' }
      }

      return stage
    }))

    if (event.eventType === 'image.completed' && metadata.s3Key) {
      setJobMeta((current) => ({ ...current, outputKey: metadata.s3Key }))
      appendLog('DONE', `Final asset ready at ${metadata.s3Key}`)
      setNotice('Pipeline hoan tat. Co the export anh da xu ly.')
    }
  }, [])

  const realtime = usePipelineRealtime({
    userId: user?.id,
    onProgress: applyProgressEvent,
  })

  function setOption(name, value) {
    setOptionsForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')
    setActivity('Preparing upload and pipeline request...')
    setOutputUrl('')
    setJobMeta({ jobId: '', imageId: '', sourceKey: '', outputKey: '' })
    setStages(makeInitialStages(optionsPreview).map((stage) => (
      stage.id === 'start' ? { ...stage, status: 'running', detail: 'Initializing...' } : stage
    )))
    appendLog('INFO', file ? `Uploading ${file.name}` : `Starting existing key ${manualS3Key}`)

    try {
      const data = file
        ? await uploadAndProcessImage({ accessToken, file, options: optionsPreview })
        : await processExistingImage({ accessToken, s3Key: manualS3Key, options: optionsPreview })
      const meta = metadataFromResponse(data)

      setJobMeta((current) => ({ ...current, ...meta }))
      setStages((current) => current.map((stage) => {
        if (stage.id === 'start') return { ...stage, status: 'done', detail: 'Queued' }
        if (stage.id === 'resize' && stage.status === 'pending') return { ...stage, status: 'running', detail: 'In progress...' }
        return stage
      }))

      appendLog('OK', meta.skipped ? 'Request accepted, but pipeline is not configured.' : `Pipeline queued: ${meta.jobId}`)
      setNotice(meta.skipped ? 'Pipeline chua duoc cau hinh de chay tiep.' : 'Job da vao pipeline. Dang nghe realtime events.')

      if (!meta.skipped && meta.jobId) {
        pollFinalOutput(meta.jobId, optionsPreview)
      }
    } catch (err) {
      setError(err.message)
      appendLog('ERR', err.message)
      setStages((current) => current.map((stage) => (
        stage.status === 'running' ? { ...stage, status: 'failed', detail: 'Failed' } : stage
      )))
    } finally {
      setLoading(false)
    }
  }

  async function pollFinalOutput(jobId, options) {
    const candidateKeys = [
      resultOutputKey(user?.id, jobId, options),
      processedOutputKey(jobId, options),
    ].filter(Boolean)

    if (candidateKeys.length === 0) return

    appendLog('INFO', `Fallback watcher armed for ${candidateKeys[0]}`)

    for (let attempt = 1; attempt <= fallbackPollLimit; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, fallbackPollDelay))

      for (const key of candidateKeys) {
        try {
          const data = await getProcessedImageDownloadUrl({ accessToken, s3Key: key })
          const signedUrl = data.data.url

          setOutputUrl(signedUrl)
          setJobMeta((current) => current.outputKey
            ? current
            : { ...current, outputKey: key })
          setStages((current) => current.map((stage) => (
            stage.status === 'pending' || stage.status === 'running'
              ? { ...stage, status: 'done', detail: 'Completed' }
              : stage
          )))
          setNotice('Pipeline hoan tat. Output da duoc luu tren S3 va san sang export.')
          appendLog('DONE', `Final output detected: ${key}`)
          return
        } catch {
          if (attempt === 1 && key === candidateKeys[0]) {
            appendLog('SYNC', 'Waiting for final S3 object...')
          }
        }
      }
    }

    appendLog('WARN', 'Fallback watcher timed out before final output appeared.')
  }

  async function handleExport() {
    if (!jobMeta.outputKey) {
      setError('Final output is not ready yet.')
      return
    }

    try {
      const data = await getProcessedImageDownloadUrl({ accessToken, s3Key: jobMeta.outputKey })
      setOutputUrl(data.data.url)
      appendLog('EXPORT', `Signed URL generated for ${jobMeta.outputKey}`)
      window.open(data.data.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err.message)
      appendLog('ERR', err.message)
    }
  }

  return (
    <section className="studio-page">
      <aside className="studio-sidebar">
        <div className="studio-brand">FluxCore Engine</div>
        <div className="studio-project">
          <strong>Project Alpha</strong>
          <span>{user?.email || 'operator'}</span>
        </div>
        <nav>
          <a className="active">Pipelines</a>
          <a>Function Logs</a>
          <a>Secrets</a>
          <a>Deployment</a>
        </nav>
        <div className="studio-help">
          <span>Docs</span>
          <span>Support</span>
        </div>
      </aside>

      <section className="studio-main">
        <header className="studio-toolbar">
          <div>
            <p>Pipelines / {jobMeta.jobId || 'new-image-proc'}</p>
            <h2>Image Processor Live</h2>
          </div>
          <div className="studio-actions">
            <button type="button" onClick={handleExport} disabled={!jobMeta.outputKey}>Export</button>
            <span className={`studio-run ${loading ? 'running' : 'ready'}`}>{loading ? 'Running' : realtime.status}</span>
            <button type="button" className="studio-cancel" disabled={!loading}>Cancel Job</button>
          </div>
        </header>

        <form className="studio-grid" onSubmit={handleSubmit}>
          <section className="studio-card stage-card">
            <div className="studio-card-head">
              <h3>Pipeline</h3>
              <div>
                <span>{jobMeta.jobId ? `Job: ${jobMeta.jobId}` : 'No active job'}</span>
                <span>{activity}</span>
              </div>
            </div>
            <div className="studio-stage-line">
              {stages.map((stage) => <StageNode stage={stage} key={stage.id} />)}
            </div>
          </section>

          <section className="studio-card visual-card">
            <div className="studio-card-head">
              <h3>Visual Buffer</h3>
              <div>
                <span>Input: {file?.name || manualS3Key || 'none'}</span>
                <span>Output: {jobMeta.outputKey || 'waiting'}</span>
              </div>
            </div>
            <div className="visual-buffer">
              <div className="visual-frame">
                {imagePreview ? <img src={imagePreview} alt="Original input" /> : <div className="visual-empty">Select image</div>}
                <strong>Original</strong>
              </div>
              <div className="visual-frame processed">
                {outputUrl ? <img src={outputUrl} alt="Processed output" /> : <div className="visual-empty">Realtime output waits for completed event</div>}
                <strong>Processed</strong>
              </div>
            </div>
          </section>

          <section className="studio-card control-card">
            <div className="studio-card-head">
              <h3>Input</h3>
              <span>{realtime.enabled ? `Realtime: ${realtime.status}` : 'Realtime config missing'}</span>
            </div>
            <label>
              Upload image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => {
                  setFile(event.target.files?.[0] || null)
                  setManualS3Key('')
                }}
              />
            </label>
            <label>
              Existing S3 key
              <input
                value={manualS3Key}
                onChange={(event) => setManualS3Key(event.target.value)}
                placeholder="originals/user/image.jpg"
                disabled={Boolean(file)}
              />
            </label>
            <div className="studio-controls">
              <label className="studio-toggle">
                <input type="checkbox" checked={optionsForm.resizeEnabled} onChange={(event) => setOption('resizeEnabled', event.target.checked)} />
                Resize
              </label>
              <input type="number" value={optionsForm.width} onChange={(event) => setOption('width', event.target.value)} />
              <input type="number" value={optionsForm.height} onChange={(event) => setOption('height', event.target.value)} placeholder="auto" />
              <select value={optionsForm.fit} onChange={(event) => setOption('fit', event.target.value)}>
                <option value="inside">inside</option>
                <option value="cover">cover</option>
                <option value="contain">contain</option>
                <option value="fill">fill</option>
              </select>
              <select value={optionsForm.filterType} onChange={(event) => setOption('filterType', event.target.value)}>
                <option value="none">none</option>
                <option value="grayscale">grayscale</option>
                <option value="sepia">sepia</option>
                <option value="blur">blur</option>
                <option value="brightness">brightness</option>
              </select>
              <input type="number" step="0.1" value={optionsForm.filterValue} onChange={(event) => setOption('filterValue', event.target.value)} />
              <label className="studio-toggle">
                <input type="checkbox" checked={optionsForm.watermarkEnabled} onChange={(event) => setOption('watermarkEnabled', event.target.checked)} />
                Watermark
              </label>
              <input value={optionsForm.watermarkText} onChange={(event) => setOption('watermarkText', event.target.value)} />
              <select value={optionsForm.outputFormat} onChange={(event) => setOption('outputFormat', event.target.value)}>
                <option value="webp">webp</option>
                <option value="jpeg">jpeg</option>
                <option value="png">png</option>
              </select>
              <input type="number" min="1" max="100" value={optionsForm.quality} onChange={(event) => setOption('quality', event.target.value)} />
            </div>
            <button className="studio-primary" disabled={loading || (!file && !manualS3Key)} type="submit">
              {loading ? 'Running pipeline...' : 'Start Processing'}
            </button>
            {notice && <div className="studio-notice">{notice}</div>}
            {error && <div className="studio-error">{error}</div>}
            {realtime.error && <div className="studio-error">{realtime.error}</div>}
          </section>
        </form>
      </section>
    </section>
  )
}
