module.exports = function(RED) {
    function KafkaConsumerNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;

        function generateUUID() {
            var u='',i=0;
            while(i++<36) {
                var c='xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'[i-1],r=Math.random()*16|0,v=c=='x'?r:(r&0x3|0x8);
                u+=(c=='-'||c=='4')?c:v.toString(16)
            }
            return u;
        }
            
        node.init = async function(){
            node.debug(`[Kafka Consumer] Initializing consumer for topic: ${config.topic}`);

            var broker = RED.nodes.getNode(config.broker);
            if (!broker) {
                node.error(`[Kafka Consumer] No broker configuration found`);
                return;
            }

            const kafka = broker.getKafka();
            const topic = config.topic;
    
            const groupId = 'nodered_hm_kafka_client_' + (!config.groupid || config.groupid === '' ? generateUUID() : config.groupid);
            
            node.debug(`[Kafka Consumer] Consumer group ID: ${groupId}`);
            node.debug(`[Kafka Consumer] From offset: ${config.fromOffset}`);
            node.debug(`[Kafka Consumer] Out of range offset: ${config.outOfRangeOffset}`);
            node.debug(`[Kafka Consumer] Fetch min bytes: ${config.minbytes || 1}`);
            node.debug(`[Kafka Consumer] Fetch max bytes: ${config.maxbytes || 1048576}`);
            node.debug(`[Kafka Consumer] Encoding: ${config.encoding || 'utf8'}`);

            node.lastMessageTime = null;

            try {
                node.consumer = kafka.consumer({ 
                    groupId: groupId,
                    minBytes: config.minbytes || 1,
                    maxBytes: config.maxbytes || 1048576
                });
                node.debug(`[Kafka Consumer] Consumer created successfully`);
            } catch (err) {
                node.error(`[Kafka Consumer] Failed to create Consumer: ${err.message}`);
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
            
            node.onMessage = async function({ topic, partition, message }){
                node.lastMessageTime = new Date().getTime();
                const value = config.encoding === 'buffer' ? message.value : message.value.toString();
                node.debug(`[Kafka Consumer] Received message from topic ${topic}, partition ${partition}, offset ${message.offset}`);
                node.debug(`[Kafka Consumer] Message value: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
                
                // Create message object similar to kafka-node format
                const messageObj = {
                    topic: topic,
                    partition: partition,
                    offset: message.offset,
                    key: message.key ? message.key.toString() : null,
                    value: value,
                    timestamp: message.timestamp
                };
                
                var msg = { payload: messageObj };
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

            try {
                node.debug(`[Kafka Consumer] Connecting to Kafka`);
                await node.consumer.connect();
                node.onConnect();

                // Subscribe to topic
                await node.consumer.subscribe({ 
                    topic: topic, 
                    fromBeginning: config.fromOffset === 'earliest' 
                });
                node.debug(`[Kafka Consumer] Subscribed to topic: ${topic}`);

                // Run consumer
                await node.consumer.run({
                    eachMessage: node.onMessage
                });
                node.debug(`[Kafka Consumer] Consumer started successfully`);

            } catch (err) {
                node.onError(err);
            }
        }

        node.on('close', async function() {
            node.debug(`[Kafka Consumer] Closing consumer for topic: ${config.topic}`);
            node.status({});
            clearInterval(node.interval);
            
            if (node.consumer) {
                try {
                    node.debug(`[Kafka Consumer] Disconnecting consumer`);
                    await node.consumer.disconnect();
                    node.debug(`[Kafka Consumer] Consumer disconnected successfully`);
                    node.consumer = null;
                } catch (err) {
                    node.error(`[Kafka Consumer] Error disconnecting consumer: ${err.message}`);
                }
            }
        });

        node.init();
    }
    RED.nodes.registerType("hm-kafka-consumer",KafkaConsumerNode);
}
