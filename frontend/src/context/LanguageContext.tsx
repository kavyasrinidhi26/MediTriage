import React, { createContext, useContext, useState, useMemo } from 'react';

export type AppLanguage = 'en' | 'te';

export interface Translations {
  [key: string]: string;
}

const enTranslations: Translations = {
  // Navigation & Common
  'nav.brand': 'MediTriage AI',
  'nav.tagline': 'Public OPD Acuity Dashboard',
  'nav.demo_badge': 'DEMO ENVIRONMENT',
  'nav.demo_title': 'Clinical Decision Support Prototype — Synthetic Outpatient Demonstration Data',
  'nav.api_online': 'API Active',
  'nav.api_local': 'Demo Local',
  'nav.btn_register': 'Register New Patient',
  'nav.btn_emergency': 'Emergency Accident Intake',
  'nav.lang_toggle': 'Language: English',
  'nav.lang_select': 'Select Language',
  'nav.refresh': 'Refresh data',

  // Nurse Patient Intake Page
  'intake.title': 'Nurse Routine Patient Intake Desk',
  'intake.subtitle': 'Routine OPD triage registration: Generate demo patient IDs, record multilingual complaints (Telugu, English), validate physiological vitals, and enroll patients into the clinical queue.',
  'intake.demo_mode': 'Synthetic Testing Mode (Demo Records Only)',
  'intake.emergency_banner_tag': 'IMMEDIATE EMERGENCY ACCIDENT BYPASS',
  'intake.emergency_banner_heading': 'Acute Trauma, Road Accident, or Hemorrhagic Shock?',
  'intake.emergency_banner_sub': 'Do not delay for routine OPD registration. Authorized staff can immediately activate Level 1 Trauma Protocol with unverified patient identity.',
  'intake.emergency_banner_btn': 'Emergency Accident Intake',

  // Section 1: Demographics
  'intake.sec1_title': '1. Patient Identification & Demographics',
  'intake.patient_id': 'Demo Patient ID',
  'intake.patient_id_regen': 'Generate new demo ID',
  'intake.patient_name': 'Patient Name',
  'intake.patient_name_opt': '(Optional)',
  'intake.patient_name_placeholder': 'e.g. Ramesh Kumar / Anonymous',
  'intake.age': 'Age (Years)',
  'intake.age_placeholder': 'e.g. 45 (use 0 for infant)',
  'intake.sex': 'Sex (Dataset Schema)',
  'intake.sex_male': 'Male',
  'intake.sex_female': 'Female',
  'intake.sex_other': 'Other',
  'intake.sex_unspecified': 'Unspecified',
  'intake.arrival_time': 'Arrival Time',
  'intake.btn_now': 'Now',

  // Section 2: Symptoms & Complaint
  'intake.sec2_title': '2. Presenting Symptoms & Medical History',
  'intake.complaint_lang': 'Language of Complaint',
  'intake.complaint_lang_hint': 'Preserves verbatim narrative in original language for multilingual OPD triage.',
  'intake.medications': 'Current Medication List',
  'intake.medications_placeholder': 'e.g. Metformin 500mg, Amlodipine 5mg, Inhaler',
  'intake.chief_complaint': "Chief Complaint in Patient's Own Words",
  'intake.chief_complaint_placeholder': "Record the exact presenting problem as described by the patient or relative (e.g., 'ఛాతీలో మంటగా ఉంది' or 'Severe breathlessness since morning')...",
  'intake.chief_complaint_hint': 'Verbatim transcription: Do not filter or translate clinical nuances during primary nursing intake.',
  'intake.known_conditions': 'Known Chronic Conditions (Comorbidities)',
  'intake.condition_none': 'None / Unknown',

  // Section 3: Vitals
  'intake.sec3_title': '3. Physiological Vitals (Bedside Nurse Examination)',
  'intake.vitals_subtitle': 'Enter all measured vital parameters. Unmeasured parameters should be left empty (no fabricated values).',
  'intake.bp': 'Blood Pressure (Systolic / Diastolic)',
  'intake.systolic_bp': 'Systolic BP (mmHg)',
  'intake.diastolic_bp': 'Diastolic BP (mmHg)',
  'intake.pulse': 'Pulse Rate (bpm)',
  'intake.pulse_flag_warning': 'CRITICAL ALERT: Pulse entered as 0 bpm triggers immediate cardiac arrest protocol!',
  'intake.temp': 'Temperature',
  'intake.temp_unit_f': '°F (Fahrenheit)',
  'intake.temp_unit_c': '°C (Celsius)',
  'intake.temp_96_flag': 'Clinical Verification: Temperature recorded as 96°F. Confirm if patient has hypothermia or cold exposure.',
  'intake.spo2': 'Oxygen Saturation (SpO₂ %)',
  'intake.spo2_hypoxia': 'CRITICAL ALERT: SpO₂ < 90% indicates severe hypoxemia. Immediate oxygen support indicated.',

  // Actions & Buttons
  'intake.btn_save_draft': 'Save Draft (Ctrl+S)',
  'intake.btn_clear': 'Clear Form',
  'intake.btn_submit': 'Submit & Request Clinical Assessment',
  'intake.submitting': 'Evaluating Clinical Rules...',
  'intake.quick_presets': 'Quick Demo Presets',
  'intake.success_title': 'Patient Intake Successfully Registered!',
  'intake.success_desc': 'Enrolled into active OPD queue as Token {token} (UHID: {uhid}). Clinical triage level is PENDING CLINICIAN ASSESSMENT.',
  'intake.btn_register_next': '+ Register Next Patient',
  'intake.btn_view_queue': 'View OPD Queue',

  // Validation messages
  'validation.id_required': 'Demo Patient ID is required.',
  'validation.age_required': 'Age is required and must be between 0 and 130 years.',
  'validation.sex_required': 'Patient sex must be specified.',
  'validation.arrival_required': 'Arrival time is required (HH:MM).',
  'validation.complaint_required': 'Chief complaint cannot be empty.',
  'validation.bp_inconsistent': 'Systolic blood pressure must be strictly greater than diastolic blood pressure.',
  'validation.pulse_range': 'Pulse rate must be between 0 and 300 bpm.',
  'validation.temp_range': 'Temperature must be between 85°F (29.4°C) and 110°F (43.3°C).',
  'validation.spo2_range': 'SpO₂ percentage must be between 50% and 100%.',

  // Voice to text strings
  'voice.start_dictation': 'Voice-to-Text Input',
  'voice.listening': 'Listening (Speak now)...',
  'voice.stop_dictation': 'Stop Listening',
  'voice.lang_telugu': 'Telugu (తెలుగు)',
  'voice.lang_english': 'English (ఇంగ్లీష్)',
  'voice.supported': 'Browser Speech Recognition Available',
  'voice.not_supported': 'Web Speech API is not supported in this browser. Please use manual keyboard input.',
  'voice.permission_denied': 'Microphone permission denied. Please allow microphone access or type manually.',
  'voice.network_error': 'Speech service network error. Please verify connection or type manually.',
  'voice.no_speech': 'No speech detected. Please try speaking again or type manually.',
  'voice.error_generic': 'Voice transcription error. Manual typing fallback is active.',
  'voice.disclaimer': 'Notice: Automated voice transcript may contain transcription errors. Do not treat as verified medical fact. Clinicians and nursing staff must review, verify, and correct text before saving.',
  'voice.privacy_notice': 'Privacy Notice: Audio is processed locally via browser Web Speech API. No audio recordings are transmitted to external third-party servers.',
  'voice.review_heading': 'Transcript Review & Correction',
  'voice.btn_insert': 'Insert into Field',
  'voice.btn_append': 'Append to Existing Text',
  'voice.btn_discard': 'Discard Transcript',
  'voice.manual_fallback': 'Manual typing fallback is always active. You can edit text directly.',

  // Emergency Intake Page Translations
  'emergency.title': 'Rapid Emergency Accident Intake Protocol',
  'emergency.subtitle': 'Priority Level 1 Trauma Resuscitation Desk: Instant patient registration with unverified identity, ABCDE primary survey, and emergency response activation.',
  'emergency.activate_btn': '🚨 ACTIVATE EMERGENCY RESUSCITATION RESPONSE',
  'emergency.activating': 'Activating Emergency Response...',
  'emergency.id_status': 'Patient Identity Status',
  'emergency.id_unknown': 'UNKNOWN / UNCONSCIOUS PATIENT',
  'emergency.id_known': 'KNOWN PATIENT IDENTITY',
  'emergency.accident_type': 'Accident Classification',
  'emergency.mechanism': 'Mechanism of Injury & Initial Observations',
  'emergency.mechanism_placeholder': 'Brief description: Two-wheeler vs heavy truck, helmet dislodged, blunt abdominal impact, deformity noted...',
  'emergency.assigned_bay': 'Assigned Resuscitation Bay',
  'emergency.activated_by': 'Initiating Clinician / Staff',
  'emergency.primary_survey': 'Primary Survey (ABCDE Rapid Observations)',
  'emergency.vitals_optional_note': 'Physiological vitals are strictly optional. Never delay emergency trauma activation to collect vitals.',
};

const teTranslations: Translations = {
  // Navigation & Common
  'nav.brand': 'MediTriage AI',
  'nav.tagline': 'ప్రభుత్వ ఓపీడీ అత్యవసర ప్రాధాన్యత డ్యాష్‌బోర్డ్',
  'nav.demo_badge': 'డెమో వాతావరణం',
  'nav.demo_title': 'క్లినికల్ నిర్ణయ మద్దతు నమూనా — నమూనా రోగుల ప్రదర్శన సమాచారం',
  'nav.api_online': 'ఏపీఐ సక్రియంగా ఉంది',
  'nav.api_local': 'స్థానిక డెమో మోడ్',
  'nav.btn_register': 'కొత్త రోగి నమోదు',
  'nav.btn_emergency': 'అత్యవసర ప్రమాద నమోదు',
  'nav.lang_toggle': 'భాష: తెలుగు',
  'nav.lang_select': 'భాషను ఎంచుకోండి',
  'nav.refresh': 'సమాచారాన్ని పునరుద్ధరించు',

  // Nurse Patient Intake Page
  'intake.title': 'నర్సింగ్ సాధారణ రోగి నమోదు డెస్క్',
  'intake.subtitle': 'సాధారణ ఓపీడీ ట్రయేజ్ నమోదు: డెమో పేషెంట్ ఐడీల సృష్టి, బహుభాషా ఫిర్యాదుల నమోదు (తెలుగు, ఇంగ్లీష్), ప్రాణవాయువు/నాడి కొలతల ధృవీకరణ మరియు క్లినికల్ క్యూలో చేర్చడం.',
  'intake.demo_mode': 'సింథటిక్ టెస్టింగ్ మోడ్ (డెమో రికార్డులు మాత్రమే)',
  'intake.emergency_banner_tag': 'తక్షణ అత్యవసర ప్రమాద బైపాస్',
  'intake.emergency_banner_heading': 'తీవ్రమైన గాయం, రోడ్డు ప్రమాదం లేదా రక్తస్రావ షాక్ ఉందా?',
  'intake.emergency_banner_sub': 'సాధారణ ఓపీడీ నమోదు కోసం వేచి ఉండకండి. అధికారిక సిబ్బంది గుర్తింపు లేని రోగికి కూడా వెంటనే లెవల్ 1 ట్రామా ప్రోటోకాల్ ప్రారంభించవచ్చు.',
  'intake.emergency_banner_btn': 'అత్యవసర ప్రమాద నమోదు',

  // Section 1: Demographics
  'intake.sec1_title': '1. రోగి గుర్తింపు & జనాభా వివరాలు',
  'intake.patient_id': 'డెమో రోగి ఐడీ (UHID)',
  'intake.patient_id_regen': 'కొత్త డెమో ఐడీని సృష్టించండి',
  'intake.patient_name': 'రోగి పేరు',
  'intake.patient_name_opt': '(ఐచ్ఛికం)',
  'intake.patient_name_placeholder': 'ఉదా: రమేష్ కుమార్ / తెలియదు',
  'intake.age': 'వయస్సు (సంవత్సరాలు)',
  'intake.age_placeholder': 'ఉదా: 45 (శిశువులకు 0 వేయండి)',
  'intake.sex': 'లింగం',
  'intake.sex_male': 'పురుషుడు (Male)',
  'intake.sex_female': 'స్త్రీ (Female)',
  'intake.sex_other': 'ఇతర (Other)',
  'intake.sex_unspecified': 'పేర్కొనబడలేదు (Unspecified)',
  'intake.arrival_time': 'వచ్చిన సమయం',
  'intake.btn_now': 'ఇప్పుడు',

  // Section 2: Symptoms & Complaint
  'intake.sec2_title': '2. ప్రస్తుత లక్షణాలు & వైద్య చరిత్ర',
  'intake.complaint_lang': 'ఫిర్యాదు భాష',
  'intake.complaint_lang_hint': 'బహుభాషా ఓపీడీ ట్రయేజ్ కోసం రోగి చెప్పిన అసలు మాటలను అలాగే భద్రపరుస్తుంది.',
  'intake.medications': 'ప్రస్తుతం వాడుతున్న మందుల జాబితా',
  'intake.medications_placeholder': 'ఉదా: మెట్‌ఫార్మిన్ 500mg, ఆమ్లోడిపైన్ 5mg, ఇన్‌హేలర్',
  'intake.chief_complaint': 'రోగి స్వంత మాటలలో ప్రధాన ఫిర్యాదు',
  'intake.chief_complaint_placeholder': "రోగి లేదా బంధువులు వివరించిన ఖచ్చితమైన సమస్యను నమోదు చేయండి (ఉదా: 'ఛాతీలో మంటగా ఉంది మరియు ఆయాసం' లేదా 'తీవ్రమైన శ్వాస ఆడకపోవడం')...",
  'intake.chief_complaint_hint': 'యథాతథ లిప్యంతరీకరణ: ప్రాథమిక నర్సింగ్ నమోదు సమయంలో క్లినికల్ సూక్ష్మభేదాలను మార్చవద్దు.',
  'intake.known_conditions': 'దీర్ఘకాలిక వ్యాధులు (Comorbidities)',
  'intake.condition_none': 'ఏమీ లేవు / తెలియదు',

  // Section 3: Vitals
  'intake.sec3_title': '3. శరీర ప్రాణాధార సూచికలు (Vitals Examination)',
  'intake.vitals_subtitle': 'కొలిచిన అన్ని సూచికలను నమోదు చేయండి. కొలవని వాటిని ఖాళీగా వదిలివేయండి (తప్పుడు సంఖ్యలు వేయకండి).',
  'intake.bp': 'రక్తపోటు (సిస్టోలిక్ / డయాస్టోలిక్)',
  'intake.systolic_bp': 'సిస్టోలిక్ బీపీ (mmHg)',
  'intake.diastolic_bp': 'డయాస్టోలిక్ బీపీ (mmHg)',
  'intake.pulse': 'నాడి వేగం / పల్స్ (bpm)',
  'intake.pulse_flag_warning': 'తీవ్రమైన హెచ్చరిక: నాడి 0 bpm గా నమోదు చేయబడింది! కార్డియాక్ అరెస్ట్ ప్రోటోకాల్ వెంటనే వర్తిస్తుంది!',
  'intake.temp': 'శరీర ఉష్ణోగ్రత',
  'intake.temp_unit_f': '°F (ఫారెన్‌హీట్)',
  'intake.temp_unit_c': '°C (సెల్సియస్)',
  'intake.temp_96_flag': 'క్లినికల్ పరిశీలన: ఉష్ణోగ్రత 96°F గా నమోదైంది. రోగికి చలి తాకిడి లేదా హైపోథర్మియా ఉందో లేదో సరిచూడండి.',
  'intake.spo2': 'ఆక్సిజన్ సంతృప్తత (SpO₂ %)',
  'intake.spo2_hypoxia': 'తీవ్రమైన హెచ్చరిక: SpO₂ < 90% తీవ్రమైన హైపోక్సీమియాను సూచిస్తుంది. వెంటనే ఆక్సిజన్ అందించాలి.',

  // Actions & Buttons
  'intake.btn_save_draft': 'చిత్తుప్రతి సేవ్ చేయి (Ctrl+S)',
  'intake.btn_clear': 'ఫారమ్‌ను ఖాళీ చేయి',
  'intake.btn_submit': 'సమర్పించి క్లినికల్ అసెస్‌మెంట్ కోరండి',
  'intake.submitting': 'క్లినికల్ నిబంధనల విశ్లేషణ జరుగుతోంది...',
  'intake.quick_presets': 'శీఘ్ర డెమో నమూనాలు',
  'intake.success_title': 'రోగి నమోదు విజయవంతంగా పూర్తయింది!',
  'intake.success_desc': 'టోకెన్ {token} (UHID: {uhid}) గా క్రియాశీల ఓపీడీ క్యూలో చేర్చబడింది. క్లినికల్ ట్రయేజ్ వర్గం వైద్యుల పరిశీలనలో ఉంది.',
  'intake.btn_register_next': '+ తదుపరి రోగిని నమోదు చేయండి',
  'intake.btn_view_queue': 'ఓపీడీ క్యూను చూడండి',

  // Validation messages
  'validation.id_required': 'డెమో రోగి ఐడీ తప్పనిసరి.',
  'validation.age_required': 'వయస్సు తప్పనిసరి మరియు 0 నుండి 130 సంవత్సరాల మధ్య ఉండాలి.',
  'validation.sex_required': 'రోగి లింగం పేర్కొనాలి.',
  'validation.arrival_required': 'వచ్చిన సమయం తప్పనిసరి (HH:MM).',
  'validation.complaint_required': 'ప్రధాన ఫిర్యాదు ఖాళీగా ఉండకూడదు.',
  'validation.bp_inconsistent': 'సిస్టోలిక్ రక్తపోటు ఖచ్చితంగా డయాస్టోలిక్ కంటే ఎక్కువగా ఉండాలి.',
  'validation.pulse_range': 'పల్స్ రేటు 0 నుండి 300 bpm మధ్య ఉండాలి.',
  'validation.temp_range': 'ఉష్ణోగ్రత 85°F (29.4°C) నుండి 110°F (43.3°C) మధ్య ఉండాలి.',
  'validation.spo2_range': 'SpO₂ శాతం 50% నుండి 100% మధ్య ఉండాలి.',

  // Voice to text strings
  'voice.start_dictation': 'వాయిస్-టు-టెక్స్ట్ (స్పీచ్ ఇన్‌పుట్)',
  'voice.listening': 'వినబడుతోంది (ఇప్పుడు మాట్లాడండి)...',
  'voice.stop_dictation': 'రికార్డింగ్ ఆపు',
  'voice.lang_telugu': 'తెలుగు (Telugu)',
  'voice.lang_english': 'ఇంగ్లీష్ (English)',
  'voice.supported': 'బ్రౌజర్ స్పీచ్ రికగ్నిషన్ అందుబాటులో ఉంది',
  'voice.not_supported': 'ఈ బ్రౌజర్‌లో వెబ్ స్పీచ్ సదుపాయం అందుబాటులో లేదు. దయచేసి కీబోర్డ్ ద్వారా టైప్ చేయండి.',
  'voice.permission_denied': 'మైక్రోఫోన్ అనుమతి నిరాకరించబడింది. దయచేసి బ్రౌజర్ సెట్టింగ్స్‌లో అనుమతించండి లేదా స్వయంగా టైప్ చేయండి.',
  'voice.network_error': 'స్పీచ్ సర్వీస్ నెట్‌వర్క్ సమస్య. దయచేసి కనెక్షన్ తనిఖీ చేయండి లేదా స్వయంగా టైప్ చేయండి.',
  'voice.no_speech': 'మాటలు గుర్తించబడలేదు. దయచేసి మళ్ళీ స్పష్టంగా మాట్లాడండి లేదా స్వయంగా టైప్ చేయండి.',
  'voice.error_generic': 'వాయిస్ ట్రాన్స్‌క్రిప్షన్ లోపం. మాన్యువల్ టైపింగ్ అందుబాటులో ఉంది.',
  'voice.disclaimer': 'గమనిక: ఆటోమేటెడ్ వాయిస్ ట్రాన్స్‌క్రిప్షన్‌లో లోపాలు ఉండవచ్చు. దీనిని నేరుగా వైద్య వాస్తవంగా భావించవద్దు. సేవ్ చేసే ముందు వైద్య సిబ్బంది తప్పనిసరిగా సరిచూసి సరిదిద్దాలి.',
  'voice.privacy_notice': 'గోప్యతా గమనిక: ఆడియో బ్రౌజర్ వెబ్ స్పీచ్ ఏపీఐ ద్వారా స్థానికంగా ప్రాసెస్ చేయబడుతుంది. ఏ బాహ్య సర్వర్లకూ ఆడియో పంపబడదు.',
  'voice.review_heading': 'ట్రాన్స్‌క్రిప్ట్ సమీక్ష & సవరణ',
  'voice.btn_insert': 'ఫీల్డ్‌లో చేర్చండి',
  'voice.btn_append': 'ఉన్న సమాచారానికి జతచేయండి',
  'voice.btn_discard': 'రద్దు చేయి',
  'voice.manual_fallback': 'మాన్యువల్ టైపింగ్ ఎల్లప్పుడూ సక్రియంగా ఉంటుంది. మీరు నేరుగా టెక్స్ట్‌ను సరిదిద్దవచ్చు.',

  // Emergency Intake Page Translations
  'emergency.title': 'శీఘ్ర అత్యవసర ప్రమాద నమోదు ప్రోటోకాల్',
  'emergency.subtitle': 'ప్రాధాన్యత లెవల్ 1 ట్రామా పునరుజ్జీవన డెస్క్: తెలియని రోగి గుర్తింపుతో తక్షణ నమోదు, ABCDE ప్రాథమిక సర్వే, మరియు ఎమర్జెన్సీ స్పందన క్రియాశీలత.',
  'emergency.activate_btn': '🚨 అత్యవసర పునరుజ్జీవన స్పందనను ప్రారంభించండి (ACTIVATE)',
  'emergency.activating': 'ఎమర్జెన్సీ రెస్పాన్స్ ప్రారంభించబడుతోంది...',
  'emergency.id_status': 'రోగి గుర్తింపు స్థితి',
  'emergency.id_unknown': 'గుర్తించబడని / స్పృహలేని రోగి (UNKNOWN)',
  'emergency.id_known': 'గుర్తించబడిన రోగి (KNOWN)',
  'emergency.accident_type': 'ప్రమాద వర్గీకరణ',
  'emergency.mechanism': 'గాయపడిన తీరు & ప్రాథమిక పరిశీలనలు (Mechanism)',
  'emergency.mechanism_placeholder': 'సంక్షిప్త వివరణ: ద్విచక్ర వాహనం మరియు లారీ ప్రమాదం, హెల్మెట్ ఊడిపోయింది, కడుపుపై తీవ్ర గాయం, విరిగిన ఎముకలు...',
  'emergency.assigned_bay': 'కేటాయించిన అత్యవసర విభాగం (Resuscitation Bay)',
  'emergency.activated_by': 'ప్రారంభించిన వైద్యుడు / సిబ్బంది',
  'emergency.primary_survey': 'ప్రాథమిక పరిశీలన (ABCDE Rapid Observations)',
  'emergency.vitals_optional_note': 'వైటల్స్ కొలతలు పూర్తిగా ఐచ్ఛికం. వైటల్స్ తీసుకోవడం కోసం అత్యవసర చికిత్సను ఎప్పుడూ ఆలస్యం చేయవద్దు.',
};

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  toggleLanguage: () => void;
  t: (key: string, replacements?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'meditriage_language';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'te' || saved === 'en') {
        return saved;
      }
    } catch {
      // localStorage may not be available in private browsing or testing
    }
    return 'en';
  });

  const setLanguage = (lang: AppLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'te' : 'en');
  };

  const t = (key: string, replacements?: Record<string, string | number>): string => {
    const dict = language === 'te' ? teTranslations : enTranslations;
    let text = dict[key];

    // Fallback gracefully to English if Telugu translation key is missing
    if (!text && language === 'te') {
      text = enTranslations[key];
    }

    // Ultimate fallback is the key itself
    if (!text) {
      text = key;
    }

    if (replacements) {
      Object.entries(replacements).forEach(([k, v]) => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }

    return text;
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      t,
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
