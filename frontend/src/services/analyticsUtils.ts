import type { PatientQueueItem, TriageCategory } from '../types/triage';

export interface HourlyArrivalData {
  hourLabel: string;
  hour24: number;
  actualCount: number;
  syntheticBaseline: number;
}

export interface TriageCategoryDistribution {
  category: TriageCategory;
  displayName: string;
  count: number;
  percentage: number;
  color: string;
  clinicalDescription: string;
}

export interface DepartmentWaitTimeData {
  department: string;
  avgWaitMinutes: number;
  maxWaitMinutes: number;
  patientCount: number;
  isSimulated: boolean;
}

export interface DepartmentWorkloadData {
  department: string;
  totalWaiting: number;
  emergencyCount: number;
  priorityCount: number;
  routineCount: number;
}

// Canonical 8-to-10 hour OPD Shift synthetic baseline for comparative clinical flow analysis
export const SYNTHETIC_HOURLY_BASELINE: Record<number, number> = {
  8: 14,
  9: 28,
  10: 42,
  11: 36,
  12: 24,
  13: 18,
  14: 22,
  15: 16,
  16: 12,
  17: 8,
};

/**
 * Deduplicates patient queue items by ID, token, or UHID to prevent double-counting.
 */
export function deduplicatePatients(patients: PatientQueueItem[]): PatientQueueItem[] {
  const seenIds = new Set<string>();
  const seenTokens = new Set<string>();
  const seenUhids = new Set<string>();
  const unique: PatientQueueItem[] = [];

  for (const p of patients) {
    if (!p) continue;
    const id = p.id ? String(p.id).trim() : null;
    const token = p.token_number ? String(p.token_number).trim().toUpperCase() : null;
    const uhid = p.opd_registration_number ? String(p.opd_registration_number).trim().toUpperCase() : null;

    if (id && seenIds.has(id)) continue;
    if (token && seenTokens.has(token)) continue;
    if (uhid && seenUhids.has(uhid)) continue;

    if (id) seenIds.add(id);
    if (token) seenTokens.add(token);
    if (uhid) seenUhids.add(uhid);

    unique.push(p);
  }

  return unique;
}

/**
 * Aggregates patient arrivals by hour of day from real queue arrival timestamps.
 */
export function calculateArrivalsByHour(patients: PatientQueueItem[]): {
  data: HourlyArrivalData[];
  isSyntheticFallback: boolean;
  totalRecorded: number;
} {
  const uniquePatients = deduplicatePatients(patients);
  const hourCounts: Record<number, number> = {};

  // Standard OPD shift hours: 8 AM to 5 PM (08:00 to 17:00)
  for (let h = 8; h <= 17; h++) {
    hourCounts[h] = 0;
  }

  let validTimestampsCount = 0;
  const recordedHours = new Set<number>();

  uniquePatients.forEach((patient) => {
    let hour: number | null = null;

    if (patient.created_at) {
      try {
        const date = new Date(patient.created_at);
        if (!isNaN(date.getTime())) {
          hour = date.getHours();
        }
      } catch {
        // Skip malformed timestamp gracefully
      }
    }

    // Graceful fallback: check arrival_time string (e.g., "08:30 AM") if created_at is unavailable
    if (hour === null && (patient as unknown as { arrival_time?: string }).arrival_time) {
      try {
        const timeStr = String((patient as unknown as { arrival_time?: string }).arrival_time).trim();
        const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
        if (match) {
          let h = parseInt(match[1], 10);
          const ampm = match[3]?.toUpperCase();
          if (ampm === 'PM' && h < 12) h += 12;
          if (ampm === 'AM' && h === 12) h = 0;
          if (h >= 0 && h <= 23) {
            hour = h;
          }
        }
      } catch {
        // Skip malformed arrival_time
      }
    }

    if (hour !== null) {
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      validTimestampsCount++;
      recordedHours.add(hour);
    }
  });

  const isSyntheticFallback = validTimestampsCount === 0;

  // Union of standard shift hours (8..17) and any additional hours with arrivals
  const standardHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  const allHours = Array.from(new Set([...standardHours, ...Array.from(recordedHours)])).sort((a, b) => a - b);

  const data: HourlyArrivalData[] = allHours.map((h) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    const hourLabel = `${displayHour.toString().padStart(2, '0')}:00 ${period}`;
    return {
      hourLabel,
      hour24: h,
      actualCount: hourCounts[h] || 0,
      syntheticBaseline: SYNTHETIC_HOURLY_BASELINE[h] || 15,
    };
  });

  return {
    data,
    isSyntheticFallback,
    totalRecorded: validTimestampsCount,
  };
}

/**
 * Calculates current live patient count and percentage breakdown by triage category.
 */
export function calculateTriageDistribution(patients: PatientQueueItem[]): {
  categories: TriageCategoryDistribution[];
  total: number;
} {
  const uniquePatients = deduplicatePatients(patients);
  const total = uniquePatients.length;

  let emergencyCount = 0;
  let priorityCount = 0;
  let routineCount = 0;

  uniquePatients.forEach((p) => {
    const cat = p.assessment?.triage_category;
    if (cat === 'EMERGENCY') {
      emergencyCount++;
    } else if (cat === 'PRIORITY') {
      priorityCount++;
    } else {
      routineCount++;
    }
  });

  const categories: TriageCategoryDistribution[] = [
    {
      category: 'EMERGENCY',
      displayName: 'Emergency (Level 1)',
      count: emergencyCount,
      percentage: total > 0 ? Number(((emergencyCount / total) * 100).toFixed(1)) : 0,
      color: '#dc2626', // Emergency Red
      clinicalDescription: 'Immediate resuscitation / casualty preemption',
    },
    {
      category: 'PRIORITY',
      displayName: 'Priority (Levels 2-3)',
      count: priorityCount,
      percentage: total > 0 ? Number(((priorityCount / total) * 100).toFixed(1)) : 0,
      color: '#d97706', // Priority Amber
      clinicalDescription: 'Urgent evaluation within 15 to 30 minutes',
    },
    {
      category: 'ROUTINE',
      displayName: 'Routine (Levels 4-5)',
      count: routineCount,
      percentage: total > 0 ? Number(((routineCount / total) * 100).toFixed(1)) : 0,
      color: '#16a34a', // Routine Green
      clinicalDescription: 'Standard outpatient queue consultation',
    },
  ];

  return { categories, total };
}

/**
 * Calculates real elapsed waiting times by department based on patient arrival timestamps.
 */
export function calculateWaitTimeByDepartment(patients: PatientQueueItem[]): {
  departments: DepartmentWaitTimeData[];
  isSimulated: boolean;
} {
  const uniquePatients = deduplicatePatients(patients);
  const deptMap: Record<string, { totalWaitMinutes: number; maxWait: number; count: number }> = {};
  const now = Date.now();
  let hasValidElapsed = false;

  uniquePatients.forEach((p) => {
    // Only consider waiting and under-review patients for current waiting time
    if (p.status === 'COMPLETED') return;

    const dept = p.assessment?.recommended_department || 'General Medicine';
    if (!deptMap[dept]) {
      deptMap[dept] = { totalWaitMinutes: 0, maxWait: 0, count: 0 };
    }

    if (p.created_at) {
      try {
        const arrivalMs = new Date(p.created_at).getTime();
        if (!isNaN(arrivalMs)) {
          const waitMin = Math.max(0, Math.round((now - arrivalMs) / 60000));
          deptMap[dept].totalWaitMinutes += waitMin;
          deptMap[dept].maxWait = Math.max(deptMap[dept].maxWait, waitMin);
          deptMap[dept].count += 1;
          hasValidElapsed = true;
          return;
        }
      } catch {
        // Fall through
      }
    }

    // Default reference wait from assessment recommendation if arrival timestamp not available
    const recWait = p.assessment?.max_recommended_wait_minutes || 30;
    deptMap[dept].totalWaitMinutes += recWait;
    deptMap[dept].maxWait = Math.max(deptMap[dept].maxWait, recWait);
    deptMap[dept].count += 1;
  });

  const depts = Object.keys(deptMap);
  if (depts.length === 0) {
    // Simulated clinical benchmark when queue is empty
    return {
      departments: [
        { department: 'Casualty / Emergency', avgWaitMinutes: 4, maxWaitMinutes: 10, patientCount: 0, isSimulated: true },
        { department: 'General Medicine', avgWaitMinutes: 24, maxWaitMinutes: 45, patientCount: 0, isSimulated: true },
        { department: 'Pulmonology', avgWaitMinutes: 18, maxWaitMinutes: 35, patientCount: 0, isSimulated: true },
        { department: 'Cardiology', avgWaitMinutes: 12, maxWaitMinutes: 25, patientCount: 0, isSimulated: true },
        { department: 'Pediatrics', avgWaitMinutes: 15, maxWaitMinutes: 30, patientCount: 0, isSimulated: true },
        { department: 'Orthopedics', avgWaitMinutes: 22, maxWaitMinutes: 40, patientCount: 0, isSimulated: true },
      ],
      isSimulated: true,
    };
  }

  const result: DepartmentWaitTimeData[] = depts.map((d) => {
    const entry = deptMap[d];
    return {
      department: d,
      avgWaitMinutes: entry.count > 0 ? Math.round(entry.totalWaitMinutes / entry.count) : 0,
      maxWaitMinutes: entry.maxWait,
      patientCount: entry.count,
      isSimulated: !hasValidElapsed,
    };
  });

  // Sort descending by average wait time
  result.sort((a, b) => b.avgWaitMinutes - a.avgWaitMinutes);

  return { departments: result, isSimulated: !hasValidElapsed };
}

/**
 * Calculates current workload (patient volume and acuity breakdown) across departments.
 */
export function calculateDepartmentWorkload(patients: PatientQueueItem[]): DepartmentWorkloadData[] {
  const uniquePatients = deduplicatePatients(patients);
  const deptMap: Record<
    string,
    { total: number; emergency: number; priority: number; routine: number }
  > = {};

  uniquePatients.forEach((p) => {
    if (p.status === 'COMPLETED') return;

    const dept = p.assessment?.recommended_department || 'General Medicine';
    if (!deptMap[dept]) {
      deptMap[dept] = { total: 0, emergency: 0, priority: 0, routine: 0 };
    }

    deptMap[dept].total += 1;
    const cat = p.assessment?.triage_category;
    if (cat === 'EMERGENCY') {
      deptMap[dept].emergency += 1;
    } else if (cat === 'PRIORITY') {
      deptMap[dept].priority += 1;
    } else {
      deptMap[dept].routine += 1;
    }
  });

  const result: DepartmentWorkloadData[] = Object.keys(deptMap).map((d) => ({
    department: d,
    totalWaiting: deptMap[d].total,
    emergencyCount: deptMap[d].emergency,
    priorityCount: deptMap[d].priority,
    routineCount: deptMap[d].routine,
  }));

  // Sort by highest load first
  result.sort((a, b) => b.totalWaiting - a.totalWaiting);

  return result;
}

export type TimeRangeOption = 'ALL' | 'MORNING' | 'AFTERNOON';

/**
 * Filters patients by operational OPD shift time ranges using stored timestamps.
 * - ALL: Full shift (all recorded hours)
 * - MORNING: Morning rush (08:00 to 11:59)
 * - AFTERNOON: Afternoon shift (12:00 to 17:00)
 */
export function filterPatientsByTimeRange(
  patients: PatientQueueItem[],
  timeRange: TimeRangeOption
): PatientQueueItem[] {
  if (!timeRange || timeRange === 'ALL') return patients;

  return patients.filter((p) => {
    let hour: number | null = null;
    if (p.created_at) {
      try {
        const d = new Date(p.created_at);
        if (!isNaN(d.getTime())) {
          hour = d.getHours();
        }
      } catch {
        // Fall through
      }
    }

    if (hour === null && (p as unknown as { arrival_time?: string }).arrival_time) {
      try {
        const timeStr = String((p as unknown as { arrival_time?: string }).arrival_time).trim();
        const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
        if (match) {
          let h = parseInt(match[1], 10);
          const ampm = match[3]?.toUpperCase();
          if (ampm === 'PM' && h < 12) h += 12;
          if (ampm === 'AM' && h === 12) h = 0;
          if (h >= 0 && h <= 23) {
            hour = h;
          }
        }
      } catch {
        // Fall through
      }
    }

    // If timestamp cannot be determined, retain safely to avoid losing records
    if (hour === null) return true;

    if (timeRange === 'MORNING') {
      return hour >= 8 && hour < 12;
    }
    if (timeRange === 'AFTERNOON') {
      return hour >= 12 && hour <= 17;
    }

    return true;
  });
}

/**
 * Filters patients by recommended specialty department.
 */
export function filterPatientsByDepartment(
  patients: PatientQueueItem[],
  department: string
): PatientQueueItem[] {
  if (!department || department === 'ALL') return patients;
  const deptLower = department.trim().toLowerCase();
  return patients.filter((p) => {
    const d = p.assessment?.recommended_department || 'General Medicine';
    return d.toLowerCase().includes(deptLower);
  });
}

