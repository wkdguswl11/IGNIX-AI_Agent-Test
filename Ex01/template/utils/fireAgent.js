const DEFAULT_THRESHOLDS = Object.freeze({
  dangerTemp: 80,
  warningTemp: 55,
  dangerSmoke: 300,
  warningSmoke: 100,
  flameChannelsWarning: 1,
  flameChannelsDanger: 2,
});

const DEFAULT_WEIGHTS = Object.freeze({
  smoke: 0.32,
  temperature: 0.28,
  flame: 0.4,
});

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function ramp(value, warning, danger) {
  if (danger <= warning) return value >= danger ? 1 : 0;
  return clamp01((value - warning) / (danger - warning));
}

function toNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeFlames(input) {
  if (Array.isArray(input)) return input.map((value) => Number(value));
  if (input === undefined || input === null || input === "") return [];
  return [Number(input)];
}

function countActiveFlames(input, activeValue = 1) {
  return normalizeFlames(input).filter((value) => value === Number(activeValue)).length;
}

function classifyFireRisk(sensorInput, thresholdInput = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...thresholdInput };
  const smoke = toNumber(sensorInput.smoke ?? sensorInput.mq2 ?? sensorInput.gas);
  const temperature = toNumber(sensorInput.temperature ?? sensorInput.temp_c ?? sensorInput.tempC);
  const flameCount = Number.isFinite(Number(sensorInput.flameCount))
    ? Number(sensorInput.flameCount)
    : countActiveFlames(
        sensorInput.flames ?? sensorInput.flame,
        sensorInput.flameActiveValue ?? 1
      );

  const smokeScore = ramp(smoke, thresholds.warningSmoke, thresholds.dangerSmoke);
  const tempScore = ramp(temperature, thresholds.warningTemp, thresholds.dangerTemp);
  const flameScore = ramp(flameCount, thresholds.flameChannelsWarning, thresholds.flameChannelsDanger);
  const score = (
    smokeScore * DEFAULT_WEIGHTS.smoke
    + tempScore * DEFAULT_WEIGHTS.temperature
    + flameScore * DEFAULT_WEIGHTS.flame
  );

  const reasons = [];
  if (smoke >= thresholds.warningSmoke) reasons.push("smoke_high");
  if (temperature >= thresholds.warningTemp) reasons.push("temperature_high");
  if (flameCount >= thresholds.flameChannelsWarning) reasons.push("flame_detected");

  let alertType = "normal";
  if (score >= 0.35 || reasons.length > 0) alertType = "warning";
  if (score >= 0.7) alertType = "danger";
  if (smoke >= thresholds.dangerSmoke || temperature >= thresholds.dangerTemp) alertType = "danger";
  if (flameCount >= thresholds.flameChannelsDanger) alertType = "danger";
  if (flameCount >= 1 && (smoke >= thresholds.warningSmoke || temperature >= thresholds.warningTemp)) {
    alertType = "danger";
  }

  const labelKo = alertType === "danger" ? "위험" : alertType === "warning" ? "주의" : "정상";
  const alertMsg = `AI ${labelKo} 판단 - 온도 ${temperature.toFixed(1)} / 연기 감지값 ${Math.round(smoke)} / 불꽃 감지 ${flameCount}`;

  return {
    alertType,
    state: alertType.toUpperCase(),
    score: Number(score.toFixed(3)),
    reasons,
    alertMsg,
    sensor: {
      smoke,
      temperature,
      flameCount,
    },
    thresholds,
  };
}

module.exports = {
  DEFAULT_THRESHOLDS,
  classifyFireRisk,
};
