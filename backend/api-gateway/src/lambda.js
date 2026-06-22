const DEFAULT_TIMEOUT_MS = 29000;

const hopByHopHeaders = new Set([
  'connection',
  'content-length',
  'expect',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key,X-Amz-Date,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
  };
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function getServiceRoute(path) {
  const authServiceUrl = normalizeBaseUrl(process.env.AUTH_SERVICE_URL);
  const notificationServiceUrl = normalizeBaseUrl(process.env.NOTIFICATION_SERVICE_URL);

  if (path === '/health') {
    return null;
  }

  if (path.startsWith('/api/auth') || path.startsWith('/api/pipeline')) {
    return {
      name: 'auth-service',
      baseUrl: authServiceUrl,
      targetPath: path,
    };
  }

  if (path.startsWith('/api/notifications')) {
    return {
      name: 'notification-serverless',
      baseUrl: notificationServiceUrl,
      targetPath: path.replace(/^\/api\/notifications/, ''),
    };
  }

  return undefined;
}

function queryString(event) {
  const params = event.multiValueQueryStringParameters || event.queryStringParameters || {};
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, item));
      return;
    }

    if (value !== undefined && value !== null) {
      searchParams.append(key, value);
    }
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

function requestHeaders(event) {
  const headers = {};

  Object.entries(event.headers || {}).forEach(([key, value]) => {
    const lowerKey = key.toLowerCase();
    if (!hopByHopHeaders.has(lowerKey) && value !== undefined && value !== null) {
      headers[key] = value;
    }
  });

  headers['X-Gateway-Name'] = 'image-processing-api-gateway';
  headers['X-Forwarded-Path'] = event.path;

  return headers;
}

function requestBody(event) {
  if (!event.body) return undefined;
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
}

function responseHeaders(headers) {
  const output = {};

  headers.forEach((value, key) => {
    if (!hopByHopHeaders.has(key.toLowerCase())) {
      output[key] = value;
    }
  });

  return {
    ...output,
    ...corsHeaders(),
  };
}

async function gatewayHealth() {
  return jsonResponse(200, {
    success: true,
    service: 'api-gateway',
    routes: {
      auth: Boolean(process.env.AUTH_SERVICE_URL),
      pipeline: Boolean(process.env.AUTH_SERVICE_URL),
      notifications: Boolean(process.env.NOTIFICATION_SERVICE_URL),
    },
    rateLimit: {
      source: 'aws-api-gateway',
      apiKeyRequired: true,
    },
  });
}

async function proxyRequest(event, route) {
  if (!route.baseUrl) {
    return jsonResponse(503, {
      success: false,
      error: `${route.name} is not configured`,
      details: {
        missingEnvironmentVariable: route.name === 'notification-serverless'
          ? 'NOTIFICATION_SERVICE_URL'
          : 'AUTH_SERVICE_URL',
      },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.PROXY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));

  try {
    const targetUrl = `${route.baseUrl}${route.targetPath}${queryString(event)}`;
    const response = await fetch(targetUrl, {
      method: event.httpMethod,
      headers: requestHeaders(event),
      body: ['GET', 'HEAD'].includes(event.httpMethod) ? undefined : requestBody(event),
      signal: controller.signal,
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || '';
    const isTextResponse = contentType.includes('application/json')
      || contentType.startsWith('text/')
      || contentType.includes('application/problem+json');

    return {
      statusCode: response.status,
      headers: responseHeaders(response.headers),
      isBase64Encoded: !isTextResponse,
      body: isTextResponse ? buffer.toString('utf8') : buffer.toString('base64'),
    };
  } catch (error) {
    const isTimeout = error.name === 'AbortError';
    return jsonResponse(isTimeout ? 504 : 502, {
      success: false,
      error: isTimeout ? 'Gateway request timed out' : 'Gateway failed to reach upstream service',
      details: {
        service: route.name,
        message: error.message,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: '',
    };
  }

  if (event.path === '/health') {
    return gatewayHealth();
  }

  const route = getServiceRoute(event.path || '/');

  if (!route) {
    return jsonResponse(404, {
      success: false,
      error: `Route not found: ${event.httpMethod} ${event.path}`,
    });
  }

  return proxyRequest(event, route);
};
