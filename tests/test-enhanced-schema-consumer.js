const { Kafka } = require('kafkajs');
const { SchemaRegistry } = require('@kafkajs/confluent-schema-registry');

// Test configuration
const config = {
  kafka: {
    clientId: 'enhanced-schema-consumer-test-client',
    brokers: ['localhost:9092'],
    ssl: false,
    sasl: undefined
  },
  registry: {
    host: 'http://localhost:8081',
    clientId: 'enhanced-schema-consumer-test-registry'
  },
  topic: 'test-enhanced-schema-consumer-topic',
  subject: 'test-enhanced-schema-consumer-topic-value'
};

// Enhanced test schema with more complex types
const testSchema = {
  type: 'record',
  name: 'EnhancedTestMessage',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'message', type: 'string' },
    { name: 'timestamp', type: 'long' },
    { name: 'priority', type: { type: 'enum', name: 'Priority', symbols: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] } },
    { name: 'tags', type: { type: 'array', items: 'string' }, default: [] },
    { name: 'metadata', type: ['null', {
      type: 'record',
      name: 'EnhancedMetadata',
      fields: [
        { name: 'source', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'environment', type: 'string' },
        { name: 'correlationId', type: ['null', 'string'], default: null },
        { name: 'metrics', type: ['null', {
          type: 'record',
          name: 'ProcessingMetrics',
          fields: [
            { name: 'processingTime', type: 'double' },
            { name: 'queueTime', type: 'double' },
            { name: 'retryCount', type: 'int' }
          ]
        }], default: null }
      ]
    }], default: null }
  ]
};

// Schema evolution test - a second version with additional fields
const testSchemaV2 = {
  type: 'record',
  name: 'EnhancedTestMessage',
  fields: [
    ...testSchema.fields,
    { name: 'newField', type: ['null', 'string'], default: null },
    { name: 'additionalData', type: ['null', {
      type: 'record',
      name: 'AdditionalData',
      fields: [
        { name: 'category', type: 'string' },
        { name: 'subcategory', type: ['null', 'string'], default: null }
      ]
    }], default: null }
  ]
};

async function testEnhancedSchemaConsumerFeatures() {
  console.log('🚀 Testing Enhanced Schema Consumer Node Features');
  console.log('='.repeat(60));

  // Create clients
  const kafka = new Kafka(config.kafka);
  const registry = new SchemaRegistry(config.registry);
  const producer = kafka.producer();

  try {
    // Connect to Kafka
    console.log('1. Connecting to Kafka...');
    await producer.connect();
    console.log('✅ Connected to Kafka');

    // Test 1: Schema Registration and Evolution
    console.log('\n2. Testing Schema Registration and Evolution...');
    
    // Register initial schema
    const schemaV1 = await registry.register({
      type: 'AVRO',
      schema: JSON.stringify(testSchema)
    }, {
      subject: config.subject
    });
    console.log(`✅ Registered schema v1 with ID: ${schemaV1.id}`);

    // Register evolved schema
    const schemaV2 = await registry.register({
      type: 'AVRO',
      schema: JSON.stringify(testSchemaV2)
    }, {
      subject: config.subject
    });
    console.log(`✅ Registered schema v2 with ID: ${schemaV2.id}`);

    // Test 2: Performance and Batch Processing
    console.log('\n3. Testing Performance and Batch Processing...');
    
    // Create test messages for performance testing
    const testMessages = [];
    for (let i = 0; i < 100; i++) {
      testMessages.push({
        id: `perf-test-${i}`,
        message: `Performance test message ${i}`,
        timestamp: Date.now() + i,
        priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][i % 4],
        tags: [`tag-${i}`, `category-${i % 10}`, `batch-${Math.floor(i / 10)}`],
        metadata: {
          source: 'performance-test',
          version: '1.0.0',
          environment: 'test',
          correlationId: `corr-${i}`,
          metrics: {
            processingTime: Math.random() * 100,
            queueTime: Math.random() * 50,
            retryCount: Math.floor(Math.random() * 3)
          }
        }
      });
    }

    // Encode and send messages using both schema versions
    const messagesToSend = [];
    for (let i = 0; i < testMessages.length; i++) {
      const schemaId = i < 50 ? schemaV1.id : schemaV2.id;
      let messageData = testMessages[i];
      
      // Add new fields for v2 schema
      if (schemaId === schemaV2.id) {
        messageData.newField = `new-field-${i}`;
        messageData.additionalData = {
          category: `category-${i % 5}`,
          subcategory: i % 3 === 0 ? `subcategory-${i % 3}` : null
        };
      }
      
      try {
        const encodedMessage = await registry.encode(schemaId, messageData);
        messagesToSend.push({
          key: messageData.id,
          value: encodedMessage,
          timestamp: messageData.timestamp.toString(),
          headers: {
            'schema-version': schemaId === schemaV1.id ? 'v1' : 'v2',
            'test-batch': Math.floor(i / 10).toString()
          }
        });
      } catch (error) {
        console.error(`❌ Failed to encode message ${i}: ${error.message}`);
      }
    }

    // Send messages in batches
    const batchSize = 10;
    for (let i = 0; i < messagesToSend.length; i += batchSize) {
      const batch = messagesToSend.slice(i, i + batchSize);
      await producer.send({
        topic: config.topic,
        messages: batch
      });
      console.log(`📤 Sent batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(messagesToSend.length / batchSize)} (${batch.length} messages)`);
      
      // Small delay to simulate realistic load
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✅ Successfully sent ${messagesToSend.length} messages`);

    // Test 3: Invalid Messages for Error Handling
    console.log('\n4. Testing Error Handling with Invalid Messages...');
    
    // Send some invalid messages (not Avro encoded)
    const invalidMessages = [
      {
        key: 'invalid-1',
        value: Buffer.from('This is not an Avro message'),
        timestamp: Date.now().toString(),
        headers: { 'test-type': 'invalid-format' }
      },
      {
        key: 'invalid-2',
        value: Buffer.from(JSON.stringify({ invalid: 'json-message' })),
        timestamp: Date.now().toString(),
        headers: { 'test-type': 'invalid-json' }
      }
    ];

    await producer.send({
      topic: config.topic,
      messages: invalidMessages
    });
    console.log(`✅ Sent ${invalidMessages.length} invalid messages for error handling test`);

    // Test 4: Schema Compatibility Test
    console.log('\n5. Testing Schema Compatibility...');
    
    // Create a message that's valid for both schemas
    const compatibilityTestMessage = {
      id: 'compatibility-test',
      message: 'Testing backward compatibility',
      timestamp: Date.now(),
      priority: 'HIGH',
      tags: ['compatibility', 'test'],
      metadata: {
        source: 'compatibility-test',
        version: '1.0.0',
        environment: 'test',
        correlationId: 'compat-test-001',
        metrics: {
          processingTime: 15.5,
          queueTime: 2.3,
          retryCount: 0
        }
      }
    };

    // Send with both schema versions
    for (const [version, schemaId] of [['v1', schemaV1.id], ['v2', schemaV2.id]]) {
      let messageData = { ...compatibilityTestMessage };
      if (version === 'v2') {
        messageData.newField = 'compatibility-test-field';
        messageData.additionalData = {
          category: 'compatibility',
          subcategory: 'backward-compat'
        };
      }
      
      const encodedMessage = await registry.encode(schemaId, messageData);
      await producer.send({
        topic: config.topic,
        messages: [{
          key: `compatibility-${version}`,
          value: encodedMessage,
          timestamp: Date.now().toString(),
          headers: { 'compatibility-test': version }
        }]
      });
      console.log(`✅ Sent compatibility test message with schema ${version}`);
    }

    console.log('\n6. Test Summary:');
    console.log(`📊 Total messages sent: ${messagesToSend.length + invalidMessages.length + 2}`);
    console.log(`📈 Performance test messages: ${testMessages.length}`);
    console.log(`🔄 Schema versions used: 2 (${schemaV1.id}, ${schemaV2.id})`);
    console.log(`❌ Invalid messages: ${invalidMessages.length}`);
    console.log(`🔧 Compatibility test messages: 2`);
    console.log('\n✅ Enhanced Schema Consumer test completed successfully!');
    console.log('\n📝 Configure your kafka-schema-consumer node with:');
    console.log(`   - Topic: ${config.topic}`);
    console.log(`   - Schema Subject: ${config.subject}`);
    console.log(`   - Registry URL: ${config.registry.host}`);
    console.log(`   - Enable Multi-Output: true (to separate valid/invalid messages)`);
    console.log(`   - Enable Metrics: true (to track performance)`);
    console.log(`   - Track Schema Evolution: true (to monitor schema changes)`);
    console.log(`   - Batch Size: 10 (for batch processing)`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  } finally {
    // Cleanup
    await producer.disconnect();
    console.log('\n🧹 Cleanup completed');
  }
}

// Run the test
if (require.main === module) {
  testEnhancedSchemaConsumerFeatures()
    .then(() => {
      console.log('\n🎉 All tests completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Test suite failed:', error.message);
      process.exit(1);
    });
}

module.exports = { testEnhancedSchemaConsumerFeatures };
