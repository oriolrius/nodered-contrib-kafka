module.exports = function(RED) {
    const { SchemaRegistry } = require('@kafkajs/confluent-schema-registry');

    function KafkaSchemaConsumerNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.ready = false;
        node.schemaRegistry = null;
        node.cachedSchemas = new Map(); // Cache schemas by ID for performance
        node.lastMessageTime = null;
        node.messageCount = 0;
        node.errorCount = 0;
        
        // Enhanced features
        node.schemaEvolution = new Map(); // Track schema evolution
        node.performanceMetrics = {
            totalProcessingTime: 0,
            averageProcessingTime: 0,
            messagesPerSecond: 0,
            lastMetricReset: Date.now()
        };
        node.messageBatch = []; // For batch processing
        node.batchTimeout = null;

        function generateUUID() {
            var u='',i=0;
            while(i++<36) {
                var c='xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'[i-1],r=Math.random()*16|0,v=c=='x'?r:(r&0x3|0x8);
                u+=(c=='-'||c=='4')?c:v.toString(16)
            }
            return u;
        }
            
        node.init = async function(){
            node.debug(`[Kafka Schema Consumer] Initializing schema consumer for topic: ${config.topic}`);
            node.status({fill:"yellow",shape:"ring",text:"Initializing..."});

            var broker = RED.nodes.getNode(config.broker);
            if (!broker) {
                node.error(`[Kafka Schema Consumer] No broker configuration found`);
                node.status({fill:"red",shape:"ring",text:"No broker config"});
                return;
            }

            // Initialize Schema Registry
            node.status({fill:"yellow",shape:"ring",text:"Connecting to Schema Registry..."});
            try {
                const registryConfig = {
                    host: config.registryUrl,
                    clientId: 'node-red-schema-consumer',
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
                    node.debug(`[Kafka Schema Consumer] Schema Registry auth configured for user: ${config.registryUsername}`);
                }

                node.schemaRegistry = new SchemaRegistry(registryConfig);
                node.debug(`[Kafka Schema Consumer] Schema Registry client created for: ${config.registryUrl}`);
            } catch (error) {
                node.error(`[Kafka Schema Consumer] Failed to create Schema Registry client: ${error.message}`);
                node.status({fill:"red",shape:"ring",text:`Registry failed: ${error.message.substring(0, 15)}...`});
                return;
            }

            // Get or register schema if needed
            try {
                await node.getOrRegisterSchema();
                node.status({fill:"yellow",shape:"ring",text:"Schema validated"});
            } catch (error) {
                node.error(`[Kafka Schema Consumer] Schema validation failed: ${error.message}`);
                node.status({fill:"red",shape:"ring",text:`Schema failed: ${error.message.substring(0, 15)}...`});
                return;
            }

            const kafka = broker.getKafka();
            const topic = config.topic;
    
            const groupId = 'nodered_hm_kafka_schema_client_' + (!config.groupid || config.groupid === '' ? generateUUID() : config.groupid);
            
            node.debug(`[Kafka Schema Consumer] Consumer group ID: ${groupId}`);
            node.debug(`[Kafka Schema Consumer] From offset: ${config.fromOffset}`);
            node.debug(`[Kafka Schema Consumer] Out of range offset: ${config.outOfRangeOffset}`);
            node.debug(`[Kafka Schema Consumer] Fetch min bytes: ${config.minbytes || 1}`);
            node.debug(`[Kafka Schema Consumer] Fetch max bytes: ${config.maxbytes || 1048576}`);
            node.debug(`[Kafka Schema Consumer] Schema subject: ${config.schemaSubject}`);
            node.debug(`[Kafka Schema Consumer] Skip invalid messages: ${config.skipInvalidMessages}`);
            node.debug(`[Kafka Schema Consumer] Output raw message: ${config.outputRawMessage}`);
            node.debug(`[Kafka Schema Consumer] Multi-output enabled: ${config.enableMultiOutput}`);
            node.debug(`[Kafka Schema Consumer] Schema evolution tracking: ${config.trackSchemaEvolution}`);
            node.debug(`[Kafka Schema Consumer] Performance metrics: ${config.enableMetrics}`);
            node.debug(`[Kafka Schema Consumer] Batch size: ${config.batchSize}`);
            node.debug(`[Kafka Schema Consumer] Processing timeout: ${config.processingTimeout}`);

            node.lastMessageTime = null;
            node.messageCount = 0;
            node.errorCount = 0;

            try {
                node.consumer = kafka.consumer({ 
                    groupId: groupId,
                    minBytes: config.minbytes || 1,
                    maxBytes: config.maxbytes || 1048576
                });
                node.debug(`[Kafka Schema Consumer] Consumer created successfully`);
            } catch (err) {
                node.error(`[Kafka Schema Consumer] Failed to create Consumer: ${err.message}`);
                node.status({fill:"red",shape:"ring",text:"Failed to create consumer"});
                return;
            }
    
            node.status({fill:"yellow",shape:"ring",text:"Connecting to Kafka..."});

            node.onConnect = function(){
                node.lastMessageTime = new Date().getTime();
                node.debug(`[Kafka Schema Consumer] Successfully connected to Kafka broker`);
                node.status({fill:"green",shape:"ring",text:"Ready"});
                node.ready = true;
            }
 
            node.onError = function(err){
                node.lastMessageTime = null;
                node.ready = false;
                node.error(`[Kafka Schema Consumer] Connection error: ${err.message}`);
                node.debug(`[Kafka Schema Consumer] Full error details: ${JSON.stringify(err, null, 2)}`);
                node.status({fill:"red",shape:"ring",text:"Error"});
                node.error(err);
            } 
            
            node.onMessage = async function({ topic, partition, message }){
                const messageStartTime = Date.now();
                node.lastMessageTime = messageStartTime;
                node.debug(`[Kafka Schema Consumer] Received message from topic ${topic}, partition ${partition}, offset ${message.offset}`);
                
                try {
                    // Decode the Avro message
                    const decodedValue = await node.schemaRegistry.decode(message.value);
                    const processingTime = Date.now() - messageStartTime;
                    
                    // Update performance metrics if enabled
                    if (config.enableMetrics) {
                        node.updatePerformanceMetrics(processingTime);
                    }
                    
                    // Track schema evolution if enabled
                    if (config.trackSchemaEvolution) {
                        await node.trackSchemaChange(message.value);
                    }
                    
                    node.debug(`[Kafka Schema Consumer] Message decoded successfully in ${processingTime}ms`);
                    node.debug(`[Kafka Schema Consumer] Decoded value: ${JSON.stringify(decodedValue)}`);
                    
                    // Create message object
                    let messageObj = {
                        payload: decodedValue
                    };

                    // Include raw message metadata if requested
                    if (config.outputRawMessage) {
                        messageObj.kafkaMessage = {
                            topic: topic,
                            partition: partition,
                            offset: message.offset,
                            key: message.key ? message.key.toString() : null,
                            timestamp: message.timestamp,
                            headers: message.headers || {},
                            processingTime: config.enableMetrics ? processingTime : undefined
                        };
                    }
                    
                    // Handle batch processing
                    if (config.batchSize > 1) {
                        node.addToBatch(messageObj);
                    } else {
                        // Send individual message
                        if (config.enableMultiOutput) {
                            node.send([messageObj, null]); // Valid message to first output
                        } else {
                            node.send(messageObj);
                        }
                    }
                    
                    node.messageCount++;
                    node.updateStatus();

                } catch (decodeError) {
                    const processingTime = Date.now() - messageStartTime;
                    node.errorCount++;
                    node.error(`[Kafka Schema Consumer] Failed to decode message: ${decodeError.message}`);
                    node.debug(`[Kafka Schema Consumer] Decode error details: ${JSON.stringify(decodeError, null, 2)}`);
                    
                    if (config.skipInvalidMessages) {
                        node.warn(`[Kafka Schema Consumer] Skipping invalid message at offset ${message.offset}: ${decodeError.message}`);
                    } else {
                        // Create error message
                        const errorMsg = {
                            payload: null,
                            error: {
                                message: decodeError.message,
                                type: 'SCHEMA_DECODE_ERROR',
                                processingTime: config.enableMetrics ? processingTime : undefined,
                                kafkaMessage: {
                                    topic: topic,
                                    partition: partition,
                                    offset: message.offset,
                                    key: message.key ? message.key.toString() : null,
                                    timestamp: message.timestamp,
                                    rawValue: message.value
                                }
                            }
                        };
                        
                        if (config.enableMultiOutput) {
                            node.send([null, errorMsg]); // Error message to second output
                        } else {
                            node.send(errorMsg);
                        }
                    }
                    
                    node.updateStatus();
                }
            }

            function checkLastMessageTime() {
                if(node.lastMessageTime != null && node.ready){
                    timeDiff = new Date().getTime() - node.lastMessageTime;
                    if(timeDiff > 5000){
                        node.debug(`[Kafka Schema Consumer] Consumer idle for ${timeDiff}ms`);
                        let statusText = "Idle";
                        if (node.messageCount > 0) {
                            statusText = `Idle (${node.messageCount} msgs)`;
                        }
                        if (node.errorCount > 0) {
                            statusText = `Idle (${node.messageCount} msgs, ${node.errorCount} errors)`;
                        }
                        
                        // Add performance metrics to idle status
                        if (config.enableMetrics && node.performanceMetrics.messagesPerSecond > 0) {
                            statusText += ` - Avg: ${node.performanceMetrics.averageProcessingTime.toFixed(1)}ms`;
                        }
                        
                        // Add schema evolution info
                        if (config.trackSchemaEvolution && node.schemaEvolution.size > 1) {
                            statusText += ` - ${node.schemaEvolution.size} schemas`;
                        }
                        
                        node.status({fill:"yellow",shape:"ring",text:statusText});
                    }
                }   
            }
              
            node.interval = setInterval(checkLastMessageTime, 1000);

            try {
                node.debug(`[Kafka Schema Consumer] Connecting to Kafka`);
                await node.consumer.connect();
                node.onConnect();

                // Subscribe to topic
                await node.consumer.subscribe({ 
                    topic: topic, 
                    fromBeginning: config.fromOffset === 'earliest' 
                });
                node.debug(`[Kafka Schema Consumer] Subscribed to topic: ${topic}`);

                // Run consumer
                await node.consumer.run({
                    eachMessage: node.onMessage
                });
                node.debug(`[Kafka Schema Consumer] Consumer started successfully`);

            } catch (err) {
                node.onError(err);
            }
        }

        node.getOrRegisterSchema = async function() {
            try {
                node.debug(`[Kafka Schema Consumer] Getting schema for subject: ${config.schemaSubject}`);
                
                // Try to get existing schema
                try {
                    const schemaId = await node.schemaRegistry.getLatestSchemaId(config.schemaSubject);
                    node.debug(`[Kafka Schema Consumer] Found existing schema ID: ${schemaId}`);
                    
                    // Cache the schema for faster lookups
                    const schema = await node.schemaRegistry.getSchema(schemaId);
                    node.cachedSchemas.set(schemaId, schema);
                    node.debug(`[Kafka Schema Consumer] Schema cached successfully`);
                    
                    return schemaId;
                } catch (error) {
                    if (error.message.includes('Subject') && error.message.includes('not found')) {
                        node.debug(`[Kafka Schema Consumer] Schema subject not found: ${config.schemaSubject}`);
                        
                        if (config.autoRegisterSchema && config.defaultSchema) {
                            node.debug(`[Kafka Schema Consumer] Auto-registering schema`);
                            try {
                                const schemaObj = JSON.parse(config.defaultSchema);
                                const registered = await node.schemaRegistry.register({
                                    type: 'AVRO',
                                    schema: JSON.stringify(schemaObj)
                                }, {
                                    subject: config.schemaSubject
                                });
                                
                                node.debug(`[Kafka Schema Consumer] Schema auto-registered with ID: ${registered.id}`);
                                
                                // Cache the schema
                                const schema = await node.schemaRegistry.getSchema(registered.id);
                                node.cachedSchemas.set(registered.id, schema);
                                
                                return registered.id;
                            } catch (registerError) {
                                throw new Error(`Failed to auto-register schema: ${registerError.message}`);
                            }
                        } else {
                            throw new Error(`Schema subject '${config.schemaSubject}' not found and auto-registration is disabled`);
                        }
                    } else {
                        throw error;
                    }
                }
            } catch (error) {
                node.error(`[Kafka Schema Consumer] Schema operation failed: ${error.message}`);
                throw error;
            }
        };

        // Enhanced methods for new features
        node.updatePerformanceMetrics = function(processingTime) {
            node.performanceMetrics.totalProcessingTime += processingTime;
            node.performanceMetrics.averageProcessingTime = 
                node.performanceMetrics.totalProcessingTime / node.messageCount;
            
            const timeDiff = (Date.now() - node.performanceMetrics.lastMetricReset) / 1000;
            if (timeDiff > 0) {
                node.performanceMetrics.messagesPerSecond = node.messageCount / timeDiff;
            }
            
            node.debug(`[Kafka Schema Consumer] Performance - Avg: ${node.performanceMetrics.averageProcessingTime.toFixed(2)}ms, Rate: ${node.performanceMetrics.messagesPerSecond.toFixed(2)} msg/s`);
        };

        node.trackSchemaChange = async function(rawMessage) {
            try {
                // Extract schema ID from the Avro message (first 4 bytes after magic byte)
                if (rawMessage && rawMessage.length > 5) {
                    const schemaId = rawMessage.readUInt32BE(1);
                    
                    if (!node.schemaEvolution.has(schemaId)) {
                        node.debug(`[Kafka Schema Consumer] New schema version detected: ${schemaId}`);
                        const schema = await node.schemaRegistry.getSchema(schemaId);
                        node.schemaEvolution.set(schemaId, {
                            id: schemaId,
                            firstSeen: Date.now(),
                            messageCount: 1,
                            schema: schema
                        });
                        
                        node.warn(`[Kafka Schema Consumer] Schema evolution detected - New schema ID: ${schemaId}`);
                    } else {
                        node.schemaEvolution.get(schemaId).messageCount++;
                    }
                }
            } catch (error) {
                node.debug(`[Kafka Schema Consumer] Schema evolution tracking error: ${error.message}`);
            }
        };

        node.addToBatch = function(messageObj) {
            node.messageBatch.push(messageObj);
            
            // Clear existing timeout
            if (node.batchTimeout) {
                clearTimeout(node.batchTimeout);
            }
            
            // Send batch if it reaches the configured size
            if (node.messageBatch.length >= config.batchSize) {
                node.sendBatch();
            } else {
                // Set timeout to send partial batch
                node.batchTimeout = setTimeout(() => {
                    if (node.messageBatch.length > 0) {
                        node.sendBatch();
                    }
                }, config.processingTimeout || 30000);
            }
        };

        node.sendBatch = function() {
            if (node.messageBatch.length === 0) return;
            
            const batchMessage = {
                payload: node.messageBatch.slice(), // Create a copy
                batchInfo: {
                    size: node.messageBatch.length,
                    timestamp: Date.now(),
                    batchId: generateUUID()
                }
            };
            
            if (config.enableMultiOutput) {
                node.send([batchMessage, null]); // Batch to first output
            } else {
                node.send(batchMessage);
            }
            
            node.debug(`[Kafka Schema Consumer] Sent batch of ${node.messageBatch.length} messages`);
            node.messageBatch = [];
            
            if (node.batchTimeout) {
                clearTimeout(node.batchTimeout);
                node.batchTimeout = null;
            }
        };

        node.updateStatus = function() {
            let statusText = `Reading (${node.messageCount})`;
            let statusColor = "blue";
            
            if (config.enableMetrics && node.performanceMetrics.messagesPerSecond > 0) {
                statusText = `Reading (${node.messageCount}) - ${node.performanceMetrics.messagesPerSecond.toFixed(1)} msg/s`;
            }
            
            if (node.errorCount > 0) {
                statusText += ` - ${node.errorCount} errors`;
                statusColor = "yellow";
            }
            
            if (config.batchSize > 1 && node.messageBatch.length > 0) {
                statusText += ` - Batch: ${node.messageBatch.length}/${config.batchSize}`;
            }
            
            node.status({fill: statusColor, shape: "ring", text: statusText});
        };
        
        node.on('close', async function() {
            node.debug(`[Kafka Schema Consumer] Closing consumer for topic: ${config.topic}`);
            node.status({});
            node.ready = false;
            node.lastMessageTime = null;
            node.messageCount = 0;
            node.errorCount = 0;
            clearInterval(node.interval);
            
            // Send any remaining batch messages
            if (node.messageBatch.length > 0) {
                node.debug(`[Kafka Schema Consumer] Sending final batch of ${node.messageBatch.length} messages`);
                node.sendBatch();
            }
            
            // Clear batch timeout
            if (node.batchTimeout) {
                clearTimeout(node.batchTimeout);
                node.batchTimeout = null;
            }
            
            // Clear schema cache and evolution tracking
            node.cachedSchemas.clear();
            node.schemaEvolution.clear();
            
            // Reset performance metrics
            node.performanceMetrics = {
                totalProcessingTime: 0,
                averageProcessingTime: 0,
                messagesPerSecond: 0,
                lastMetricReset: Date.now()
            };
            
            if (node.consumer) {
                try {
                    node.debug(`[Kafka Schema Consumer] Disconnecting consumer`);
                    await node.consumer.disconnect();
                    node.debug(`[Kafka Schema Consumer] Consumer disconnected successfully`);
                    node.consumer = null;
                } catch (err) {
                    node.error(`[Kafka Schema Consumer] Error disconnecting consumer: ${err.message}`);
                }
            }
        });

        node.init();
    }
    RED.nodes.registerType("hm-kafka-schema-consumer", KafkaSchemaConsumerNode, {
        settings: {
            kafkaSchemaConsumerMaxOutputs: {
                value: function(node) {
                    return node.enableMultiOutput ? 2 : 1;
                },
                exportable: true
            }
        }
    });
}
