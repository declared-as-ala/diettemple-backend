import nodemailer from 'nodemailer';
import twilio from 'twilio';

const generateOTP = (): string => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Lazy initialization of Twilio client - only create if valid credentials exist
const getTwilioClient = (): twilio.Twilio | null => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  // Only initialize if both are present and Account SID is valid format
  if (accountSid && authToken && accountSid.startsWith('AC')) {
    try {
      return twilio(accountSid, authToken);
    } catch (error) {
      console.warn('⚠️  Twilio initialization failed:', error);
      return null;
    }
  }
  
  return null;
};

export const sendEmailOTP = async (email: string, otp: string): Promise<void> => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`[DEV] OTP for ${email}: ${otp}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Code de vérification DietTemple',
      html: `
        <h2>Code de vérification</h2>
        <p>Votre code de vérification est: <strong>${otp}</strong></p>
        <p>Ce code est valide pendant 10 minutes.</p>
      `,
    });
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send OTP email');
  }
};

export const sendSMSOTP = async (phone: string, otp: string): Promise<void> => {
  const twilioClient = getTwilioClient();
  
  if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
    console.log(`[DEV] OTP for ${phone}: ${otp}`);
    return;
  }

  try {
    await twilioClient.messages.create({
      body: `Votre code de vérification DietTemple est: ${otp}. Valide pendant 10 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw new Error('Failed to send OTP SMS');
  }
};

export { generateOTP };

