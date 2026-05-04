const express = require('express');
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const { requireOfficerModule } = require('../middleware/accessControl');
const { IMAGE_UPLOAD_MAX_BYTES } = require('../utils/uploadLimits');
const {
  getContactHoaSettings,
  updateContactHoaImage,
  deleteContactHoaImage,
  updateContactHoaContacts
} = require('../controllers/contactHoaController');

const router = express.Router();

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_UPLOAD_MAX_BYTES },
  fileFilter(req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }

    cb(new Error('Only image files (JPEG, PNG, GIF) are allowed'));
  }
});

router.use(auth);

router.get('/', getContactHoaSettings);
router.put('/image', requireOfficerModule('contact_hoa'), imageUpload.single('hierarchyImage'), updateContactHoaImage);
router.delete('/image', requireOfficerModule('contact_hoa'), deleteContactHoaImage);
router.put('/contacts', requireOfficerModule('contact_hoa'), updateContactHoaContacts);

module.exports = router;
