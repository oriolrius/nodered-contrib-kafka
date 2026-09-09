<!--
Copyright 2026 Yehor Roshcha
SPDX-License-Identifier: Apache-2.0
-->

# Kafka Send Node — Protobuf Serialization Guide

## Overview

Starting from **v6.2.0**, the Kafka Send node supports three serialization modes:

| Mode | Config value | When to use |
|------|-------------|-------------|
| Avro + Schema Registry | `serializationType: "avro"` | Default; Confluent SR Avro encoding |
| **Protobuf + Schema Registry** | `serializationType: "protobuf"`, `protobufMode: "registry"` | **Recommended.** Confluent wire format (magic byte + schema ID) |
| Protobuf Raw | `serializationType: "protobuf"`, `protobufMode: "raw"` | No Schema Registry; pure protobufjs bytes |

Node status badge shows the active mode: **`[avro]`**, **`[proto-sr]`**, or **`[proto-raw]`**.

---

## Node Configuration (UI fields)

| Field | Description |
|-------|-------------|
| **Enable Schema Validation** | Must be **checked** to use any serialization |
| **Serialization** | Choose `Avro` or `Protobuf` |
| **Mode** *(Protobuf only)* | `Schema Registry` (recommended) or `Raw` |
| **Registry URL** | Confluent Schema Registry URL, e.g. `http://localhost:8081` |
| **Schema Subject** | Subject name in SR, e.g. `my-topic-value` |
| **Schema Version** | `latest` or a specific version number |
| **Use SR Authentication** | Enables username/password for SR |
| **Auto-register schema** | Automatically register `.proto` in SR if not exists |
| **Message Name** | Root message type name from your `.proto`, e.g. `MyEvent` |
| **.proto Schema** | Full text of your `.proto` definition |

---

## What to put in `msg.payload`

`msg.payload` must be a **plain JavaScript object** whose fields match the Protobuf message type defined in your `.proto` schema.

### Example

Given this `.proto` schema (configured in the node):

```proto
syntax = "proto3";

message SensorReading {
  string device_id  = 1;
  double temperature = 2;
  double humidity    = 3;
  int64  timestamp   = 4;
}
```

Send this `msg` from a Function node or Inject node:

```javascript
msg.payload = {
    device_id:   "sensor-42",
    temperature: 23.5,
    humidity:    61.2,
    timestamp:   Date.now()
};
return msg;
```

The Kafka Send node will:
1. Validate the object against the `SensorReading` Protobuf type
2. Encode it (Confluent wire format with schema ID header in SR mode, or raw bytes in raw mode)
3. Publish the encoded bytes to the configured Kafka topic

---

## Optional message properties

You can override the Kafka topic and message key per-message:

```javascript
msg.payload = { device_id: "sensor-42", temperature: 23.5, humidity: 61.2, timestamp: Date.now() };
msg.topic   = "override-topic";   // optional: overrides the topic set in node config
msg.key     = "sensor-42";        // optional: Kafka partition key
return msg;
```

---

## Nested messages

Nested Protobuf messages are passed as nested JS objects:

```proto
syntax = "proto3";

message Location {
  double lat = 1;
  double lon = 2;
}

message Vehicle {
  string id       = 1;
  Location pos    = 2;
  float    speed  = 3;
}
```

```javascript
msg.payload = {
    id:    "truck-007",
    pos:   { lat: 50.45, lon: 30.52 },
    speed: 87.3
};
return msg;
```

---

## Repeated fields (arrays)

```proto
syntax = "proto3";

message Batch {
  string          source  = 1;
  repeated double values  = 2;
  repeated string tags    = 3;
}
```

```javascript
msg.payload = {
    source: "collector-1",
    values: [1.1, 2.2, 3.3],
    tags:   ["prod", "europe"]
};
return msg;
```

---

## Enum fields

```proto
syntax = "proto3";

enum Status { UNKNOWN = 0; ACTIVE = 1; INACTIVE = 2; }

message Device {
  string id     = 1;
  Status status = 2;
}
```

Pass the **integer value** of the enum:

```javascript
msg.payload = {
    id:     "device-01",
    status: 1  // ACTIVE
};
return msg;
```

---

## Output (what comes out of the node)

After successful publish, the node passes `msg` downstream with `msg.payload` replaced by a result object:

```javascript
msg.payload = {
    topic:         "my-topic",
    messageCount:  42,
    timestamp:     1716300000000,
    serialization: "protobuf-registry"  // or "protobuf-raw" / "avro" / "none"
};
```

---

## Error handling

| Situation | Behaviour |
|-----------|-----------|
| Object fields don't match the `.proto` definition | Node emits a warning, sets status to **Validation failed**, does **not** publish |
| Schema Registry unreachable | Node logs an error, status turns red |
| `msg.payload` is a JSON string | Node auto-parses it to an object before encoding |

---

## Mode comparison

| | Protobuf + SR | Protobuf Raw |
|---|---|---|
| Confluent wire format header | ✅ magic byte + 4-byte schema ID | ❌ raw bytes only |
| Compatible with ksqlDB / Confluent consumers | ✅ | ❌ |
| Schema Registry required | ✅ | ❌ |
| Auto-register schema | ✅ (optional) | — |
| Node status badge | `[proto-sr]` | `[proto-raw]` |
