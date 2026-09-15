const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Staff = require('../models/Staff');

const authCombined = async (req, res, next) => {
  try {
    // Header first; body token supports sendBeacon check-out on tab close (no custom headers).
    const token =
      req.header('Authorization')?.replace('Bearer ', '') ||
      (req.body && (req.body.accessToken || req.body.token)) ||
      '';
    if (!token) throw new Error('No token provided');

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    
    // Try Admin first
    if (!decoded.aud || decoded.aud === 'admin') {
      const user = await User.findById(decoded.id);
      if (user) {
        req.user = user;
        req.userType = 'admin';
        return next();
      }
    }

    // Try Staff
    if (decoded.aud === 'staff') {
      const staff = await Staff.findById(decoded.id).populate('user', 'companyName companyLogo');
      if (staff && staff.isPortalEnabled) {
        req.staff = staff;
        req.userType = 'staff';
        // For compatibility with routes expecting req.user._id
        req.user = staff.user; 
        return next();
      }
    }

    throw new Error('User not found or access denied');
  } catch (err) {
    res.status(401).json({ success: false, message: 'Please authenticate' });
  }
};

module.exports = { authCombined };
