#!/usr/bin/env node

console.log('🚀 Starting Test Runner');
console.log('='.repeat(50));

const path = require('path');
const fs = require('fs');

// Check if we can find the required modules
console.log('\n📁 Checking test directory structure...');
const testDir = __dirname;
const rootDir = path.join(__dirname, '..');
const jsDir = path.join(rootDir, 'js');

console.log('Test directory:', testDir);
console.log('Root directory:', rootDir);
console.log('JS directory:', jsDir);

// Check if required files exist
const requiredFiles = [
    path.join(jsDir, 'kafka-schema-producer.js'),
    path.join(jsDir, 'kafka-schema-consumer.js'),
    path.join(jsDir, 'kafka-consumer.js'),
    path.join(jsDir, 'kafka-producer.js'),
    path.join(jsDir, 'kafka-broker.js')
];

console.log('\n🔍 Checking required files...');
requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log('✅', path.relative(rootDir, file));
    } else {
        console.log('❌', path.relative(rootDir, file), 'NOT FOUND');
    }
});

// Test list
const tests = [
    'test-node-loading.js',
    'comprehensive-test.js',
    'test-schema-producer.js',
    'test-schema-consumer.js'
];

console.log('\n📋 Available tests:');
tests.forEach(test => {
    const testPath = path.join(testDir, test);
    if (fs.existsSync(testPath)) {
        console.log('✅', test);
    } else {
        console.log('❌', test, 'NOT FOUND');
    }
});

console.log('\n🧪 Running individual tests...');

// Function to run a test safely
function runTest(testFile) {
    console.log(`\n--- Running ${testFile} ---`);
    try {
        require(path.join(testDir, testFile));
        console.log(`✅ ${testFile} completed successfully`);
    } catch (error) {
        console.log(`❌ ${testFile} failed:`, error.message);
        console.log('Stack trace:', error.stack);
    }
}

// Run tests
tests.forEach(runTest);

console.log('\n🏁 Test runner completed');
