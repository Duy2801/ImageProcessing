const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

// Initialize S3 client (inherits Lambda role credentials/region)
const s3Client = new S3Client({});

/**
 * Downloads a file from S3 to a local destination path.
 * Enforces path security checks.
 * @param {string} bucket - S3 Bucket Name
 * @param {string} key - S3 Object Key
 * @param {string} localDestPath - Local destination path (e.g. in /tmp)
 */
async function downloadFile(bucket, key, localDestPath) {
  // TODO(security): Sanitize key and localDestPath to prevent directory traversal
  const sanitizedLocalPath = path.resolve(localDestPath);
  const baseDir = path.dirname(sanitizedLocalPath);

  // Enforce boundary check for local files: only allow writing in /tmp
  if (!sanitizedLocalPath.startsWith('/tmp')) {
    throw new Error(`Unauthorized write attempt outside /tmp: ${sanitizedLocalPath}`);
  }

  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await s3Client.send(command);
  await pipeline(response.Body, fs.createWriteStream(sanitizedLocalPath));
  return sanitizedLocalPath;
}

/**
 * Uploads a local file to S3.
 * @param {string} bucket - S3 Bucket Name
 * @param {string} key - S3 Object Key
 * @param {string} localSrcPath - Local source path to upload
 * @param {string} contentType - Content-type header
 */
async function uploadFile(bucket, key, localSrcPath, contentType) {
  const sanitizedLocalPath = path.resolve(localSrcPath);

  // Enforce boundary check for reading local files: only allow /tmp
  if (!sanitizedLocalPath.startsWith('/tmp')) {
    throw new Error(`Unauthorized read attempt outside /tmp: ${sanitizedLocalPath}`);
  }

  if (!fs.existsSync(sanitizedLocalPath)) {
    throw new Error(`Source file not found for upload: ${sanitizedLocalPath}`);
  }

  const fileStream = fs.createReadStream(sanitizedLocalPath);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileStream,
    ContentType: contentType,
  });

  await s3Client.send(command);
}

/**
 * Uploads a buffer directly to S3.
 * @param {string} bucket - S3 Bucket Name
 * @param {string} key - S3 Object Key
 * @param {Buffer} buffer - File buffer
 * @param {string} contentType - Content-type header
 */
async function uploadBuffer(bucket, key, buffer, contentType) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3Client.send(command);
}

module.exports = {
  downloadFile,
  uploadFile,
  uploadBuffer,
  s3Client
};
