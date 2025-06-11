# Publish with Schema Node Examples

## Basic Schema Validation Example

This example shows how to use the "Publish with Schema" node to validate and publish messages with Avro schemas.

### Configuration

1. **Kafka Broker**: Configure your existing hm-kafka-broker node
2. **Schema Registry**: Set up Schema Registry connection (usually running on port 8081)
3. **Topic**: The Kafka topic where messages will be published
4. **Schema Subject**: The subject name in Schema Registry (e.g., "my-topic-value")

### Example Flow

```json
[
    {
        "id": "inject1",
        "type": "inject",
        "name": "Test Message",
        "props": [
            {
                "p": "payload",
                "v": "{\"id\":\"msg-001\",\"message\":\"Hello Avro!\",\"timestamp\":1640995200000}",
                "vt": "json"
            }
        ],
        "wires": [["schema-producer1"]]
    },
    {
        "id": "schema-producer1",
        "type": "hm-kafka-schema-producer",
        "name": "Publish with Schema",
        "broker": "broker1",
        "topic": "test-topic",
        "registryUrl": "http://localhost:8081",
        "schemaSubject": "test-topic-value",
        "autoRegister": true,
        "autoSchema": "{\"type\":\"record\",\"name\":\"TestMessage\",\"fields\":[{\"name\":\"id\",\"type\":\"string\"},{\"name\":\"message\",\"type\":\"string\"},{\"name\":\"timestamp\",\"type\":\"long\"}]}",
        "wires": [["debug1"]]
    },
    {
        "id": "debug1",
        "type": "debug",
        "name": "Output",
        "wires": []
    }
]
```

### Default Schema

The node comes with a default schema that includes these fields:

```json
{
  "type": "record",
  "name": "Message",
  "fields": [
    {"name": "id", "type": "string"},
    {"name": "message", "type": "string"},
    {"name": "timestamp", "type": "long"}
  ]
}
```

### Message Format

Input messages should match the schema structure:

```json
{
  "id": "unique-message-id",
  "message": "Your message content",
  "timestamp": 1640995200000
}
```

## Advanced Examples

### 1. Schema Validation Only

Configure the node with `validateOnly: true` to test schema validation without publishing:

```json
{
  "validateOnly": true
}
```

Output will include validation results:

```json
{
  "validated": true,
  "schemaId": 1,
  "originalData": {...},
  "encodedSize": 42
}
```

### 2. Custom Schema with Complex Types

Example schema with optional fields and nested structures:

```json
{
  "type": "record",
  "name": "IoTSensorData",
  "fields": [
    {"name": "deviceId", "type": "string"},
    {"name": "timestamp", "type": "long"},
    {"name": "temperature", "type": "float"},
    {"name": "humidity", "type": ["null", "float"], "default": null},
    {
      "name": "location",
      "type": {
        "type": "record",
        "name": "Location",
        "fields": [
          {"name": "lat", "type": "double"},
          {"name": "lon", "type": "double"}
        ]
      }
    }
  ]
}
```

### 3. Schema Registry Authentication

For secured Schema Registry instances:

```json
{
  "useRegistryAuth": true,
  "registryUsername": "your-username",
  "registryPassword": "your-password"
}
```

## Error Handling

The node provides detailed error information for:

- **Schema validation failures**: When message doesn't match schema
- **Registry connection issues**: When Schema Registry is unreachable
- **Authentication failures**: When registry credentials are invalid
- **Schema not found**: When subject doesn't exist and auto-register is disabled

Error output example:

```json
{
  "error": "Schema validation failed: Field 'timestamp' is required but missing",
  "originalMessage": {...}
}
```

## Performance Tips

1. **Schema Caching**: The node caches schema IDs to avoid repeated registry calls
2. **Batch Processing**: Use with appropriate rate limiting for high-throughput scenarios
3. **Connection Pooling**: Reuse broker connections across multiple nodes

## Troubleshooting

### Common Issues

1. **"Schema not found"**: Ensure the subject exists in Schema Registry or enable auto-registration
2. **"Connection refused"**: Check Schema Registry URL and network connectivity
3. **"Validation failed"**: Verify message structure matches the registered schema
4. **"Authentication failed"**: Check registry credentials and permissions

### Debug Information

Enable debug logging to see detailed operation information:

```
[Kafka Schema Producer] Retrieved existing schema ID: 1
[Kafka Schema Producer] Message validated and encoded successfully
[Kafka Schema Producer] Message published successfully
```

## Configuration Variables

You can use environment variables or Node-RED global context for dynamic configuration:

```javascript
// In a function node before the schema producer
msg.registryUrl = global.get("SCHEMA_REGISTRY_URL");
msg.schemaSubject = global.get("SCHEMA_SUBJECT");
return msg;
```
