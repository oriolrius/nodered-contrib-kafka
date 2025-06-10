module.exports = function(RED) {
    function KafkaConsumerNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;

        function e1() {
            var u='',i=0;
            while(i++<36) {
                var c='xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'[i-1],r=Math.random()*16|0,v=c=='x'?r:(r&0x3|0x8);
                u+=(c=='-'||c=='4')?c:v.toString(16)
            }
            return u;
        }
            
        node.init = function(){
            const kafka = require('kafka-node'); 

            node.debug(`[Kafka Consumer] Initializing consumer for topic: ${config.topic}`);

            var broker = RED.nodes.getNode(config.broker);
            if (!broker) {
                node.error(`[Kafka Consumer] No broker configuration found`);
                return;
            }

            var options = broker.getOptions();
            var topic = config.topic;
    
            options.groupId = 'nodered_hm_kafka_client_' + (!config.groupid || config.groupid === '' ? e1() : config.groupid);
            options.fromOffset = config.fromOffset;
            options.outOfRangeOffset = config.outOfRangeOffset;
            options.fetchMinBytes = config.minbytes || 1;
            options.fetchMaxBytes = config.maxbytes || 1048576;
            options.encoding = config.encoding || 'utf8';

            node.debug(`[Kafka Consumer] Consumer group ID: ${options.groupId}`);
            node.debug(`[Kafka Consumer] From offset: ${options.fromOffset}`);
            node.debug(`[Kafka Consumer] Out of range offset: ${options.outOfRangeOffset}`);
            node.debug(`[Kafka Consumer] Fetch min bytes: ${options.fetchMinBytes}`);
            node.debug(`[Kafka Consumer] Fetch max bytes: ${options.fetchMaxBytes}`);
            node.debug(`[Kafka Consumer] Encoding: ${options.encoding}`);

            node.lastMessageTime = null;

            try {
                node.consumerGroup = new kafka.ConsumerGroup(options, topic);
                node.debug(`[Kafka Consumer] ConsumerGroup created successfully`);
            } catch (err) {
                node.error(`[Kafka Consumer] Failed to create ConsumerGroup: ${err.message}`);
                node.status({fill:"red",shape:"ring",text:"Failed to create consumer"});
                return;
            }
    
            node.status({fill:"yellow",shape:"ring",text:"Initializing"});

            node.onConnect = function(){
                node.lastMessageTime = new Date().getTime();
                node.debug(`[Kafka Consumer] Successfully connected to Kafka broker`);
                node.status({fill:"green",shape:"ring",text:"Ready"});
            }
 
            node.onError = function(err){
                node.lastMessageTime = null;
                node.error(`[Kafka Consumer] Connection error: ${err.message}`);
                node.debug(`[Kafka Consumer] Full error details: ${JSON.stringify(err, null, 2)}`);
                node.status({fill:"red",shape:"ring",text:"Error"});
                node.error(err);
            } 
            
            node.onMessage = function(message){
                node.lastMessageTime = new Date().getTime();
                node.debug(`[Kafka Consumer] Received message from topic ${message.topic}, partition ${message.partition}, offset ${message.offset}`);
                node.debug(`[Kafka Consumer] Message value: ${typeof message.value === 'string' ? message.value : JSON.stringify(message.value)}`);
                var msg = { payload:message };
                node.send(msg);
                node.status({fill:"blue",shape:"ring",text:"Reading"});
            }

            function checkLastMessageTime() {
                if(node.lastMessageTime != null){
                    timeDiff = new Date().getTime() - node.lastMessageTime;
                    if(timeDiff > 5000){
                        node.debug(`[Kafka Consumer] Consumer idle for ${timeDiff}ms`);
                        node.status({fill:"yellow",shape:"ring",text:"Idle"});
                    }
                }   
            }
              
            node.interval = setInterval(checkLastMessageTime, 1000);

            node.debug(`[Kafka Consumer] Attaching event listeners`);
            node.consumerGroup.on('connect', node.onConnect);
            node.consumerGroup.on('message', node.onMessage);
            node.consumerGroup.on('error', node.onError);
            node.consumerGroup.on('offsetOutOfRange', node.onError);
            
            // Additional debug event listeners
            node.consumerGroup.on('rebalancing', function() {
                node.debug(`[Kafka Consumer] Consumer group rebalancing`);
            });
            
            node.consumerGroup.on('rebalanced', function() {
                node.debug(`[Kafka Consumer] Consumer group rebalanced`);
            });
        }

        node.on('close', function() {
            node.debug(`[Kafka Consumer] Closing consumer for topic: ${config.topic}`);
            node.status({});
            clearInterval(node.interval);
            
            if (node.consumerGroup) {
                node.debug(`[Kafka Consumer] Removing event listeners`);
                node.consumerGroup.removeListener('connect', node.onConnect);
                node.consumerGroup.removeListener('message', node.onMessage);
                node.consumerGroup.removeListener('error', node.onError);
                node.consumerGroup.removeListener('offsetOutOfRange', node.onError);

                node.debug(`[Kafka Consumer] Closing consumer group`);
                node.consumerGroup.close(true, function(err) {
                    if(err){
                        node.error(`[Kafka Consumer] Error closing consumer group: ${err.message}`);
                        return;
                    }

                    node.debug(`[Kafka Consumer] Consumer group closed successfully`);
                    node.consumerGroup = null;
                });
            }
        });

        node.init();
    }
    RED.nodes.registerType("hm-kafka-consumer",KafkaConsumerNode);
}
