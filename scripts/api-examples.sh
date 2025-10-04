#!/bin/bash

# Observability Server API Examples
# Make sure the server is running: docker-compose -f docker-compose.obs.yml up -d

BASE_URL="http://localhost:3001"

echo "🚀 Observability Server API Examples"
echo "====================================="
echo

# Check server health
echo "1. Health Checks"
echo "----------------"
echo "Health check:"
curl -s "$BASE_URL/healthz" | jq '.'
echo

echo "Readiness check:"
curl -s "$BASE_URL/readyz" | jq '.'
echo
echo

# Create a span
echo "2. Create Span (Extended API)"
echo "-----------------------------"
TRACE_ID="trace-$(date +%s)"
SPAN_ID="span-$(date +%s)"
START_TIME=$(date +%s000)

echo "Creating span with traceId: $TRACE_ID, spanId: $SPAN_ID"
curl -s -X POST "$BASE_URL/v1/spans/upsert" \
  -H "Content-Type: application/json" \
  -d '{
    "state": "created",
    "traceId": "'$TRACE_ID'",
    "spanId": "'$SPAN_ID'",
    "label": "Demo: User Request Processing",
    "status": "running",
    "startTime": '$START_TIME',
    "attributes": {
      "userId": "demo-user-123",
      "requestType": "data_analysis",
      "environment": "demo"
    },
    "idempotencyKey": "create-'$(date +%s)'-'$RANDOM'"
  }' | jq '.'
echo

# Update the span
echo "3. Update Span"
echo "--------------"
sleep 1
echo "Updating span with new attributes and events..."
curl -s -X POST "$BASE_URL/v1/spans/upsert" \
  -H "Content-Type: application/json" \
  -d '{
    "state": "updated",
    "traceId": "'$TRACE_ID'",
    "spanId": "'$SPAN_ID'",
    "status": "running",
    "attributes": {
      "progress": "50%",
      "currentStep": "data_processing"
    },
    "events": [
      {
        "name": "data_fetch_completed",
        "timestamp": '$(date +%s000)',
        "attributes": {
          "records": 1250,
          "source": "database"
        }
      }
    ],
    "idempotencyKey": "update-'$(date +%s)'-'$RANDOM'"
  }' | jq '.'
echo

# Complete the span
echo "4. Complete Span"
echo "----------------"
sleep 1
END_TIME=$(date +%s000)
echo "Completing span..."
curl -s -X POST "$BASE_URL/v1/spans/upsert" \
  -H "Content-Type: application/json" \
  -d '{
    "state": "completed",
    "traceId": "'$TRACE_ID'",
    "spanId": "'$SPAN_ID'",
    "status": "ok",
    "endTime": '$END_TIME',
    "attributes": {
      "progress": "100%",
      "result": "success"
    },
    "events": [
      {
        "name": "processing_completed",
        "timestamp": '$END_TIME',
        "attributes": {
          "duration_ms": '$(($END_TIME - $START_TIME))',
          "output_size": "2.5MB"
        }
      }
    ],
    "idempotencyKey": "complete-'$(date +%s)'-'$RANDOM'"
  }' | jq '.'
echo

# Retrieve the span
echo "5. Retrieve Single Span"
echo "-----------------------"
echo "Getting span details..."
curl -s "$BASE_URL/v1/spans/$TRACE_ID/$SPAN_ID" | jq '.'
echo
echo

# Create a few more spans for query examples
echo "6. Creating Additional Test Spans"
echo "---------------------------------"
for i in {1..3}; do
  TRACE_ID_2="trace-test-$i"
  SPAN_ID_2="span-test-$i"
  STATUS=("running" "ok" "error")
  LABEL=("Data Processing" "API Call" "File Upload")
  
  curl -s -X POST "$BASE_URL/v1/spans/upsert" \
    -H "Content-Type: application/json" \
    -d '{
      "state": "created",
      "traceId": "'$TRACE_ID_2'",
      "spanId": "'$SPAN_ID_2'",
      "label": "'${LABEL[$((i-1))]}'",
      "status": "'${STATUS[$((i-1))]}'",
      "startTime": '$(date +%s000)',
      "attributes": {
        "testData": true,
        "index": '$i'
      }
    }' > /dev/null
  
  if [ "${STATUS[$((i-1))]}" != "running" ]; then
    curl -s -X POST "$BASE_URL/v1/spans/upsert" \
      -H "Content-Type: application/json" \
      -d '{
        "state": "completed",
        "traceId": "'$TRACE_ID_2'",
        "spanId": "'$SPAN_ID_2'",
        "status": "'${STATUS[$((i-1))]}'",
        "endTime": '$(date +%s000)'
      }' > /dev/null
  fi
done
echo "Created 3 test spans with different statuses"
echo

# Query examples
echo "7. Query Examples"
echo "-----------------"

echo "All spans (latest first):"
curl -s "$BASE_URL/v1/spans?limit=10" | jq '.spans[] | {traceId, spanId, label, status, completed}'
echo

echo "Running spans only:"
curl -s "$BASE_URL/v1/spans?running=true" | jq '.spans[] | {traceId, spanId, label, status}'
echo

echo "Error spans only:"
curl -s "$BASE_URL/v1/spans?status=error" | jq '.spans[] | {traceId, spanId, label, status}'
echo

echo "Spans containing 'Data' in label:"
curl -s "$BASE_URL/v1/spans?label=Data" | jq '.spans[] | {traceId, spanId, label, status}'
echo

echo "Time range query (last 5 minutes):"
FROM_TIME=$(date -d '5 minutes ago' +%s000)
TO_TIME=$(date +%s000)
curl -s "$BASE_URL/v1/spans?from=$FROM_TIME&to=$TO_TIME&limit=5" | jq '.spans[] | {traceId, spanId, label, startTime, status}'
echo

# OTLP endpoint test
echo "8. OTLP Endpoint Test"
echo "--------------------"
echo "Testing OTLP endpoint (placeholder):"
curl -s -X POST "$BASE_URL/v1/traces" \
  -H "Content-Type: application/x-protobuf" \
  -d "mock-protobuf-data" | jq '.'
echo

echo "✅ API examples completed!"
echo "📊 Check the MongoDB collection 'spans' in database 'observability' to see stored data"
echo "🐳 Stop services: docker-compose -f docker-compose.obs.yml down"