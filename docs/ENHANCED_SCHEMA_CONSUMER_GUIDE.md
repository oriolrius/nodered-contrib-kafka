# Kafka Schema Consumer Node - Enhanced Features

## Overview

The `kafka-schema-consumer` node is an advanced Kafka consumer that integrates with Confluent Schema Registry for automatic Avro message decoding and validation. This enhanced version includes performance monitoring, schema evolution tracking, batch processing, and multi-output capabilities.

## Key Features

### Core Features
- **Avro Message Decoding**: Automatically decodes Avro-encoded messages using schemas from Confluent Schema Registry
- **Schema Validation**: Validates incoming messages against registered schemas
- **Consumer Group Management**: Configurable consumer groups with automatic UUID generation
- **Offset Management**: Support for earliest, latest, and none offset strategies
- **Error Handling**: Configurable error handling with skip-invalid-messages option

### Enhanced Features (v2.0+)
- **Multi-Output Support**: Separate valid and invalid messages to different outputs
- **Performance Metrics**: Real-time processing time and throughput monitoring
- **Schema Evolution Tracking**: Monitors and logs schema version changes
- **Batch Processing**: Groups messages into batches for efficient processing
- **Advanced Status Monitoring**: Detailed status information with metrics
- **Schema Caching**: Improved performance with schema caching

## Configuration Options

### Basic Configuration
- **Name**: Optional node name
- **Broker**: Reference to kafka-broker configuration node
- **Topic**: Kafka topic to consume from (required)
- **Group ID**: Consumer group ID (auto-generated if not provided)
- **Min/Max Bytes**: Fetch size configuration
- **From Offset**: Starting offset strategy (latest, earliest, none)
- **Out of Range Offset**: Behavior when offset is out of range

### Schema Registry Configuration
- **Registry URL**: Confluent Schema Registry URL (default: http://localhost:8081)
- **Schema Subject**: Schema subject name for the topic (required)
- **Use Registry Authentication**: Enable basic auth for Schema Registry
- **Username/Password**: Authentication credentials
- **Auto-register Schema**: Automatically register schema if not found
- **Default Schema**: JSON schema definition for auto-registration
- **Skip Invalid Messages**: Continue processing when encountering invalid messages
- **Include Raw Message**: Include Kafka message metadata in output

### Advanced Configuration
- **Enable Multi-Output**: Split valid and invalid messages to separate outputs
- **Track Schema Evolution**: Monitor and log schema version changes
- **Enable Performance Metrics**: Track processing time and throughput
- **Batch Processing Size**: Group messages into batches (1 = no batching)
- **Processing Timeout**: Maximum time to wait for incomplete batches

## Output Formats

### Single Output Mode
```javascript
// Valid message
{
  payload: {
    // Decoded Avro data
  }, 
  kafkaMessage: { // Optional (if Include Raw Message is enabled)
    topic: "my-topic",
    partition: 0,
    offset: 12345,
    key: "message-key",
    timestamp: 1623456789000,
    headers: {},
    processingTime: 15.2 // Optional (if metrics enabled)
  }
}

// Error message (when skip invalid is disabled)
{
  payload: null,
  error: {
    message: "Schema decode error",
    type: "SCHEMA_DECODE_ERROR",
    processingTime: 5.1,
    kafkaMessage: {
      topic: "my-topic",
      partition: 0,
      offset: 12346,
      key: "invalid-key",
      timestamp: 1623456789001,
      rawValue: Buffer
    }
  }
}
```

### Multi-Output Mode
- **Output 1**: Valid decoded messages
- **Output 2**: Invalid messages with error details

### Batch Processing Mode
```javascript
{
  payload: [
    { /* decoded message 1 */ },
    { /* decoded message 2 */ },
    // ... more messages
  ],
  batchInfo: {
    size: 10,
    timestamp: 1623456789000,
    batchId: "uuid-batch-id"
  }
}
```

## Performance Metrics

When performance metrics are enabled, the node tracks:
- **Average Processing Time**: Mean time to decode each message
- **Messages Per Second**: Throughput rate
- **Total Processing Time**: Cumulative processing time
- **Error Rate**: Percentage of failed messages

Metrics are displayed in the node status and included in message metadata when enabled.

## Schema Evolution Tracking

The node can monitor schema evolution by tracking different schema IDs used in messages:
- Logs when new schema versions are detected
- Maintains statistics on schema usage
- Warns about schema evolution events
- Provides schema version information in debug logs

## Error Handling

### Skip Invalid Messages Mode
- Invalid messages are logged as warnings
- Processing continues with next message
- Error count is tracked in status

### Strict Mode (default)
- Invalid messages are sent as error objects
- Processing continues but errors are propagated
- Detailed error information is provided

## Status Indicators

The node provides detailed status information:
- **Initializing**: Node is starting up
- **Connecting to Schema Registry**: Establishing registry connection
- **Schema validated**: Schema retrieved/registered successfully
- **Connecting to Kafka**: Establishing Kafka connection
- **Ready**: Consumer is ready and waiting for messages
- **Reading (X)**: Actively processing messages with count
- **Reading (X) - Y msg/s**: Processing with throughput (when metrics enabled)
- **Batch: X/Y**: Current batch progress (when batching enabled)
- **Idle (X msgs)**: No recent messages, showing total processed
- **Error**: Connection or processing error occurred

## Best Practices

### Performance Optimization
1. **Enable Schema Caching**: Reduces Schema Registry calls
2. **Use Appropriate Batch Sizes**: Balance latency vs throughput
3. **Configure Fetch Parameters**: Optimize min/max bytes for your use case
4. **Monitor Metrics**: Use performance metrics to identify bottlenecks

### Schema Management
1. **Use Descriptive Subject Names**: Follow naming conventions (e.g., `topic-value`)
2. **Plan Schema Evolution**: Consider backward/forward compatibility
3. **Test Schema Changes**: Validate evolution in development environment
4. **Monitor Schema Evolution**: Enable tracking in production

### Error Handling
1. **Use Multi-Output**: Separate error handling logic
2. **Configure Skip Invalid**: Based on your error tolerance
3. **Monitor Error Rates**: Set up alerts for high error rates
4. **Log Error Details**: Use debug logs for troubleshooting

### Deployment Considerations
1. **Consumer Groups**: Use meaningful group IDs for scaling
2. **Offset Strategy**: Choose appropriate starting offset
3. **Resource Allocation**: Monitor memory usage with large schemas
4. **Network Configuration**: Ensure connectivity to both Kafka and Schema Registry

## Troubleshooting

### Common Issues

**Schema Not Found**
- Verify schema subject name
- Check Schema Registry connectivity
- Enable auto-registration if needed

**Connection Errors**
- Verify Kafka broker configuration
- Check network connectivity
- Validate authentication credentials

**Performance Issues**
- Monitor processing time metrics
- Adjust batch size settings
- Check Schema Registry response times
- Optimize schema complexity

**Message Decode Errors**
- Verify schema compatibility
- Check message format
- Enable debug logging
- Use multi-output to isolate errors

### Debug Information

Enable debug logging to see:
- Schema retrieval operations
- Message processing details
- Performance metrics
- Error stack traces
- Connection status changes

## Examples

### Basic Usage
```
[kafka-broker] -> [kafka-schema-consumer] -> [function]
```

### Multi-Output with Error Handling
```
[kafka-broker] -> [kafka-schema-consumer] -> [valid-processor]
                                        \-> [error-handler]
```

### Batch Processing
```
[kafka-broker] -> [kafka-schema-consumer] -> [batch-processor]
                     (batch size: 10)
```

### Performance Monitoring
```
[kafka-broker] -> [kafka-schema-consumer] -> [metrics-collector]
                     (metrics enabled)        -> [dashboard]
```

## Migration from Basic Consumer

To migrate from `kafka-consumer` to `kafka-schema-consumer`:

1. **Add Schema Registry Configuration**
   - Set Registry URL
   - Configure schema subject
   - Add authentication if needed

2. **Update Message Handling**
   - Messages are now pre-decoded
   - No need for manual JSON parsing
   - Handle new message structure

3. **Consider New Features**
   - Enable multi-output for better error handling
   - Use batch processing for higher throughput
   - Enable metrics for monitoring

4. **Test Schema Compatibility**
   - Verify existing messages work with schema
   - Test error handling with invalid messages
   - Validate performance impact

## Version History

### v2.0.0 (Enhanced)
- Added multi-output support
- Implemented schema evolution tracking
- Added performance metrics
- Introduced batch processing
- Enhanced status monitoring
- Improved error handling

### v1.0.0 (Initial)
- Basic Avro message decoding
- Schema Registry integration
- Consumer group management
- Basic error handling
