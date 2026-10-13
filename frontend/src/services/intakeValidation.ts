import type {
  NewPatientIntakeData,
  IntakeValidationResult,
  ClinicalVerificationAlert,
  MissingMeasurementNotice,
  TemperatureUnit,
} from '../types/triage.ts';

/**
 * Generates a unique demo patient ID in the standard hospital prototype format.
 */
export function generateDemoPatientId(): string {
  const timestamp = Date.now().toString().slice(-4);
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `DEMO-PT-2026-${timestamp}${randomSuffix.toString().slice(0, 2)}`;
}

/**
 * Formats current local time as HH:mm for default arrival time.
 */
export function getCurrentTimeHHMM(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Returns clean default intake form data.
 */
export function getInitialIntakeData(): NewPatientIntakeData {
  return {
    patient_id: generateDemoPatientId(),
    patient_name: '',
    age: null,
    sex: 'Male',
    arrival_time: getCurrentTimeHHMM(),
    chief_complaint: '',
    complaint_language: 'English',
    known_conditions: [],
    medications: '',
    systolic_bp: null,
    diastolic_bp: null,
    pulse_bpm: null,
    temperature: null,
    temperature_unit: 'F',
    spo2: null,
    notes: '',
  };
}

/**
 * Converts a temperature value to Fahrenheit for standardized clinical threshold checks.
 */
export function toFahrenheit(value: number, unit: TemperatureUnit): number {
  if (unit === 'F') return value;
  return Number(((value * 9) / 5 + 32).toFixed(1));
}

/**
 * Converts a temperature value to Celsius.
 */
export function toCelsius(value: number, unit: TemperatureUnit): number {
  if (unit === 'C') return value;
  return Number((((value - 32) * 5) / 9).toFixed(1));
}

/**
 * Validates the New Patient Intake form against clinical safety boundaries,
 * distinguishing missing data, invalid entries, and critical physiological readings.
 */
export function validateIntakeForm(data: NewPatientIntakeData): IntakeValidationResult {
  const errors: Record<string, string> = {};
  const alerts: ClinicalVerificationAlert[] = [];
  const missingMeasurements: MissingMeasurementNotice[] = [];

  // 1. Patient Identification Validation
  if (!data.patient_id || !data.patient_id.trim()) {
    errors.patient_id = 'Demo Patient ID is required.';
  }

  // 2. Age Validation
  if (data.age === null || data.age === undefined || isNaN(Number(data.age))) {
    errors.age = 'Patient age is required.';
  } else {
    const numAge = Number(data.age);
    if (numAge < 0 || numAge > 130) {
      errors.age = 'Age must be between 0 and 130 years.';
    } else if (!Number.isInteger(numAge)) {
      errors.age = 'Age must be a whole number (use 0 for infants under 1 year).';
    }
  }

  // 3. Sex Validation (matching dataset schema)
  const validSexes = ['Male', 'Female', 'Other', 'Unspecified'];
  if (!data.sex || !validSexes.includes(data.sex)) {
    errors.sex = 'Please select a valid sex option (Male, Female, Other, Unspecified).';
  }

  // 4. Arrival Time Validation
  if (!data.arrival_time || !data.arrival_time.trim()) {
    errors.arrival_time = 'Arrival time is required.';
  }

  // 5. Symptoms & Complaint Validation (preserving verbatim patient words)
  if (!data.chief_complaint || !data.chief_complaint.trim()) {
    errors.chief_complaint = "Chief complaint in the patient's own words is required.";
  } else if (data.chief_complaint.trim().length < 3) {
    errors.chief_complaint = 'Please enter at least 3 characters describing the presenting complaint.';
  }

  if (!data.complaint_language || !data.complaint_language.trim()) {
    errors.complaint_language = 'Complaint language must be selected.';
  }

  // 6. Blood Pressure Validation
  const hasSystolic = data.systolic_bp !== null && data.systolic_bp !== undefined && !isNaN(Number(data.systolic_bp));
  const hasDiastolic = data.diastolic_bp !== null && data.diastolic_bp !== undefined && !isNaN(Number(data.diastolic_bp));

  if (!hasSystolic && !hasDiastolic) {
    missingMeasurements.push({
      field: 'blood_pressure',
      label: 'Blood Pressure (Systolic / Diastolic)',
      explanation: 'Not measured at intake. Will NOT be silently converted to 120/80 mmHg.',
    });
  } else {
    if (hasSystolic) {
      const s = Number(data.systolic_bp);
      if (s < 40 || s > 300) {
        errors.systolic_bp = 'Systolic BP must be between 40 and 300 mmHg.';
      }
    } else {
      errors.systolic_bp = 'Systolic BP is required when Diastolic BP is recorded.';
    }

    if (hasDiastolic) {
      const d = Number(data.diastolic_bp);
      if (d < 20 || d > 200) {
        errors.diastolic_bp = 'Diastolic BP must be between 20 and 200 mmHg.';
      }
    } else {
      errors.diastolic_bp = 'Diastolic BP is required when Systolic BP is recorded.';
    }

    if (hasSystolic && hasDiastolic && !errors.systolic_bp && !errors.diastolic_bp) {
      const s = Number(data.systolic_bp);
      const d = Number(data.diastolic_bp);
      if (s <= d) {
        errors.systolic_bp = 'Systolic BP must be strictly greater than Diastolic BP.';
      } else {
        if (s < 90) {
          alerts.push({
            field: 'systolic_bp',
            code: 'CRITICAL_HYPOTENSION',
            severity: 'critical',
            message: `Systolic BP is ${s} mmHg (Hypotension / Shock boundary < 90 mmHg).`,
            safetyProtocol: 'Evaluate immediately for circulatory shock, hemorrhage, or severe dehydration.',
          });
        } else if (s >= 180 || d >= 120) {
          alerts.push({
            field: 'blood_pressure',
            code: 'HYPERTENSIVE_CRISIS',
            severity: 'warning',
            message: `Severe blood pressure elevation (${s}/${d} mmHg).`,
            safetyProtocol: 'Check for acute target organ damage (headache, chest pain, visual disturbance).',
          });
        }
      }
    }
  }

  // 7. Pulse Rate Validation
  // REQUIREMENT: Treat pulse = 0 as requiring immediate verification and safety workflow, NOT as missing data!
  if (data.pulse_bpm === null || data.pulse_bpm === undefined || (typeof data.pulse_bpm === 'string' && (data.pulse_bpm as string).trim() === '')) {
    missingMeasurements.push({
      field: 'pulse_bpm',
      label: 'Pulse (Heart Rate)',
      explanation: 'Not recorded. Will NOT be assumed normal (72 bpm).',
    });
  } else {
    const pulse = Number(data.pulse_bpm);
    if (isNaN(pulse)) {
      errors.pulse_bpm = 'Pulse must be a valid number.';
    } else if (pulse === 0) {
      // PULSE IS ZERO -> CRITICAL SAFETY WORKFLOW
      alerts.push({
        field: 'pulse_bpm',
        code: 'CRITICAL_PULSE_ZERO',
        severity: 'critical',
        message: '🚨 CRITICAL SAFETY ALERT: Pulse recorded as 0 bpm (Pulselessness / Cardiac Arrest Suspected).',
        safetyProtocol:
          'IMMEDIATE CLINICAL ACTION: Immediately verify carotid pulse. If pulseless, initiate cardiopulmonary resuscitation (CPR) / Code Blue workflow without delay. If patient is alert and conversing, re-verify pulse manually.',
      });
    } else if (pulse < 0 || pulse > 300) {
      errors.pulse_bpm = 'Pulse must be 0 (if pulseless) or between 20 and 300 bpm.';
    } else if (pulse > 0 && pulse < 20) {
      errors.pulse_bpm = 'Pulse below 20 bpm is outside survivable range without arrest. Enter 0 if pulseless or re-verify manually.';
    } else if (pulse > 130) {
      alerts.push({
        field: 'pulse_bpm',
        code: 'CRITICAL_TACHYCARDIA',
        severity: 'critical',
        message: `Severe tachycardia detected (Pulse: ${pulse} bpm > 130).`,
        safetyProtocol: 'Promptly check ECG and assess for hemodynamic instability, arrhythmia, or sepsis.',
      });
    } else if (pulse < 45) {
      alerts.push({
        field: 'pulse_bpm',
        code: 'CRITICAL_BRADYCARDIA',
        severity: 'warning',
        message: `Severe bradycardia detected (Pulse: ${pulse} bpm < 45).`,
        safetyProtocol: 'Evaluate for heart block, drug toxicity, or syncope risk.',
      });
    }
  }

  // 8. Temperature Validation
  // REQUIREMENT: Flag temperature of 96°F for clinical verification rather than automatically assuming typo.
  if (data.temperature === null || data.temperature === undefined || (typeof data.temperature === 'string' && (data.temperature as string).trim() === '')) {
    missingMeasurements.push({
      field: 'temperature',
      label: 'Body Temperature',
      explanation: 'Not measured. Will NOT be silently converted to 98.6°F / 37.0°C.',
    });
  } else {
    const rawTemp = Number(data.temperature);
    if (isNaN(rawTemp)) {
      errors.temperature = 'Temperature must be a valid number.';
    } else {
      const tempF = toFahrenheit(rawTemp, data.temperature_unit);

      if (data.temperature_unit === 'F') {
        if (rawTemp < 85.0 || rawTemp > 115.0) {
          errors.temperature = 'Temperature in °F must be between 85.0°F and 115.0°F.';
        }
      } else {
        if (rawTemp < 29.4 || rawTemp > 46.1) {
          errors.temperature = 'Temperature in °C must be between 29.4°C and 46.1°C.';
        }
      }

      if (!errors.temperature) {
        // CLINICAL FLAG FOR 96°F (and equivalent 35.5 - 35.6°C)
        if (Math.abs(tempF - 96.0) <= 0.3) {
          alerts.push({
            field: 'temperature',
            code: 'TEMP_96_VERIFICATION',
            severity: 'warning',
            message: `⚠️ CLINICAL VERIFICATION REQUIRED: Temperature recorded as ${rawTemp}°${data.temperature_unit} (${tempF.toFixed(1)}°F / ${toCelsius(rawTemp, data.temperature_unit).toFixed(1)}°C).`,
            safetyProtocol:
              'CLINICAL VERIFICATION: Check patient for hypothermia, environmental cold exposure, endocrine pathology, or severe sepsis. Re-measure with calibrated core or axillary thermometer; DO NOT assume this reading is a typo.',
          });
        } else if (tempF >= 104.0) {
          alerts.push({
            field: 'temperature',
            code: 'HIGH_FEVER',
            severity: 'warning',
            message: `High pyrexia recorded: ${rawTemp}°${data.temperature_unit} (${tempF.toFixed(1)}°F).`,
            safetyProtocol: 'Evaluate for acute febrile infection, heat stroke, or neuroleptic malignant syndrome.',
          });
        }
      }
    }
  }

  // 9. SpO2 Percentage Validation
  if (data.spo2 === null || data.spo2 === undefined || (typeof data.spo2 === 'string' && (data.spo2 as string).trim() === '')) {
    missingMeasurements.push({
      field: 'spo2',
      label: 'SpO2 Oxygen Saturation',
      explanation: 'Not recorded. Will NOT be assumed normal (98%).',
    });
  } else {
    const spo2 = Number(data.spo2);
    if (isNaN(spo2)) {
      errors.spo2 = 'SpO2 must be a valid number.';
    } else if (spo2 < 30 || spo2 > 100) {
      errors.spo2 = 'SpO2 must be between 30% and 100%.';
    } else if (spo2 < 90) {
      alerts.push({
        field: 'spo2',
        code: 'CRITICAL_HYPOXIA',
        severity: 'critical',
        message: `🚨 CRITICAL OXYGEN SATURATION: SpO2 is ${spo2}% (< 90% severe hypoxemia).`,
        safetyProtocol: 'Initiate supplemental high-flow oxygen immediately if available; expedite medical officer review.',
      });
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    alerts,
    missingMeasurements,
  };
}
