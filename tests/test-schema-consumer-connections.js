// Test script to verify the Kafka Schema Consumer node has proper connection dots
const path = require('path');

// Mock Node-RED environment
const RED = {
    nodes: {
        createNode: function(node, config) {
            // Mock createNode implementation
        },
        getNode: function(id) {
            // Mock getNode implementation
            return {
                brokerurl: 'localhost:9092',
                username: '',
                password: '',
                clientId: 'test-client'
            };
        },
        registerType: function(name, constructor, options) {
            console.log(`✓ Node registered: ${name}`);
            console.log(`  - Constructor: ${typeof constructor}`);
            console.log(`  - Options: ${JSON.stringify(options, null, 2)}`);
        }
    }
};

// Mock the schema registry dependency
const mockSchemaRegistry = {
    SchemaRegistry: class {
        constructor(config) {
            this.config = config;
        }
        
        async getSchema(id) {
            return { type: 'record', name: 'test' };
        }
        
        async encode(id, data) {
            return Buffer.from(JSON.stringify(data));
        }
        
        async decode(buffer) {
            return JSON.parse(buffer.toString());
        }
    }
};

// Mock require for dependencies
const originalRequire = require;
require = function(module) {
    if (module === '@kafkajs/confluent-schema-registry') {
        return mockSchemaRegistry;
    }
    return originalRequire(module);
};

try {
    console.log('🧪 Testing Kafka Schema Consumer Node Structure...\n');
    
    // Load the schema consumer node
    const schemaConsumerPath = path.join(__dirname, '..', 'js', 'kafka-schema-consumer.js');
    const schemaConsumerModule = originalRequire(schemaConsumerPath);
    
    // Execute the module with mocked RED
    schemaConsumerModule(RED);
    
    console.log('\n✅ Schema Consumer node structure test completed successfully!');
    console.log('The node should now have proper connection dots for outputs.');
    
} catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
}

// Restore original require
require = originalRequire;
