export const initialPipelineOptions = {
  resizeEnabled: true,
  width: 1280,
  height: '',
  fit: 'inside',
  filterType: 'grayscale',
  filterValue: 1.2,
  watermarkEnabled: true,
  watermarkText: 'Image Processing',
  watermarkPosition: 'bottom-right',
  watermarkOpacity: 0.55,
  watermarkFontSize: 32,
  outputFormat: 'webp',
  quality: 82,
}

export function buildPipelineOptions(form) {
  const options = {
    compression: {
      format: form.outputFormat,
      quality: Number(form.quality),
    },
  }

  if (form.resizeEnabled) {
    options.resize = {
      fit: form.fit,
    }

    if (form.width) options.resize.width = Number(form.width)
    if (form.height) options.resize.height = Number(form.height)
  }

  if (form.filterType !== 'none') {
    options.filter = {
      type: form.filterType,
      value: Number(form.filterValue),
    }
  }

  if (form.watermarkEnabled && form.watermarkText.trim()) {
    options.watermark = {
      type: 'text',
      text: form.watermarkText.trim(),
      position: form.watermarkPosition,
      opacity: Number(form.watermarkOpacity),
      fontSize: Number(form.watermarkFontSize),
    }
  }

  return options
}
