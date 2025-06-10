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
            let broker = RED.nodes.getNode(config.broker);
            // Get IoT configuration from broker if available, otherwise use producer config
            if (broker && broker.getIotConfig) {
                const brokerIotConfig = broker.getIotConfig();
                if (brokerIotConfig.useiot) {
                    iotOptions = brokerIotConfig;
                } else {
                    iotOptions = getIotOptions(config);
                }
            } else {
                iotOptions = getIotOptions(config);
            }
            
            let kafkaClient = new kafka.KafkaClient(broker.getOptions());

            let producerOptions = new Object();
            producerOptions.requireAcks = config.requireAcks;
            producerOptions.ackTimeoutMs = config.ackTimeoutMs;

            node.lastMessageTime = null;

            node.producer = new kafka.HighLevelProducer(kafkaClient, producerOptions);

            node.onError = function (err) {
                node.ready = false;
                node.lastMessageTime = null;
                node.status({ fill: "red", shape: "ring", text: "Error" });
                node.error(err);
            }

            node.onReady = function () {
                node.ready = true;
                node.lastMessageTime = new Date().getTime();
                node.status({ fill: "green", shape: "ring", text: "Ready" });
            }

            node.producer.on('ready', node.onReady);
            node.producer.on('error', node.onError);
        }

        node.init();

        node.on('input', function (msg) {
            if (msg.broker) {
                // Pass-through parameters, such as model, device, iotType, etc.
                iotOptions = { ...iotOptions, ...msg.broker };
            }
            if (node.ready) {
                var sendOptions = new Object();

                sendOptions.topic = config.topic;
                sendOptions.attributes = config.attributes;
                if (config.useiot) {
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
                } else {
                    const message = typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload)
                    sendOptions.messages = [message];
                }

                node.producer.send([sendOptions], function (err) {
                    if (!err) {
                        node.lastMessageTime = new Date().getTime();
                        node.status({ fill: "blue", shape: "ring", text: "Sending" });
                    }
                    else {
                        node.lastMessageTime = null;
                        node.status({ fill: "red", shape: "ring", text: "Error" });
                    }
                });
            }
        });

        function checkLastMessageTime() {
            if (node.lastMessageTime != null) {
                timeDiff = new Date().getTime() - node.lastMessageTime;
                if (timeDiff > 5000) {
                    node.status({ fill: "yellow", shape: "ring", text: "Idle" });
                }
            }
        }

        node.interval = setInterval(checkLastMessageTime, 1000);

        node.on('close', function () {
            node.ready = false;
            node.status({});
            clearInterval(node.interval);
            node.producer.removeListener('ready', node.onReady);
            node.producer.removeListener('error', node.onError);
        })
    }
    RED.nodes.registerType("hm-kafka-producer", KafkaProducerNode);
}
