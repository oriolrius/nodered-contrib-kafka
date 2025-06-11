module.exports = function (RED) {
    const { SchemaRegistry } = require('@kafkajs/confluent-schema-registry');

    function KafkaSchemaProducerNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.ready = false;
        node.schemaRegistry = null;
        node.cachedSchemaId = null;

        node.init = function () {
            node.debug(`[Kafka Schema Producer] Initializing schema producer for topic: ${config.topic}`);
            
            let broker = RED.nodes.getNode(config.broker);
            if (!broker) {
                node.error(`[Kafka Schema Producer] No broker configuration found`);
                return;
            }

            // Initialize Schema Registry
            try {
                const registryConfig = {
                    host: config.registryUrl,
                    clientId: 'node-red-schema-producer',
                    retry: {
                        retries: 3,
                        factor: 2,
                        multiplier: 1000,
                        maxRetryTimeInSecs: 60
                    }
                };

                // Add authentication if configured
                if (config.useRegistryAuth && config.registryUsername && config.registryPassword) {
                    registryConfig.auth = {
                        username: config.registryUsername,
                        password: config.registryPassword,
                    };
                    node.debug(`[Kafka Schema Producer] Schema Registry auth configured for user: ${config.registryUsername}`);
                }

                node.schemaRegistry = new SchemaRegistry(registryConfig);
                node.debug(`[Kafka Schema Producer] Schema Registry client created for: ${config.registryUrl}`);
            } catch (error) {
                node.error(`[Kafka Schema Producer] Failed to create Schema Registry client: ${error.message}`);
                return;
            }

            // Get Kafka client from broker
            try {
                const kafka = broker.getKafka();
                node.debug(`[Kafka Schema Producer] Kafka instance obtained successfully`);
                
                const producer = kafka.producer({
                    maxInFlightRequests: 1,
                    idempotent: config.requireAcks === 1,
                    requestTimeout: config.ackTimeoutMs || 100
                });

                producer.connect().then(() => {
                    node.debug(`[Kafka Schema Producer] Producer ready and connected to Kafka broker`);
                    node.ready = true;
                    node.status({ fill: "green", shape: "dot", text: "connected" });
                    
                    // Set up producer event handlers
                    producer.on('producer.connect', () => {
                        node.debug(`[Kafka Schema Producer] Producer connected to Kafka`);
                        node.status({ fill: "green", shape: "dot", text: "connected" });
                    });

                    producer.on('producer.disconnect', () => {
                        node.debug(`[Kafka Schema Producer] Producer disconnected from Kafka`);
                        node.status({ fill: "red", shape: "ring", text: "disconnected" });
                        node.ready = false;
                    });

                    // Store producer reference
                    node.producer = producer;

                }).catch(error => {
                    node.error(`[Kafka Schema Producer] Failed to connect producer: ${error.message}`, error);
                    node.status({ fill: "red", shape: "ring", text: "connection failed" });
                });

            } catch (error) {
                node.error(`[Kafka Schema Producer] Failed to get Kafka instance: ${error.message}`, error);
                node.status({ fill: "red", shape: "ring", text: "kafka failed" });
            }
        };

        node.getOrRegisterSchema = async function() {
            try {
                // Try to get existing schema
                if (node.cachedSchemaId) {
                    node.debug(`[Kafka Schema Producer] Using cached schema ID: ${node.cachedSchemaId}`);
                    return node.cachedSchemaId;
                }

                try {
                    const latestSchemaId = await node.schemaRegistry.getLatestSchemaId(config.schemaSubject);
                    node.cachedSchemaId = latestSchemaId;
                    node.debug(`[Kafka Schema Producer] Retrieved existing schema ID: ${latestSchemaId}`);
                    return latestSchemaId;
                } catch (error) {
                    node.debug(`[Kafka Schema Producer] Schema not found: ${error.message}`);
                    
                    // If auto-register is enabled, register the schema
                    if (config.autoRegister && config.autoSchema) {
                        node.debug(`[Kafka Schema Producer] Auto-registering schema for subject: ${config.schemaSubject}`);
                        
                        let schemaObject;
                        try {
                            schemaObject = JSON.parse(config.autoSchema);
                        } catch (parseError) {
                            throw new Error(`Invalid schema JSON: ${parseError.message}`);
                        }

                        const registeredSchema = await node.schemaRegistry.register({
                            type: 'AVRO',
                            schema: JSON.stringify(schemaObject)
                        }, {
                            subject: config.schemaSubject
                        });
                        
                        node.cachedSchemaId = registeredSchema.id;
                        node.debug(`[Kafka Schema Producer] Registered new schema with ID: ${registeredSchema.id}`);
                        return registeredSchema.id;
                    } else {
                        throw new Error(`Schema not found for subject ${config.schemaSubject} and auto-register is disabled`);
                    }
                }
            } catch (error) {
                node.error(`[Kafka Schema Producer] Schema operation failed: ${error.message}`);
                throw error;
            }
        };

        node.on('input', async function (msg) {
            if (!node.ready) {
                node.warn(`[Kafka Schema Producer] Producer not ready, discarding message`);
                return;
            }

            try {
                node.debug(`[Kafka Schema Producer] Received input message`);
                
                // Get or register schema
                const schemaId = await node.getOrRegisterSchema();
                
                // Prepare message data
                let messageData = msg.payload;
                if (typeof messageData === 'string') {
                    try {
                        messageData = JSON.parse(messageData);
                    } catch (parseError) {
                        node.error(`[Kafka Schema Producer] Failed to parse message payload as JSON: ${parseError.message}`);
                        return;
                    }
                }

                node.debug(`[Kafka Schema Producer] Message data to validate:`, messageData);

                // Encode message with schema validation
                let encodedMessage;
                try {
                    encodedMessage = await node.schemaRegistry.encode(schemaId, messageData);
                    node.debug(`[Kafka Schema Producer] Message validated and encoded successfully`);
                } catch (encodeError) {
                    node.error(`[Kafka Schema Producer] Schema validation failed: ${encodeError.message}`);
                    node.send([null, { payload: { error: encodeError.message, data: messageData } }]);
                    return;
                }

                // If validate-only mode, return the validated data without publishing
                if (config.validateOnly) {
                    node.debug(`[Kafka Schema Producer] Validation-only mode, not publishing to Kafka`);
                    msg.payload = { 
                        validated: true, 
                        schemaId: schemaId, 
                        originalData: messageData,
                        encodedSize: encodedMessage.length
                    };
                    node.send(msg);
                    return;
                }

                // Prepare Kafka message
                const kafkaMessage = {
                    topic: config.topic,
                    messages: [
                        {
                            key: msg.key || (messageData.id ? messageData.id.toString() : null),
                            value: encodedMessage,
                            timestamp: msg.timestamp || Date.now().toString(),
                            headers: msg.headers || {}
                        },
                    ],
                };

                // Send to Kafka
                node.debug(`[Kafka Schema Producer] Publishing validated message to topic: ${config.topic}`);
                const result = await node.producer.send(kafkaMessage);
                
                node.debug(`[Kafka Schema Producer] Message published successfully`);
                
                // Send success response
                msg.payload = {
                    success: true,
                    schemaId: schemaId,
                    kafkaResult: result,
                    originalData: messageData,
                    topic: config.topic
                };
                node.send(msg);

            } catch (error) {
                node.error(`[Kafka Schema Producer] Error processing message: ${error.message}`, error);
                node.send([null, { payload: { error: error.message, originalMessage: msg } }]);
            }
        });

        node.on('close', function (done) {
            node.debug(`[Kafka Schema Producer] Closing node`);
            if (node.producer) {
                node.producer.disconnect().then(() => {
                    node.debug(`[Kafka Schema Producer] Producer disconnected`);
                    done();
                }).catch(error => {
                    node.error(`[Kafka Schema Producer] Error disconnecting producer: ${error.message}`);
                    done();
                });
            } else {
                done();
            }
        });

        // Initialize the node
        node.init();
    }

    RED.nodes.registerType("hm-kafka-schema-producer", KafkaSchemaProducerNode);
};
