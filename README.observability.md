# Observability for LLM/Agent Workflows

A custom observability solution optimized for monitoring LLM and agent workflows, featuring real-time span tracking and minimal query capabilities.

## Quick Start

### 1. Start the System

```bash
# Start MongoDB and observability server
docker-compose -f docker-compose.obs.yml up -d

# Wait for services to be ready
curl http://localhost:3001/readyz
```

### 2. Run the Demo

```bash
# Install dependencies
pnpm install

# Run the interactive demo
cd examples/observability-demo
pnpm dev
```

### 3. Explore with API Examples

```bash
# Run comprehensive API examples
./scripts/api-examples.sh
```

## What's Included

### Core Components

- **@hautech/obs-sdk** - TypeScript SDK for instrumenting applications
- **@hautech/obs-server** - Fastify-based backend service with MongoDB storage
- **MongoDB** - Document storage optimized for span queries
- **Docker Compose** - Complete development environment

### Features

- **Real-time spans**: Immediate visibility into running operations (Extended mode)
- **Dual modes**: Extended (real-time) and OTLP (batched) collection
- **Query API**: Filter by status, running state, time range, and label patterns
- **Context propagation**: Automatic parent-child span relationships via AsyncLocalStorage
- **Reliability**: Retry logic, idempotency, and graceful error handling
- **Performance**: Optimized MongoDB indexes for common query patterns

## Architecture

```
┌─────────────────┐    HTTP/JSON    ┌─────────────────┐    MongoDB    ┌─────────────────┐
│   Application   │ ──────────────→ │  obs-server     │ ────────────→ │    Database     │
│   + obs-sdk     │                 │  (Fastify)      │              │   (spans coll.) │
└─────────────────┘                 └─────────────────┘              └─────────────────┘
        │                                    │
        │ withSpan()                         │ Query API
        ▼                                    ▼
┌─────────────────┐                 ┌─────────────────┐
│ AsyncLocalStorage│                │  REST Queries   │
│ Context Manager │                │  Cursor Pagination │
└─────────────────┘                 └─────────────────┘
```

## Usage Examples

### Basic Instrumentation

```typescript
import { observability } from '@hautech/obs-sdk';

// Initialize once at startup
observability.init({
  mode: 'extended',
  endpoint: 'http://localhost:3001',
  defaultAttributes: {
    service: 'my-agent',
    environment: 'production'
  }
});

// Instrument operations
await observability.withSpan(
  { 
    label: 'Agent: Process User Request',
    attributes: { userId: 'user123', requestType: 'analysis' }
  },
  async () => {
    // Nested operations are automatically traced
    const data = await observability.withSpan(
      { label: 'Tool: Fetch Data' },
      () => fetchData()
    );
    
    const result = await observability.withSpan(
      { label: 'LLM: Analyze Data' },
      () => analyzeWithLLM(data)
    );
    
    return result;
  }
);
```

### Query Examples

```bash
# Get all running spans
curl "http://localhost:3001/v1/spans?running=true"

# Get error spans from last hour
curl "http://localhost:3001/v1/spans?status=error&from=$(date -d '1 hour ago' +%s000)"

# Search spans by label pattern
curl "http://localhost:3001/v1/spans?label=LLM"

# Get specific span
curl "http://localhost:3001/v1/spans/{traceId}/{spanId}"
```

## Data Model

### Span Lifecycle (Extended Mode)

1. **Created**: Span is immediately sent when `withSpan()` is called
2. **Updated**: Changes to attributes/events are sent while span is running
3. **Completed**: Final state is sent when function completes or errors

### MongoDB Document

```javascript
{
  traceId: "abc123...",           // 32-char hex trace ID
  spanId: "def456...",            // 16-char hex span ID
  parentSpanId: "parent123...",   // Parent span reference
  label: "LLM: Generate Response", // Human-readable description
  status: "ok",                   // running | ok | error | cancelled
  startTime: 1640995200000,       // Unix timestamp (ms)
  endTime: 1640995201500,         // Unix timestamp (ms)
  completed: true,                // Completion flag
  lastUpdate: 1640995201500,      // Last modification timestamp
  attributes: {                   // Key-value metadata
    model: "gpt-4",
    temperature: 0.7,
    tokenCount: 150
  },
  events: [{                      // Timeline events
    name: "token_limit_reached",
    timestamp: 1640995201000,
    attributes: { limit: 4096 }
  }],
  rev: 3,                         // Revision counter
  createdAt: "2022-01-01T00:00:00Z",
  updatedAt: "2022-01-01T00:00:01Z"
}
```

## Configuration

### SDK Configuration

```typescript
observability.init({
  mode: 'extended',                    // 'extended' | 'otlp'
  endpoint: 'http://localhost:3001',   // Extended API endpoint
  otlpEndpoint: 'http://...',         // OTLP endpoint (for OTLP mode)
  maxRetries: 3,                      // Retry attempts
  retryBackoff: 1000,                 // Backoff delay (ms)
  defaultAttributes: {                // Applied to all spans
    service: 'my-service',
    version: '1.0.0'
  }
});
```

### Server Environment

```bash
PORT=3001                           # Server port
MONGO_URL=mongodb://localhost:27017/observability
LOG_LEVEL=info                      # debug | info | warn | error
CORS_ENABLED=true                   # Enable CORS
```

## API Reference

### Extended API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/spans/upsert` | POST | Create/update spans |
| `/v1/spans` | GET | Query spans with filters |
| `/v1/spans/{traceId}/{spanId}` | GET | Get single span |
| `/v1/traces` | POST | OTLP endpoint (placeholder) |
| `/healthz` | GET | Health check |
| `/readyz` | GET | Readiness check |

### Query Parameters

- `status`: Filter by span status
- `running`: Filter by completion state (boolean)
- `from`, `to`: Time range (Unix timestamps)
- `label`: Label pattern (case-insensitive regex)
- `cursor`: Pagination cursor
- `limit`: Results per page (1-100, default 50)
- `sort`: Sort field (`lastUpdate`, `startTime`)
- `order`: Sort order (`asc`, `desc`)

## Development

### Prerequisites

- Node.js 20+
- pnpm 10+
- Docker & Docker Compose

### Setup

```bash
# Install dependencies
pnpm install

# Start infrastructure
docker-compose -f docker-compose.obs.yml up -d

# Build packages
cd packages/obs-sdk && pnpm build
cd packages/obs-server && pnpm build

# Run tests
cd packages/obs-sdk && pnpm test
# Note: Server E2E tests require MongoDB memory server (may fail in restricted environments)

# Run demo
cd examples/observability-demo && pnpm dev
```

### Package Structure

```
packages/
├── obs-sdk/                    # SDK package
│   ├── src/
│   │   ├── sdk.ts             # Main SDK class
│   │   ├── span.ts            # Span implementation
│   │   ├── context.ts         # AsyncLocalStorage context
│   │   ├── http-client.ts     # HTTP communication
│   │   └── types.ts           # TypeScript definitions
│   └── __tests__/             # Unit tests
└── obs-server/                 # Server package
    ├── src/
    │   ├── index.ts           # Fastify server
    │   ├── spans.service.ts   # Business logic
    │   ├── mongo.ts           # MongoDB service
    │   ├── config.ts          # Configuration
    │   └── types.ts           # Zod schemas
    └── __tests__/             # E2E tests
```

## Performance Considerations

### SDK Performance

- **Extended mode**: Higher network usage, real-time visibility
- **OTLP mode**: Lower network usage, batched export
- **Context overhead**: Minimal impact via AsyncLocalStorage
- **Retry logic**: Exponential backoff with jitter

### Server Performance

- **Indexes**: Optimized for status, time, and running queries
- **Pagination**: Cursor-based for efficient large result sets
- **Upserts**: Atomic updates with revision counters
- **TTL**: Automatic cleanup after 30 days

### Scaling Recommendations

- **Read replicas**: Use MongoDB read replicas for query workloads
- **Sharding**: Shard by traceId for high write volumes
- **Connection pooling**: Configure appropriate pool sizes
- **Load balancing**: Multiple server instances behind load balancer

## Troubleshooting

### Common Issues

**SDK not sending data:**
- Verify `observability.init()` was called
- Check network connectivity to server endpoint
- Review console for error messages

**Server connection errors:**
- Check MongoDB connectivity: `curl http://localhost:3001/readyz`
- Verify `MONGO_URL` environment variable
- Check server logs for startup errors

**Missing spans:**
- Verify spans are completing successfully (no uncaught exceptions)
- Check query filters (status, time range, label)
- Consider TTL retention (30 days default)

### Monitoring

Monitor these metrics for healthy operation:

- **SDK**: HTTP request success rate, retry attempts
- **Server**: Request latency, MongoDB connection health
- **Database**: Query performance, index usage, storage size

## Migration from Traceloop/Jaeger

Key differences from existing tracing solutions:

1. **Real-time visibility**: Extended mode provides immediate span visibility
2. **Simplified data model**: MongoDB documents vs. distributed trace formats
3. **Query API**: REST-based vs. specialized query interfaces
4. **Retention**: TTL-based vs. manual cleanup processes

Migration approach:

1. Deploy observability system alongside existing infrastructure
2. Instrument new features with `@hautech/obs-sdk`
3. Gradually migrate existing instrumentation
4. Monitor both systems during transition period
5. Retire legacy system when confident in new solution

For detailed documentation, see [docs/observability.md](docs/observability.md).