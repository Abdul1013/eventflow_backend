/**
 * Password reset email template.
 * Pure function — returns a complete HTML document string
 * compatible with Gmail, Outlook, and Apple Mail (table-based, inline styles).
 */
export function passwordResetEmailTemplate(name: string, resetLink: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Reset your EventFlow password</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:#F3F4F6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:480px;width:100%;background-color:#FFFFFF;border-radius:12px;
                      border:1px solid #E5E7EB;overflow:hidden;">
          <!-- Logo header -->
          <tr>
            <td style="padding:32px 40px 0 40px;">
              <p style="margin:0;font-size:26px;font-weight:700;color:#4F46E5;
                         letter-spacing:-0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                EventFlow
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:28px 40px 32px 40px;">
              <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:600;color:#111827;
                          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                Reset your password
              </h1>
              <p style="margin:0 0 4px 0;font-size:15px;color:#374151;
                          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                Hi ${name},
              </p>
              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.6;color:#374151;
                          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                We received a request to reset the password for your EventFlow account.
                Click the button below to choose a new password.
                This link expires in <strong>15 minutes</strong>.
              </p>
              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td>
                    <a href="${resetLink}"
                       style="display:inline-block;background-color:#4F46E5;color:#FFFFFF;
                              padding:14px 32px;border-radius:8px;text-decoration:none;
                              font-weight:600;font-size:15px;
                              font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0 0;font-size:13px;line-height:1.5;color:#9CA3AF;
                          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                If you did not request a password reset, you can safely ignore this email —
                your account password will not be changed.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #F3F4F6;background-color:#F9FAFB;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;
                          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                &copy; ${year} EventFlow. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
