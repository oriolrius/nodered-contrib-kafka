

module.exports = {
    getNameTypes: (fields = []) => {
        console.log(`[Utils] Processing ${fields.length} field definitions`);
        const nameTypes = fields.map(item => {
            const nameType = `${item.fieldName}:${item.dataType}`;
            console.log(`[Utils] Created nameType: ${nameType}`);
            return nameType;
        });
        console.log(`[Utils] Final nameTypes: ${JSON.stringify(nameTypes)}`);
        return nameTypes;
    },
    getMsgValues: (nameTypes = [], payload = {}) => {
        console.log(`[Utils] Processing payload with ${nameTypes.length} nameTypes`);
        console.log(`[Utils] Payload type: ${Array.isArray(payload) ? 'array' : typeof payload}`);
        console.log(`[Utils] Payload content: ${JSON.stringify(payload)}`);
        
        const tsList = [];
        const genRecord = (data = {}) => {
           const record = nameTypes.map(item => {
                const fieldName = item.split(':')[0];
                const dataType = item.split(':')[1];
                const val = fieldName ? data[fieldName] : null;
                console.log(`[Utils] Field ${fieldName} (${dataType}): ${val}`);
                return val ?? null;
            });
            console.log(`[Utils] Generated record: ${JSON.stringify(record)}`);
            return record;
        }
        
        if (Array.isArray(payload)) {
            console.log(`[Utils] Processing array payload with ${payload.length} items`);
            const valueList = [];
            payload.forEach((msg, index) => {
                console.log(`[Utils] Processing array item ${index}`);
                const recordValue = genRecord(msg);
                const timestamp = new Date().getTime();
                tsList.push(timestamp);
                valueList.push(recordValue);
                console.log(`[Utils] Added timestamp: ${timestamp}`);
            });
            console.log(`[Utils] Final result for array: values=${JSON.stringify(valueList)}, tsList=${JSON.stringify(tsList)}`);
            return { values: valueList, tsList }

        } else {
            console.log(`[Utils] Processing single object payload`);
            const recordValue = genRecord(payload);
            const timestamp = new Date().getTime();
            console.log(`[Utils] Generated timestamp: ${timestamp}`);
            const result = { values: [recordValue], tsList: [timestamp] };
            console.log(`[Utils] Final result for object: ${JSON.stringify(result)}`);
            return result;
        }

    },
}