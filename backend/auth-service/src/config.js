const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const config = {
  port: Number(process.env.AUTH_PORT || process.env.PORT || 4000),
  usersTable: process.env.USERS_TABLE,
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-env',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  aws: {
    region: process.env.AWS_REGION || 'ap-southeast-2',
    bucket: process.env.AWS_S3_BUCKET || process.env.S3_BUCKET_NAME || process.env.S3_BUCKET,
  },
  pipelineApiUrl: process.env.PIPELINE_API_URL || '',
};

module.exports = config;
