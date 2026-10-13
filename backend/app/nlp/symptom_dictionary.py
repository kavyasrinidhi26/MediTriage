"""
MediTriage AI — Clinically Reviewed Symptom Concept Dictionary
Supports English, Telugu script (తెలుగు), and common Latin-script Telugu transliterations.

CLINICAL SAFETY NOTICE:
Extracted concepts represent presenting symptoms and clinical findings.
They do NOT represent definitive medical diagnoses.
"""

from typing import Dict, List, Set

# Standardized Clinical Symptom Concepts
CONCEPT_CHEST_PAIN = "chest_pain"
CONCEPT_RESPIRATORY_DISTRESS = "respiratory_distress"
CONCEPT_FEVER = "fever"
CONCEPT_ALTERED_SENSORIUM = "altered_sensorium"
CONCEPT_SEVERE_BLEEDING = "severe_bleeding"
CONCEPT_HEADACHE = "headache"
CONCEPT_ABDOMINAL_PAIN = "abdominal_pain"
CONCEPT_VOMITING_DIARRHEA = "vomiting_diarrhea"
CONCEPT_SEIZURE = "seizure"
CONCEPT_TRAUMA = "trauma"
CONCEPT_PALPITATIONS = "palpitations"
CONCEPT_DIZZINESS = "dizziness"

# Clinically reviewed symptom terms organized by concept and language format
SYMPTOM_DICTIONARY: Dict[str, Dict[str, List[str]]] = {
    CONCEPT_CHEST_PAIN: {
        "en": [
            "chest pain", "chest tightness", "chest pressure", "chest heaviness",
            "angina", "retrosternal pain", "cardiac pain", "heart pain",
            "pain radiating to arm", "pain radiating to jaw", "crushing chest pain"
        ],
        "te_script": [
            "గుండె నొప్పి", "ఛాతీ నొప్పి", "రొమ్ము నొప్పి", "గుండెలో నొప్పి", "ఛాతీలో మంట"
        ],
        "te_translit": [
            "gunde noppi", "gundelo noppi", "chhati noppi", "chhati lo noppi",
            "chathilo noppi", "gunde baruvu", "chest lo noppi", "gundelo manta"
        ],
    },
    CONCEPT_RESPIRATORY_DISTRESS: {
        "en": [
            "shortness of breath", "breathlessness", "difficulty breathing",
            "struggling to breathe", "dyspnea", "wheezing", "suffocation",
            "gasping", "breathless", "asthma attack", "respiratory distress"
        ],
        "te_script": [
            "ఆయాసం", "శ్వాస ఆడకపోవడం", "శ్వాస తీసుకోవడంలో ఇబ్బంది", "దమ్ము", "గాలి ఆడటం లేదు"
        ],
        "te_translit": [
            "aayasam", "ayasam", "swasa aadakapovadam", "swasa teesukovadam kastam",
            "dammu", "swasa kastam", "gaali aadam ledu", "breath teesukolekapothunna"
        ],
    },
    CONCEPT_FEVER: {
        "en": [
            "fever", "high fever", "chills", "rigors", "pyrexia", "hot body", "high temperature"
        ],
        "te_script": [
            "జ్వరం", "తీవ్రమైన జ్వరం", "చలి జ్వరం", "ఒళ్లు కాలడం"
        ],
        "te_translit": [
            "jwaram", "jvaram", "chali jwaram", "ollu kaaladam", "high jwaram"
        ],
    },
    CONCEPT_ALTERED_SENSORIUM: {
        "en": [
            "unconscious", "loss of consciousness", "fainted", "syncope",
            "confused", "altered sensorium", "unresponsive", "drowsy", "lethargic"
        ],
        "te_script": [
            "స్పృహ తప్పడం", "కళ్లు తిరిగి పడిపోవడం", "తెలివి తప్పడం", "మత్తుగా ఉండటం"
        ],
        "te_translit": [
            "spruha tappadam", "spruha ledu", "kallu thirigi padipovadam",
            "telivi tappadam", "matthuga undatam"
        ],
    },
    CONCEPT_SEVERE_BLEEDING: {
        "en": [
            "severe bleeding", "massive bleeding", "blood loss", "hemorrhage",
            "vomiting blood", "hematemesis", "rectal bleeding", "bleeding wound"
        ],
        "te_script": [
            "తీవ్రమైన రక్తస్రావం", "రక్తం కారడం", "రక్తపు వాంతులు", "రక్తం పడుతోంది"
        ],
        "te_translit": [
            "raktam karutondi", "raktham", "raktapu vantulu", "raktam padutondi",
            "blood karutondi", "blood bleeding"
        ],
    },
    CONCEPT_HEADACHE: {
        "en": [
            "headache", "severe headache", "head pain", "migraine", "throbbing head pain"
        ],
        "te_script": [
            "తలనొప్పి", "తీవ్రమైన తలనొప్పి", "తలపోటు"
        ],
        "te_translit": [
            "talanoppi", "thala noppi", "thalanopi", "thalapotu"
        ],
    },
    CONCEPT_ABDOMINAL_PAIN: {
        "en": [
            "abdominal pain", "stomach ache", "belly pain", "severe stomach pain", "gastric pain"
        ],
        "te_script": [
            "కడుపు నొప్పి", "పొట్ట నొప్పి", "తీవ్రమైన కడుపు నొప్పి"
        ],
        "te_translit": [
            "kadupu noppi", "potta noppi", "kadupulo noppi", "stomach noppi"
        ],
    },
    CONCEPT_VOMITING_DIARRHEA: {
        "en": [
            "vomiting", "vomited", "nausea", "diarrhea", "loose motions", "watery stools"
        ],
        "te_script": [
            "వాంతులు", "విరేచనాలు", "నీళ్ల విరేచనాలు", "వాంతి"
        ],
        "te_translit": [
            "vantulu", "vaantulu", "virechanalu", "neella virechanalu", "motionulu"
        ],
    },
    CONCEPT_SEIZURE: {
        "en": [
            "seizure", "convulsions", "fits", "epileptic attack", "shaking violently"
        ],
        "te_script": [
            "ఫిట్స్", "మూర్ఛ", "మూర్ఛ రోగం"
        ],
        "te_translit": [
            "fits", "murcha", "moorcha", "fits vachayi"
        ],
    },
    CONCEPT_TRAUMA: {
        "en": [
            "road accident", "injury", "fracture", "fall from height", "cut wound", "trauma"
        ],
        "te_script": [
            "రోడ్డు ప్రమాదం", "గాయం", "దెబ్బ", "ఎముక విరిగింది"
        ],
        "te_translit": [
            "accident", "gayam", "debba", "emuka virigindi", "kindapaddaru"
        ],
    },
    CONCEPT_DIZZINESS: {
        "en": [
            "dizziness", "vertigo", "giddiness", "lightheadedness"
        ],
        "te_script": [
            "కళ్లు తిరగడం", "తల తిరగడం"
        ],
        "te_translit": [
            "kallu tiragadam", "kallu thiruguthunnayi", "thala thiragadam"
        ],
    },
}

# Negation terms by language
NEGATIONS_ENGLISH: List[str] = [
    "no", "not", "denies", "denied", "without", "absence of", "negative for",
    "free of", "never", "rule out", "did not have", "doesn't have", "does not have"
]

NEGATIONS_TELUGU_SCRIPT: List[str] = [
    "లేదు", "రాలేదు", "కాదు", "ఉండటం లేదు", "ఆగిపోయింది"
]

NEGATIONS_TELUGU_TRANSLIT: List[str] = [
    "ledu", "ledhu", "kaadu", "kaadhu", "raaledu", "raledhu", "lekapovadam", "undatam ledu"
]

# Uncertainty terms
UNCERTAINTY_ENGLISH: List[str] = [
    "maybe", "possible", "possibly", "suspected", "doubtful", "unclear if", "perhaps", "might be"
]

UNCERTAINTY_TELUGU: List[str] = [
    "అనుకుంటున్నా", "ఉందేమో", "అనిపిస్తోంది", "సందేహం",
    "anukuntunna", "undemo", "anipistondi", "doubt ga undi", "doubt"
]

# Historical terms indicating past resolved episodes
HISTORICAL_ENGLISH: List[str] = [
    "had in past", "history of", "past history", "last week", "last month",
    "years ago", "previously had", "past episode", "resolved", "earlier had"
]

HISTORICAL_TELUGU: List[str] = [
    "గతంలో", "పోయిన వారం", "నిన్న ఉండింది ఇప్పుడు తగ్గింది",
    "gathamlo", "poyina vaaram", "ninna vachindi ippudu ledu", "mundu undedi"
]

# Red flag concepts for priority safety rules
RED_FLAG_CONCEPTS: Set[str] = {
    CONCEPT_CHEST_PAIN,
    CONCEPT_RESPIRATORY_DISTRESS,
    CONCEPT_ALTERED_SENSORIUM,
    CONCEPT_SEVERE_BLEEDING,
    CONCEPT_SEIZURE,
    CONCEPT_TRAUMA,
}
