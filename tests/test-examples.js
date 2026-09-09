#!/usr/bin/env node

// Test to validate all example flows can be loaded

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Example Flows');
console.log('==================================================\n');

const examplesDir = path.join(__dirname, '..', 'examples');
const exampleFiles = fs.readdirSync(examplesDir).filter(f => f.endsWith('.json'));

console.log(`Found ${exampleFiles.length} example files:\n`);

let allPassed = true;

exampleFiles.forEach(file => {
    console.log(`📝 Testing: ${file}`);
    console.log('--------------------------------------------------');

    const filePath = path.join(examplesDir, file);
    let flow;

    // Test 1: Valid JSON
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        flow = JSON.parse(content);
        console.log('  ✅ Valid JSON syntax');
    } catch (error) {
        console.log(`  ❌ Invalid JSON: ${error.message}`);
        allPassed = false;
        return;
    }

    // Test 2: Must be an array
    if (!Array.isArray(flow)) {
        console.log('  ❌ Flow must be an array');
        allPassed = false;
        return;
    }
    console.log('  ✅ Valid flow structure');

    // Test 3: Build node map
    const nodes = {};
    const tabs = [];
    flow.forEach(node => {
        if (node.id) {
            nodes[node.id] = node;
            if (node.type === 'tab') {
                tabs.push(node.id);
            }
        }
    });
    console.log(`  ✅ Found ${Object.keys(nodes).length} nodes`);

    // Test 4: Check for our Kafka nodes
    const kafkaNodes = flow.filter(n =>
        n.type && n.type.startsWith('yroshcha-kafka-')
    );
    console.log(`  ✅ Found ${kafkaNodes.length} Kafka nodes`);

    if (kafkaNodes.length === 0) {
        console.log('  ⚠️  Warning: No Kafka nodes found in example');
    }

    // Test 5: Validate wiring
    let wiringErrors = 0;
    flow.forEach(node => {
        if (node.wires) {
            node.wires.forEach((wireArray, outputIdx) => {
                if (!Array.isArray(wireArray)) {
                    console.log(`  ❌ Node ${node.id}: wires[${outputIdx}] is not an array`);
                    wiringErrors++;
                    return;
                }
                wireArray.forEach(targetId => {
                    if (!nodes[targetId]) {
                        console.log(`  ❌ Node ${node.id}: wires to non-existent node ${targetId}`);
                        wiringErrors++;
                    }
                });
            });
        }
    });

    if (wiringErrors === 0) {
        console.log('  ✅ All wiring is valid');
    } else {
        console.log(`  ❌ Found ${wiringErrors} wiring errors`);
        allPassed = false;
    }

    // Test 6: Validate broker references
    let brokerErrors = 0;
    flow.forEach(node => {
        if (node.broker && !nodes[node.broker]) {
            console.log(`  ❌ Node ${node.id}: references non-existent broker ${node.broker}`);
            brokerErrors++;
        }
    });

    if (brokerErrors === 0) {
        console.log('  ✅ All broker references are valid');
    } else {
        console.log(`  ❌ Found ${brokerErrors} broker reference errors`);
        allPassed = false;
    }

    // Test 7: Check Kafka node configurations
    let configErrors = 0;
    kafkaNodes.forEach(node => {
        if (node.type === 'yroshcha-kafka-producer') {
            if (!node.topic) {
                console.log(`  ❌ Producer ${node.id}: missing required field 'topic'`);
                configErrors++;
            }
            if (node.requireAcks === undefined) {
                console.log(`  ❌ Producer ${node.id}: missing required field 'requireAcks'`);
                configErrors++;
            }
            if (node.ackTimeoutMs === undefined) {
                console.log(`  ❌ Producer ${node.id}: missing required field 'ackTimeoutMs'`);
                configErrors++;
            }
        }

        if (node.type === 'yroshcha-kafka-consumer') {
            if (!node.topic) {
                console.log(`  ❌ Consumer ${node.id}: missing required field 'topic'`);
                configErrors++;
            }
        }

        if (node.type === 'yroshcha-kafka-history-reader') {
            if (!node.topic) {
                console.log(`  ❌ History Reader ${node.id}: missing required field 'topic'`);
                configErrors++;
            }
        }
    });

    if (configErrors === 0 && kafkaNodes.length > 0) {
        console.log('  ✅ All Kafka node configurations are valid');
    } else if (configErrors > 0) {
        console.log(`  ❌ Found ${configErrors} configuration errors`);
        allPassed = false;
    }

    // Test 8: Check for tab nodes
    if (tabs.length > 0) {
        console.log(`  ✅ Found ${tabs.length} tab(s) for organization`);
    }

    // Test 9: Check z references (node belongs to tab)
    const nodesWithZ = flow.filter(n => n.z && n.type !== 'tab');
    let zErrors = 0;
    nodesWithZ.forEach(node => {
        if (!tabs.includes(node.z)) {
            console.log(`  ❌ Node ${node.id}: references non-existent tab ${node.z}`);
            zErrors++;
        }
    });

    if (zErrors === 0 && nodesWithZ.length > 0) {
        console.log('  ✅ All nodes properly assigned to tabs');
    } else if (zErrors > 0) {
        console.log(`  ❌ Found ${zErrors} tab assignment errors`);
        allPassed = false;
    }

    console.log('');
});

// Summary
console.log('📊 Test Summary');
console.log('==================================================');

if (allPassed) {
    console.log('🎉 All example flows are valid and functional!');
    console.log('✅ JSON syntax is correct');
    console.log('✅ Node wiring is correct');
    console.log('✅ Broker references are valid');
    console.log('✅ Kafka node configurations are valid');
    console.log('✅ Tab assignments are correct');
    process.exit(0);
} else {
    console.log('❌ Some examples have issues that need to be fixed');
    process.exit(1);
}