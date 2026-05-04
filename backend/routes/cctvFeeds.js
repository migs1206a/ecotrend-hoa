const express = require('express');
const auth = require('../middleware/auth');
const { requireAccess, requireOfficerModule } = require('../middleware/accessControl');
const {
  getCCTVFeeds,
  createCCTVFeed,
  updateCCTVFeed,
  deleteCCTVFeed
} = require('../controllers/cctvFeedController');

const router = express.Router();

router.use(auth);

router.get(
  '/',
  requireAccess({
    roles: ['ADMIN', 'MASTER_ADMIN', 'GUARD'],
    modules: ['cctv'],
    message: 'CCTV access required'
  }),
  getCCTVFeeds
);

router.post('/', requireOfficerModule('cctv'), createCCTVFeed);
router.put('/:id', requireOfficerModule('cctv'), updateCCTVFeed);
router.delete('/:id', requireOfficerModule('cctv'), deleteCCTVFeed);

module.exports = router;
