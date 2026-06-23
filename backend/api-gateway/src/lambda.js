const { InvokeCommand, LambdaClient } = require('@aws-sdk/client-lambda');

const DEFAULT_TIMEOUT_MS = 29000;
const lambda = new LambdaClient({});

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

function getServiceRoute(path) {
  if (path === '/health') {
    return null;
  }

  if (path.startsWith('/api/auth') || path.startsWith('/api/pipeline')) {
    return {
      name: 'auth-service',
      functionName: process.env.AUTH_SERVICE_FUNCTION_NAME,
      targetPath: path,
    };
  }

  const subscriptionMatch = path.match(/^\/api\/notifications\/users\/([^/]+)\/subscriptions$/);
  if (subscriptionMatch) {
    return {
      name: 'notification-serverless',
      targetPath: path.replace(/^\/api\/notifications/, ''),
      pathParameters: { userId: decodeURIComponent(subscriptionMatch[1]) },
      resolveFunctionName(httpMethod) {
        return httpMethod === 'GET'
          ? process.env.NOTIFICATION_GET_SUBSCRIPTIONS_FUNCTION_NAME
          : process.env.NOTIFICATION_SAVE_SUBSCRIPTION_FUNCTION_NAME;
      },
    };
  }

  if (path.startsWith('/api/notifications')) {
    return {
      name: 'notification-serverless',
      functionName: '',
      targetPath: path.replace(/^\/api\/notifications/, ''),
    };
  }

  return undefined;
}

async function gatewayHealth() {
  return jsonResponse(200, {
    success: true,
    service: 'api-gateway',
    routes: {
      auth: Boolean(process.env.AUTH_SERVICE_FUNCTION_NAME),
      pipeline: Boolean(process.env.AUTH_SERVICE_FUNCTION_NAME),
      notifications: Boolean(process.env.NOTIFICATION_SAVE_SUBSCRIPTION_FUNCTION_NAME)
        && Boolean(process.env.NOTIFICATION_GET_SUBSCRIPTIONS_FUNCTION_NAME),
    },
    rateLimit: {
      source: 'aws-api-gateway',
      apiKeyRequired: true,
    },
  });
}

function serviceEvent(event, route) {
  return {
    ...event,
    path: route.targetPath,
    resource: route.targetPath,
    pathParameters: route.pathParameters || event.pathParameters || null,
    headers: {
      ...(event.headers || {}),
      'X-Gateway-Name': 'image-processing-api-gateway',
      'X-Forwarded-Path': event.path,
    },
  };
}

function stripUpstreamManagedHeaders(headers = {}) {
  const blockedHeaders = new Set([
    'access-control-allow-origin',
    'access-control-allow-credentials',
    'access-control-allow-headers',
    'access-control-allow-methods',
    'access-control-max-age',
    'x-content-type-options',
  ]);

  return Object.entries(headers).reduce((cleanHeaders, [key, value]) => {
    if (!blockedHeaders.has(key.toLowerCase())) {
      cleanHeaders[key] = value;
    }

    return cleanHeaders;
  }, {});
}

function normalizeLambdaResponse(payload) {
  const response = typeof payload === 'string' ? JSON.parse(payload) : payload;

  return {
    statusCode: response.statusCode || 200,
    headers: {
      ...stripUpstreamManagedHeaders(response.headers),
      ...corsHeaders(),
    },
    isBase64Encoded: Boolean(response.isBase64Encoded),
    body: response.body || '',
  };
}

async function proxyRequest(event, route) {
  const functionName = route.resolveFunctionName
    ? route.resolveFunctionName(event.httpMethod)
    : route.functionName;

  if (!functionName) {
    return jsonResponse(503, {
      success: false,
      error: `${route.name} is not configured`,
      details: {
        missingEnvironmentVariable: route.name === 'notification-serverless'
          ? 'NOTIFICATION_SAVE_SUBSCRIPTION_FUNCTION_NAME or NOTIFICATION_GET_SUBSCRIPTIONS_FUNCTION_NAME'
          : 'AUTH_SERVICE_FUNCTION_NAME',
      },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.PROXY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));

  try {
    const response = await lambda.send(new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(serviceEvent(event, route))),
    }), { abortSignal: controller.signal });

    const payloadText = Buffer.from(response.Payload || '').toString('utf8');

    if (response.FunctionError) {
      return jsonResponse(502, {
        success: false,
        error: `${route.name} Lambda returned an error`,
        details: payloadText ? JSON.parse(payloadText) : undefined,
      });
    }

    return normalizeLambdaResponse(payloadText);
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
