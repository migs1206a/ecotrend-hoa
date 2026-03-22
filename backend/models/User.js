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
    enum: ['Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister',
           'Grandfather', 'Grandmother', 'Grandson', 'Granddaughter',
           'Uncle', 'Aunt', 'Nephew', 'Niece', 'Cousin', 'Other'],
    trim: true
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
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  },
  isApproved: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});



module.exports = mongoose.model('User', UserSchema);