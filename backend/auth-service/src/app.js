const express = require('express');
const cors = require('cors');
const config = require('./config');
const authRoutes = require('./routes/auth');
const pipelineRoutes = require('./routes/pipeline');

const app = express();

app.use(cors({
  origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((origin) => origin.trim()),
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'auth-service',
    usersTableConfigured: Boolean(config.usersTable),
    authStore: config.usersTable ? 'dynamodb' : 'local-file',
    pipelineConfigured: Boolean(config.pipelineApiUrl),
    bucketConfigured: Boolean(config.aws.bucket),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/pipeline', pipelineRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: error.message || 'Internal server error',
    details: error.details,
  });
});

module.exports = app;
