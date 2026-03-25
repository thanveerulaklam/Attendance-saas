/**
 * Patch zk-attendance-sdk decodeRecordData40 so recordTime is always IST-based ISO UTC,
 * not host-local Date#toString() (which breaks on UTC servers / wrong OS TZ).
 */
const utils = require('zk-attendance-sdk/src/helper/utils.js');
const { parseZkCompactTimeToIsoIst } = require('./zkTimeIst.js');

const originalDecode40 = utils.decodeRecordData40;
const originalDecode16 = utils.decodeRecordData16;

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

/** UDP path (judp.js) — same compact time at offset 4 */
utils.decodeRecordData16 = function decodeRecordData16Ist(recordData) {
  return {
    deviceUserId: recordData.readUIntLE(0, 2),
    recordTime: parseZkCompactTimeToIsoIst(recordData.readUInt32LE(4)),
  };
};

module.exports = { originalDecode40, originalDecode16 };
