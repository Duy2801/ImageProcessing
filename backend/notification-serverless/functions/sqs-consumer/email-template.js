/**
 * Generates a premium HTML email template for Image Pipeline notifications
 */
function getEmailHtml(eventType, eventData) {
  const { jobId, imageId, metadata = {} } = eventData;
  const isSuccess = eventType === 'image.completed';
  const statusTitle = isSuccess ? 'Xử Lý Ảnh Thành Công' : 'Xử Lý Ảnh Thất Bại';
  const statusColor = isSuccess ? '#10B981' : '#EF4444'; // Green or Red
  const statusBg = isSuccess ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';

  // Format bytes helper
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return 'N/A';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  const finalSize = metadata.size ? formatBytes(metadata.size) : 'N/A';
  const dimensions = metadata.width && metadata.height ? `${metadata.width} x ${metadata.height} px` : 'N/A';
  const outputFormat = metadata.format ? metadata.format.toUpperCase() : 'N/A';

  // Find original image size if present in logs
  let originalSize = 'N/A';
  let compressionRatio = '';
  if (metadata.logs && metadata.logs.length > 0) {
    const inputStage = metadata.logs.find(l => l.stage === 'InputStage');
    // If we have size in metadata of input stages, but let's look at logs message:
    // "Pipeline initialized for S3 Key: inputs/filename.jpg"
  }

  // Generate logs HTML rows
  let logsHtml = '';
  if (metadata.logs && Array.isArray(metadata.logs)) {
    logsHtml = metadata.logs
      .map(
        (log) => `
      <div style="padding: 10px 15px; border-left: 2px solid ${
        log.status === 'completed' ? '#10B981' : '#3B82F6'
      }; background: #F8FAFC; margin-bottom: 8px; border-radius: 0 8px 8px 0;">
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #64748B; font-weight: bold; margin-bottom: 2px;">
          <span>${log.stage.toUpperCase()}</span>
          <span>${new Date(log.timestamp).toLocaleTimeString()}</span>
        </div>
        <div style="font-size: 13px; color: #1E293B;">${log.message}</div>
        ${log.duration ? `<div style="font-size: 11px; color: #94A3B8; margin-top: 2px;">Thời gian xử lý: ${log.duration}ms</div>` : ''}
      </div>`
      )
      .join('');
  }

  const ctaButton = isSuccess
    ? `
    <div style="text-align: center; margin: 30px 0;">
      <a href="http://localhost:3000" target="_blank" style="background: linear-gradient(135deg, #4F46E5 0%, #3B82F6 100%); color: #ffffff; padding: 12px 30px; text-decoration: none; font-weight: bold; border-radius: 50px; font-size: 14px; box-shadow: 0 4px 10px rgba(59, 130, 246, 0.3); display: inline-block;">
        Xem Kết Quả Trên Giao Diện
      </a>
    </div>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${statusTitle}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #F1F5F9;
      color: #1E293B;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
  </style>
</head>
<body style="background-color: #F1F5F9; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);">
    
    <!-- Top Glow Ribbon -->
    <div style="height: 6px; background: linear-gradient(90deg, #4F46E5 0%, #3B82F6 50%, #10B981 100%);"></div>
    
    <!-- Main Content Wrapper -->
    <div style="padding: 40px 30px;">
      
      <!-- Brand Header -->
      <div style="text-align: center; margin-bottom: 25px;">
        <span style="font-weight: 900; font-size: 24px; letter-spacing: -1px; color: #4F46E5;">PIPELINE STUDIO</span>
      </div>

      <!-- Status Banner -->
      <div style="background-color: ${statusBg}; border: 1px solid ${statusColor}40; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 30px;">
        <div style="color: ${statusColor}; font-weight: 800; font-size: 18px; text-transform: uppercase; letter-spacing: 0.5px;">
          ${statusTitle}
        </div>
        <div style="font-size: 13px; color: #64748B; margin-top: 5px;">
          Job ID: <span style="font-family: monospace; font-weight: bold;">${jobId}</span>
        </div>
      </div>

      ${isSuccess ? `
      <!-- Processing Stats Grid -->
      <div style="margin-bottom: 30px;">
        <h4 style="font-size: 12px; color: #64748B; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px; font-weight: bold; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px;">THÔNG TIN ẢNH ĐẦU RA</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 10px 0; color: #64748B; border-bottom: 1px dashed #E2E8F0;">Định dạng nén</td>
            <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #1E293B; border-bottom: 1px dashed #E2E8F0;">${outputFormat}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #64748B; border-bottom: 1px dashed #E2E8F0;">Kích thước hiển thị</td>
            <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #1E293B; border-bottom: 1px dashed #E2E8F0;">${dimensions}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #64748B; border-bottom: 1px dashed #E2E8F0;">Dung lượng tệp</td>
            <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #10B981; border-bottom: 1px dashed #E2E8F0;">${finalSize}</td>
          </tr>
          ${metadata.s3Key ? `
          <tr>
            <td style="padding: 10px 0; color: #64748B; border-bottom: 1px dashed #E2E8F0;">Đường dẫn S3 Key</td>
            <td style="padding: 10px 0; text-align: right; font-family: monospace; font-size: 11px; color: #4F46E5; border-bottom: 1px dashed #E2E8F0; word-break: break-all;">${metadata.s3Key}</td>
          </tr>
          ` : ''}
        </table>
      </div>
      ` : `
      <!-- Failure Details -->
      <div style="background-color: #FFF5F5; border-left: 4px solid #EF4444; padding: 15px; border-radius: 4px; margin-bottom: 30px;">
        <div style="font-weight: bold; color: #EF4444; font-size: 14px;">Lỗi chi tiết:</div>
        <div style="font-size: 13px; color: #B91C1C; margin-top: 5px; font-family: monospace;">${metadata.error || 'N/A'}</div>
        <div style="font-size: 12px; color: #B91C1C; margin-top: 3px;">Giai đoạn thất bại: ${metadata.failedStage || 'N/A'}</div>
      </div>
      `}

      <!-- Timeline Logs -->
      ${logsHtml ? `
      <div>
        <h4 style="font-size: 12px; color: #64748B; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px; font-weight: bold; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px;">LỊCH SỬ KHỞI CHẠY PIPELINE</h4>
        <div style="max-height: 250px; overflow-y: auto;">
          ${logsHtml}
        </div>
      </div>
      ` : ''}

      <!-- Call To Action Button -->
      ${ctaButton}

    </div>

    <!-- Footer -->
    <div style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 20px; text-align: center; font-size: 11px; color: #94A3B8;">
      Đây là email thông báo tự động từ Serverless Image Pipeline Studio.<br>
      © 2026 Pipeline Studio. Visionary Processing. All rights reserved.
    </div>

  </div>
</body>
</html>
  `;
}

module.exports = {
  getEmailHtml,
};
