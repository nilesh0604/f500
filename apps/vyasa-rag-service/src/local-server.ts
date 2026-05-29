/**
 * Local development server for testing Vyasa RAG service
 * Runs the Lambda handlers via Express for local HTTP testing
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { handler as chatHandler } from './handlers/chat';
import { handler as healthHandler } from './handlers/health';
import { handler as indexHandler } from './index';
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import type { LambdaResponse } from './types';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Create Lambda event from Express request
function createLambdaEvent(
  req: Request,
  path: string,
  method: string
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: new URLSearchParams(
      req.query as Record<string, string>
    ).toString(),
    headers: Object.entries(req.headers).reduce(
      (acc, [key, value]) => {
        acc[key.toLowerCase()] = String(value);
        return acc;
      },
      {} as Record<string, string>
    ),
    queryStringParameters: (req.query as Record<string, string>) || undefined,
    requestContext: {
      accountId: '123456789012',
      apiId: 'local-api',
      domainName: `localhost:${PORT}`,
      domainPrefix: 'localhost',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: req.ip || '127.0.0.1',
        userAgent: req.get('user-agent') || 'unknown',
      },
      requestId: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      routeKey: `${method} ${path}`,
      stage: 'local',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    body: req.body ? JSON.stringify(req.body) : undefined,
    isBase64Encoded: false,
  };
}

// Mock Lambda context
const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'vyasa-rag-local',
  functionVersion: 'local',
  invokedFunctionArn:
    'arn:aws:lambda:local:123456789012:function:vyasa-rag-local',
  memoryLimitInMB: '1024',
  awsRequestId: `local-${Date.now()}`,
  logGroupName: '/aws/lambda/vyasa-rag-local',
  logStreamName: `local-${new Date().toISOString().replace(/:/g, '-')}`,
  getRemainingTimeInMillis: () => 30000,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  done: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  fail: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  succeed: () => {},
};

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  try {
    const event = createLambdaEvent(req, '/health', 'GET');
    const result = (await healthHandler(event)) as LambdaResponse;
    res.status(result.statusCode).json(JSON.parse(result.body));
  } catch (error) {
    console.error('Health check error:', error);
    res
      .status(500)
      .json({ error: 'Internal server error', message: String(error) });
  }
});

// Chat endpoint (non-streaming)
app.post('/chat', async (req: Request, res: Response) => {
  try {
    const event = createLambdaEvent(req, '/chat', 'POST');
    const result = (await chatHandler(event)) as LambdaResponse;
    res.status(result.statusCode).json(JSON.parse(result.body));
  } catch (error) {
    console.error('Chat error:', error);
    res
      .status(500)
      .json({ error: 'Internal server error', message: String(error) });
  }
});

// Chat streaming endpoint (SSE)
app.post('/chat/stream', async (req: Request, res: Response) => {
  try {
    const event = createLambdaEvent(req, '/chat/stream', 'POST');
    const result = (await indexHandler(event, mockContext)) as LambdaResponse;

    // Handle SSE response
    if (
      result.headers &&
      result.headers['Content-Type'] === 'text/event-stream'
    ) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.status(result.statusCode);
      res.write(result.body as string);
      res.end();
    } else {
      res.status(result.statusCode).json(JSON.parse(result.body));
    }
  } catch (error) {
    console.error('Stream error:', error);
    res
      .status(500)
      .json({ error: 'Internal server error', message: String(error) });
  }
});

// Catch-all for other routes
app.all('*', async (req: Request, res: Response) => {
  try {
    const event = createLambdaEvent(req, req.path, req.method);
    const result = (await indexHandler(event, mockContext)) as LambdaResponse;
    res.status(result.statusCode).json(JSON.parse(result.body));
  } catch (error) {
    console.error('Handler error:', error);
    res
      .status(500)
      .json({ error: 'Internal server error', message: String(error) });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║     Vyasa RAG Service - Local Development Server         ║
╠═══════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT}                  ║
║                                                           ║
║  Available endpoints:                                     ║
║    GET  /health      - Health check                      ║
║    POST /chat        - Non-streaming chat                ║
║    POST /chat/stream - SSE streaming chat                ║
║                                                           ║
║  Example usage:                                          ║
║    curl -X POST http://localhost:${PORT}/chat \\\\            ║
║      -H "Content-Type: application/json" \\\\                 ║
║      -d '{"message": "Who was Karna?"}'                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
