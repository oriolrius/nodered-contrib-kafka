# Kafka Client Debug Guide

This guide explains how to use the comprehensive debug information added to the Kafka client nodes. The library has been migrated from kafka-node to kafkajs for better performance and modern features.

## Debug Information Available

### 1. Kafka Broker Configuration
- **Connection Options**: Logs details about hosts, TLS, and SASL configuration
- **Certificate Loading**: Shows success/failure of loading SSL certificates
- **SSL Configuration**: Reports SSL settings like reject unauthorized
- **SASL Configuration**: Shows authentication mechanism and username

### 2. Kafka Consumer
- **Initialization**: Logs consumer group creation and configuration
- **Connection Status**: Reports successful connection to Kafka brokers
- **Message Reception**: Logs each received message with topic, partition, and offset
- **Consumer Group Events**: Reports rebalancing events
- **Error Handling**: Detailed error messages with full error objects
- **Idle Detection**: Reports when consumer has been idle for more than 5 seconds

### 3. Kafka Producer
- **Initialization**: Logs producer creation and configuration
- **IoT Configuration**: Shows whether IoT mode is enabled and field mappings
- **Message Processing**: Logs how messages are formatted (IoT vs raw)
- **Send Operations**: Reports successful/failed message sends
- **Connection Status**: Shows producer ready/error states
- **Idle Detection**: Reports when producer has been idle for more than 5 seconds

### 4. Utils (IoT Message Processing)
- **Field Processing**: Shows how field definitions are processed
- **Payload Transformation**: Logs payload type and content
- **Record Generation**: Shows how individual records are created
- **Timestamp Generation**: Reports timestamp creation for messages

## How to Enable Debug Logging

### Method 1: Node-RED Debug Panel
1. Open Node-RED in your browser
2. Go to the Debug tab in the right panel
3. Deploy your flow
4. All debug messages will appear with prefixes like:
   - `[Kafka Broker]`
   - `[Kafka Consumer]`
   - `[Kafka Producer]`
   - `[Utils]`

### Method 2: Node-RED Logs
If running Node-RED from command line, debug messages will appear in the console output.

### Method 3: Enable Detailed Logging
Add this to your Node-RED settings.js file to see all debug messages:

```javascript
logging: {
    console: {
        level: "debug",
        metrics: false,
        audit: false
    }
}
```

## Common Debug Scenarios

### 1. Connection Issues
Look for these debug messages:
```
[Kafka Broker] Creating connection options for hosts: broker1:9092,broker2:9092
[Kafka Broker] TLS enabled, configuring SSL options
[Kafka Consumer] Successfully connected to Kafka broker
[Kafka Producer] Producer ready and connected to Kafka broker
```

### 2. SSL/TLS Certificate Problems
```
[Kafka Broker] Successfully loaded CA certificate from: /path/to/ca.pem
[Kafka Broker] Failed to load CA certificate from /path/to/ca.pem: ENOENT
```

### 3. Message Publishing Issues
```
[Kafka Producer] Received input message
[Kafka Producer] Processing message in IoT format
[Kafka Producer] IoT message prepared: {"mc":"121212","dc":"343434",...}
[Kafka Producer] Message sent successfully to topic: my-topic
```

### 4. Consumer Message Reception
```
[Kafka Consumer] Received message from topic my-topic, partition 0, offset 12345
[Kafka Consumer] Message value: {"temperature": 25.5, "humidity": 60}
```

### 5. IoT Configuration Issues
```
[Kafka Producer] IoT mode enabled - Model: 121212, Device: 343434, Type: props
[Utils] Processing 3 field definitions
[Utils] Created nameType: temperature:FLOAT
[Utils] Field temperature (FLOAT): 25.5
```

## Error Troubleshooting

### Connection Errors
- Check broker host configuration
- Verify network connectivity
- Check SSL/SASL credentials
- Look for certificate loading errors

### Message Send Failures
- Verify topic exists
- Check producer acknowledgment settings
- Look for serialization errors in IoT mode
- Verify field mappings match payload structure

### Consumer Issues
- Check consumer group permissions
- Verify topic subscription
- Look for offset out of range errors
- Check message encoding settings

## Performance Monitoring

The debug logs include:
- Message send timestamps
- Idle detection (5+ seconds without activity)
- Consumer group rebalancing events
- Connection state changes

## Debug Message Format

All debug messages follow this pattern:
```
[Component] Description: details
```

Where Component is one of:
- `Kafka Broker`: Configuration and connection setup
- `Kafka Consumer`: Message consumption and consumer group management
- `Kafka Producer`: Message production and sending
- `Utils`: IoT message processing utilities

## Tips for Effective Debugging

1. **Start Simple**: Test with a basic producer-consumer setup first
2. **Check Connections**: Verify broker connectivity before troubleshooting messages
3. **Validate Configuration**: Ensure SSL certificates and SASL credentials are correct
4. **Monitor Message Flow**: Use debug messages to trace message journey
5. **IoT Mode**: When using IoT features, verify field mappings match your data structure

## Example Debug Session

Here's what a successful message flow looks like:

```
[Kafka Broker] Creating connection options for hosts: localhost:9092
[Kafka Broker] TLS disabled, using plain connection
[Kafka Broker] SASL disabled
[Kafka Producer] Initializing producer for topic: test-topic
[Kafka Producer] KafkaClient created successfully
[Kafka Producer] Producer ready and connected to Kafka broker
[Kafka Producer] Received input message
[Kafka Producer] Processing message in raw format
[Kafka Producer] Raw message prepared: {"test": "data"}
[Kafka Producer] Message sent successfully to topic: test-topic
[Kafka Consumer] Received message from topic test-topic, partition 0, offset 123
[Kafka Consumer] Message value: {"test": "data"}
```

This debug information will help you identify exactly where issues occur in your Kafka integration and provide detailed context for troubleshooting.
