const express = require('express');
const mysql = require('mysql2/promise');
const client = require('prom-client');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Thu thap metrics cho Prometheus (Container, Web Server & Database)
client.collectDefaultMetrics();
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Tong so luot request HTTP vao Web Server',
  labelNames: ['method', 'route', 'status']
});

const dbUpGauge = new client.Gauge({
  name: 'mysql_db_up',
  help: 'Trang thai ket noi MySQL Database (1 = UP, 0 = DOWN)'
});

const totalCheckinsGauge = new client.Gauge({
  name: 'mysql_checkins_records_total',
  help: 'Tong so luot diem danh luu trong MySQL Database'
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'db',
  user: process.env.DB_USER || 'att_user',
  password: process.env.DB_PASSWORD || 'StrongP@ssw0rd2026',
  database: process.env.DB_NAME || 'attendance_db',
  timezone: '+07:00',
  waitForConnections: true,
  connectionLimit: 10
});

// Vong lap khoi tao va kiem tra ket noi MySQL
async function initDB() {
  let connected = false;
  while (!connected) {
    try {
      const conn = await pool.getConnection();
      await conn.query(`
        CREATE TABLE IF NOT EXISTS checkins (
          id INT AUTO_INCREMENT PRIMARY KEY,
          student_id VARCHAR(50) NOT NULL,
          student_name VARCHAR(100) NOT NULL,
          checkin_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      conn.release();
      connected = true;
      dbUpGauge.set(1);
      console.log('Ket noi MySQL va kiem tra bang checkins thanh cong!');
    } catch (err) {
      dbUpGauge.set(0);
      console.log('Dang doi MySQL khoi dong... thu lai sau 3 giay');
      await new Promise(res => setTimeout(res, 3000));
    }
  }
}
initDB();

// Giao dien nguoi dung hien dai, toi gian
app.get('/', async (req, res) => {
  httpRequestCounter.inc({ method: 'GET', route: '/', status: 200 });
  try {
    const [rows] = await pool.query('SELECT * FROM checkins ORDER BY checkin_time DESC LIMIT 10');
    
    let tableRows = rows.map(r => {
      // Dinh dang ngay gio theo mui gio Viet Nam (UTC+7: Asia/Ho_Chi_Minh)
      const date = new Date(r.checkin_time).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour12: false
      });
      return `
        <tr>
          <td><span class="badge">${escapeHtml(r.student_id)}</span></td>
          <td style="font-weight: 500; color: #1e293b;">${escapeHtml(r.student_name)}</td>
          <td style="color: #64748b;">${escapeHtml(date)}</td>
        </tr>
      `;
    }).join('');

    if (rows.length === 0) {
      tableRows = `<tr><td colspan="3" style="text-align:center; color:#94a3b8; padding: 24px;">Chua co luot diem danh nao hom nay</td></tr>`;
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Hệ Thống Điểm Danh Sinh Viên</title>
        <style>
          :root {
            --primary: #2563eb;
            --primary-hover: #1d4ed8;
            --bg: #f8fafc;
            --card-bg: #ffffff;
            --text-main: #0f172a;
            --border: #e2e8f0;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          body { background-color: var(--bg); color: var(--text-main); display: flex; justify-content: center; padding: 40px 16px; min-height: 100vh; }
          .container { width: 100%; max-width: 680px; display: flex; flex-direction: column; gap: 24px; }
          
          /* Header */
          .header { text-align: center; }
          .header h1 { font-size: 1.6rem; font-weight: 700; color: #0f172a; letter-spacing: -0.5px; }
          .header p { color: #64748b; font-size: 0.9rem; margin-top: 4px; }

          /* Card hop thoai */
          .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .card-title { font-size: 1.1rem; font-weight: 600; margin-bottom: 16px; color: #1e293b; display: flex; align-items: center; gap: 8px; }

          /* Form nhap */
          .form-group { display: flex; flex-direction: column; gap: 12px; }
          .input-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          @media (max-width: 500px) { .input-row { grid-template-columns: 1fr; } }
          
          input[type="text"] {
            width: 100%; padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.95rem; outline: none; transition: 0.2s;
          }
          input[type="text"]:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15); }

          button {
            background-color: var(--primary); color: white; border: none; padding: 11px 16px; border-radius: 8px; font-size: 0.95rem; font-weight: 500; cursor: pointer; transition: 0.2s;
          }
          button:hover { background-color: var(--primary-hover); }

          /* Table */
          .table-wrapper { overflow-x: auto; margin-top: 8px; }
          table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem; }
          th { padding: 12px 14px; background: #f1f5f9; color: #475569; font-weight: 600; border-bottom: 1px solid var(--border); }
          td { padding: 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }
          tr:last-child td { border-bottom: none; }
          
          .badge {
            background: #e0e7ff; color: #3730a3; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; font-family: monospace;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Hệ Thống Điểm Danh Sinh Viên</h1>
            <p>Phần mềm quản lý ca học & lịch sử điểm danh</p>
          </div>

          <!-- Form diem danh -->
          <div class="card">
            <div class="card-title">Check-in Trực Tuyến</div>
            <form action="/checkin" method="POST" class="form-group">
              <div class="input-row">
                <input type="text" name="student_id" placeholder="Mã sinh viên / NV" required autocomplete="off"/>
                <input type="text" name="student_name" placeholder="Họ và tên" required autocomplete="off"/>
              </div>
              <button type="submit">Xác nhận điểm danh</button>
            </form>
          </div>

          <!-- Bang lich su -->
          <div class="card">
            <div class="card-title">Lịch Sử Gần Đây (10 lượt mới nhất)</div>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Mã SV</th>
                    <th>Họ và Tên</th>
                    <th>Thời Gian Điểm Danh</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send('Cơ sở dữ liệu đang đồng bộ, vui lòng tải lại trang sau giây lát...');
  }
});

app.post('/checkin', async (req, res) => {
  const { student_id, student_name } = req.body;
  if (student_id && student_name) {
    await pool.query('INSERT INTO checkins (student_id, student_name) VALUES (?, ?)', [student_id.trim(), student_name.trim()]);
    httpRequestCounter.inc({ method: 'POST', route: '/checkin', status: 200 });
    console.log(`[CHECKIN] SV: ${student_id} - ${student_name}`);
  }
  res.redirect('/');
});

app.get('/metrics', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS total FROM checkins');
    dbUpGauge.set(1);
    totalCheckinsGauge.set(rows[0].total || 0);
  } catch (err) {
    dbUpGauge.set(0);
  }
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(3000, () => console.log('Attendance App running on port 3000'));
