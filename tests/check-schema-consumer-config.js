#!/usr/bin/env node

console.log('🧪 Testing Kafka Schema Consumer Configuration...\n');

// Test 1: Check if HTML file exists and has proper structure
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'js', 'kafka-schema-consumer.html');
const jsPath = path.join(__dirname, '..', 'js', 'kafka-schema-consumer.js');

console.log('📁 Checking file existence...');
console.log(`HTML file exists: ${fs.existsSync(htmlPath)}`);
console.log(`JS file exists: ${fs.existsSync(jsPath)}`);

if (fs.existsSync(htmlPath)) {
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Check for key registration properties
    const hasInputs = htmlContent.includes('inputs:0');
    const hasOutputs = htmlContent.includes('outputs:2');
    const hasIcon = htmlContent.includes('icon: "publish.png"');
    const hasCategory = htmlContent.includes('category: \'IOT\'');
    const hasRegisterType = htmlContent.includes('RED.nodes.registerType(\'hm-kafka-schema-consumer\'');
    
    console.log('\n🔍 Checking HTML configuration...');
    console.log(`✓ Has inputs:0 - ${hasInputs}`);
    console.log(`✓ Has outputs:2 - ${hasOutputs}`);
    console.log(`✓ Has icon - ${hasIcon}`);
    console.log(`✓ Has IOT category - ${hasCategory}`);
    console.log(`✓ Has registerType - ${hasRegisterType}`);
    
    if (hasInputs && hasOutputs && hasIcon && hasCategory && hasRegisterType) {
        console.log('\n✅ Schema Consumer HTML configuration looks correct!');
        console.log('The node should appear in Node-RED with proper connection dots.');
    } else {
        console.log('\n❌ Some configuration issues found in HTML file.');
    }
} else {
    console.log('❌ HTML file not found');
}

console.log('\n📝 Summary:');
console.log('- inputs:0 = No input connection dots (correct for consumer)');
console.log('- outputs:2 = Two output connection dots (for valid/invalid messages)');
console.log('- icon: "publish.png" = Same icon as working kafka-consumer');
console.log('- category: "IOT" = Will appear in IOT section of palette');
console.log('\nIf the node still doesn\'t show connection dots, try:');
console.log('1. Restart Node-RED completely');
console.log('2. Clear browser cache');
console.log('3. Check Node-RED logs for errors');
