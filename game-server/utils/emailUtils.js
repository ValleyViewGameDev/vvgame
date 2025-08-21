import nodemailer from 'nodemailer';

export async function sendNewUserEmail(player) {
  // Debug logging
  console.log('📧 Email configuration:');
  console.log('  ALERT_EMAIL_USERNAME:', process.env.ALERT_EMAIL_USERNAME);
  console.log('  ALERT_EMAIL_RECEIVER:', process.env.ALERT_EMAIL_RECEIVER);
  
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.ALERT_EMAIL_USERNAME,     // Your Gmail
      pass: process.env.ALERT_EMAIL_PASSWORD      // App password
    },
  });

  const mailOptions = {
    from: `"Valley View Notifier" <${process.env.ALERT_EMAIL_USERNAME}>`,
    to: process.env.ALERT_EMAIL_RECEIVER,         // Also your Gmail
    subject: '😀 New Valley View Account Registered',
    text: `Username: ${player.username}\nID: ${player._id}\nCreated: ${new Date(player.created).toLocaleString()}`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('📬 New user alert email sent.');
  } catch (error) {
    console.error('❌ Error sending alert email:', error);
  }
}
