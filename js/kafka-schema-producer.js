module.exports = function (RED) {
    const { SchemaRegistry } = require('@kafkajs/confluent-schema-registry');

    function KafkaSchemaProducerNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.ready = false;
        node.schemaRegistry = null;
        node.cachedSchemaId = null;
        node.lastMessageTime = null;
        node.messageCount = 0;

        node.init = function () {
            node.debug(`[Kafka Schema Producer] Initializing schema producer for topic: ${config.topic}`);
            node.status({ fill: "yellow", shape: "ring", text: "Initializing..." });
            
            let broker = RED.nodes.getNode(config.broker);
            if (!broker) {
                node.error(`[Kafka Schema Producer] No broker configuration found`);
                node.status({ fill: "red", shape: "ring", text: "No broker config" });
                return;
            }

            // Initialize Schema Registry
            node.status({ fill: "yellow", shape: "ring", text: "Connecting to Schema Registry..." });
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
                node.status({ fill: "yellow", shape: "ring", text: "Registry connected" });
            } catch (error) {
                node.error(`[Kafka Schema Producer] Failed to create Schema Registry client: ${error.message}`);
                node.status({ fill: "red", shape: "ring", text: `Registry failed: ${error.message.substring(0, 10)}...` });
                return;
            }

            // Get Kafka client from broker
            node.status({ fill: "yellow", shape: "ring", text: "Connecting to Kafka..." });
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
                    node.lastMessageTime = new Date().getTime();
                    node.messageCount = 0;
                    node.status({ fill: "green", shape: "ring", text: "Ready" });
                    
                    // Set up producer event handlers
                    producer.on('producer.connect', () => {
                        node.debug(`[Kafka Schema Producer] Producer connected to Kafka`);
                        node.status({ fill: "green", shape: "ring", text: "Connected" });
                    });

                    producer.on('producer.disconnect', () => {
                        node.debug(`[Kafka Schema Producer] Producer disconnected from Kafka`);
                        node.status({ fill: "red", shape: "ring", text: "Disconnected" });
                        node.ready = false;
                        node.lastMessageTime = null;
                        node.messageCount = 0;
                    });

                    // Store producer reference
                    node.producer = producer;

                }).catch(error => {
                    node.error(`[Kafka Schema Producer] Failed to connect producer: ${error.message}`, error);
                    node.status({ fill: "red", shape: "ring", text: `Connect failed: ${error.message.substring(0, 15)}...` });
                    node.ready = false;
                    node.lastMessageTime = null;
                });

            } catch (error) {
                node.error(`[Kafka Schema Producer] Failed to get Kafka instance: ${error.message}`, error);
                node.status({ fill: "red", shape: "ring", text: `Kafka failed: ${error.message.substring(0, 10)}...` });
                node.ready = false;
                node.lastMessageTime = null;
            }
        };

        node.getOrRegisterSchema = async function() {
            try {
                // Try to get existing schema
                if (node.cachedSchemaId) {
                    node.debug(`[Kafka Schema Producer] Using cached schema ID: ${node.cachedSchemaId}`);
                    node.status({ fill: "blue", shape: "ring", text: "Using cached schema" });
                    return node.cachedSchemaId;
                }

                node.status({ fill: "blue", shape: "ring", text: "Getting schema..." });
                try {
                    const latestSchemaId = await node.schemaRegistry.getLatestSchemaId(config.schemaSubject);
                    node.cachedSchemaId = latestSchemaId;
                    node.debug(`[Kafka Schema Producer] Retrieved existing schema ID: ${latestSchemaId}`);
                    node.status({ fill: "blue", shape: "ring", text: "Schema retrieved" });
                    return latestSchemaId;
                } catch (error) {
                    node.debug(`[Kafka Schema Producer] Schema not found: ${error.message}`);
                    
                    // If auto-register is enabled, register the schema
                    if (config.autoRegister && config.autoSchema) {
                        node.debug(`[Kafka Schema Producer] Auto-registering schema for subject: ${config.schemaSubject}`);
                        node.status({ fill: "blue", shape: "ring", text: "Registering schema..." });
                        
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
                        node.status({ fill: "blue", shape: "ring", text: "Schema registered" });
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
            node.debug(`[Kafka Schema Producer] Received input message`);
            
            if (!node.ready) {
                node.warn(`[Kafka Schema Producer] Producer not ready, discarding message`);
                node.status({ fill: "yellow", shape: "ring", text: "Not ready" });
                return;
            }

            try {
                node.status({ fill: "blue", shape: "dot", text: "Validating schema" });
                
                // Get or register schema
                const schemaId = await node.getOrRegisterSchema();
                
                // Prepare message data
                let messageData = msg.payload;
                if (typeof messageData === 'string') {
                    try {
                        messageData = JSON.parse(messageData);
                    } catch (parseError) {
                        node.error(`[Kafka Schema Producer] Failed to parse message payload as JSON: ${parseError.message}`);
                        node.status({ fill: "red", shape: "ring", text: "Parse error" });
                        return;
                    }
                }

                node.debug(`[Kafka Schema Producer] Message data to validate:`, messageData);

                // Encode message with schema validation
                node.status({ fill: "blue", shape: "dot", text: "Encoding message" });
                let encodedMessage;
                try {
                    encodedMessage = await node.schemaRegistry.encode(schemaId, messageData);
                    node.debug(`[Kafka Schema Producer] Message validated and encoded successfully`);
                } catch (encodeError) {
                    node.error(`[Kafka Schema Producer] Schema validation failed: ${encodeError.message}`);
                    node.status({ fill: "red", shape: "ring", text: "Validation failed" });
                    node.send([null, { payload: { error: encodeError.message, data: messageData } }]);
                    return;
                }

                // If validate-only mode, return the validated data without publishing
                if (config.validateOnly) {
                    node.debug(`[Kafka Schema Producer] Validation-only mode, not publishing to Kafka`);
                    node.messageCount++;
                    node.status({ fill: "green", shape: "dot", text: `Validated ${node.messageCount} messages` });
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
                node.status({ fill: "blue", shape: "dot", text: "Sending to Kafka" });
                node.debug(`[Kafka Schema Producer] Publishing validated message to topic: ${config.topic}`);
                const result = await node.producer.send(kafkaMessage);
                
                node.debug(`[Kafka Schema Producer] Message published successfully`);
                node.lastMessageTime = new Date().getTime();
                node.messageCount++;
                node.status({ fill: "green", shape: "dot", text: `Sent ${node.messageCount} messages` });
                
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
                node.status({ fill: "red", shape: "ring", text: `Error: ${error.message.substring(0, 15)}...` });
                node.lastMessageTime = null;
                node.send([null, { payload: { error: error.message, originalMessage: msg } }]);
            }
        });

        // Function to check for idle state and update status
        function checkLastMessageTime() {
            if (node.lastMessageTime != null && node.ready) {
                const timeDiff = new Date().getTime() - node.lastMessageTime;
                if (timeDiff > 5000) {
                    const idleSeconds = Math.floor(timeDiff/1000);
                    const countText = node.messageCount > 0 ? ` (${node.messageCount} sent)` : '';
                    node.debug(`[Kafka Schema Producer] Producer idle for ${timeDiff}ms`);
                    node.status({ fill: "yellow", shape: "ring", text: `Idle ${idleSeconds}s${countText}` });
                }
            }
        }

        // Start idle monitoring
        node.interval = setInterval(checkLastMessageTime, 1000);

        node.on('close', function (done) {
            node.debug(`[Kafka Schema Producer] Closing node`);
            node.ready = false;
            node.status({});
            node.lastMessageTime = null;
            node.messageCount = 0;
            clearInterval(node.interval);
            
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
