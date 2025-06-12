# @oriolrius/kafka

Kafka Consumer and Producer

## Acknowledgments

We extend our sincere gratitude to the original creators and contributors of the Node-RED Kafka integration projects that served as the foundation for this work. This project builds upon the excellent groundwork laid by the Node-RED community in creating Kafka connectivity solutions.

## About This Project

This Node-RED Kafka client is based on the original `node-red-contrib-kafka` implementations but has been completely modernized and enhanced. **We have migrated from the legacy `kafka-node` library to the modern `kafkajs` library** for better performance, reliability, and active maintenance support.

### Key Improvements Over Original Projects

- **Modern Library**: Uses `kafkajs` instead of the deprecated `kafka-node`
- **Enhanced SASL Support**: Better SASL authentication with support for PLAIN, SCRAM-SHA-256, and SCRAM-SHA-512 mechanisms
- **Improved SSL/TLS**: Enhanced certificate handling and SSL configuration options
- **Better Error Handling**: More detailed error reporting and debugging capabilities
- **Active Maintenance**: Built on actively maintained libraries for long-term reliability
- **IoT Integration**: Added specialized IoT cloud configuration features

This node can be used to produce and consume messages to/from Kafka. It consists of four nodes:

- **Kafka Broker** (hm-kafka-broker) - Connection configuration
- **Kafka Send** (hm-kafka-producer) - Send messages to Kafka topics  
- **Kafka Receive** (hm-kafka-consumer) - Receive messages from Kafka topics
- **Kafka Schema Send** (hm-kafka-schema-producer) - Send messages with Avro schema validation
- **Kafka Schema Receive** (hm-kafka-schema-consumer) - Receive and decode Avro messages

### Dynamic Configuration Support ⚡ NEW

**All Kafka nodes now support dynamic configuration**, allowing you to override node settings using input message properties. This enables:

- **Multi-tenant applications**: Route messages to different topics/schemas per tenant
- **Environment-based routing**: Switch between dev/staging/production configurations
- **A/B testing**: Route traffic to experimental configurations
- **Runtime flexibility**: Change behavior without redeploying flows

#### Quick Example
```javascript
// Function node before Kafka Producer
msg.topic = "tenant-" + msg.payload.tenantId + "-events";
msg.key = msg.payload.userId;
msg.headers = {"tenant-id": msg.payload.tenantId};
msg.requireAcks = msg.payload.critical ? 1 : 0;
return msg;
```

**📚 See [Dynamic Configuration Guide](docs/DYNAMIC_CONFIGURATION_GUIDE.md) for complete documentation and examples.**

### Schema Registry Support

**NEW**: The `hm-kafka-schema-producer` node adds Avro schema validation support using Confluent Schema Registry. This node:
- Validates message payloads against registered Avro schemas
- Supports automatic schema registration if schema doesn't exist
- Provides schema-only validation mode for testing
- Integrates with Confluent Schema Registry authentication
- Ensures data consistency and compatibility across your Kafka ecosystem

### SASL Authentication Support

This library provides comprehensive SASL authentication support based on the `kafkajs` project. It now supports:
- **PLAIN** - Basic username/password authentication
- **SCRAM-SHA-256** - Secure password authentication with SHA-256
- **SCRAM-SHA-512** - Secure password authentication with SHA-512

These enhanced authentication mechanisms provide better security compared to the original `kafka-node` implementations.

## Input Parameters

### Kafka Broker (Connection Configuration)

#### Name (Optional)

Name wanted to be shown in Node

#### Hosts

Host names comma delimited (Multiple host is provided)

#### Use TLS

Check if TLS security is required for Kafka Cluster

#### CA Certs (Optional)

CA Root certificate path defined in Kafka Cluster

#### Client Cert (Optional)

Client cert path created by openssl derived from Private Key (pem)

#### Private Key (Optional)

Private Key path created by openssl (pem)

#### Passphrase (Optional)

Passphrase of created private Key

#### Self Sign

Check if want to be allowed untrusted certificates

#### Use SASL

Check if SASL security is required for Kafka Cluster

#### SASL Mechanism

Select the SASL authentication mechanism: PLAIN, SCRAM-SHA-256, or SCRAM-SHA-512

#### SASL Username (Optional)

SASL Username

#### SASL Password (Optional)

SASL Password

### Kafka Send (Producer)

#### Name (Optional)

Name wanted to be shown in Node

#### Broker

Broker which is wanted to be connected

#### Topic

Topic name of selected broker which messages will be published to

#### Require Ack

Default value is 1. 0 can be set if Acknowledge is not required.

#### Ack Timeout

Timeout of acknowledge response.

#### Attributes

Can be selected if compression is important

### Kafka Receive (Consumer)

#### Name (Optional)

Name wanted to be shown in Node

#### Broker

Broker which is wanted to be connected

#### Topic

Topic name of selected broker which is wanted to be consumed

#### From Offset

'latest', 'none' or 'earliest' options can be selected

#### Out of Range Offset

'latest', 'none' or 'earliest' options can be selected

### Kafka Schema Send (Schema Producer)

#### Name (Optional)
Name wanted to be shown in Node

#### Broker
Broker which is wanted to be connected

#### Topic
Topic name of selected broker which messages will be published to

#### Require Ack
Default value is 1. 0 can be set if Acknowledge is not required.

#### Ack Timeout (Ms)
Timeout of acknowledge response in milliseconds.

#### Registry URL
Confluent Schema Registry URL (e.g., http://localhost:8081)

#### Schema Subject
The subject name for the Avro schema in the registry (e.g., my-topic-value)

#### Use Registry Authentication
Check if authentication is required for Schema Registry

#### Registry Username (Optional)
Username for Schema Registry authentication

#### Registry Password (Optional)
Password for Schema Registry authentication

#### Auto-register schema if not found
Check to automatically register the schema if it doesn't exist in the registry

#### Default Schema (JSON)
Avro schema definition in JSON format used for auto-registration

#### Validate schema only
Check to only validate the message against the schema without publishing to Kafka

## Installation
```
npm install @edgeflow/kafka-client
```

## Usage
1. Example JSON here
```JSON
{"topic":"TOPIC_NAME","value":"DENEME","offset":16638,"partition":0,"highWaterOffset":16639,"key":null,"timestamp":"2020-08-19T08:58:27.866Z"}
```
## Screenshots

![kafka-broker](./images/kafka-broker.PNG)

![kafka-broker-iot](./images/kafka-broker-iot.png)

![kafka-consumer](./images/kafka-consumer.PNG)

![kafka-flow](./images/kafka-flow.PNG)

![kafka-producer](./images/kafka-producer.PNG)

## IoT Parameter Description

Source format

```json
{
    "enterCarNum": 105,
    "internetStatus": 1,
    "dataTime": 1706438947487,
    "name": "G-end pre-release parking lot",
    "freeNum": 4997,
    "plateNum": 5102,
    "parkId": "20201130105422734010026003601298"
}

```

broker enables IoT cloud configuration and automatically formats it as:

```json
{
  "mc": "121212",
  "dc": "343434",
  "type": "props",
  "nameTypes": [
    "name:TEXT",
    "parkId:TEXT",
    "enterCarNum:INT32",
    "internetStatus:INT32",
    "freeNum:INT32",
    "plateNum:INT32"
  ],
  "ts": [1706442643979],
  "values": [
    ["G-end pre-release parking lot", "20201130105422734010026003601298", 105, 1, 4997, 5102]
  ]
}

```

flows code

```json
[
    {
        "id": "38455e3c08fa62ab",
        "type": "tab",
        "label": "Flow 1",
        "disabled": false,
        "info": "",
        "env": []
    },
    {
        "id": "b8e47102069aaad9",
        "type": "inject",
        "z": "38455e3c08fa62ab",
        "name": "",
        "props": [
            {
                "p": "payload"
            },
            {
                "p": "topic",
                "vt": "str"
            }
        ],
        "repeat": "",
        "crontab": "",
        "once": true,
        "onceDelay": 0.1,
        "topic": "",
        "payload": "",
        "payloadType": "date",
        "x": 300,
        "y": 280,
        "wires": [
            [
                "e5701b52b51b6c72"
            ]
        ]
    },
    {
        "id": "e5701b52b51b6c72",
        "type": "function",
        "z": "38455e3c08fa62ab",
        "name": "Data",
        "func": "msg.broker = {};\nmsg.broker.model = '121212'\nmsg.broker.device = '343434'\n\nmsg.payload = {\n    \"enterCarNum\": 105,\n    \"internetStatus\": 1,\n    \"dataTime\": 1706438947487,\n    \"name\": \"G-end pre-release parking lot\",\n    \"freeNum\": 4997,\n    \"plateNum\": 5102,\n    \"parkId\": \"20201130105422734010026003601298\"\n}\n\nreturn msg;",
        "outputs": 1,
        "timeout": 0,
        "noerr": 0,
        "initialize": "",
        "finalize": "",
        "libs": [],
        "x": 490,
        "y": 280,
        "wires": [
            [
                "ce8b5c02b1f4c17c"
            ]
        ]
    },
    {
        "id": "ce8b5c02b1f4c17c",
        "type": "hm-kafka-producer",
        "z": "38455e3c08fa62ab",
        "name": "",
        "broker": "f7b89f9454780a93",
        "topic": "iot-tablet-props-test",
        "requireAcks": 1,
        "ackTimeoutMs": 100,
        "attributes": 0,
        "x": 720,
        "y": 280,
        "wires": []
    },
    {
        "id": "4b2b5ddfd4f03b36",
        "type": "hm-kafka-consumer",
        "z": "38455e3c08fa62ab",
        "name": "",
        "broker": "f7b89f9454780a93",
        "outOfRangeOffset": "earliest",
        "fromOffset": "latest",
        "topic": "iot-tablet-props-test",
        "groupid": "",
        "encoding": "utf8",
        "x": 280,
        "y": 420,
        "wires": [
            [
                "dc995c6be8028295"
            ]
        ]
    },
    {
        "id": "04ad34e8b6dd113d",
        "type": "debug",
        "z": "38455e3c08fa62ab",
        "name": "debug 1",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "false",
        "statusVal": "",
        "statusType": "auto",
        "x": 660,
        "y": 420,
        "wires": []
    },
    {
        "id": "dc995c6be8028295",
        "type": "function",
        "z": "38455e3c08fa62ab",
        "name": "toJSON",
        "func": "const value = JSON.parse(msg.payload.value)\nmsg.payload = value\nreturn msg;",
        "outputs": 1,
        "timeout": 0,
        "noerr": 0,
        "initialize": "",
        "finalize": "",
        "libs": [],
        "x": 480,
        "y": 420,
        "wires": [
            [
                "04ad34e8b6dd113d"
            ]
        ]
    },
    {
        "id": "f7b89f9454780a93",
        "type": "hm-kafka-broker",
        "name": "",
        "hosts": "147.13.93.122:19004",
        "usesasl": false,
        "username": "",
        "password": "",
        "usetls": false,
        "cacert": "",
        "clientcert": "",
        "privatekey": "",
        "passphrase": "",
        "selfsign": false,
        "useiot": true,
        "model": "use",
        "device": "use",
        "iotType": "props",
        "fields": [
            {
                "fieldName": "name",
                "dataType": "TEXT"
            },
            {
                "fieldName": "parkId",
                "dataType": "TEXT"
            },
            {
                "fieldName": "enterCarNum",
                "dataType": "INT32"
            },
            {
                "fieldName": "internetStatus",
                "dataType": "INT32"
            },
            {
                "fieldName": "freeNum",
                "dataType": "INT32"
            },
            {
                "fieldName": "plateNum",
                "dataType": "INT32"
            }
        ]
    }
]
```

## Documentation

This project includes comprehensive documentation to help you get started and understand all features:

### Getting Started
- **[Schema Guide](docs/SCHEMA_GUIDE.md)** - Complete guide to using Avro schema validation with the Schema Producer node
- **[Migration Guide](docs/MIGRATION_GUIDE.md)** - Guide for migrating from legacy kafka-node based implementations

### Development & Implementation
- **[Implementation Summary](docs/IMPLEMENTATION_SUMMARY.md)** - Technical overview of the project's architecture and components
- **[Debug Guide](docs/DEBUG_GUIDE.md)** - Troubleshooting and debugging information for common issues

### Improvements & Features
- **[Schema Producer Status Improvements](docs/SCHEMA_PRODUCER_STATUS_IMPROVEMENTS.md)** - Details about status reporting enhancements in the Schema Producer
- **[Node Names Improvement](docs/NODE_NAMES_IMPROVEMENT.md)** - Information about node naming conventions and improvements

## License

This project is licensed under the MIT License - the same license as the original Node-RED Kafka projects that served as its foundation.

## Acknowledgments

We extend our sincere gratitude to the original creators and contributors of the Node-RED Kafka integration projects that served as the foundation for this work. This project builds upon the excellent groundwork laid by the Node-RED community in creating Kafka connectivity solutions.

**Migration from kafka-node to kafkajs**: This Node-RED Kafka client is based on the original `node-red-contrib-kafka` implementations but has been completely modernized. We have migrated from the legacy `kafka-node` library to the modern `kafkajs` library for better performance, reliability, and active maintenance support.

### Key Improvements Over Original Projects

- **Modern Library**: Uses `kafkajs` instead of the deprecated `kafka-node`
- **Enhanced SASL Support**: Better SASL authentication with support for PLAIN, SCRAM-SHA-256, and SCRAM-SHA-512 mechanisms  
- **Improved SSL/TLS**: Enhanced certificate handling and SSL configuration options
- **Better Error Handling**: More detailed error reporting and debugging capabilities
- **Active Maintenance**: Built on actively maintained libraries for long-term reliability
- **IoT Integration**: Added specialized IoT cloud configuration features

The enhanced SASL authentication mechanisms provide significantly better security compared to the original `kafka-node` implementations, making this solution more suitable for production environments.