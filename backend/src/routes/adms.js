const express = require('express');
const {
  admsGetRequest,
  admsCdata,
} = require('../controllers/deviceController');

const router = express.Router();

router.get('/getrequest', admsGetRequest);
router.post('/getrequest', admsGetRequest);
router.get('/cdata', admsCdata);
router.post('/cdata', admsCdata);
// Some eSSL/ZKTeco firmwares use legacy .aspx endpoints.
router.get('/getrequest.aspx', admsGetRequest);
router.post('/getrequest.aspx', admsGetRequest);
router.get('/cdata.aspx', admsCdata);
router.post('/cdata.aspx', admsCdata);

module.exports = router;
