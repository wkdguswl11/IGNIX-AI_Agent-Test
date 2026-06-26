const express = require("express");
const router = express.Router();

const conn = require("../config/db");


router.get("/danger/latest", (req, res) => {
  const sql = `
    SELECT
      a.alert_id,
      a.bin_id,
      b.bin_loc,
      a.alert_msg,
      a.alerted_at
    FROM t_alert a
    LEFT JOIN t_trashbin b
      ON a.bin_id = b.bin_id
    WHERE a.alert_type = 'danger'
      AND COALESCE(a.is_received, 'N') <> 'Y'
    ORDER BY a.alerted_at DESC
    LIMIT 1
  `;

  conn.query(sql, (err, rows) => {
    if (err) {
      console.error("위험 알림 조회 실패:", err);
      return res.status(500).json({ hasDanger: false, message: "위험 알림 조회 실패" });
    }

    if (!rows.length) return res.json({ hasDanger: false });

    const alert = rows[0];
    res.json({
      hasDanger: true,
      alert_id: alert.alert_id,
      bin_id: alert.bin_id,
      location: alert.bin_loc,
      alert_msg: alert.alert_msg,
      alerted_at: alert.alerted_at,
    });
  });
});

router.get("/list", (req, res) => {
  const sql = `
    SELECT
      a.alert_id,
      a.bin_id,
      a.alert_type,
      a.alert_msg,
      a.alerted_at,
      COALESCE(a.is_received, 'N') AS is_received,
      b.bin_loc,
      b.installed_at
    FROM t_alert a
    LEFT JOIN t_trashbin b
      ON a.bin_id = b.bin_id
    ORDER BY
      CASE a.alert_type
        WHEN 'danger' THEN 1
        WHEN 'warning' THEN 2
        ELSE 3
      END,
      a.alerted_at DESC
    LIMIT 20
  `;

  conn.query(sql, (err, rows) => {
    if (err) {
      console.error("알림 목록 조회 실패:", err);
      return res.status(500).json({ message: "알림 목록 조회 실패" });
    }

    res.json(rows);
  });
});

router.post("/read-all", (req, res) => {
  conn.query("UPDATE t_alert SET is_received = 'Y', received_at = NOW() WHERE COALESCE(is_received, 'N') <> 'Y'", (err, result) => {
    if (err) {
      console.error("알림 읽음 처리 실패:", err);
      return res.status(500).json({ message: "알림 읽음 처리 실패" });
    }

    res.json({
      message: "\uBAA8\uB4E0 \uC54C\uB9BC\uC744 \uC77D\uC74C \uCC98\uB9AC\uD588\uC2B5\uB2C8\uB2E4.",
      changedRows: result.changedRows || 0,
    });
  });
});

module.exports = router;

