# Migration Guide: kafka-node to kafkajs

This document outlines the migration from `kafka-node` to `kafkajs` in the EdgeFlow Kafka Client Node-RED library.

## Overview

The library has been migrated from the `kafka-node` library to `kafkajs` for the following benefits:

- **Better Performance**: kafkajs is more modern and performant
- **Active Maintenance**: kafkajs is actively maintained while kafka-node is deprecated
- **Better Error Handling**: Improved error reporting and debugging capabilities
- **Modern JavaScript**: Uses async/await patterns for better code readability
- **Better TypeScript Support**: If you use TypeScript in your Node-RED environment

## Breaking Changes

### 1. Message Format Changes

**Before (kafka-node):**
```javascript
// Consumer message format
{
  topic: "my-topic",
  partition: 0,
  offset: 12345,
  key: null,
  value: "message content",
  timestamp: "2020-08-19T08:58:27.866Z"
}
```

**After (kafkajs):**
```javascript
// Consumer message format (unchanged for compatibility)
{
  topic: "my-topic",
  partition: 0,
  offset: "12345",  // Note: offset is now a string
  key: null,
  value: "message content",
  timestamp: "1597829907866"  // Unix timestamp as string
}
```

### 2. Configuration Changes

#### Broker Configuration

**Before:**
- Used `kafkaHost` format: `"host1:9092,host2:9092"`

**After:**
- Now uses `brokers` array internally: `["host1:9092", "host2:9092"]`
- **No change needed in UI** - the same comma-separated format is still supported

#### SSL Configuration

**Before:**
```javascript
sslOptions: {
  ca: [fs.readFileSync(path)],
  cert: [fs.readFileSync(path)],
  key: [fs.readFileSync(path)]
}
```

**After:**
```javascript
ssl: {
  ca: fs.readFileSync(path),      // No array wrapper
  cert: fs.readFileSync(path),    // No array wrapper
  key: fs.readFileSync(path)      // No array wrapper
}
```

### 3. Producer Changes

**Before:**
- Used callback-based `producer.send([options], callback)`
- Required `requireAcks` and `ackTimeoutMs` options

**After:**
- Uses async/await pattern
- Maps compression attributes to kafkajs compression types
- Better error handling with detailed error messages

### 4. Consumer Changes

**Before:**
- Event-based consumer with `connect`, `message`, `error` events
- Used `ConsumerGroup` class

**After:**
- Uses async/await pattern with `consumer.run({ eachMessage })`
- Automatic reconnection handling
- Better subscription management

## What Stays the Same

### 1. Node-RED Interface
- All UI elements remain exactly the same
- Same configuration options in the Node-RED editor
- Same visual appearance and behavior

### 2. IoT Features
- IoT cloud configuration works identically
- Field mapping and message transformation unchanged
- All IoT-specific functionality preserved

### 3. SASL Authentication
- Same SASL mechanisms supported: PLAIN, SCRAM-SHA-256, SCRAM-SHA-512
- Same configuration interface

### 4. TLS/SSL Support
- Same certificate configuration
- Same file path inputs for CA, client cert, and private key

## Migration Steps

### For Existing Users

1. **Update the Package**
   ```bash
   npm update @edgeflow/kafka-client
   ```

2. **No Configuration Changes Required**
   - Existing flows will continue to work
   - No need to reconfigure nodes

3. **Check Debug Logs**
   - Debug messages may have slightly different formats
   - Look for new `[Kafka Broker]`, `[Kafka Producer]`, `[Kafka Consumer]` prefixes

### For Developers

1. **Update Dependencies**
   ```json
   {
     "dependencies": {
       "kafkajs": "^2.2.4"
     }
   }
   ```

2. **Review Error Handling**
   - Error messages may be more detailed
   - Check any custom error handling code

## Performance Improvements

### Connection Management
- Faster initial connections
- Better connection pooling
- Improved reconnection logic

### Message Processing
- Lower memory usage
- Better throughput for high-volume scenarios
- Improved batch processing

### Error Recovery
- More robust error handling
- Better retry mechanisms
- Improved connection stability

## Troubleshooting

### Common Issues After Migration

1. **Offset Format**
   - Offsets are now strings instead of numbers
   - Update any code that performs numeric operations on offsets

2. **Timestamp Format**
   - Timestamps are Unix timestamps as strings
   - Convert to Date objects if needed: `new Date(parseInt(timestamp))`

3. **Connection Errors**
   - Check debug logs for more detailed error information
   - kafkajs provides better error descriptions

### Debug Information

Enable debug logging to see detailed information:

```javascript
// In Node-RED settings.js
logging: {
    console: {
        level: "debug",
        metrics: false,
        audit: false
    }
}
```

Look for these debug message patterns:
- `[Kafka Broker] Creating connection options for brokers: ...`
- `[Kafka Producer] Producer ready and connected to Kafka broker`
- `[Kafka Consumer] Successfully connected to Kafka broker`

## Support

If you encounter issues after the migration:

1. Check the debug logs for detailed error information
2. Verify your Kafka broker version compatibility
3. Test with a simple producer-consumer setup first
4. Report issues on the GitHub repository with debug logs

## Version Compatibility

- **Node.js**: Requires Node.js >=14.6.0 (unchanged)
- **Node-RED**: Requires Node-RED >=3.0.0 (unchanged)
- **Kafka**: Compatible with Kafka 0.10+ (improved compatibility)

The migration maintains backward compatibility while providing better performance and reliability for your Kafka integration in Node-RED.
