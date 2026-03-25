const utils = require('zk-attendance-sdk/src/helper/utils.js');
const { parseZkCompactTimeToIsoIst } = require('./zkTimeIst.js');

utils.decodeRecordData40 = function decodeRecordData40Ist(recordData) {
  const record = {
    userSn: recordData.readUIntLE(0, 2),
    deviceUserId: recordData
      .slice(2, 2 + 9)
      .toString('ascii')
      .split('\0')
      .shift(),
    recordTime: parseZkCompactTimeToIsoIst(recordData.readUInt32LE(27)),
  };
  return record;
};

utils.decodeRecordData16 = function decodeRecordData16Ist(recordData) {
  return {
    deviceUserId: recordData.readUIntLE(0, 2),
    recordTime: parseZkCompactTimeToIsoIst(recordData.readUInt32LE(4)),
  };
};
