const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({

   resetPasswordToken: {
    type: String,
    default: undefined
  },
  resetPasswordExpires: {
    type: Date,
    default: undefined
  },
  
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  familyName: {
    type: String,
    required: [true, 'Family name is required'],
    trim: true
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required']
  },
  houseAddress: {
    type: String,
    required: [true, 'House address is required'],
    trim: true
  },
  addressKey: {
    type: String,
    trim: true,
    index: true
  },
  propertyType: {
    type: String,
    enum: ['house', 'apartment'],
    default: 'house'
  },
  occupancyType: {
    type: String,
    enum: ['permanent', 'renter'],
    default: 'permanent'
  },
  block: {
    type: String,
    trim: true,
    default: ''
  },
  lot: {
    type: String,
    trim: true,
    default: ''
  },
  phase: {
    type: String,
    trim: true,
    default: ''
  },
  buildingName: {
    type: String,
    trim: true,
    default: ''
  },
  unitNumber: {
    type: String,
    trim: true,
    default: ''
  },
  street: {
    type: String,
    required: [true, 'Street is required'],
    trim: true
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  familyMembers: [{
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  middleName: {
    type: String,
    required: true,
    trim: true
  },
  relationship: {
    type: String,
    required: true,
    enum: ['Primary Contact', 'Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister',
           'Grandfather', 'Grandmother', 'Grandson', 'Granddaughter',
           'Uncle', 'Aunt', 'Nephew', 'Niece', 'Cousin', 'Other'],
    trim: true
  },
  isPrimaryContact: {
    type: Boolean,
    default: false
  }
}],
  vehicles: [{
    plateNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    vehicleType: {
      type: String,
      required: true,
      enum: ['Car', 'SUV', 'Van', 'Motorcycle', 'Truck', 'Bike'],
      trim: true
    },
    brand: {
      type: String,
      required: true,
      trim: true
    },
    model: {
      type: String,
      required: true,
      trim: true
    },
    color: {
      type: String,
      required: true,
      trim: true
    },
    photo: {
      filename: { type: String },
      originalName: { type: String },
      mimetype: { type: String },
      size: { type: Number },
      path: { type: String },
      storage: { type: String, enum: ['local', 'cloudinary'] },
      publicId: { type: String },
      resourceType: { type: String },
      uploadedAt: { type: Date, default: Date.now }
    },
    registeredDate: {
      type: Date,
      default: Date.now
    },
    deletedAt: {        
      type: Date,
      default: null
    }
  }],
  identificationDocument: {
    filename: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    mimetype: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    path: {
      type: String,
      required: true
    },
    storage: {
      type: String,
      enum: ['local', 'cloudinary'],
      default: 'local'
    },
    publicId: {
      type: String
    },
    resourceType: {
      type: String
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  occupancyStartDate: {
    type: Date,
    default: null
  },
  occupancyEndDate: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null
  },
  renewalStatus: {
    type: String,
    enum: ['not_applicable', 'none', 'pending', 'approved', 'rejected'],
    default: 'not_applicable'
  },
  renewalRequestedAt: {
    type: Date,
    default: null
  },
  requestedOccupancyEndDate: {
    type: Date,
    default: null
  },
  renewalRequestNote: {
    type: String,
    trim: true,
    default: ''
  },
  renewalReviewedAt: {
    type: Date,
    default: null
  },
  renewalDecisionNote: {
    type: String,
    trim: true,
    default: ''
  },
  lastRenewedAt: {
    type: Date,
    default: null
  },
  isDummyResident: {
    type: Boolean,
    default: false,
    index: true
  },
  seedBatch: {
    type: String,
    trim: true,
    default: '',
    index: true
  }
}, {
  timestamps: true
});



module.exports = mongoose.model('User', UserSchema);
