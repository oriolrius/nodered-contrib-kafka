// Test to verify the node structure and ensure it can be loaded
const fs = require('fs');
const path = require('path');

// Mock RED object to simulate Node-RED environment
const mockRED = {
    nodes: {
        registerType: function(type, constructor, settings) {
            console.log(`✓ Node registered: ${type}`);
            console.log(`  Constructor: ${typeof constructor}`);
            console.log(`  Settings: ${JSON.stringify(settings, null, 2)}`);
            
            // Test the constructor
            try {
                const mockConfig = {
                    name: "Test Node",
                    broker: "test-broker",
                    topic: "test-topic",
                    registryUrl: "http://localhost:8081",
                    schemaSubject: "test-subject"
                };
                
                // Mock createNode function
                const mockCreateNode = function(node, config) {
                    console.log(`  Mock node created with config:`, Object.keys(config));
                };
                
                // Temporarily mock createNode
                const originalCreateNode = mockRED.nodes.createNode;
                mockRED.nodes.createNode = mockCreateNode;
                
                console.log(`  Testing constructor...`);
                const nodeInstance = new constructor(mockConfig);
                console.log(`  ✓ Constructor executed successfully`);
                
                // Restore original
                mockRED.nodes.createNode = originalCreateNode;
                
            } catch (error) {
                console.log(`  ✗ Constructor failed: ${error.message}`);
            }
        },
        createNode: function(node, config) {
            console.log(`  createNode called with config keys: ${Object.keys(config)}`);
        },
        getNode: function(id) {
            // Return a mock broker node
            return {
                host: "localhost",
                port: 9092,
                clientId: "test-client"
            };
        }
    }
};

console.log("Testing Node Structure...\n");

// Test the HTML file exists and is valid
const htmlPath = path.join(__dirname, '..', 'js', 'kafka-schema-consumer.html');
if (fs.existsSync(htmlPath)) {
    console.log("✓ HTML file exists");
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Check for required elements
    const hasRegisterType = htmlContent.includes('registerType');
    const hasInputs = htmlContent.includes('inputs:');
    const hasOutputs = htmlContent.includes('outputs:');
    const hasIcon = htmlContent.includes('icon:');
    
    console.log(`  - registerType: ${hasRegisterType ? '✓' : '✗'}`);
    console.log(`  - inputs defined: ${hasInputs ? '✓' : '✗'}`);
    console.log(`  - outputs defined: ${hasOutputs ? '✓' : '✗'}`);
    console.log(`  - icon defined: ${hasIcon ? '✓' : '✗'}`);
    
    // Extract and display the node configuration
    const registerMatch = htmlContent.match(/RED\.nodes\.registerType\s*\(\s*['"]([^'"]+)['"]\s*,\s*{([^}]+(?:{[^}]*}[^}]*)*)}/);
    if (registerMatch) {
        console.log(`  - Node type: ${registerMatch[1]}`);
        
        // Look for inputs/outputs specifically
        const inputsMatch = htmlContent.match(/inputs\s*:\s*(\d+|function[^,]*)/);
        const outputsMatch = htmlContent.match(/outputs\s*:\s*(\d+|function[^,]*)/);
        
        if (inputsMatch) {
            console.log(`  - Inputs: ${inputsMatch[1]}`);
        }
        if (outputsMatch) {
            console.log(`  - Outputs: ${outputsMatch[1]}`);
        }
    }
} else {
    console.log("✗ HTML file not found");
}

// Test the JS file exists and can be loaded
const jsPath = path.join(__dirname, '..', 'js', 'kafka-schema-consumer.js');
if (fs.existsSync(jsPath)) {
    console.log("\n✓ JS file exists");
    
    try {
        // Load the module
        const nodeModule = require(jsPath);
        console.log("✓ JS module loaded successfully");
        
        // Execute the module with mock RED
        console.log("\nTesting module execution...");
        nodeModule(mockRED);
        
    } catch (error) {
        console.log(`✗ JS module failed to load: ${error.message}`);
        console.log("Stack:", error.stack);
    }
} else {
    console.log("✗ JS file not found");
}

console.log("\nTest completed!");
