

module.exports = {
    getNameTypes: (fields = []) => {
        return fields.map(item => {
            return `${item.fieldName}:${item.dataType}`
        });
    },
    getMsgValues: (nameTypes = [], payload = {}) => {
        const tsList = [];
        const genRecord = (data = {}) => {
           return nameTypes.map(item => {
                const fieldName = item.split(':')[0];
                const val = fieldName ? data[fieldName] : null
                return val ?? null;
            })
        }
        if (Array.isArray(payload)) {
            const valueList = [];
            payload.forEach(msg => {
                const recordValue = genRecord(msg);
                tsList.push(new Date().getTime());
                valueList.push(recordValue);
            });
            return { values: valueList, tsList }

        } else {
            const recordValue = genRecord(payload);
            return { values: [recordValue], tsList: [new Date().getTime()] }
        }

    },
}