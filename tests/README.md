# Tests

This directory contains all test files for the EdgeFlow Kafka Client Node-RED nodes.

## Test Files

- **comprehensive-test.js** - Comprehensive test for the Kafka Schema Send Node
- **test-node-loading.js** - Test to verify the broker.getKafka() method works correctly  
- **test-schema-producer.js** - Integration test for the Kafka Schema Send functionality
- **run-tests.js** - Test runner utility that executes all tests with proper error handling

## Running Tests

### Run all tests
```bash
npm test
```

### Run individual tests
```bash
npm run test:comprehensive    # Run comprehensive Kafka Schema Send test
npm run test:loading         # Run node loading test
npm run test:schema          # Run Kafka Schema Send integration test
```

### Run tests individually with Node.js
```bash
node tests/comprehensive-test.js
node tests/test-node-loading.js
node tests/test-schema-producer.js
```

## Test Requirements

The tests require:
- Node.js >= 14.6.0 (as specified in package.json)
- Kafka broker running on localhost:9092 (for integration tests)
- Schema Registry running on localhost:8081 (for schema tests)
- All Node-RED node modules in the `js/` directory

## Test Structure

All tests mock the Node-RED environment and test the functionality of the Kafka nodes without requiring a full Node-RED installation.

The improved node names make it clearer what each node does:
- **Kafka Broker** - Manages connection configuration
- **Kafka Send** - Publishes messages to topics  
- **Kafka Receive** - Subscribes to and receives messages
- **Kafka Schema Send** - Publishes messages with Avro schema validation
