# Dynamic Configuration Guide

This guide explains how to use dynamic configuration features in the Kafka nodes, allowing you to override node settings using input message properties and headers.

## Overview

The enhanced Kafka nodes now support dynamic configuration, enabling you to:

- Change topics, schema subjects, and registry URLs per message
- Override encoding, compression, and validation settings
- Modify IoT configurations on-the-fly
- Control error handling and output options dynamically

This is particularly useful for:
- Multi-tenant applications
- Dynamic routing based on message content
- A/B testing with different configurations
- Runtime environment switching

## Supported Nodes

### ✅ Kafka Producer (`hm-kafka-producer`)
### ✅ Kafka Schema Producer (`hm-kafka-schema-producer`) 
### ✅ Kafka Schema Consumer (`hm-kafka-schema-consumer`)
### ✅ Kafka Consumer (`hm-kafka-consumer`)

## Producer Nodes Dynamic Configuration

### Kafka Producer

#### Supported Dynamic Properties

| Property | Description | Example |
|----------|-------------|---------|
| `msg.topic` | Override target topic | `"dynamic-topic"` |
| `msg.key` | Set message key | `"user-123"` |
| `msg.headers` | Add message headers | `{"source": "api", "version": "v1"}` |
| `msg.requireAcks` | Override acknowledgment requirement | `1` or `0` |
| `msg.ackTimeoutMs` | Override ack timeout | `5000` |
| `msg.attributes` | Override compression (0=none, 1=gzip, 2=snappy) | `1` |
| `msg.useiot` | Enable/disable IoT mode | `true` |
| `msg.iot` | IoT configuration object | `{model: "sensor", device: "temp01"}` |
| `msg.broker` | Legacy IoT broker config | `{model: "device", iotType: "telemetry"}` |

#### Example Usage

```javascript
// Function node before Kafka Producer
msg.topic = "sensors-" + msg.payload.sensorType;
msg.key = msg.payload.deviceId;
msg.headers = {
    "source": "iot-gateway",
    "timestamp": Date.now().toString(),
    "priority": msg.payload.priority || "normal"
};
msg.requireAcks = msg.payload.critical ? 1 : 0;
msg.attributes = 1; // Use gzip compression

// Dynamic IoT configuration
if (msg.payload.useIoTFormat) {
    msg.useiot = true;
    msg.iot = {
        model: msg.payload.deviceModel,
        device: msg.payload.deviceId,
        iotType: "telemetry",
        fields: [
            {name: "temperature", type: "float"},
            {name: "humidity", type: "float"}
        ]
    };
}

return msg;
```

### Kafka Schema Producer

#### Supported Dynamic Properties

| Property | Description | Example |
|----------|-------------|---------|
| `msg.topic` | Override target topic | `"events-v2"` |
| `msg.schemaSubject` | Override schema subject | `"events-v2-value"` |
| `msg.registryUrl` | Override registry URL | `"http://prod-registry:8081"` |
| `msg.key` | Set message key | `"event-456"` |
| `msg.headers` | Add message headers | `{"schema-version": "v2"}` |
| `msg.timestamp` | Override message timestamp | `Date.now().toString()` |
| `msg.requireAcks` | Override acknowledgment requirement | `1` |
| `msg.ackTimeoutMs` | Override ack timeout | `10000` |
| `msg.validateOnly` | Enable validation-only mode | `true` |

#### Example Usage

```javascript
// Function node before Kafka Schema Producer
const environment = global.get("environment") || "dev";

// Route to different topics and schemas based on environment
if (environment === "production") {
    msg.topic = "prod-events";
    msg.schemaSubject = "prod-events-value";
    msg.registryUrl = "http://prod-registry:8081";
    msg.requireAcks = 1; // Ensure delivery in production
} else {
    msg.topic = "dev-events";
    msg.schemaSubject = "dev-events-value";
    msg.registryUrl = "http://dev-registry:8081";
    msg.validateOnly = true; // Only validate in dev
}

msg.key = msg.payload.eventId;
msg.headers = {
    "environment": environment,
    "schema-version": "v1.2",
    "source-system": "order-service"
};

return msg;
```

## Consumer Nodes Dynamic Configuration

### Kafka Schema Consumer

The schema consumer supports dynamic configuration through **message headers** since it doesn't have traditional input messages.

#### Supported Dynamic Headers

| Header | Description | Example |
|--------|-------------|---------|
| `x-schema-subject` | Override schema subject for decoding | `"events-v2-value"` |
| `x-registry-url` | Override registry URL | `"http://alt-registry:8081"` |
| `x-skip-invalid` | Override skip invalid messages setting | `"true"` or `"false"` |
| `x-output-raw` | Override output raw message setting | `"true"` or `"false"` |

#### Usage from Producer

When producing messages that will be consumed with dynamic configuration:

```javascript
// In producer (before sending to Kafka)
msg.headers = {
    "x-schema-subject": "custom-schema-value",
    "x-registry-url": "http://tenant-registry:8081",
    "x-skip-invalid": "true",
    "x-output-raw": "true"
};
```

The schema consumer will automatically detect these headers and use the specified configuration for that message.

### Kafka Consumer

#### Supported Dynamic Headers

| Header | Description | Example |
|--------|-------------|---------|
| `x-encoding` | Override message encoding | `"buffer"` or `"utf8"` |
| `x-include-headers` | Include headers in output | `"true"` or `"false"` |
| `x-include-metadata` | Include additional metadata | `"true"` or `"false"` |

#### Usage from Producer

```javascript
// In producer (before sending to Kafka)
msg.headers = {
    "x-encoding": "buffer",
    "x-include-headers": "true",
    "x-include-metadata": "true"
};
```

## Advanced Use Cases

### Multi-Tenant Applications

```javascript
// Route messages to tenant-specific topics and schemas
const tenantId = msg.payload.tenantId;

msg.topic = `tenant-${tenantId}-events`;
msg.schemaSubject = `tenant-${tenantId}-events-value`;
msg.key = `${tenantId}-${msg.payload.eventId}`;

// Add tenant info to headers
msg.headers = {
    "tenant-id": tenantId,
    "x-schema-subject": `tenant-${tenantId}-events-value`
};
```

### Environment-Based Routing

```javascript
// Switch configuration based on environment
const env = global.get("NODE_ENV") || "development";

const envConfig = {
    production: {
        topic: "prod-events",
        registryUrl: "http://prod-registry:8081",
        requireAcks: 1,
        compression: 1
    },
    staging: {
        topic: "staging-events", 
        registryUrl: "http://staging-registry:8081",
        requireAcks: 1,
        compression: 0
    },
    development: {
        topic: "dev-events",
        registryUrl: "http://localhost:8081",
        requireAcks: 0,
        validateOnly: true
    }
};

Object.assign(msg, envConfig[env]);
```

### A/B Testing

```javascript
// Route percentage of messages to experimental topic
const experimentGroup = Math.random() < 0.1 ? "experiment" : "control";

if (experimentGroup === "experiment") {
    msg.topic = "events-experiment";
    msg.schemaSubject = "events-experiment-value";
    msg.headers = {
        "experiment-group": "A",
        "x-schema-subject": "events-experiment-value"
    };
} else {
    msg.topic = "events-production";
    msg.schemaSubject = "events-production-value";
    msg.headers = {
        "experiment-group": "B"
    };
}
```

### Conditional IoT Processing

```javascript
// Enable IoT mode based on device type
if (msg.payload.deviceType === "sensor") {
    msg.useiot = true;
    msg.iot = {
        model: msg.payload.model,
        device: msg.payload.deviceId,
        iotType: "telemetry",
        fields: msg.payload.telemetryFields
    };
    msg.topic = "iot-telemetry";
} else {
    msg.useiot = false;
    msg.topic = "standard-events";
}
```

## Best Practices

### Security Considerations

1. **Validate Dynamic Inputs**: Always validate dynamic configuration values
2. **Whitelist Allowed Values**: Don't allow arbitrary registry URLs or topics
3. **Use Environment Variables**: Store sensitive URLs and credentials securely

```javascript
// Validate allowed registry URLs
const allowedRegistries = [
    "http://prod-registry:8081",
    "http://staging-registry:8081", 
    "http://localhost:8081"
];

if (msg.registryUrl && !allowedRegistries.includes(msg.registryUrl)) {
    node.error("Unauthorized registry URL: " + msg.registryUrl);
    return null;
}
```

### Performance Considerations

1. **Cache Dynamic Configs**: Avoid creating new registry clients for every message
2. **Batch Similar Configs**: Group messages with same dynamic config
3. **Monitor Resource Usage**: Dynamic configs can increase memory usage

### Error Handling

1. **Graceful Fallbacks**: Provide defaults when dynamic config fails
2. **Comprehensive Logging**: Log all dynamic configuration changes
3. **Validation**: Validate dynamic values before applying

```javascript
// Robust dynamic configuration with fallbacks
try {
    msg.topic = msg.dynamicTopic || config.defaultTopic;
    msg.schemaSubject = msg.dynamicSubject || config.defaultSubject;
    
    // Validate values
    if (!msg.topic.match(/^[a-zA-Z0-9._-]+$/)) {
        throw new Error("Invalid topic name");
    }
    
    node.debug(`Using dynamic config: topic=${msg.topic}, subject=${msg.schemaSubject}`);
    
} catch (error) {
    node.warn(`Dynamic config failed: ${error.message}, using defaults`);
    msg.topic = config.defaultTopic;
    msg.schemaSubject = config.defaultSubject;
}
```

## Migration from Static Configuration

To migrate existing flows to use dynamic configuration:

1. **Identify Dynamic Needs**: Determine which properties need to be dynamic
2. **Add Function Nodes**: Insert function nodes before Kafka nodes to set dynamic properties  
3. **Update Error Handling**: Account for dynamic configuration failures
4. **Test Thoroughly**: Verify all code paths with different dynamic configurations
5. **Monitor Performance**: Watch for performance impacts

## Troubleshooting

### Common Issues

1. **"Dynamic registry client creation failed"**
   - Check registry URL format and accessibility
   - Verify authentication credentials

2. **"Schema not found for dynamic subject"**
   - Ensure schema exists in the target registry
   - Enable auto-registration if needed

3. **"Invalid dynamic configuration"**
   - Validate property types and values
   - Check for typos in property names

### Debug Information

Enable debug logging to see dynamic configuration in action:

```
[Kafka Producer] Using dynamic config - Topic: events-v2, RequireAcks: 1, UseIoT: false
[Kafka Schema Producer] Using dynamic config - Topic: events-v2, Subject: events-v2-value, ValidateOnly: false
[Kafka Schema Consumer] Using dynamic schema subject from headers: events-v2-value
[Kafka Schema Consumer] Using dynamic registry URL from headers: http://alt-registry:8081
```

## Conclusion

Dynamic configuration provides powerful flexibility for Kafka nodes, enabling sophisticated routing, multi-tenancy, and runtime adaptation. Use it wisely with proper validation, error handling, and monitoring to build robust, flexible flows.
