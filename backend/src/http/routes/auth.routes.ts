import { Router } from 'express';
import {
  changePassword,
  forgotPassword,
  getCurrentUser,
  login,
  logout,
  register,
  resendVerification,
  resetPassword,
  verifyEmail,
} from '../controllers/auth.controller.js';
import {
  finishGoogleSignIn,
  getProviders,
  startGoogleSignIn,
} from '../controllers/google.controller.js';
import { limitByEmail, limitByIp } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

router.post('/register', limitByIp(), register);
router.post('/verify-email', limitByIp(), verifyEmail);
router.post('/resend-verification', limitByIp(), limitByEmail(), resendVerification);
router.post('/login', limitByIp(), limitByEmail(), login);
router.post('/logout', requireAuth, logout);
router.post('/forgot-password', limitByIp(), limitByEmail(), forgotPassword);
router.post('/reset-password', limitByIp(), resetPassword);
router.post('/change-password', requireAuth, limitByIp(), changePassword);
router.get('/me', requireAuth, getCurrentUser);

// Sign-in with Google: the browser navigates to /start and Google sends it back to /callback
router.get('/providers', getProviders);
router.get('/google/start', limitByIp(), startGoogleSignIn);
router.get('/google/callback', limitByIp(), finishGoogleSignIn);

export default router;
