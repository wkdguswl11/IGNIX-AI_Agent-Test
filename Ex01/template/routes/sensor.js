const express = require("express");
const conn = require("../config/db");
const { DEFAULT_THRESHOLDS, classifyFireRisk } = require("../utils/fireAgent");

const router = express.Router();

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    conn.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function getThresholds() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS t_fire_threshold (
        id INT NOT NULL PRIMARY KEY,
        danger_temp DECIMAL(5,1) NOT NULL,
        warning_temp DECIMAL(5,1) NOT NULL,
        danger_smoke INT NOT NULL,
        warning_smoke INT NOT NULL,
        updated_by INT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await query(
      `INSERT IGNORE INTO t_fire_threshold
        (id, danger_temp, warning_temp, danger_smoke, warning_smoke)
       VALUES (1, ?, ?, ?, ?)`,
      [DEFAULT_THRESHOLDS.dangerTemp, DEFAULT_THRESHOLDS.warningTemp, DEFAULT_THRESHOLDS.dangerSmoke, DEFAULT_THRESHOLDS.warningSmoke]
    );

    const rows = await query("SELECT * FROM t_fire_threshold WHERE id = 1");
    if (!rows.length) return DEFAULT_THRESHOLDS;

    return {
      dangerTemp: Number(rows[0].danger_temp),
      warningTemp: Number(rows[0].warning_temp),
      dangerSmoke: Number(rows[0].danger_smoke),
      warningSmoke: Number(rows[0].warning_smoke),
      flameChannelsWarning: DEFAULT_THRESHOLDS.flameChannelsWarning,
      flameChannelsDanger: DEFAULT_THRESHOLDS.flameChannelsDanger,
    };
  } catch (err) {
    console.error("AI 판정 임계값 조회 실패, 기본값 사용:", err);
    return DEFAULT_THRESHOLDS;
  }
}

async function ensureAlertTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS t_alert (
      alert_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      bin_id INT NOT NULL,
      alert_type VARCHAR(20) NOT NULL,
      alert_msg VARCHAR(255) NOT NULL,
      alerted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_received CHAR(1) NOT NULL DEFAULT 'N',
      received_at DATETIME NULL
    )
  `);

  const alters = [
    "ALTER TABLE t_alert ADD COLUMN alert_type VARCHAR(20) NOT NULL DEFAULT 'warning'",
    "ALTER TABLE t_alert ADD COLUMN alert_msg VARCHAR(255) NOT NULL DEFAULT ''",
    "ALTER TABLE t_alert ADD COLUMN alerted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    "ALTER TABLE t_alert ADD COLUMN is_received CHAR(1) NOT NULL DEFAULT 'N'",
    "ALTER TABLE t_alert ADD COLUMN received_at DATETIME NULL",
  ];

  for (const sql of alters) {
    try {
      await query(sql);
    } catch (err) {
      if (err.code !== "ER_DUP_FIELDNAME") throw err;
    }
  }
}

async function saveAlert(binId, result) {
  if (result.alertType === "normal") return null;

  try {
    await ensureAlertTable();
    const insert = await query(
      `INSERT INTO t_alert (bin_id, alert_type, alert_msg, alerted_at, is_received)
       VALUES (?, ?, ?, NOW(), 'N')`,
      [binId, result.alertType, result.alertMsg]
    );
    return insert.insertId || null;
  } catch (err) {
    console.error("AI 판정 알림 저장 실패:", err);
    return null;
  }
}

router.post("/fire", async (req, res) => {
  const binId = Number(req.body.bin_id ?? req.body.binId);
  if (!Number.isFinite(binId) || binId <= 0) {
    return res.status(400).json({ success: false, message: "bin_id가 필요합니다." });
  }

  const thresholds = await getThresholds();
  const result = classifyFireRisk(req.body, thresholds);
  const alertId = await saveAlert(binId, result);

  res.json({
    success: true,
    bin_id: binId,
    alert_id: alertId,
    alert_type: result.alertType,
    state: result.state,
    score: result.score,
    reasons: result.reasons,
    alert_msg: result.alertMsg,
    sensor: result.sensor,
    thresholds: result.thresholds,
  });
});

router.post("/judge", (req, res) => {
  const result = classifyFireRisk(req.body, {
    dangerTemp: Number(req.body.dangerTemp ?? DEFAULT_THRESHOLDS.dangerTemp),
    warningTemp: Number(req.body.warningTemp ?? DEFAULT_THRESHOLDS.warningTemp),
    dangerSmoke: Number(req.body.dangerSmoke ?? DEFAULT_THRESHOLDS.dangerSmoke),
    warningSmoke: Number(req.body.warningSmoke ?? DEFAULT_THRESHOLDS.warningSmoke),
  });

  res.json({
    success: true,
    alert_type: result.alertType,
    state: result.state,
    score: result.score,
    reasons: result.reasons,
    alert_msg: result.alertMsg,
    sensor: result.sensor,
  });
});

module.exports = router;
