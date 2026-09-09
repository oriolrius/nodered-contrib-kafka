/*
 * Copyright 2025 Oriol Rius
 * Copyright 2026 Yehor Roshcha
 *
 * This file contains original MIT-licensed work and Apache-2.0-licensed fork
 * modifications. See LICENSE, LICENSE-MIT, LICENSE-APACHE, and NOTICE.
 * SPDX-License-Identifier: MIT AND Apache-2.0
 */
module.exports = function (RED) {
    const { SchemaRegistry, SchemaType } = require('@kafkajs/confluent-schema-registry');
    const { CompressionTypes, CompressionCodecs } = require('kafkajs');
    const { getNameTypes, getMsgValues } = require('./utils');

    try {
        const SnappyCodec = require('kafkajs-snappy');
        CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;
    } catch (error) { /* Snappy codec not available */ }

    try {
        const LZ4Codec = require('kafkajs-lz4');
        CompressionCodecs[CompressionTypes.LZ4] = () => new LZ4Codec();
    } catch (error) { /* LZ4 codec not available */ }

    function getIotOptions(config) {
        var options = new Object();
        if (config.useiot) {
            options = new Object();
            options.model = config.model;
            options.device = config.device;
            options.iotType = config.iotType;
            options.fields = config.fields;
        }
        return options;
    }

    function KafkaProducerNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.ready = false;
        node.schemaRegistry = null;
        node.cachedSchemaId = null;
        node.cachedSchemaVersion = null;
        node.lastMessageTime = null;
        node.messageCount = 0;
        node.protobufType = null;
        node.protobufRoot = null;

        let iotOptions = {};

        node.init = function () {
            // serializationType: 'avro' | 'protobuf'
            // protobufMode:      'registry' (priority, uses Confluent SR) | 'raw' (protobufjs only)
            const serializationType = config.serializationType || 'avro';
            const protobufMode      = config.protobufMode || 'registry';

            const nodeLabel = config.useSchemaValidation
                ? (serializationType === 'protobuf'
                    ? (protobufMode === 'raw' ? 'Protobuf Raw Producer' : 'Protobuf SR Producer')
                    : 'Schema Producer')
                : 'Producer';

            const versionInfo = config.useSchemaValidation && config.schemaVersion && config.schemaVersion.trim() !== ''
                ? ` (schema version: ${config.schemaVersion.trim()})` : '';
            node.debug(`[Kafka ${nodeLabel}] Initializing for topic: ${config.topic}${versionInfo}`);
            node.status({ fill: 'yellow', shape: 'ring', text: 'Initializing...' });

            let broker = RED.nodes.getNode(config.broker);
            if (!broker) {
                node.error(`[Kafka ${nodeLabel}] No broker configuration found`);
                node.status({ fill: 'red', shape: 'ring', text: 'No broker config' });
                return;
            }

            if (broker && broker.getIotConfig) {
                const brokerIotConfig = broker.getIotConfig();
                iotOptions = brokerIotConfig.useiot ? brokerIotConfig : getIotOptions(config);
            } else {
                iotOptions = getIotOptions(config);
            }

            if (config.useSchemaValidation) {

                if (serializationType === 'protobuf') {
                    // Always parse the .proto definition (needed for validation + raw encoding)
                    node.status({ fill: 'yellow', shape: 'ring', text: 'Loading Protobuf schema...' });
                    try {
                        const protobuf = require('protobufjs');
                        if (!config.protobufSchema || config.protobufSchema.trim() === '') {
                            throw new Error('Protobuf schema (.proto) definition is required');
                        }
                        const messageName = config.protobufMessageName || 'Message';
                        const root = protobuf.parse(config.protobufSchema, { keepCase: true }).root;
                        node.protobufType = root.lookupType(messageName);
                        node.protobufRoot = root;
                        node.debug(`[Kafka Protobuf] Loaded .proto type "${messageName}"`);
                    } catch (error) {
                        node.error(`[Kafka Protobuf] Failed to parse .proto schema: ${error.message}`);
                        node.status({ fill: 'red', shape: 'ring', text: `Proto parse error` });
                        return;
                    }

                    if (protobufMode === 'registry') {
                        // Protobuf + Schema Registry: register .proto in Confluent SR
                        node.status({ fill: 'yellow', shape: 'ring', text: 'Connecting to SR (Protobuf)...' });
                        try {
                            const registryConfig = {
                                host: config.registryUrl,
                                clientId: 'node-red-protobuf-producer',
                                retry: { retries: 3, factor: 2, multiplier: 1000, maxRetryTimeInSecs: 60 }
                            };
                            if (config.useRegistryAuth && config.registryUsername && config.registryPassword) {
                                registryConfig.auth = { username: config.registryUsername, password: config.registryPassword };
                            }
                            node.schemaRegistry = new SchemaRegistry(registryConfig);
                            node.debug(`[Kafka Protobuf SR] Registry client created: ${config.registryUrl}`);
                            node.status({ fill: 'yellow', shape: 'ring', text: 'Protobuf SR connected' });
                        } catch (error) {
                            node.error(`[Kafka Protobuf SR] Failed to create SR client: ${error.message}`);
                            node.status({ fill: 'red', shape: 'ring', text: 'SR failed' });
                            return;
                        }
                    } else {
                        node.debug(`[Kafka Protobuf Raw] No Schema Registry â raw encoding`);
                        node.status({ fill: 'yellow', shape: 'ring', text: 'Protobuf raw mode' });
                    }

                } else {
                    // Avro + Schema Registry
                    node.status({ fill: 'yellow', shape: 'ring', text: 'Connecting to SR (Avro)...' });
                    try {
                        const registryConfig = {
                            host: config.registryUrl,
                            clientId: 'node-red-schema-producer',
                            retry: { retries: 3, factor: 2, multiplier: 1000, maxRetryTimeInSecs: 60 }
                        };
                        if (config.useRegistryAuth && config.registryUsername && config.registryPassword) {
                            registryConfig.auth = { username: config.registryUsername, password: config.registryPassword };
                            node.debug(`[Kafka Avro SR] Auth configured for user: ${config.registryUsername}`);
                        }
                        node.schemaRegistry = new SchemaRegistry(registryConfig);
                        node.debug(`[Kafka Avro SR] Registry client created: ${config.registryUrl}`);
                        node.status({ fill: 'yellow', shape: 'ring', text: 'Avro SR connected' });
                    } catch (error) {
                        node.error(`[Kafka Avro SR] Failed to create SR client: ${error.message}`);
                        node.status({ fill: 'red', shape: 'ring', text: 'Registry failed' });
                        return;
                    }
                }
            } else {
                node.debug(`[Kafka Producer] Schema validation disabled`);
            }

            node.status({ fill: 'yellow', shape: 'ring', text: 'Connecting to Kafka...' });
            try {
                const kafka = broker.getKafka();
                const producer = kafka.producer({
                    maxInFlightRequests: 1,
                    idempotent: config.requireAcks === 1,
                    requestTimeout: config.ackTimeoutMs || 100
                });

                producer.connect().then(() => {
                    node.debug(`[Kafka Producer] Connected`);
                    node.ready = true;
                    node.lastMessageTime = new Date().getTime();
                    node.messageCount = 0;
                    node.status({ fill: 'green', shape: 'ring', text: 'Ready' });

                    producer.on('producer.connect', () => {
                        node.status({ fill: 'green', shape: 'ring', text: 'Connected' });
                    });
                    producer.on('producer.disconnect', () => {
                        node.status({ fill: 'red', shape: 'ring', text: 'Disconnected' });
                        node.ready = false;
                        node.lastMessageTime = null;
                        node.messageCount = 0;
                    });
                    node.producer = producer;
                }).catch(error => {
                    node.error(`[Kafka Producer] Failed to connect: ${error.message}`, error);
                    node.status({ fill: 'red', shape: 'ring', text: `Connect failed` });
                    node.ready = false;
                    node.lastMessageTime = null;
                });
            } catch (error) {
                node.error(`[Kafka Producer] Failed to get Kafka instance: ${error.message}`, error);
                node.status({ fill: 'red', shape: 'ring', text: 'Kafka failed' });
                node.ready = false;
                node.lastMessageTime = null;
            }
        };

        // ââ Avro: get / auto-register schema from Confluent SR âââââââââââââââââââ
        node.getOrRegisterAvroSchema = async function () {
            const version = config.schemaVersion && config.schemaVersion.trim() !== ''
                ? config.schemaVersion.trim() : 'latest';

            if (node.cachedSchemaId && node.cachedSchemaVersion === version) {
                node.debug(`[Kafka Avro SR] Using cached schema ID: ${node.cachedSchemaId}`);
                node.status({ fill: 'blue', shape: 'ring', text: `Cached schema v${version}` });
                return node.cachedSchemaId;
            }

            node.debug(`[Kafka Avro SR] Fetching schema, version: ${version}`);
            node.status({ fill: 'blue', shape: 'ring', text: 'Getting Avro schema...' });

            let schemaId;
            if (version === 'latest') {
                if (config.autoRegister && config.autoSchema) {
                    let schemaObject;
                    try { schemaObject = JSON.parse(config.autoSchema); }
                    catch (e) { throw new Error(`Invalid Avro schema JSON: ${e.message}`); }
                    const registered = await node.schemaRegistry.register(
                        { type: SchemaType.AVRO, schema: JSON.stringify(schemaObject) },
                        { subject: config.schemaSubject }
                    );
                    schemaId = registered.id;
                    node.debug(`[Kafka Avro SR] Schema registered/found, ID: ${schemaId}`);
                } else {
                    schemaId = await node.schemaRegistry.getLatestSchemaId(config.schemaSubject);
                    node.debug(`[Kafka Avro SR] Latest ID for "${config.schemaSubject}": ${schemaId}`);
                }
            } else {
                schemaId = await node.schemaRegistry.getSchemaId(config.schemaSubject, parseInt(version));
                node.debug(`[Kafka Avro SR] Schema ID for v${version}: ${schemaId}`);
            }

            node.cachedSchemaId = schemaId;
            node.cachedSchemaVersion = version;
            node.status({ fill: 'blue', shape: 'ring', text: `Avro schema v${version} cached` });
            return schemaId;
        };

        // ââ Protobuf + Schema Registry: register .proto and encode âââââââââââââââ
        //    Registers the .proto definition in Confluent SR (type PROTOBUF),
        //    then uses schemaRegistry.encode() which prepends the Confluent wire
        //    format header (magic byte 0x00 + 4-byte schema ID).
        node.getOrRegisterProtobufSchema = async function () {
            const version = config.schemaVersion && config.schemaVersion.trim() !== ''
                ? config.schemaVersion.trim() : 'latest';

            if (node.cachedSchemaId && node.cachedSchemaVersion === version) {
                node.debug(`[Kafka Protobuf SR] Using cached schema ID: ${node.cachedSchemaId}`);
                node.status({ fill: 'blue', shape: 'ring', text: `Cached proto schema v${version}` });
                return node.cachedSchemaId;
            }

            node.debug(`[Kafka Protobuf SR] Fetching/registering .proto schema, version: ${version}`);
            node.status({ fill: 'blue', shape: 'ring', text: 'Getting Protobuf schema...' });

            let schemaId;
            if (version === 'latest') {
                if (config.autoRegister && config.protobufSchema) {
                    // Register (or idempotently get existing) .proto schema in SR
                    const registered = await node.schemaRegistry.register(
                        { type: SchemaType.PROTOBUF, schema: config.protobufSchema },
                        { subject: config.schemaSubject }
                    );
                    schemaId = registered.id;
                    node.debug(`[Kafka Protobuf SR] .proto registered/found in SR, ID: ${schemaId}`);
                } else {
                    schemaId = await node.schemaRegistry.getLatestSchemaId(config.schemaSubject);
                    node.debug(`[Kafka Protobuf SR] Latest ID for "${config.schemaSubject}": ${schemaId}`);
                }
            } else {
                schemaId = await node.schemaRegistry.getSchemaId(config.schemaSubject, parseInt(version));
                node.debug(`[Kafka Protobuf SR] Schema ID for v${version}: ${schemaId}`);
            }

            node.cachedSchemaId = schemaId;
            node.cachedSchemaVersion = version;
            node.status({ fill: 'blue', shape: 'ring', text: `Proto schema v${version} cached` });
            return schemaId;
        };

        // ââ Protobuf raw: pure protobufjs encoding, no Schema Registry ââââââââââââ
        node.encodeProtobufRaw = function (messageData) {
            if (!node.protobufType) {
                throw new Error('Protobuf type not loaded. Check your .proto schema definition.');
            }
            const errMsg = node.protobufType.verify(messageData);
            if (errMsg) throw new Error(`Protobuf validation error: ${errMsg}`);
            const protoMsg = node.protobufType.create(messageData);
            return Buffer.from(node.protobufType.encode(protoMsg).finish());
        };

        // ââ Input handler âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
        node.on('input', async function (msg) {
            const serializationType = config.serializationType || 'avro';
            const protobufMode      = config.protobufMode || 'registry';

            const nodeLabel = config.useSchemaValidation
                ? (serializationType === 'protobuf'
                    ? (protobufMode === 'raw' ? 'Protobuf Raw Producer' : 'Protobuf SR Producer')
                    : 'Schema Producer')
                : 'Producer';

            node.debug(`[Kafka ${nodeLabel}] Received input message`);

            if (!node.ready) {
                node.warn(`[Kafka ${nodeLabel}] Producer not ready, skipping message`);
                return;
            }

            try {
                let messageData = msg.payload;
                if (typeof messageData === 'string') {
                    try { messageData = JSON.parse(messageData); } catch (e) { /* keep as string */ }
                }

                // IoT formatting
                if (iotOptions && iotOptions.useiot) {
                    if (typeof messageData === 'string') {
                        try { messageData = JSON.parse(messageData); }
                        catch (parseError) {
                            node.error(`[Kafka ${nodeLabel}] Failed to parse payload as JSON: ${parseError.message}`);
                            node.status({ fill: 'red', shape: 'ring', text: 'Parse error' });
                            return;
                        }
                    }
                    const nameTypes = getNameTypes(iotOptions.fields);
                    const msgValues = getMsgValues(messageData, iotOptions.fields);
                    messageData = {
                        mc: iotOptions.model, dc: iotOptions.device,
                        type: iotOptions.iotType, nameTypes,
                        ts: [new Date().getTime()], values: [msgValues]
                    };
                }

                let serializedValue;

                if (config.useSchemaValidation) {

                    if (serializationType === 'protobuf') {

                        if (protobufMode === 'registry') {
                            // ââ Protobuf + Schema Registry (priority) âââââââââââââ
                            node.debug(`[Kafka Protobuf SR] Encoding via Schema Registry`);
                            node.status({ fill: 'blue', shape: 'dot', text: 'Encoding (proto-sr)' });

                            const schemaId = await node.getOrRegisterProtobufSchema();

                            if (config.validateOnly) {
                                const errMsg = node.protobufType
                                    ? node.protobufType.verify(messageData)
                                    : 'Protobuf type not loaded';
                                if (errMsg) {
                                    node.warn(`[Kafka Protobuf SR] Validation failed: ${errMsg}`);
                                    node.status({ fill: 'yellow', shape: 'ring', text: 'Validation failed' });
                                    msg.payload = { validated: false, error: errMsg };
                                    node.send(msg);
                                    return;
                                }
                                node.status({ fill: 'green', shape: 'ring', text: 'Validated (not sent)' });
                                msg.payload = { validated: true, schemaId };
                                node.send(msg);
                                return;
                            }

                            // schemaRegistry.encode prepends magic byte + schema ID header
                            serializedValue = await node.schemaRegistry.encode(schemaId, messageData);

                            // Confluent Protobuf wire format requires a message index byte (0x00 for
                            // the first/only message type) at position 5, right after the 5-byte header
                            // (magic byte 0x00 + 4-byte schema ID). Some SR client versions omit it.
                            if (serializedValue.length > 5 && serializedValue.readUInt8(5) !== 0) {
                                const patched = Buffer.alloc(serializedValue.length + 1);
                                serializedValue.copy(patched, 0, 0, 5);   // copy 5-byte header
                                patched.writeUInt8(0, 5);                  // insert message index 0x00
                                serializedValue.copy(patched, 6, 5);       // copy protobuf payload
                                serializedValue = patched;
                                node.debug('[Kafka Protobuf SR] Inserted missing Confluent message index byte');
                            }
                            node.debug(`[Kafka Protobuf SR] Encoded with schema ID: ${schemaId}`);

                        } else {
                            // ââ Protobuf raw (no Schema Registry) âââââââââââââââââ
                            node.debug(`[Kafka Protobuf Raw] Encoding with protobufjs`);
                            node.status({ fill: 'blue', shape: 'dot', text: 'Encoding (proto-raw)' });

                            if (config.validateOnly) {
                                const errMsg = node.protobufType
                                    ? node.protobufType.verify(messageData)
                                    : 'Protobuf type not loaded';
                                if (errMsg) {
                                    node.warn(`[Kafka Protobuf Raw] Validation failed: ${errMsg}`);
                                    node.status({ fill: 'yellow', shape: 'ring', text: 'Validation failed' });
                                    msg.payload = { validated: false, error: errMsg };
                                    node.send(msg);
                                    return;
                                }
                                node.status({ fill: 'green', shape: 'ring', text: 'Validated (not sent)' });
                                msg.payload = { validated: true };
                                node.send(msg);
                                return;
                            }

                            serializedValue = node.encodeProtobufRaw(messageData);
                            node.debug(`[Kafka Protobuf Raw] Encoded to ${serializedValue.length} bytes`);
                        }

                    } else {
                        // ââ Avro + Schema Registry âââââââââââââââââââââââââââââââââ
                        node.debug(`[Kafka Avro SR] Encoding via Schema Registry`);
                        node.status({ fill: 'blue', shape: 'dot', text: 'Encoding (avro)' });

                        const schemaId = await node.getOrRegisterAvroSchema();

                        if (config.validateOnly) {
                            try {
                                await node.schemaRegistry.encode(schemaId, messageData);
                                node.status({ fill: 'green', shape: 'ring', text: 'Validated (not sent)' });
                                msg.payload = { validated: true, schemaId };
                                node.send(msg);
                            } catch (validationError) {
                                node.warn(`[Kafka Avro SR] Validation failed: ${validationError.message}`);
                                node.status({ fill: 'yellow', shape: 'ring', text: 'Validation failed' });
                                msg.payload = { validated: false, error: validationError.message };
                                node.send(msg);
                            }
                            return;
                        }

                        serializedValue = await node.schemaRegistry.encode(schemaId, messageData);
                        node.debug(`[Kafka Avro SR] Encoded with schema ID: ${schemaId}`);
                    }

                } else {
                    serializedValue = typeof messageData === 'string' ? messageData : JSON.stringify(messageData);
                }

                const topic = msg.topic || config.topic;
                const kafkaMessage = { value: serializedValue };

                if (msg.key !== undefined) {
                    kafkaMessage.key = typeof msg.key === 'string' ? msg.key : JSON.stringify(msg.key);
                } else if (config.messageKey && config.messageKey.trim() !== '') {
                    kafkaMessage.key = config.messageKey.trim();
                }
                if (msg.headers && typeof msg.headers === 'object') {
                    kafkaMessage.headers = msg.headers;
                }

                node.debug(`[Kafka ${nodeLabel}] Sending to topic: ${topic}`);
                node.status({ fill: 'blue', shape: 'dot', text: 'Sending...' });

                const compressionType = config.compressionType !== undefined
                    ? Number(config.compressionType) : CompressionTypes.None;

                await node.producer.send({ topic, compression: compressionType, messages: [kafkaMessage] });

                node.messageCount++;
                node.lastMessageTime = new Date().getTime();

                let serTag = '';
                if (config.useSchemaValidation) {
                    serTag = serializationType === 'protobuf'
                        ? (protobufMode === 'raw' ? ' [proto-raw]' : ' [proto-sr]')
                        : ' [avro]';
                }
                node.status({ fill: 'green', shape: 'dot', text: `Sent${serTag} #${node.messageCount}` });

                msg.payload = {
                    topic,
                    messageCount: node.messageCount,
                    timestamp: node.lastMessageTime,
                    serialization: config.useSchemaValidation
                        ? (serializationType === 'protobuf'
                            ? (protobufMode === 'raw' ? 'protobuf-raw' : 'protobuf-registry')
                            : 'avro')
                        : 'none'
                };
                node.send(msg);

            } catch (error) {
                node.error(`[Kafka Producer] Error: ${error.message}`, error);
                node.status({ fill: 'red', shape: 'ring', text: `Error: ${error.message.substring(0, 15)}...` });
                node.lastMessageTime = null;
            }
        });

        node.checkLastMessageTime = function () {
            if (node.lastMessageTime) {
                const serializationType = config.serializationType || 'avro';
                const protobufMode      = config.protobufMode || 'registry';
                let serTag = '';
                if (config.useSchemaValidation) {
                    serTag = serializationType === 'protobuf'
                        ? (protobufMode === 'raw' ? ' [proto-raw]' : ' [proto-sr]')
                        : ' [avro]';
                }
                const timeSince = new Date().getTime() - node.lastMessageTime;
                const minutes = Math.floor(timeSince / 60000);
                const seconds = Math.floor((timeSince % 60000) / 1000);
                node.status({ fill: 'green', shape: 'ring',
                    text: `Ready${serTag} | Last: ${minutes}m ${seconds}s | Count: ${node.messageCount}` });
            }
        };

        node.on('close', function (done) {
            node.debug(`[Kafka Producer] Node closing`);
            node.ready = false;
            node.protobufType = null;
            node.protobufRoot = null;
            if (node.producer) {
                node.producer.disconnect()
                    .then(() => { node.debug('[Kafka Producer] Disconnected'); done(); })
                    .catch(error => { node.error(`[Kafka Producer] Error: ${error.message}`); done(); });
            } else {
                done();
            }
        });

        node.init();
    }

    RED.nodes.registerType('yroshcha-kafka-producer', KafkaProducerNode);
};
