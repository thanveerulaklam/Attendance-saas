/**
 * India Standard Time (IST) helpers — thin wrapper over companyDate for backward compatibility.
 * New code should use companyDate with an explicit timezone.
 */

const IST = 'Asia/Kolkata';
const cd = require('./companyDate');

const istYmdFromDate = (d) => cd.ymdFromDate(d, IST);
const istYmdParts = (d) => cd.ymdParts(d, IST);
const todayIstYmd = () => cd.todayYmd(IST);
const pgDateToYmd = (value) => cd.pgDateToYmd(value, IST);
const istDayBounds = (ymd) => cd.dayBounds(ymd, IST);
const addDaysIst = (ymd, deltaDays) => cd.addDaysYmd(ymd, deltaDays, IST);
const SQL_PUNCH_IST_DATE = cd.sqlPunchLocalDate(IST);
const parseDeviceIstDateTime = (timeStr) => cd.parseDeviceDateTime(timeStr, IST);
const formatIstAdmsStamp = (date) => cd.formatAdmsStamp(date, IST);
const istMinutesFromMidnight = (d) => cd.minutesFromMidnight(d, IST);

module.exports = {
  IST,
  istYmdFromDate,
  istYmdParts,
  todayIstYmd,
  pgDateToYmd,
  istDayBounds,
  addDaysIst,
  parseDeviceIstDateTime,
  formatIstAdmsStamp,
  istMinutesFromMidnight,
  SQL_PUNCH_IST_DATE,
};
