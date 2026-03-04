/**
 * Ticket confirmation email template.
 * Pure function — returns a complete HTML document string
 * compatible with Gmail, Outlook, and Apple Mail (table-based, inline styles).
 *
 * @param qrCodeDataUrl - base64 data URL produced by the qrcode library (e.g. "data:image/png;base64,...")
 */
export function ticketEmailTemplate(
  name: string,
  eventTitle: string,
  eventDate: string,
  venueName: string,
  seatInfo: string,
  ticketType: string,
  qrCodeDataUrl: string,
): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Your ticket for ${eventTitle}</title>
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
          <!-- Event banner block -->
          <tr>
            <td style="padding:28px 40px 0 40px;">
              <h1 style="margin:0 0 6px 0;font-size:24px;font-weight:700;color:#4F46E5;
                          line-height:1.3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                ${eventTitle}
              </h1>
              <p style="margin:0 0 4px 0;font-size:14px;color:#6B7280;
                          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                📅 ${eventDate}
              </p>
              <p style="margin:0 0 16px 0;font-size:14px;color:#6B7280;
                          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                📍 ${venueName}
              </p>
              <!-- Ticket type badge -->
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px;">
                <tr>
                  <td style="background-color:#EEF2FF;border-radius:9999px;padding:4px 14px;">
                    <p style="margin:0;font-size:13px;font-weight:600;color:#4F46E5;
                                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                      ${ticketType}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Greeting -->
          <tr>
            <td style="padding:0 40px 16px 40px;">
              <p style="margin:0;font-size:15px;color:#374151;
                          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                Hi ${name}, your ticket is confirmed! Present the QR code below at the venue entrance.
              </p>
            </td>
          </tr>
          <!-- QR code -->
          <tr>
            <td align="center" style="padding:0 40px 8px 40px;">
              <img src="${qrCodeDataUrl}"
                   alt="Ticket QR Code"
                   width="250"
                   height="250"
                   style="display:block;width:250px;height:250px;
                          border:1px solid #E5E7EB;border-radius:12px;" />
            </td>
          </tr>
          <!-- Seat info -->
          <tr>
            <td align="center" style="padding:12px 40px 32px 40px;">
              <p style="margin:0;font-size:14px;font-weight:600;color:#374151;
                          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                Seat: ${seatInfo}
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #F3F4F6;background-color:#F9FAFB;">
              <p style="margin:0 0 4px 0;font-size:12px;color:#9CA3AF;
                          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                Need help? Contact us at support@eventflow.app
              </p>
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
