import nodemailer from 'nodemailer';

export async function sendNewUserEmail(player) {
  // Debug logging
  console.log('📧 Email configuration:');
  console.log('  ALERT_EMAIL_USERNAME:', process.env.ALERT_EMAIL_USERNAME);
  console.log('  ALERT_EMAIL_RECEIVER:', process.env.ALERT_EMAIL_RECEIVER);
  
  // family: 4 forces IPv4: Render's outbound network cannot reach Gmail's IPv6 SMTP endpoints
  // reliably (ENETUNREACH). The timeouts stop a stuck socket from hanging with no error line.
  // Same settings as House's utils/emailUtils.js.
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.ALERT_EMAIL_USERNAME,     // the studio Gmail
      pass: process.env.ALERT_EMAIL_PASSWORD      // that account's app password
    },
    family: 4,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  const mailOptions = {
    from: `"Valley View Studio" <${process.env.ALERT_EMAIL_USERNAME}>`,
    to: process.env.ALERT_EMAIL_RECEIVER,         // Also your Gmail
    subject: '👸 New Secrets of Elsinore Account Registered',
    text: `Username: ${player.username}\nID: ${player._id}\nCreated: ${new Date(player.created).toLocaleString()}`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('📬 New user alert email sent.');
  } catch (error) {
    console.error('❌ Error sending alert email:', error);
  }
}
