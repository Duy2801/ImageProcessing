const express = require('express');
const multer = require('multer');
const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
});
const s3 = new S3Client({ region: config.aws.region });

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function parseOptions(rawOptions) {
  if (!rawOptions) return {};
  if (typeof rawOptions === 'object') return rawOptions;

  try {
    return JSON.parse(rawOptions);
  } catch (_error) {
    const err = new Error('Options must be valid JSON');
    err.statusCode = 400;
    throw err;
  }
}

function safeFileName(name) {
  return String(name || 'image')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
}

async function callPipeline(payload) {
  if (!config.pipelineApiUrl) {
    return {
      skipped: true,
      message: 'PIPELINE_API_URL is not configured. S3 upload is ready, but pipeline was not called.',
      requestPayload: payload,
    };
  }

  const endpoint = `${config.pipelineApiUrl.replace(/\/$/, '')}/process`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch (_error) {
    data = { raw: text };
  }

  if (!response.ok) {
    const err = new Error(data.error || data.message || `Pipeline API failed with ${response.status}`);
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }

  return data;
}

router.post('/process', requireAuth, async (req, res, next) => {
  try {
    const { s3Key, options } = req.body || {};

    if (!s3Key || typeof s3Key !== 'string') {
      return res.status(400).json({ success: false, error: 's3Key is required' });
    }

    const payload = {
      s3Key,
      options: parseOptions(options),
      userId: req.user.id,
    };

    const pipeline = await callPipeline(payload);
    return res.json({ success: true, data: { payload, pipeline } });
  } catch (error) {
    return next(error);
  }
});

router.post('/upload-and-process', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    if (!config.aws.bucket) {
      return res.status(500).json({ success: false, error: 'AWS_S3_BUCKET or S3_BUCKET_NAME is required' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Image file is required' });
    }

    if (!allowedTypes.has(req.file.mimetype)) {
      return res.status(400).json({ success: false, error: 'Only JPEG, PNG, WebP and GIF images are supported' });
    }

    const extension = req.file.originalname.includes('.')
      ? req.file.originalname.split('.').pop().toLowerCase()
      : req.file.mimetype.split('/').pop();
    const s3Key = `originals/${req.user.id}/${Date.now()}-${safeFileName(req.file.originalname || `image.${extension}`)}`;

    await s3.send(new PutObjectCommand({
      Bucket: config.aws.bucket,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        uploadedBy: req.user.id,
        originalName: safeFileName(req.file.originalname),
      },
    }));

    const payload = {
      s3Key,
      options: parseOptions(req.body.options),
      userId: req.user.id,
    };
    const pipeline = await callPipeline(payload);

    return res.status(201).json({
      success: true,
      data: {
        bucket: config.aws.bucket,
        s3Key,
        payload,
        pipeline,
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
