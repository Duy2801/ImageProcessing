import { useMemo, useState } from 'react'
import { processExistingImage, uploadAndProcessImage } from '../../api/pipelineApi'
import { useAuth } from '../../hooks/useAuth'
import { useObjectUrl } from '../../hooks/useObjectUrl'
import { buildPipelineOptions, initialPipelineOptions } from '../../untils/pipelineOptions'

export function ProcessingPage() {
  const { accessToken } = useAuth()
  const [file, setFile] = useState(null)
  const [manualS3Key, setManualS3Key] = useState('')
  const [optionsForm, setOptionsForm] = useState(initialPipelineOptions)
  const [result, setResult] = useState(null)
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

    try {
      const data = file
        ? await uploadAndProcessImage({ accessToken, file, options: optionsPreview })
        : await processExistingImage({ accessToken, s3Key: manualS3Key, options: optionsPreview })

      setResult(data)
      setNotice(data.data?.pipeline?.skipped
        ? 'Upload thanh cong. Pipeline chua duoc goi vi backend chua cau hinh PIPELINE_API_URL.'
        : 'Da gui job xu ly anh thanh cong.')
    } catch (err) {
      setError(err.message)
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
