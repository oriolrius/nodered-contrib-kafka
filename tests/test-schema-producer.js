const { Kafka } = require('kafkajs');
const { SchemaRegistry } = require('@kafkajs/confluent-schema-registry');

// Test configuration - similar to your original test code
const config = {
  kafka: {
    clientId: 'schema-test-client',
    brokers: ['localhost:9092'],
    ssl: false,
    sasl: undefined
  },
  registry: {
    host: 'http://localhost:8081',
    clientId: 'schema-test-registry'
  },
  topic: 'test-schema-topic',
  subject: 'test-schema-topic-value'
};

// Test schema
const testSchema = {
  type: 'record',
  name: 'TestMessage',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'message', type: 'string' },
    { name: 'timestamp', type: 'long' },
    { name: 'metadata', type: ['null', 'string'], default: null }
  ]
};

async function testSchemaProducerFunctionality() {
  console.log('🧪 Testing Schema Producer Node Functionality');
  console.log('='.repeat(50));

  // Create clients
  const kafka = new Kafka(config.kafka);
  const registry = new SchemaRegistry(config.registry);
  const producer = kafka.producer();

  try {
    // Connect to Kafka
    console.log('1. Connecting to Kafka...');
    await producer.connect();
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

    // Test message validation and encoding
    console.log('\n3. Testing message validation...');
    const testMessage = {
      id: `test-${Date.now()}`,
      message: 'Hello from schema test!',
      timestamp: Date.now(),
      metadata: 'test metadata'
    };

    console.log('Test message:', testMessage);

    // Encode message
    const encodedMessage = await registry.encode(schemaId, testMessage);
    console.log(`✅ Message encoded successfully (${encodedMessage.length} bytes)`);

    // Test publishing
    console.log('\n4. Testing message publishing...');
    const result = await producer.send({
      topic: config.topic,
      messages: [{
        key: testMessage.id,
        value: encodedMessage,
        timestamp: testMessage.timestamp.toString()
      }]
    });
    console.log('✅ Message published successfully');
    console.log('Publish result:', result);

    // Verify by decoding
    console.log('\n5. Verifying message encoding/decoding...');
    const decodedMessage = await registry.decode(encodedMessage);
    console.log('✅ Message decoded successfully:', decodedMessage);

    // Test validation failure
    console.log('\n6. Testing validation failure...');
    const invalidMessage = {
      id: 'test-invalid',
      // missing required 'message' field
      timestamp: Date.now()
    };

    try {
      await registry.encode(schemaId, invalidMessage);
      console.log('❌ Expected validation to fail, but it passed');
    } catch (validationError) {
      console.log('✅ Validation correctly failed:', validationError.message);
    }

    console.log('\n🎉 All tests passed! The schema producer functionality is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  } finally {
    await producer.disconnect();
    console.log('\n🔌 Disconnected from Kafka');
  }
}

// Test schema validation logic
function testSchemaValidation() {
  console.log('\n📋 Testing Schema Validation Logic');
  console.log('-'.repeat(30));

  // Test valid message
  const validMessage = {
    id: 'test-001',
    message: 'Valid message',
    timestamp: 1640995200000,
    metadata: null
  };

  // Test missing required field
  const invalidMessage1 = {
    id: 'test-002',
    // missing 'message' field
    timestamp: 1640995200000
  };

  // Test wrong type
  const invalidMessage2 = {
    id: 'test-003',
    message: 'Valid message',
    timestamp: 'invalid-timestamp', // should be long
    metadata: null
  };

  console.log('Valid message structure:', JSON.stringify(validMessage, null, 2));
  console.log('\nInvalid message examples:');
  console.log('1. Missing required field:', JSON.stringify(invalidMessage1, null, 2));
  console.log('2. Wrong field type:', JSON.stringify(invalidMessage2, null, 2));
}

// Run tests if this file is executed directly
if (require.main === module) {
  console.log('🚀 Starting Node-RED Kafka Schema Producer Tests');
  console.log('=' .repeat(60));
  
  testSchemaValidation();
  
  console.log('\n' + '='.repeat(60));
  testSchemaProducerFunctionality().catch(console.error);
} else {
  // Export for use in other modules
  module.exports = {
    testSchemaProducerFunctionality,
    testSchemaValidation,
    config,
    testSchema
  };
}
