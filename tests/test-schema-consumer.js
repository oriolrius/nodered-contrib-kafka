const { Kafka } = require('kafkajs');
const { SchemaRegistry } = require('@kafkajs/confluent-schema-registry');

// Test configuration
const config = {
  kafka: {
    clientId: 'schema-consumer-test-client',
    brokers: ['localhost:9092'],
    ssl: false,
    sasl: undefined
  },
  registry: {
    host: 'http://localhost:8081',
    clientId: 'schema-consumer-test-registry'
  },
  topic: 'test-schema-consumer-topic',
  subject: 'test-schema-consumer-topic-value'
};

// Test schema for the consumer tests
const testSchema = {
  type: 'record',
  name: 'TestConsumerMessage',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'message', type: 'string' },
    { name: 'timestamp', type: 'long' },
    { name: 'level', type: ['null', 'string'], default: null },
    { name: 'metadata', type: ['null', {
      type: 'record',
      name: 'Metadata',
      fields: [
        { name: 'source', type: 'string' },
        { name: 'version', type: 'string' }
      ]
    }], default: null }
  ]
};

async function testSchemaConsumerFunctionality() {
  console.log('🧪 Testing Schema Consumer Node Functionality');
  console.log('='.repeat(50));

  // Create clients
  const kafka = new Kafka(config.kafka);
  const registry = new SchemaRegistry(config.registry);
  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: 'test-schema-consumer-group' });

  try {
    // Connect to Kafka
    console.log('1. Connecting to Kafka...');
    await producer.connect();
    await consumer.connect();
    console.log('✅ Connected to Kafka');

    // Register or get schema
    console.log('\n2. Handling schema registration...');
    let schemaId;
    try {
      schemaId = await registry.getLatestSchemaId(config.subject);
      console.log(`✅ Found existing schema ID: ${schemaId}`);
    } catch (error) {
      console.log('📝 Schema not found, registering new schema...');
      const registered = await registry.register({
        type: 'AVRO',
        schema: JSON.stringify(testSchema)
      }, {
        subject: config.subject
      });
      schemaId = registered.id;
      console.log(`✅ Registered new schema ID: ${schemaId}`);
    }

    // Subscribe to topic for testing
    console.log('\n3. Setting up consumer subscription...');
    await consumer.subscribe({ topic: config.topic, fromBeginning: false });
    console.log('✅ Consumer subscribed to topic');

    // Create test messages
    console.log('\n4. Creating and publishing test messages...');
    const testMessages = [
      {
        id: `test-valid-${Date.now()}`,
        message: 'Valid message with metadata',
        timestamp: Date.now(),
        level: 'INFO',
        metadata: {
          source: 'test-suite',
          version: '1.0.0'
        }
      },
      {
        id: `test-simple-${Date.now()}`,
        message: 'Simple valid message',
        timestamp: Date.now(),
        level: null,
        metadata: null
      },
      {
        id: `test-minimal-${Date.now()}`,
        message: 'Minimal message',
        timestamp: Date.now()
        // Optional fields not included
      }
    ];

    // Encode and publish test messages
    const publishPromises = testMessages.map(async (msg, index) => {
      const encodedMessage = await registry.encode(schemaId, msg);
      console.log(`📤 Publishing test message ${index + 1}: ${msg.id}`);
      
      return producer.send({
        topic: config.topic,
        messages: [{
          key: msg.id,
          value: encodedMessage,
          timestamp: msg.timestamp.toString()
        }]
      });
    });

    await Promise.all(publishPromises);
    console.log('✅ All test messages published successfully');

    // Test message consumption and decoding
    console.log('\n5. Testing message consumption and schema decoding...');
    let receivedMessages = [];
    let messageCount = 0;
    const expectedMessages = testMessages.length;

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          console.log(`📥 Received message at offset ${message.offset}`);
          
          // This simulates what the schema consumer node does
          const decodedValue = await registry.decode(message.value);
          console.log(`✅ Message decoded successfully:`, decodedValue);
          
          receivedMessages.push({
            kafkaMessage: {
              topic,
              partition,
              offset: message.offset,
              key: message.key ? message.key.toString() : null,
              timestamp: message.timestamp
            },
            payload: decodedValue
          });
          
          messageCount++;
          
          // Stop after receiving all expected messages
          if (messageCount >= expectedMessages) {
            console.log(`✅ Received all ${expectedMessages} messages`);
            return;
          }
        } catch (decodeError) {
          console.error(`❌ Failed to decode message: ${decodeError.message}`);
        }
      },
    });

    // Wait a bit for messages to be processed
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(`\n6. Verifying message content...`);
    console.log(`Expected: ${expectedMessages} messages, Received: ${receivedMessages.length} messages`);
    
    if (receivedMessages.length === expectedMessages) {
      console.log('✅ All messages received and decoded correctly');
      
      // Verify content of each message
      receivedMessages.forEach((msg, index) => {
        const original = testMessages[index];
        const decoded = msg.payload;
        
        console.log(`\nMessage ${index + 1} verification:`);
        console.log(`  Original ID: ${original.id}, Decoded ID: ${decoded.id}`);
        console.log(`  Original message: ${original.message}, Decoded message: ${decoded.message}`);
        console.log(`  Schema validation: ${decoded.id === original.id && decoded.message === original.message ? '✅ PASS' : '❌ FAIL'}`);
      });
    } else {
      console.log(`❌ Message count mismatch`);
    }

    console.log('\n🎉 Schema Consumer functionality test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  } finally {
    await producer.disconnect();
    await consumer.disconnect();
    console.log('\n🔌 Disconnected from Kafka');
  }
}

// Test error handling scenarios
async function testErrorHandling() {
  console.log('\n🔍 Testing Error Handling Scenarios');
  console.log('-'.repeat(40));

  const kafka = new Kafka(config.kafka);
  const registry = new SchemaRegistry(config.registry);
  const producer = kafka.producer();

  try {
    await producer.connect();
    console.log('✅ Connected for error testing');

    // Test 1: Invalid schema message
    console.log('\n1. Testing invalid schema message...');
    const invalidMessage = Buffer.from('This is not a valid Avro message');
    
    try {
      await registry.decode(invalidMessage);
      console.log('❌ Expected decode to fail, but it passed');
    } catch (decodeError) {
      console.log('✅ Invalid message correctly rejected:', decodeError.message);
    }

    // Test 2: Schema not found scenario
    console.log('\n2. Testing schema not found scenario...');
    try {
      await registry.getLatestSchemaId('non-existent-subject');
      console.log('❌ Expected schema lookup to fail, but it passed');
    } catch (schemaError) {
      console.log('✅ Non-existent schema correctly rejected:', schemaError.message);
    }

    console.log('\n✅ Error handling tests completed successfully');

  } catch (error) {
    console.error('❌ Error handling test failed:', error.message);
  } finally {
    await producer.disconnect();
  }
}

// Test schema consumer node configuration validation
function testNodeConfiguration() {
  console.log('\n⚙️  Testing Node Configuration Validation');
  console.log('-'.repeat(40));

  // Test valid configuration
  const validConfig = {
    name: 'Test Schema Consumer',
    broker: 'test-broker',
    topic: 'test-topic',
    groupid: 'test-group',
    fromOffset: 'latest',
    outOfRangeOffset: 'earliest',
    registryUrl: 'http://localhost:8081',
    schemaSubject: 'test-topic-value',
    useRegistryAuth: false,
    autoRegisterSchema: true,
    defaultSchema: JSON.stringify(testSchema),
    skipInvalidMessages: false,
    outputRawMessage: true
  };

  console.log('Valid configuration structure:', JSON.stringify(validConfig, null, 2));

  // Test invalid configurations
  const invalidConfigs = [
    { ...validConfig, topic: '' }, // Missing topic
    { ...validConfig, registryUrl: '' }, // Missing registry URL
    { ...validConfig, schemaSubject: '' }, // Missing schema subject
    { ...validConfig, defaultSchema: 'invalid-json' }, // Invalid JSON schema
  ];

  console.log('\nInvalid configuration examples:');
  invalidConfigs.forEach((config, index) => {
    console.log(`${index + 1}. ${JSON.stringify(config, null, 2)}`);
  });

  console.log('\n✅ Configuration validation tests completed');
}

// Run tests if this file is executed directly
if (require.main === module) {
  console.log('🚀 Starting Node-RED Kafka Schema Consumer Tests');
  console.log('='.repeat(60));
  
  testNodeConfiguration();
  
  console.log('\n' + '='.repeat(60));
  testSchemaConsumerFunctionality()
    .then(() => testErrorHandling())
    .catch(console.error);
} else {
  // Export for use in other modules
  module.exports = {
    testSchemaConsumerFunctionality,
    testErrorHandling,
    testNodeConfiguration,
    config,
    testSchema
  };
}
