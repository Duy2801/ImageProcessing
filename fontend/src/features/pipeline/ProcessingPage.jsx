import { useMemo, useState } from 'react'
import { processExistingImage, uploadAndProcessImage } from '../../api/pipelineApi'
import { useAuth } from '../../hooks/useAuth'
import { useObjectUrl } from '../../hooks/useObjectUrl'
import { buildPipelineOptions, initialPipelineOptions } from '../../untils/pipelineOptions'

function createPipelineSteps({ file, s3Key, options, state = 'idle', pipelineStarted = false }) {
  const inputDone = state === 'queued' || state === 'failed'
  const startDone = pipelineStarted && state === 'queued'
  const stageState = startDone ? 'queued' : 'pending'

  return [
    {
      id: 'input',
      title: file ? 'Upload original image' : 'Use S3 source',
      detail: file ? file.name : s3Key || 'Waiting for S3 key',
      status: inputDone ? 'done' : state === 'submitting' ? 'running' : 'pending',
    },
    {
      id: 'start',
      title: 'Start pipeline',
      detail: 'Create image processing job and send it to the first queue',
      status: startDone ? 'done' : inputDone ? 'warning' : 'pending',
    },
    {
      id: 'resize',
      title: 'Resize',
      detail: options.resize
        ? `${options.resize.width || 'auto'} x ${options.resize.height || 'auto'} (${options.resize.fit})`
        : 'Resize disabled',
      status: options.resize ? stageState : 'skipped',
    },
    {
      id: 'filter',
      title: 'Filter',
      detail: options.filter ? `${options.filter.type} value ${options.filter.value}` : 'Filter disabled',
      status: options.filter ? stageState : 'skipped',
    },
    {
      id: 'watermark',
      title: 'Watermark',
      detail: options.watermark ? `${options.watermark.text} (${options.watermark.position})` : 'Watermark disabled',
      status: options.watermark ? stageState : 'skipped',
    },
    {
      id: 'compress',
      title: 'Compress',
      detail: `${options.compression.format}, quality ${options.compression.quality}`,
      status: stageState,
    },
    {
      id: 'notify',
      title: 'Notify progress',
      detail: 'Send progress events to notification queue',
      status: stageState,
    },
  ]
}

function getPipelineMeta(data) {
  const pipelineData = data?.data?.pipeline?.data || data?.data?.pipeline || {}

  return {
    jobId: pipelineData.jobId || data?.data?.payload?.jobId || '',
    imageId: pipelineData.imageId || data?.data?.payload?.imageId || '',
    s3Key: data?.data?.s3Key || data?.data?.payload?.s3Key || '',
    skipped: Boolean(data?.data?.pipeline?.skipped),
  }
}

function StepBadge({ status }) {
  const labels = {
    pending: 'Pending',
    running: 'Running',
    done: 'Done',
    queued: 'Queued',
    skipped: 'Skipped',
    warning: 'Waiting',
    failed: 'Failed',
  }

  return <span className={`step-badge ${status}`}>{labels[status] || status}</span>
}

export function ProcessingPage() {
  const { accessToken } = useAuth()
  const [file, setFile] = useState(null)
  const [manualS3Key, setManualS3Key] = useState('')
  const [optionsForm, setOptionsForm] = useState(initialPipelineOptions)
  const [result, setResult] = useState(null)
  const [steps, setSteps] = useState([])
  const [history, setHistory] = useState([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const imagePreview = useObjectUrl(file)
  const optionsPreview = useMemo(() => buildPipelineOptions(optionsForm), [optionsForm])

  function setOption(name, value) {
    setOptionsForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')
    setResult(null)
    setSteps(createPipelineSteps({
      file,
      s3Key: manualS3Key,
      options: optionsPreview,
      state: 'submitting',
    }))

    try {
      const data = file
        ? await uploadAndProcessImage({ accessToken, file, options: optionsPreview })
        : await processExistingImage({ accessToken, s3Key: manualS3Key, options: optionsPreview })
      const meta = getPipelineMeta(data)
      const pipelineStarted = !meta.skipped
      const completedSteps = createPipelineSteps({
        file,
        s3Key: meta.s3Key || manualS3Key,
        options: optionsPreview,
        state: 'queued',
        pipelineStarted,
      }).map((step) => {
        if (meta.skipped && step.id !== 'input') {
          return {
            ...step,
            status: step.status === 'skipped' ? 'skipped' : 'warning',
          }
        }

        return step
      })

      setResult(data)
      setSteps(completedSteps)
      setHistory((current) => [
        {
          id: `${Date.now()}`,
          createdAt: new Date().toLocaleString(),
          jobId: meta.jobId,
          imageId: meta.imageId,
          s3Key: meta.s3Key || manualS3Key,
          fileName: file?.name || '',
          status: meta.skipped ? 'Pipeline not configured' : 'Queued successfully',
          steps: completedSteps,
        },
        ...current,
      ].slice(0, 5))
      setNotice(data.data?.pipeline?.skipped
        ? 'Anh da duoc nhan, nhung pipeline chua duoc cau hinh de chay tiep.'
        : 'Da gui job xu ly anh thanh cong.')
    } catch (err) {
      setError(err.message)
      setSteps((current) => current.map((step) => (
        step.status === 'running' ? { ...step, status: 'failed' } : step
      )))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="workspace process-workspace">
      <section className="panel pipeline-panel">
        <div className="panel-head">
          <h2>Pipeline test</h2>
          <span className="status ready">Authenticated</span>
        </div>

        <form className="pipeline-grid" onSubmit={handleSubmit}>
          <div className="upload-zone">
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
            {imagePreview && (
              <div className="image-preview">
                <img src={imagePreview} alt="Selected upload preview" />
                <span>{file.name}</span>
              </div>
            )}
            <div className="divider">or use existing S3 key</div>
            <label>
              S3 key
              <input
                value={manualS3Key}
                onChange={(event) => setManualS3Key(event.target.value)}
                placeholder="originals/user/image.jpg"
                disabled={Boolean(file)}
              />
            </label>
          </div>

          <div className="control-grid">
            <label className="toggle">
              <input
                type="checkbox"
                checked={optionsForm.resizeEnabled}
                onChange={(event) => setOption('resizeEnabled', event.target.checked)}
              />
              Resize
            </label>
            <label>
              Width
              <input
                type="number"
                value={optionsForm.width}
                onChange={(event) => setOption('width', event.target.value)}
              />
            </label>
            <label>
              Height
              <input
                type="number"
                value={optionsForm.height}
                onChange={(event) => setOption('height', event.target.value)}
                placeholder="auto"
              />
            </label>
            <label>
              Fit
              <select value={optionsForm.fit} onChange={(event) => setOption('fit', event.target.value)}>
                <option value="inside">inside</option>
                <option value="cover">cover</option>
                <option value="contain">contain</option>
                <option value="fill">fill</option>
              </select>
            </label>
            <label>
              Filter
              <select value={optionsForm.filterType} onChange={(event) => setOption('filterType', event.target.value)}>
                <option value="none">none</option>
                <option value="grayscale">grayscale</option>
                <option value="sepia">sepia</option>
                <option value="blur">blur</option>
                <option value="brightness">brightness</option>
              </select>
            </label>
            <label>
              Filter value
              <input
                type="number"
                step="0.1"
                value={optionsForm.filterValue}
                onChange={(event) => setOption('filterValue', event.target.value)}
              />
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={optionsForm.watermarkEnabled}
                onChange={(event) => setOption('watermarkEnabled', event.target.checked)}
              />
              Watermark
            </label>
            <label>
              Text
              <input
                value={optionsForm.watermarkText}
                onChange={(event) => setOption('watermarkText', event.target.value)}
              />
            </label>
            <label>
              Position
              <select
                value={optionsForm.watermarkPosition}
                onChange={(event) => setOption('watermarkPosition', event.target.value)}
              >
                <option value="bottom-right">bottom-right</option>
                <option value="bottom-left">bottom-left</option>
                <option value="top-right">top-right</option>
                <option value="top-left">top-left</option>
                <option value="center">center</option>
              </select>
            </label>
            <label>
              Opacity
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={optionsForm.watermarkOpacity}
                onChange={(event) => setOption('watermarkOpacity', event.target.value)}
              />
            </label>
            <label>
              Format
              <select value={optionsForm.outputFormat} onChange={(event) => setOption('outputFormat', event.target.value)}>
                <option value="webp">webp</option>
                <option value="jpeg">jpeg</option>
                <option value="png">png</option>
              </select>
            </label>
            <label>
              Quality
              <input
                type="number"
                min="1"
                max="100"
                value={optionsForm.quality}
                onChange={(event) => setOption('quality', event.target.value)}
              />
            </label>
          </div>

          <button className="primary wide" disabled={loading || (!file && !manualS3Key)} type="submit">
            {loading ? 'Sending job...' : file ? 'Upload and process' : 'Start process'}
          </button>
        </form>
      </section>

      <section className="panel progress-panel">
        <div className="panel-head">
          <h2>Processing steps</h2>
          <span className={loading ? 'status' : 'status ready'}>{loading ? 'Sending' : 'Ready'}</span>
        </div>

        <div className="step-list">
          {(steps.length ? steps : createPipelineSteps({
            file,
            s3Key: manualS3Key,
            options: optionsPreview,
          })).map((step) => (
            <div className={`step-item ${step.status}`} key={step.id}>
              <div className="step-marker" />
              <div>
                <div className="step-title-row">
                  <strong>{step.title}</strong>
                  <StepBadge status={step.status} />
                </div>
                <p>{step.detail}</p>
              </div>
            </div>
          ))}
        </div>

        {history.length > 0 && (
          <div className="history-list">
            <h2>Recent jobs</h2>
            {history.map((item) => (
              <article className="history-item" key={item.id}>
                <div>
                  <strong>{item.fileName || item.s3Key}</strong>
                  <span>{item.createdAt}</span>
                </div>
                <span className="status ready">{item.status}</span>
                {(item.jobId || item.imageId) && (
                  <p>
                    {item.jobId && `Job: ${item.jobId}`}
                    {item.jobId && item.imageId && ' | '}
                    {item.imageId && `Image: ${item.imageId}`}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel response-panel">
        <div className="panel-head">
          <h2>Response</h2>
          <span className="status ready">JSON</span>
        </div>
        {notice && <div className="notice-box">{notice}</div>}
        {error && <div className="error-box">{error}</div>}
        <pre>{JSON.stringify(result || { optionsPreview }, null, 2)}</pre>
      </section>
    </section>
  )
}
