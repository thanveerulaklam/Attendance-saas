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

module.exports = router;
