module.exports = function (RED) {
    const kafka = require('kafka-node');
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
                let kafkaClient = new kafka.KafkaClient(broker.getOptions());
                node.debug(`[Kafka Producer] KafkaClient created successfully`);

                let producerOptions = new Object();
                producerOptions.requireAcks = config.requireAcks;
                producerOptions.ackTimeoutMs = config.ackTimeoutMs;

                node.debug(`[Kafka Producer] Producer options - Require ACKs: ${producerOptions.requireAcks}, ACK Timeout: ${producerOptions.ackTimeoutMs}ms`);

                node.lastMessageTime = null;

                node.producer = new kafka.HighLevelProducer(kafkaClient, producerOptions);
                node.debug(`[Kafka Producer] HighLevelProducer created successfully`);

                node.onError = function (err) {
                    node.ready = false;
                    node.lastMessageTime = null;
                    node.error(`[Kafka Producer] Producer error: ${err.message}`);
                    node.debug(`[Kafka Producer] Full error details: ${JSON.stringify(err, null, 2)}`);
                    node.status({ fill: "red", shape: "ring", text: "Error" });
                    node.error(err);
                }

                node.onReady = function () {
                    node.ready = true;
                    node.lastMessageTime = new Date().getTime();
                    node.debug(`[Kafka Producer] Producer ready and connected to Kafka broker`);
                    node.status({ fill: "green", shape: "ring", text: "Ready" });
                }

                node.producer.on('ready', node.onReady);
                node.producer.on('error', node.onError);
                
            } catch (err) {
                node.error(`[Kafka Producer] Failed to initialize producer: ${err.message}`);
                node.status({ fill: "red", shape: "ring", text: "Init failed" });
            }
        }

        node.init();

        node.on('input', function (msg) {
            node.debug(`[Kafka Producer] Received input message`);
            
            if (msg.broker) {
                // Pass-through parameters, such as model, device, iotType, etc.
                iotOptions = { ...iotOptions, ...msg.broker };
                node.debug(`[Kafka Producer] Updated IoT options from message: ${JSON.stringify(msg.broker)}`);
            }
            
            if (!node.ready) {
                node.warn(`[Kafka Producer] Producer not ready, discarding message`);
                node.status({ fill: "yellow", shape: "ring", text: "Not ready" });
                return;
            }
            
            if (node.ready) {
                var sendOptions = new Object();

                sendOptions.topic = config.topic;
                sendOptions.attributes = config.attributes;
                
                node.debug(`[Kafka Producer] Preparing message for topic: ${sendOptions.topic}`);
                node.debug(`[Kafka Producer] Compression attributes: ${sendOptions.attributes}`);
                
                if (config.useiot || iotOptions.useiot) {
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
                        sendOptions.messages = [JSON.stringify(message)];
                        node.debug(`[Kafka Producer] IoT message prepared: ${JSON.stringify(message)}`);
                    } catch (err) {
                        node.error(`[Kafka Producer] Error preparing IoT message: ${err.message}`);
                        return;
                    }
                } else {
                    node.debug(`[Kafka Producer] Processing message in raw format`);
                    const message = typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload)
                    sendOptions.messages = [message];
                    node.debug(`[Kafka Producer] Raw message prepared: ${message}`);
                }

                node.debug(`[Kafka Producer] Sending message to Kafka`);
                node.producer.send([sendOptions], function (err) {
                    if (!err) {
                        node.lastMessageTime = new Date().getTime();
                        node.debug(`[Kafka Producer] Message sent successfully to topic: ${sendOptions.topic}`);
                        node.status({ fill: "blue", shape: "ring", text: "Sending" });
                    }
                    else {
                        node.lastMessageTime = null;
                        node.error(`[Kafka Producer] Failed to send message: ${err.message}`);
                        node.debug(`[Kafka Producer] Send error details: ${JSON.stringify(err, null, 2)}`);
                        node.status({ fill: "red", shape: "ring", text: "Error" });
                    }
                });
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

        node.on('close', function () {
            node.debug(`[Kafka Producer] Closing producer for topic: ${config.topic}`);
            node.ready = false;
            node.status({});
            clearInterval(node.interval);
            
            if (node.producer) {
                node.debug(`[Kafka Producer] Removing event listeners`);
                node.producer.removeListener('ready', node.onReady);
                node.producer.removeListener('error', node.onError);
                node.debug(`[Kafka Producer] Producer closed successfully`);
            }
        })
    }
    RED.nodes.registerType("hm-kafka-producer", KafkaProducerNode);
}
