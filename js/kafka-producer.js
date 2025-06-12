module.exports = function (RED) {
    const { getNameTypes, getMsgValues } = require('./utils');

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

        let iotOptions = {};

        node.init = function () {
            node.debug(`[Kafka Producer] Initializing producer for topic: ${config.topic}`);
            
            let broker = RED.nodes.getNode(config.broker);
            if (!broker) {
                node.error(`[Kafka Producer] No broker configuration found`);
                return;
            }

            // Get IoT configuration from broker if available, otherwise use producer config
            if (broker && broker.getIotConfig) {
                const brokerIotConfig = broker.getIotConfig();
                if (brokerIotConfig.useiot) {
                    iotOptions = brokerIotConfig;
                    node.debug(`[Kafka Producer] Using IoT configuration from broker`);
                } else {
                    iotOptions = getIotOptions(config);
                    node.debug(`[Kafka Producer] Using IoT configuration from producer`);
                }
            } else {
                iotOptions = getIotOptions(config);
                node.debug(`[Kafka Producer] Using producer IoT configuration`);
            }
            
            if (iotOptions.useiot) {
                node.debug(`[Kafka Producer] IoT mode enabled - Model: ${iotOptions.model}, Device: ${iotOptions.device}, Type: ${iotOptions.iotType}`);
                node.debug(`[Kafka Producer] IoT fields configured: ${JSON.stringify(iotOptions.fields)}`);
            } else {
                node.debug(`[Kafka Producer] IoT mode disabled, using raw message format`);
            }
            
            try {
                const kafka = broker.getKafka();
                node.debug(`[Kafka Producer] Kafka instance obtained successfully`);

                // KafkaJS producer options
                let producerOptions = {
                    maxInFlightRequests: 1,
                    idempotent: config.requireAcks === 1,
                    requestTimeout: config.ackTimeoutMs || 30000
                };

                node.debug(`[Kafka Producer] Producer options - Idempotent: ${producerOptions.idempotent}, Request Timeout: ${producerOptions.requestTimeout}ms`);

                node.lastMessageTime = null;

                node.producer = kafka.producer(producerOptions);
                node.debug(`[Kafka Producer] Producer created successfully`);

                node.onConnect = async function () {
                    node.ready = true;
                    node.lastMessageTime = new Date().getTime();
                    node.debug(`[Kafka Producer] Producer ready and connected to Kafka broker`);
                    node.status({ fill: "green", shape: "ring", text: "Ready" });
                }

                node.onError = function (err) {
                    node.ready = false;
                    node.lastMessageTime = null;
                    node.error(`[Kafka Producer] Producer error: ${err.message}`);
                    node.debug(`[Kafka Producer] Full error details: ${JSON.stringify(err, null, 2)}`);
                    node.status({ fill: "red", shape: "ring", text: "Error" });
                    node.error(err);
                }

                // Connect the producer
                node.producer.connect()
                    .then(node.onConnect)
                    .catch(node.onError);
                
            } catch (err) {
                node.error(`[Kafka Producer] Failed to initialize producer: ${err.message}`);
                node.status({ fill: "red", shape: "ring", text: "Init failed" });
            }
        }

        node.init();

        node.on('input', async function (msg) {
            node.debug(`[Kafka Producer] Received input message`);
            
            // Dynamic configuration support
            const dynamicConfig = {
                topic: msg.topic || config.topic,
                requireAcks: msg.requireAcks !== undefined ? msg.requireAcks : config.requireAcks,
                ackTimeoutMs: msg.ackTimeoutMs || config.ackTimeoutMs,
                attributes: msg.attributes !== undefined ? msg.attributes : config.attributes,
                useiot: msg.useiot !== undefined ? msg.useiot : config.useiot
            };
            
            // Update IoT options from message if provided
            if (msg.broker) {
                // Pass-through parameters, such as model, device, iotType, etc.
                iotOptions = { ...iotOptions, ...msg.broker };
                node.debug(`[Kafka Producer] Updated IoT options from message: ${JSON.stringify(msg.broker)}`);
            }
            
            // Support dynamic IoT configuration
            if (msg.iot) {
                iotOptions = { ...iotOptions, ...msg.iot };
                node.debug(`[Kafka Producer] Updated IoT options from msg.iot: ${JSON.stringify(msg.iot)}`);
            }
            
            node.debug(`[Kafka Producer] Using dynamic config - Topic: ${dynamicConfig.topic}, RequireAcks: ${dynamicConfig.requireAcks}, UseIoT: ${dynamicConfig.useiot}`);
            
            if (!node.ready) {
                node.warn(`[Kafka Producer] Producer not ready, discarding message`);
                node.status({ fill: "yellow", shape: "ring", text: "Not ready" });
                return;
            }
            
            if (node.ready) {
                let messageValue;
                const compressionTypes = {
                    0: 'none',
                    1: 'gzip',
                    2: 'snappy'
                };
                
                node.debug(`[Kafka Producer] Preparing message for topic: ${dynamicConfig.topic}`);
                node.debug(`[Kafka Producer] Compression type: ${compressionTypes[dynamicConfig.attributes] || 'none'}`);
                
                if (dynamicConfig.useiot || iotOptions.useiot) {
                    node.debug(`[Kafka Producer] Processing message in IoT format`);
                    try {
                        const nameTypes = getNameTypes(iotOptions.fields);
                        const { values, tsList } = getMsgValues(nameTypes, msg.payload);
                        const message = {
                            mc: iotOptions.model,
                            dc: iotOptions.device,
                            type: iotOptions.iotType,
                            nameTypes,
                            ts: tsList,
                            values
                        };
                        messageValue = JSON.stringify(message);
                        node.debug(`[Kafka Producer] IoT message prepared: ${messageValue}`);
                    } catch (err) {
                        node.error(`[Kafka Producer] Error preparing IoT message: ${err.message}`);
                        return;
                    }
                } else {
                    node.debug(`[Kafka Producer] Processing message in raw format`);
                    messageValue = typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload);
                    node.debug(`[Kafka Producer] Raw message prepared: ${messageValue}`);
                }

                const kafkaMessage = {
                    topic: dynamicConfig.topic,
                    messages: [{
                        value: messageValue,
                        key: msg.key, // Support dynamic key
                        headers: msg.headers // Support dynamic headers
                    }]
                };

                // Add compression if specified
                if (dynamicConfig.attributes && dynamicConfig.attributes > 0) {
                    kafkaMessage.compression = compressionTypes[dynamicConfig.attributes];
                }

                node.debug(`[Kafka Producer] Sending message to Kafka`);
                try {
                    await node.producer.send(kafkaMessage);
                    node.lastMessageTime = new Date().getTime();
                    node.debug(`[Kafka Producer] Message sent successfully to topic: ${dynamicConfig.topic}`);
                    node.status({ fill: "blue", shape: "ring", text: "Sending" });
                } catch (err) {
                    node.lastMessageTime = null;
                    node.error(`[Kafka Producer] Failed to send message: ${err.message}`);
                    node.debug(`[Kafka Producer] Send error details: ${JSON.stringify(err, null, 2)}`);
                    node.status({ fill: "red", shape: "ring", text: "Error" });
                }
            }
        });

        function checkLastMessageTime() {
            if (node.lastMessageTime != null) {
                timeDiff = new Date().getTime() - node.lastMessageTime;
                if (timeDiff > 5000) {
                    node.debug(`[Kafka Producer] Producer idle for ${timeDiff}ms`);
                    node.status({ fill: "yellow", shape: "ring", text: "Idle" });
                }
            }
        }

        node.interval = setInterval(checkLastMessageTime, 1000);

        node.on('close', async function () {
            node.debug(`[Kafka Producer] Closing producer for topic: ${config.topic}`);
            node.ready = false;
            node.status({});
            clearInterval(node.interval);
            
            if (node.producer) {
                try {
                    await node.producer.disconnect();
                    node.debug(`[Kafka Producer] Producer disconnected successfully`);
                } catch (err) {
                    node.error(`[Kafka Producer] Error disconnecting producer: ${err.message}`);
                }
            }
        })
    }
    RED.nodes.registerType("hm-kafka-producer", KafkaProducerNode);
}
